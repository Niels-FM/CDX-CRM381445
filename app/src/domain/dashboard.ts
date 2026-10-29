import type { Page } from "./customers.ts";
import { STAGES, isClosed, loadAllPages, type Opportunity, type OpportunityService, type Stage } from "./pipeline.ts";
import type { ActivityKind, ParentType } from "./timeline.ts";

export type DashboardScope = "me" | "team";

export interface DashboardLead {
  id: string;
  /** ISO timestamp. */
  createdOn: string;
  ownerId: string;
}

export interface DashboardActivity {
  id: string;
  subject: string;
  kind: ActivityKind;
  /** ISO due date. */
  due: string;
  ownerId: string;
  regardingId: string;
  regardingType: ParentType | null;
  regardingName: string;
}

/** The thin seam to Dataverse (src/data); queries run as the caller, so rows are already limited by security role. */
export interface DashboardService {
  listLeads(q: { skipToken?: string }): Promise<Page<DashboardLead>>;
  /** Open (not done) Activities with a due date. */
  listOpenActivities(q: { skipToken?: string }): Promise<Page<DashboardActivity>>;
}

export interface DashboardData {
  opportunities: Opportunity[];
  leads: DashboardLead[];
  activities: DashboardActivity[];
}

const MAX_PAGES = 40;

async function allPages<T>(fetchPage: (skipToken?: string) => Promise<Page<T>>): Promise<T[]> {
  const out: T[] = [];
  let token: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await fetchPage(token);
    out.push(...page.items);
    token = page.skipToken;
    if (!token) break;
  }
  return out;
}

export async function loadDashboardData(svc: DashboardService, opps: Pick<OpportunityService, "listOpportunities">): Promise<DashboardData> {
  const [opportunities, leads, activities] = await Promise.all([
    loadAllPages((skipToken) => opps.listOpportunities({ skipToken })),
    allPages((skipToken) => svc.listLeads({ skipToken })),
    allPages((skipToken) => svc.listOpenActivities({ skipToken })),
  ]);
  return { opportunities, leads, activities };
}

export interface StageTotal {
  stage: Stage;
  count: number;
  value: number;
}
export interface TodayItem extends DashboardActivity {
  overdue: boolean;
}
export interface DashboardView {
  kpis: {
    openPipelineValue: number;
    openOpportunities: number;
    wonThisMonth: { count: number; value: number };
    lostThisMonth: { count: number; value: number };
    newLeads: number;
    overdueActivities: number;
  };
  byStage: StageTotal[];
  today: TodayItem[];
}

const value = (o: Opportunity) => o.estimatedRevenue ?? 0;
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export function computeDashboard(data: DashboardData, opts: { scope: DashboardScope; userId: string | undefined; now?: Date }): DashboardView {
  const now = opts.now ?? new Date();
  const mine = <T extends { ownerId: string }>(rows: T[]) => (opts.scope === "me" ? rows.filter((r) => r.ownerId === opts.userId) : rows);
  const month = monthKey(now);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();

  const opps = mine(data.opportunities);
  const open = opps.filter((o) => !isClosed(o));
  const closedThisMonth = (status: "won" | "lost") => {
    const rows = opps.filter((o) => o.status === status && o.closedDate?.slice(0, 7) === month);
    return { count: rows.length, value: rows.reduce((s, o) => s + value(o), 0) };
  };

  const due = mine(data.activities)
    .filter((a) => Date.parse(a.due) < endOfToday)
    .sort((a, b) => Date.parse(a.due) - Date.parse(b.due));

  return {
    kpis: {
      openPipelineValue: open.reduce((s, o) => s + value(o), 0),
      openOpportunities: open.length,
      wonThisMonth: closedThisMonth("won"),
      lostThisMonth: closedThisMonth("lost"),
      newLeads: mine(data.leads).filter((l) => monthKey(new Date(l.createdOn)) === month).length,
      overdueActivities: due.filter((a) => Date.parse(a.due) < now.getTime()).length,
    },
    byStage: STAGES.map((stage) => {
      const rows = open.filter((o) => o.stage === stage);
      return { stage, count: rows.length, value: rows.reduce((s, o) => s + value(o), 0) };
    }),
    today: due.map((a) => ({ ...a, overdue: Date.parse(a.due) < now.getTime() })),
  };
}

/** Route of the record an Activity is regarding. */
export function regardingPath(a: Pick<DashboardActivity, "regardingId" | "regardingType">): string | undefined {
  const routes: Record<string, string> = { nvdb_lead: "leads", nvdb_opportunity: "opportunities", account: "accounts", contact: "contacts" };
  const base = a.regardingType && routes[a.regardingType];
  return base ? `/${base}/${a.regardingId}` : undefined;
}
