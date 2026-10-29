import { describe, expect, it } from "vitest";
import { computeDashboard, loadDashboardData, type DashboardActivity, type DashboardLead, type DashboardService } from "./dashboard.ts";
import type { Opportunity } from "./pipeline.ts";

const NOW = new Date(2026, 9, 29, 14, 0, 0); // 29 Oct 2026, local

const opp = (o: Partial<Opportunity> & { id: string }): Opportunity => ({
  name: o.id, accountId: "a", accountName: "Acme", contactId: null, contactName: "", stage: "qualify", status: "open",
  estimatedRevenue: 0, estimatedCloseDate: null, probability: null, lostReason: "", closedDate: null, ownerId: "me", ownerName: "", ...o,
});
const lead = (l: Partial<DashboardLead> & { id: string }): DashboardLead => ({ createdOn: new Date(2026, 9, 5).toISOString(), ownerId: "me", ...l });
const act = (a: Partial<DashboardActivity> & { id: string }): DashboardActivity => ({
  subject: a.id, kind: "task", due: new Date(2026, 9, 29, 9).toISOString(), ownerId: "me",
  regardingId: "r1", regardingType: "nvdb_opportunity", regardingName: "Deal", ...a,
});

const data = {
  opportunities: [
    opp({ id: "o1", stage: "qualify", estimatedRevenue: 1000 }),
    opp({ id: "o2", stage: "propose", estimatedRevenue: 2500 }),
    opp({ id: "o3", stage: "propose", estimatedRevenue: null }),
    opp({ id: "o4", stage: "develop", estimatedRevenue: 400, ownerId: "other" }),
    opp({ id: "w1", status: "won", stage: "close", estimatedRevenue: 700, closedDate: "2026-10-02" }),
    opp({ id: "w2", status: "won", stage: "close", estimatedRevenue: 900, closedDate: "2026-09-30" }),
    opp({ id: "l1", status: "lost", estimatedRevenue: 300, closedDate: "2026-10-20" }),
  ],
  leads: [lead({ id: "n1" }), lead({ id: "n2", createdOn: new Date(2026, 8, 30).toISOString() }), lead({ id: "n3", ownerId: "other" })],
  activities: [
    act({ id: "late", due: new Date(2026, 9, 20).toISOString() }),
    act({ id: "today-later", due: new Date(2026, 9, 29, 17).toISOString() }),
    act({ id: "tomorrow", due: new Date(2026, 9, 30, 9).toISOString() }),
    act({ id: "other-late", due: new Date(2026, 9, 1).toISOString(), ownerId: "other" }),
  ],
};

describe("computeDashboard", () => {
  it("computes the six KPIs for Me", () => {
    const d = computeDashboard(data, { scope: "me", userId: "me", now: NOW });
    expect(d.kpis).toEqual({
      openPipelineValue: 3500,
      openOpportunities: 3,
      wonThisMonth: { count: 1, value: 700 },
      lostThisMonth: { count: 1, value: 300 },
      newLeads: 1,
      overdueActivities: 1,
    });
  });

  it("includes everything visible for Team", () => {
    const d = computeDashboard(data, { scope: "team", userId: "me", now: NOW });
    expect(d.kpis.openPipelineValue).toBe(3900);
    expect(d.kpis.openOpportunities).toBe(4);
    expect(d.kpis.newLeads).toBe(2);
    expect(d.kpis.overdueActivities).toBe(2);
  });

  it("sums open value and count per Stage, always listing all four", () => {
    const d = computeDashboard(data, { scope: "me", userId: "me", now: NOW });
    expect(d.byStage).toEqual([
      { stage: "qualify", count: 1, value: 1000 },
      { stage: "develop", count: 0, value: 0 },
      { stage: "propose", count: 2, value: 2500 },
      { stage: "close", count: 0, value: 0 },
    ]);
  });

  it("lists Activities due today or earlier, oldest first, flagging overdue", () => {
    const d = computeDashboard(data, { scope: "me", userId: "me", now: NOW });
    expect(d.today.map((a) => [a.id, a.overdue])).toEqual([["late", true], ["today-later", false]]);
  });
});

describe("loadDashboardData", () => {
  it("follows skipTokens for leads and activities", async () => {
    const svc: DashboardService = {
      listLeads: async ({ skipToken }) => (skipToken ? { items: [lead({ id: "b" })] } : { items: [lead({ id: "a" })], skipToken: "t" }),
      listOpenActivities: async () => ({ items: [act({ id: "x" })] }),
    };
    const r = await loadDashboardData(svc, { listOpportunities: async () => ({ items: [opp({ id: "o" })] }) });
    expect(r.leads.map((l) => l.id)).toEqual(["a", "b"]);
    expect(r.activities).toHaveLength(1);
    expect(r.opportunities).toHaveLength(1);
  });
});
