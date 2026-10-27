import { describe, expect, it } from "vitest";
import {
  buildLeadFilter,
  canTransition,
  changeStatus,
  leadTopic,
  submitLead,
  type Lead,
  type LeadDraft,
  type LeadService,
} from "./leads.ts";

const lead = (over: Partial<Lead> = {}): Lead => ({
  id: "l1", topic: "Ann Lee", firstName: "Ann", lastName: "Lee", companyName: "Contoso", jobTitle: "", email: "ann@x.com", phone: "",
  source: null, rating: null, status: "new", disqualifyReason: "", ownerId: "u1", ...over,
});
const draft = (over: Partial<LeadDraft> = {}): LeadDraft => ({
  firstName: "Ann", lastName: "Lee", companyName: "Contoso", jobTitle: "", email: "ann@x.com", phone: "", source: null, rating: null, ...over,
});

function mockService(over: Partial<LeadService> = {}): LeadService {
  return {
    listLeads: async () => ({ items: [] }),
    getLead: async () => lead(),
    findLeadDuplicates: async () => [],
    createLead: async (d) => lead({ ...d, id: "new" }),
    updateLead: async (id, d) => lead({ ...d, id }),
    setStatus: async (id, status, reason) => lead({ id, status, disqualifyReason: reason }),
    ...over,
  };
}

describe("canTransition", () => {
  it("moves between New and Contacted and into Disqualified", () => {
    expect(canTransition("new", "contacted")).toBe(true);
    expect(canTransition("contacted", "new")).toBe(true);
    expect(canTransition("new", "disqualified")).toBe(true);
    expect(canTransition("contacted", "disqualified")).toBe(true);
  });
  it("reaches Qualified only through Qualify, never by hand", () => {
    expect(canTransition("new", "qualified")).toBe(false);
    expect(canTransition("contacted", "qualified")).toBe(false);
  });
  it("leaves Qualified for nowhere and Disqualified only back to New", () => {
    expect(canTransition("qualified", "new")).toBe(false);
    expect(canTransition("disqualified", "new")).toBe(true);
    expect(canTransition("disqualified", "contacted")).toBe(false);
  });
});

describe("changeStatus", () => {
  it("requires a reason to disqualify", async () => {
    const setStatus = async () => { throw new Error("must not be called"); };
    const r = await changeStatus(mockService({ setStatus }), lead(), "disqualified", "  ");
    expect(r).toEqual({ status: "invalid", message: "reason" });
  });
  it("disqualifies with the trimmed reason", async () => {
    const r = await changeStatus(mockService(), lead(), "disqualified", " no budget ");
    expect(r).toMatchObject({ status: "saved", record: { status: "disqualified", disqualifyReason: "no budget" } });
  });
  it("clears the reason when un-disqualifying", async () => {
    const r = await changeStatus(mockService(), lead({ status: "disqualified", disqualifyReason: "x" }), "new");
    expect(r).toMatchObject({ status: "saved", record: { status: "new", disqualifyReason: "" } });
  });
  it("rejects a transition the rules do not allow", async () => {
    const r = await changeStatus(mockService(), lead({ status: "qualified" }), "new");
    expect(r).toEqual({ status: "invalid", message: "transition" });
  });
});

describe("submitLead duplicates", () => {
  it("warns on the same email, case-insensitively", async () => {
    const other = lead({ id: "l2" });
    const r = await submitLead(mockService({ findLeadDuplicates: async () => [other] }), draft({ email: "ANN@x.com" }), {});
    expect(r).toEqual({ status: "duplicates", matches: [other] });
  });
  it("warns on same name and company but not on name alone", async () => {
    const byName = lead({ id: "l2", email: "other@x.com" });
    const byNameOnly = lead({ id: "l3", email: "z@x.com", companyName: "Fabrikam" });
    const svc = mockService({ findLeadDuplicates: async () => [byName, byNameOnly] });
    const r = await submitLead(svc, draft({ email: "new@x.com" }), {});
    expect(r).toEqual({ status: "duplicates", matches: [byName] });
  });
  it("ignores the lead being edited and skips the check when force is set", async () => {
    const self = lead({ id: "l1" });
    const svc = mockService({ findLeadDuplicates: async () => [self] });
    expect((await submitLead(svc, draft(), { id: "l1", original: lead({ email: "old@x.com" }) })).status).toBe("saved");
    const dup = mockService({ findLeadDuplicates: async () => [lead({ id: "l2" })] });
    expect((await submitLead(dup, draft(), { force: true })).status).toBe("saved");
  });
  it("does not re-check when the identifying fields are unchanged", async () => {
    const svc = mockService({ findLeadDuplicates: async () => [lead({ id: "l2" })] });
    expect((await submitLead(svc, draft(), { id: "l1", original: lead() })).status).toBe("saved");
  });
  it("requires a last name and builds the topic from the name", async () => {
    expect(await submitLead(mockService(), draft({ lastName: " " }), {})).toEqual({ status: "invalid", message: "lastName" });
    expect(leadTopic(draft({ firstName: "Ann", lastName: "Lee" }))).toBe("Ann Lee");
  });
});

describe("buildLeadFilter", () => {
  it("searches name, company and email, escaping quotes; short text means no filter", () => {
    expect(buildLeadFilter("a")).toBeUndefined();
    expect(buildLeadFilter("O'Neil")).toBe(
      "(contains(nvdb_topic,'O''Neil') or contains(nvdb_companyname,'O''Neil') or contains(nvdb_email,'O''Neil'))",
    );
  });
});
