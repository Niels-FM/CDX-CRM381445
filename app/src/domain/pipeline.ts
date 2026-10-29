import type { Page } from "./customers.ts";

export const STAGES = ["qualify", "develop", "propose", "close"] as const;
export type Stage = (typeof STAGES)[number];
export type Status = "open" | "won" | "lost";

/** Default probability per Stage (ticket #3); editable afterwards. */
const STAGE_PROBABILITY: Record<Stage, number> = { qualify: 10, develop: 25, propose: 60, close: 90 };
export const stageDefaultProbability = (s: Stage) => STAGE_PROBABILITY[s];

export interface Opportunity {
  id: string;
  name: string;
  accountId: string;
  accountName: string;
  contactId: string | null;
  contactName: string;
  stage: Stage;
  status: Status;
  estimatedRevenue: number | null;
  /** Date only, yyyy-mm-dd. */
  estimatedCloseDate: string | null;
  probability: number | null;
  lostReason: string;
  closedDate: string | null;
  ownerId: string;
  ownerName: string;
}

export interface OpportunityDraft {
  name: string;
  accountId: string | null;
  contactId: string | null;
  estimatedRevenue: number | null;
  estimatedCloseDate: string | null;
  probability: number | null;
  stage?: Stage;
}

export type OpportunityPatch = Partial<
  Pick<Opportunity, "name" | "accountId" | "contactId" | "estimatedRevenue" | "estimatedCloseDate" | "probability" | "stage" | "status" | "lostReason" | "closedDate">
>;

/** The thin seam to Dataverse; the real implementation lives in src/data. */
export interface OpportunityService {
  listOpportunities(q: { skipToken?: string }): Promise<Page<Opportunity>>;
  getOpportunity(id: string): Promise<Opportunity>;
  createOpportunity(d: OpportunityDraft & { accountId: string; stage: Stage; probability: number }): Promise<Opportunity>;
  updateOpportunity(id: string, patch: OpportunityPatch): Promise<Opportunity>;
}

export type Result<R extends string> = { ok: true; record: Opportunity } | { ok: false; reason: R };

export const isClosed = (o: Opportunity) => o.status !== "open";

export const todayIso = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

export async function moveToStage(svc: OpportunityService, o: Opportunity, stage: Stage): Promise<Result<"closed" | "unchanged">> {
  if (isClosed(o)) return { ok: false, reason: "closed" };
  if (o.stage === stage) return { ok: false, reason: "unchanged" };
  return { ok: true, record: await svc.updateOpportunity(o.id, { stage, probability: stageDefaultProbability(stage) }) };
}

export type DropTarget = { kind: "stage"; stage: Stage } | { kind: "won" } | { kind: "lost" };
export type DropPlan =
  | { kind: "move"; stage: Stage }
  | { kind: "confirmWon" }
  | { kind: "askLostReason" }
  | { kind: "rejected"; reason: "closed" };

/** Drops on Won/Lost never close directly: Won is confirmed, Lost needs a reason first. */
export function dropOpportunity(o: Opportunity, target: DropTarget): DropPlan {
  if (isClosed(o)) return { kind: "rejected", reason: "closed" };
  if (target.kind === "stage") return { kind: "move", stage: target.stage };
  return target.kind === "won" ? { kind: "confirmWon" } : { kind: "askLostReason" };
}

export async function closeWon(svc: OpportunityService, o: Opportunity, today: string): Promise<Result<"closed">> {
  if (isClosed(o)) return { ok: false, reason: "closed" };
  return { ok: true, record: await svc.updateOpportunity(o.id, { status: "won", closedDate: today }) };
}

export async function closeLost(svc: OpportunityService, o: Opportunity, reason: string, today: string): Promise<Result<"closed" | "reasonRequired">> {
  if (isClosed(o)) return { ok: false, reason: "closed" };
  const lostReason = reason.trim();
  if (!lostReason) return { ok: false, reason: "reasonRequired" };
  return { ok: true, record: await svc.updateOpportunity(o.id, { status: "lost", lostReason, closedDate: today }) };
}

/** Sales Manager only; the server rejects everyone else, so a rejection is thrown for the UI to show. */
export async function reopenOpportunity(svc: OpportunityService, o: Opportunity): Promise<Result<"notClosed">> {
  if (!isClosed(o)) return { ok: false, reason: "notClosed" };
  return { ok: true, record: await svc.updateOpportunity(o.id, { status: "open", closedDate: null, lostReason: "" }) };
}

export async function saveOpportunity(
  svc: OpportunityService,
  d: OpportunityDraft,
  original?: Opportunity,
): Promise<Result<"name" | "account" | "probability" | "closed">> {
  if (original && isClosed(original)) return { ok: false, reason: "closed" };
  const name = d.name.trim();
  if (!name) return { ok: false, reason: "name" };
  if (!d.accountId) return { ok: false, reason: "account" };
  if (d.probability !== null && (!Number.isInteger(d.probability) || d.probability < 0 || d.probability > 100)) {
    return { ok: false, reason: "probability" };
  }
  if (original) {
    const { stage: _stage, ...rest } = d;
    void _stage;
    return { ok: true, record: await svc.updateOpportunity(original.id, { ...rest, name, accountId: d.accountId }) };
  }
  const stage = d.stage ?? "qualify";
  const record = await svc.createOpportunity({ ...d, name, accountId: d.accountId, stage, probability: d.probability ?? stageDefaultProbability(stage) });
  return { ok: true, record };
}

export interface PipelineColumn {
  stage: Stage;
  items: Opportunity[];
  count: number;
  total: number;
}

const sum = (os: Opportunity[]) => os.reduce((t, o) => t + (o.estimatedRevenue ?? 0), 0);

/** Kanban columns hold Open Opportunities only; Won and Lost live in the List view. */
export function buildPipeline(all: Opportunity[]): PipelineColumn[] {
  return STAGES.map((stage) => {
    const items = all.filter((o) => o.status === "open" && o.stage === stage);
    return { stage, items, count: items.length, total: sum(items) };
  });
}

export function openPipelineTotals(all: Opportunity[]) {
  const open = all.filter((o) => !isClosed(o));
  return { count: open.length, total: sum(open) };
}

export function filterOpportunities(all: Opportunity[], text: string): Opportunity[] {
  const t = text.trim().toLowerCase();
  if (!t) return all;
  return all.filter((o) => [o.name, o.accountName, o.contactName].some((v) => v.toLowerCase().includes(t)));
}

const MAX_PAGES = 40;

export async function loadAllPages(fetchPage: (skipToken?: string) => Promise<Page<Opportunity>>): Promise<Opportunity[]> {
  const seen = new Map<string, Opportunity>();
  let token: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await fetchPage(token);
    for (const o of page.items) if (!seen.has(o.id)) seen.set(o.id, o);
    token = page.skipToken;
    if (!token) break;
  }
  return [...seen.values()];
}
