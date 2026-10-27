import { describe, expect, it } from "vitest";
import {
  buildPipeline,
  closeLost,
  closeWon,
  dropOpportunity,
  filterOpportunities,
  loadAllPages,
  moveToStage,
  openPipelineTotals,
  reopenOpportunity,
  saveOpportunity,
  stageDefaultProbability,
  type Opportunity,
  type OpportunityPatch,
  type OpportunityService,
} from "./pipeline.ts";

const opp = (over: Partial<Opportunity> = {}): Opportunity => ({
  id: "o1", name: "Big deal", accountId: "a1", accountName: "Contoso", contactId: null, contactName: "",
  stage: "qualify", status: "open", estimatedRevenue: 1000, estimatedCloseDate: null, probability: 10,
  lostReason: "", closedDate: null, ownerId: "u1", ownerName: "Rep A", ...over,
});

function mockService(over: Partial<OpportunityService> = {}) {
  const updates: { id: string; patch: OpportunityPatch }[] = [];
  const svc: OpportunityService = {
    listOpportunities: async () => ({ items: [] }),
    getOpportunity: async () => opp(),
    createOpportunity: async (d) => opp({ ...d, id: "new" }),
    updateOpportunity: async (id, patch) => {
      updates.push({ id, patch });
      return opp({ id, ...(patch as Partial<Opportunity>) });
    },
    ...over,
  };
  return { svc, updates };
}

describe("stageDefaultProbability", () => {
  it("maps Stage to 10/25/60/90", () => {
    expect(["qualify", "develop", "propose", "close"].map((s) => stageDefaultProbability(s as never))).toEqual([10, 25, 60, 90]);
  });
});

describe("moveToStage (drag between Stages)", () => {
  it("updates Stage and resets probability to the Stage default", async () => {
    const { svc, updates } = mockService();
    const r = await moveToStage(svc, opp({ probability: 33 }), "propose");
    expect(updates).toEqual([{ id: "o1", patch: { stage: "propose", probability: 60 } }]);
    expect(r).toMatchObject({ ok: true, record: { stage: "propose", probability: 60 } });
  });

  it("does nothing when dropped on the same Stage", async () => {
    const { svc, updates } = mockService();
    expect(await moveToStage(svc, opp(), "qualify")).toEqual({ ok: false, reason: "unchanged" });
    expect(updates).toEqual([]);
  });

  it("refuses to move a closed Opportunity", async () => {
    const { svc, updates } = mockService();
    expect(await moveToStage(svc, opp({ status: "won" }), "develop")).toEqual({ ok: false, reason: "closed" });
    expect(updates).toEqual([]);
  });
});

describe("dropOpportunity (guarded drop targets)", () => {
  it("a Stage column moves the card", () => {
    expect(dropOpportunity(opp(), { kind: "stage", stage: "develop" })).toEqual({ kind: "move", stage: "develop" });
  });
  it("the Won zone asks for confirmation instead of closing", () => {
    expect(dropOpportunity(opp(), { kind: "won" })).toEqual({ kind: "confirmWon" });
  });
  it("the Lost zone asks for a reason instead of closing", () => {
    expect(dropOpportunity(opp(), { kind: "lost" })).toEqual({ kind: "askLostReason" });
  });
  it("any drop of a closed Opportunity is rejected", () => {
    expect(dropOpportunity(opp({ status: "lost" }), { kind: "stage", stage: "develop" })).toEqual({ kind: "rejected", reason: "closed" });
    expect(dropOpportunity(opp({ status: "won" }), { kind: "lost" })).toEqual({ kind: "rejected", reason: "closed" });
  });
});

describe("closeWon / closeLost", () => {
  it("Won sets Status and the closed date", async () => {
    const { svc, updates } = mockService();
    const r = await closeWon(svc, opp(), "2026-10-27");
    expect(updates[0].patch).toEqual({ status: "won", closedDate: "2026-10-27" });
    expect(r).toMatchObject({ ok: true, record: { status: "won", closedDate: "2026-10-27" } });
  });

  it("Lost requires a reason", async () => {
    const { svc, updates } = mockService();
    expect(await closeLost(svc, opp(), "   ", "2026-10-27")).toEqual({ ok: false, reason: "reasonRequired" });
    expect(updates).toEqual([]);
  });

  it("Lost stores the trimmed reason and the closed date", async () => {
    const { svc, updates } = mockService();
    await closeLost(svc, opp(), "  Too expensive ", "2026-10-27");
    expect(updates[0].patch).toEqual({ status: "lost", lostReason: "Too expensive", closedDate: "2026-10-27" });
  });

  it("a closed Opportunity cannot be closed again", async () => {
    const { svc, updates } = mockService();
    expect(await closeWon(svc, opp({ status: "lost" }), "2026-10-27")).toEqual({ ok: false, reason: "closed" });
    expect(await closeLost(svc, opp({ status: "won" }), "x", "2026-10-27")).toEqual({ ok: false, reason: "closed" });
    expect(updates).toEqual([]);
  });
});

