import type { Page } from "./customers.ts";

export const TIMELINE_PAGE_SIZE = 25;

export type ParentType = "nvdb_lead" | "nvdb_opportunity" | "account" | "contact";
export interface ParentRef {
  type: ParentType;
  id: string;
}

export const ACTIVITY_KINDS = ["task", "call", "meeting"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export type TimelineKind = "note" | ActivityKind;
export type TimelineFilter = "all" | "notes" | "tasks" | "calls" | "meetings";
export type TimelineTab = "planned" | "history";

export interface TimelineItem {
  id: string;
  kind: TimelineKind;
  subject: string;
  /** Note text or Activity description. */
  text: string;
  /** Due date for planned Activities, completion (or creation) date for History; ISO. */
  date: string;
  done: boolean;
  ownerId: string;
  ownerName: string;
}

export interface ActivityDraft {
  kind: ActivityKind;
  subject: string;
  /** Value of a datetime-local input or ISO string. */
  due: string;
  description?: string;
}

export interface OpenActivity {
  regardingId: string;
  due: string;
}

export interface TimelineQuery {
  skipToken?: string;
}

/**
 * The thin seam to Dataverse (src/data).  Creation goes through the nvdb_AddActivity / nvdb_AddNote Custom APIs;
 * the app never writes a polymorphic Regarding lookup itself.
 */
export interface TimelineService {
  listPlanned(parent: ParentRef, q: TimelineQuery & { kinds: ActivityKind[] }): Promise<Page<TimelineItem>>;
  listDoneActivities(parent: ParentRef, q: TimelineQuery & { kinds: ActivityKind[] }): Promise<Page<TimelineItem>>;
  listNotes(parent: ParentRef, q: TimelineQuery): Promise<Page<TimelineItem>>;
  /** Open Activities regarding Opportunities, for the Kanban next-activity dot. */
  listOpenActivities(q: TimelineQuery): Promise<Page<OpenActivity>>;
  addActivity(parent: ParentRef, draft: ActivityDraft): Promise<void>;
  addNote(parent: ParentRef, text: string): Promise<void>;
  markDone(item: TimelineItem): Promise<void>;
  updateItem(item: TimelineItem, patch: { subject?: string; text: string }): Promise<void>;
  deleteItem(item: TimelineItem): Promise<void>;
}

const FILTER_KINDS: Record<TimelineFilter, ActivityKind[]> = {
  all: [...ACTIVITY_KINDS],
  notes: [],
  tasks: ["task"],
  calls: ["call"],
  meetings: ["meeting"],
};
export const activityKindsFor = (f: TimelineFilter) => FILTER_KINDS[f];
const includesNotes = (f: TimelineFilter) => f === "all" || f === "notes";

type Fetch = (q: TimelineQuery) => Promise<Page<TimelineItem>>;

/** One independently paged, already sorted stream. */
class Source {
  private buffer: TimelineItem[] = [];
  private token: string | undefined;
  private started = false;
  private readonly fetch: Fetch;
  constructor(fetch: Fetch) {
    this.fetch = fetch;
  }

  get done() {
    return this.started && !this.token && this.buffer.length === 0;
  }
  get head() {
    return this.buffer[0];
  }
  take() {
    return this.buffer.shift();
  }
  async fill() {
    while (this.buffer.length === 0 && (!this.started || this.token)) {
      const page = await this.fetch({ skipToken: this.token });
      this.started = true;
      this.buffer = page.items;
      this.token = page.skipToken;
    }
  }
}

export interface Feed {
  readonly hasMore: boolean;
  /** Next page of at most TIMELINE_PAGE_SIZE items. */
  loadMore(): Promise<TimelineItem[]>;
}

const byDate = (dir: 1 | -1) => (a: TimelineItem, b: TimelineItem) => dir * (Date.parse(a.date) - Date.parse(b.date));

/**
 * Planned: open Activities, due date ascending.  History: done Activities and Notes merged client-side, newest first.
 * Each source is paged separately (skipToken); an item is emitted only when every unfinished source has its next item buffered.
 */
export function createFeed(svc: TimelineService, parent: ParentRef, tab: TimelineTab, filter: TimelineFilter): Feed {
  const kinds = activityKindsFor(filter);
  const sources: Source[] = [];
  if (tab === "planned") {
    if (kinds.length) sources.push(new Source((q) => svc.listPlanned(parent, { ...q, kinds })));
  } else {
    if (kinds.length) sources.push(new Source((q) => svc.listDoneActivities(parent, { ...q, kinds })));
    if (includesNotes(filter)) sources.push(new Source((q) => svc.listNotes(parent, q)));
  }
  const compare = byDate(tab === "planned" ? 1 : -1);

  return {
    get hasMore() {
      return sources.some((s) => !s.done);
    },
    async loadMore() {
      const page: TimelineItem[] = [];
      while (page.length < TIMELINE_PAGE_SIZE) {
        await Promise.all(sources.map((s) => s.fill()));
        const next = sources.filter((s) => s.head).sort((a, b) => compare(a.head, b.head))[0];
        if (!next) break;
        page.push(next.take()!);
      }
      return page;
    },
  };
}

export type SubmitResult<R extends string> = { ok: true } | { ok: false; reason: R };

export async function submitActivity(svc: TimelineService, parent: ParentRef, draft: ActivityDraft): Promise<SubmitResult<"subject" | "due">> {
  const subject = draft.subject.trim();
  if (!subject) return { ok: false, reason: "subject" };
  if (!draft.due || Number.isNaN(Date.parse(draft.due))) return { ok: false, reason: "due" };
  await svc.addActivity(parent, { ...draft, subject });
  return { ok: true };
}

export async function submitNote(svc: TimelineService, parent: ParentRef, text: string): Promise<SubmitResult<"text">> {
  if (!text.trim()) return { ok: false, reason: "text" };
  await svc.addNote(parent, text.trim());
  return { ok: true };
}

export type Dot = "none" | "planned" | "overdue";

/** Next-activity dot per Opportunity: grey none, green planned, red when any open Activity is overdue. */
export function buildDotMap(open: OpenActivity[], now = new Date()): Map<string, Dot> {
  const map = new Map<string, Dot>();
  for (const a of open) {
    const overdue = Date.parse(a.due) < now.getTime();
    if (overdue) map.set(a.regardingId, "overdue");
    else if (!map.has(a.regardingId)) map.set(a.regardingId, "planned");
  }
  return map;
}

export async function loadOpenActivities(svc: TimelineService): Promise<OpenActivity[]> {
  const all: OpenActivity[] = [];
  let skipToken: string | undefined;
  do {
    const page = await svc.listOpenActivities({ skipToken });
    all.push(...page.items);
    skipToken = page.skipToken;
  } while (skipToken);
  return all;
}
