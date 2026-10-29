import { describe, expect, it } from "vitest";
import {
  TIMELINE_PAGE_SIZE,
  buildDotMap,
  createFeed,
  submitActivity,
  submitNote,
  type TimelineItem,
  type TimelineService,
} from "./timeline.ts";
import type { Page } from "./customers.ts";

const item = (over: Partial<TimelineItem>): TimelineItem => ({
  id: "x", kind: "task", subject: "s", text: "", date: "2026-01-01T00:00:00Z", done: false, ownerId: "u1", ownerName: "Rep A", ...over,
});

/** A mock source that serves `items` in pages of `size`, with skip tokens "1", "2", ... */
function paged(items: TimelineItem[], size: number, log: string[] = [], name = "src") {
  return async (_parent: unknown, q: { skipToken?: string }): Promise<Page<TimelineItem>> => {
    const from = q.skipToken ? Number(q.skipToken) : 0;
    log.push(`${name}@${from}`);
    const to = from + size;
    return { items: items.slice(from, to), skipToken: to < items.length ? String(to) : undefined };
  };
}

function mockService(over: Partial<TimelineService> = {}) {
  const calls: string[] = [];
  const svc: TimelineService = {
    listPlanned: async () => ({ items: [] }),
    listDoneActivities: async () => ({ items: [] }),
    listNotes: async () => ({ items: [] }),
    listOpenActivities: async () => ({ items: [] }),
    addActivity: async (_p, d) => void calls.push(`activity:${d.kind}:${d.subject}`),
    addNote: async (_p, t) => void calls.push(`note:${t}`),
    markDone: async () => undefined,
    updateItem: async () => undefined,
    deleteItem: async () => undefined,
    ...over,
  };
  return { svc, calls };
}

const parent = { type: "nvdb_opportunity", id: "o1" } as const;

describe("history feed", () => {
  it("merges done activities and notes newest first", async () => {
    const { svc } = mockService({
      listDoneActivities: paged([item({ id: "a2", date: "2026-03-02T00:00:00Z" }), item({ id: "a1", date: "2026-03-01T00:00:00Z" })], 10),
      listNotes: paged([item({ id: "n2", kind: "note", date: "2026-03-03T00:00:00Z" }), item({ id: "n1", kind: "note", date: "2026-02-01T00:00:00Z" })], 10),
    });
    const feed = createFeed(svc, parent, "history", "all");
    const got = await feed.loadMore();
    expect(got.map((i) => i.id)).toEqual(["n2", "a2", "a1", "n1"]);
    expect(feed.hasMore).toBe(false);
  });

  it("returns 25 per page and continues with Load more across two sources", async () => {
    const acts = Array.from({ length: 30 }, (_, i) => item({ id: `a${i}`, date: new Date(Date.UTC(2026, 0, 1, 0, 60 - 2 * i)).toISOString() }));
    const notes = Array.from({ length: 30 }, (_, i) => item({ id: `n${i}`, kind: "note", date: new Date(Date.UTC(2026, 0, 1, 0, 59 - 2 * i)).toISOString() }));
    const { svc } = mockService({ listDoneActivities: paged(acts, 7), listNotes: paged(notes, 11) });
    const feed = createFeed(svc, parent, "history", "all");
    const first = await feed.loadMore();
    expect(first).toHaveLength(TIMELINE_PAGE_SIZE);
    expect(feed.hasMore).toBe(true);
    // strict alternation a0,n0,a1,n1,... because the dates interleave
    expect(first.slice(0, 4).map((i) => i.id)).toEqual(["a0", "n0", "a1", "n1"]);
    const second = await feed.loadMore();
    expect(second).toHaveLength(TIMELINE_PAGE_SIZE);
    const third = await feed.loadMore();
    expect(third).toHaveLength(10);
    expect(feed.hasMore).toBe(false);
    const all = [...first, ...second, ...third].map((i) => i.id);
    expect(new Set(all).size).toBe(60);
  });

  it("queries each source once when its first page already covers the page", async () => {
    const log: string[] = [];
    const acts = Array.from({ length: 100 }, (_, i) => item({ id: `a${i}`, date: new Date(Date.UTC(2026, 0, 2, 0, 200 - i)).toISOString() }));
    const { svc } = mockService({ listDoneActivities: paged(acts, 50, log, "acts"), listNotes: paged([], 50, log, "notes") });
    const feed = createFeed(svc, parent, "history", "all");
    expect(await feed.loadMore()).toHaveLength(25);
    expect(log).toEqual(["acts@0", "notes@0"]);
  });

  it("Notes filter reads only notes, Tasks filter only done tasks", async () => {
    const seen: string[] = [];
    const { svc } = mockService({
      listDoneActivities: async (_p, q) => (seen.push(`done:${q.kinds.join(",")}`), { items: [] }),
      listNotes: async () => (seen.push("notes"), { items: [] }),
    });
    await createFeed(svc, parent, "history", "notes").loadMore();
    await createFeed(svc, parent, "history", "tasks").loadMore();
    await createFeed(svc, parent, "history", "meetings").loadMore();
    expect(seen).toEqual(["notes", "done:task", "done:meeting"]);
  });
});