describe("reopenOpportunity", () => {
  it("sets Status back to Open and clears closed date and lost reason (role enforced on the server)", async () => {
    const { svc, updates } = mockService();
    await reopenOpportunity(svc, opp({ status: "lost", lostReason: "x", closedDate: "2026-10-01" }));
    expect(updates[0].patch).toEqual({ status: "open", closedDate: null, lostReason: "" });
  });

  it("surfaces the server rejection (Rep cannot reopen)", async () => {
    const { svc } = mockService({
      updateOpportunity: async () => {
        throw new Error("Only a Sales Manager can reopen a Won or Lost Opportunity.");
      },
    });
    await expect(reopenOpportunity(svc, opp({ status: "won" }))).rejects.toThrow(/Sales Manager/);
  });

  it("is a no-op for an Open Opportunity", async () => {
    const { svc, updates } = mockService();
    expect(await reopenOpportunity(svc, opp())).toEqual({ ok: false, reason: "notClosed" });
    expect(updates).toEqual([]);
  });
});

describe("saveOpportunity", () => {
  const draft = { name: "Deal", accountId: "a1", contactId: null, estimatedRevenue: 500, estimatedCloseDate: null, probability: 40 };

  it("validates name, Account and probability range", async () => {
    const { svc } = mockService();
    expect(await saveOpportunity(svc, { ...draft, name: " " })).toEqual({ ok: false, reason: "name" });
    expect(await saveOpportunity(svc, { ...draft, accountId: null })).toEqual({ ok: false, reason: "account" });
    expect(await saveOpportunity(svc, { ...draft, probability: 101 })).toEqual({ ok: false, reason: "probability" });
  });

  it("create defaults probability from the Stage when none is given", async () => {
    const { svc } = mockService();
    const r = await saveOpportunity(svc, { ...draft, probability: null, stage: "develop" });
    expect(r).toMatchObject({ ok: true, record: { probability: 25, stage: "develop" } });
  });

  it("refuses to edit a closed Opportunity", async () => {
    const { svc, updates } = mockService();
    expect(await saveOpportunity(svc, draft, opp({ status: "won" }))).toEqual({ ok: false, reason: "closed" });
    expect(updates).toEqual([]);
  });

  it("updates an Open Opportunity, keeping an edited probability", async () => {
    const { svc, updates } = mockService();
    await saveOpportunity(svc, draft, opp());
    expect(updates[0].patch).toMatchObject({ name: "Deal", probability: 40 });
  });
});

describe("Kanban grouping and totals", () => {
  const all = [
    opp({ id: "1", stage: "qualify", estimatedRevenue: 100 }),
    opp({ id: "2", stage: "qualify", estimatedRevenue: null }),
    opp({ id: "3", stage: "propose", estimatedRevenue: 250 }),
    opp({ id: "4", stage: "close", status: "won", estimatedRevenue: 999 }),
    opp({ id: "5", stage: "develop", status: "lost", estimatedRevenue: 999 }),
  ];

  it("groups Open Opportunities by Stage with count and value, all four Stages present", () => {
    const cols = buildPipeline(all);
    expect(cols.map((c) => [c.stage, c.count, c.total])).toEqual([
      ["qualify", 2, 100], ["develop", 0, 0], ["propose", 1, 250], ["close", 0, 0],
    ]);
    expect(cols[0].items.map((o) => o.id)).toEqual(["1", "2"]);
  });

  it("total value and count cover Open Opportunities only", () => {
    expect(openPipelineTotals(all)).toEqual({ count: 3, total: 350 });
  });
});

describe("filterOpportunities", () => {
  const all = [opp({ id: "1", name: "Website" }), opp({ id: "2", name: "CRM", accountName: "Fabrikam" })];
  it("matches name, Account or Contact, case-insensitively", () => {
    expect(filterOpportunities(all, "fabri").map((o) => o.id)).toEqual(["2"]);
    expect(filterOpportunities(all, "WEB").map((o) => o.id)).toEqual(["1"]);
    expect(filterOpportunities(all, " ").length).toBe(2);
  });
});

describe("loadAllPages", () => {
  it("follows skip tokens and drops duplicates", async () => {
    const pages: Record<string, { items: Opportunity[]; skipToken?: string }> = {
      start: { items: [opp({ id: "1" })], skipToken: "t" },
      t: { items: [opp({ id: "1" }), opp({ id: "2" })] },
    };
    const items = await loadAllPages(async (t) => pages[t ?? "start"]);
    expect(items.map((o) => o.id)).toEqual(["1", "2"]);
  });
});