describe("planned feed", () => {
  it("lists open activities by due date ascending and never reads notes", async () => {
    let notesRead = false;
    const { svc } = mockService({
      listPlanned: paged([item({ id: "p1", date: "2026-05-01T00:00:00Z" }), item({ id: "p2", date: "2026-05-02T00:00:00Z" })], 10),
      listNotes: async () => ((notesRead = true), { items: [] }),
    });
    const feed = createFeed(svc, parent, "planned", "all");
    expect((await feed.loadMore()).map((i) => i.id)).toEqual(["p1", "p2"]);
    expect(notesRead).toBe(false);
  });

  it("is empty under the Notes filter", async () => {
    const { svc } = mockService({ listPlanned: paged([item({ id: "p1" })], 10) });
    const feed = createFeed(svc, parent, "planned", "notes");
    expect(await feed.loadMore()).toEqual([]);
    expect(feed.hasMore).toBe(false);
  });
});

describe("composer", () => {
  it("requires subject and due date for an Activity, calls the API otherwise", async () => {
    const { svc, calls } = mockService();
    expect(await submitActivity(svc, parent, { kind: "call", subject: "  ", due: "2030-01-01T09:00" })).toEqual({ ok: false, reason: "subject" });
    expect(await submitActivity(svc, parent, { kind: "call", subject: "Ring", due: "" })).toEqual({ ok: false, reason: "due" });
    expect(calls).toEqual([]);
    expect(await submitActivity(svc, parent, { kind: "call", subject: " Ring ", due: "2030-01-01T09:00" })).toEqual({ ok: true });
    expect(calls).toEqual(["activity:call:Ring"]);
  });

  it("requires only text for a Note", async () => {
    const { svc, calls } = mockService();
    expect(await submitNote(svc, parent, "   ")).toEqual({ ok: false, reason: "text" });
    expect(await submitNote(svc, parent, "Met on site")).toEqual({ ok: true });
    expect(calls).toEqual(["note:Met on site"]);
  });
});

describe("next-activity dot", () => {
  const now = new Date("2026-06-10T12:00:00Z");
  it("is grey with no open Activity, green when planned, red when any is overdue", () => {
    const map = buildDotMap(
      [
        { regardingId: "o2", due: "2026-06-20T00:00:00Z" },
        { regardingId: "o3", due: "2026-06-20T00:00:00Z" },
        { regardingId: "o3", due: "2026-06-01T00:00:00Z" },
      ],
      now,
    );
    expect(map.get("o1") ?? "none").toBe("none");
    expect(map.get("o2")).toBe("planned");
    expect(map.get("o3")).toBe("overdue");
  });
});
