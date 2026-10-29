import { describe, expect, it } from "vitest";
import type { Account, Contact, CustomerService } from "./customers.ts";
import type { Lead } from "./leads.ts";
import { buildQualifyRequest, loadSuggestions, qualifyLead, type QualifyChoice, type QualifyService } from "./qualify.ts";

const lead = (over: Partial<Lead> = {}): Lead => ({
  id: "l1", topic: "Ann Lee", firstName: "Ann", lastName: "Lee", companyName: "Contoso", jobTitle: "", email: "ann@x.com", phone: "",
  source: null, rating: null, status: "new", disqualifyReason: "", ownerId: "u1", ...over,
});
const account = (id: string, name: string): Account => ({ id, name, phone: "", website: "", ownerId: "u1" });
const contact = (id: string, email: string): Contact => ({
  id, firstName: "Ann", lastName: "Lee", fullName: "Ann Lee", email, phone: "", jobTitle: "", accountId: null, accountName: "", ownerId: "u1",
});

const customers = (accounts: Account[], contacts: Contact[]) =>
  ({ findAccountsByName: async () => accounts, findContactsByEmail: async () => contacts }) as unknown as CustomerService;

describe("loadSuggestions", () => {
  it("preselects the exact-name Account and the Contact with the same email, ignoring case", async () => {
    const s = await loadSuggestions(customers([account("a1", "contoso"), account("a2", "Contoso Ltd")], [contact("c1", "ANN@x.com")]), lead());
    expect(s.accountId).toBe("a1");
    expect(s.contactId).toBe("c1");
    expect(s.accounts.map((a) => a.id)).toEqual(["a1", "a2"]);
  });
  it("preselects nothing when no candidate matches exactly", async () => {
    const s = await loadSuggestions(customers([account("a2", "Contoso Ltd")], [contact("c1", "other@x.com")]), lead());
    expect(s.accountId).toBeNull();
    expect(s.contactId).toBeNull();
  });
  it("does not search without a company or an email", async () => {
    const boom = async () => { throw new Error("must not be called"); };
    const s = await loadSuggestions({ findAccountsByName: boom, findContactsByEmail: boom } as unknown as CustomerService, lead({ companyName: " ", email: "" }));
    expect(s.accounts).toEqual([]);
    expect(s.contacts).toEqual([]);
  });
});

const choice = (over: Partial<QualifyChoice> = {}): QualifyChoice => ({
  accountId: null, contactId: null, createOpportunity: true, opportunityName: "", estimatedRevenue: "", estimatedCloseDate: "", ...over,
});

describe("buildQualifyRequest", () => {
  it("always sends createOpportunity and omits what was not chosen", () => {
    expect(buildQualifyRequest("l1", choice())).toEqual({ LeadId: "l1", CreateOpportunity: true });
  });
  it("sends the chosen existing Account and Contact and the Opportunity details", () => {
    expect(buildQualifyRequest("l1", choice({ accountId: "a1", contactId: "c1", opportunityName: " Big ", estimatedRevenue: "1500.5", estimatedCloseDate: "2027-01-31" }))).toEqual({
      LeadId: "l1", CreateOpportunity: true, AccountId: "a1", ContactId: "c1", OpportunityName: "Big", EstimatedRevenue: 1500.5,
      EstimatedCloseDate: "2027-01-31T00:00:00Z",
    });
  });
  it("sends no Opportunity details when the Opportunity is skipped", () => {
    expect(buildQualifyRequest("l1", choice({ createOpportunity: false, opportunityName: "Big", estimatedRevenue: "5" }))).toEqual({
      LeadId: "l1", CreateOpportunity: false,
    });
  });
});

describe("qualifyLead", () => {
  const svc = (calls: unknown[]): QualifyService => ({
    qualify: async (r) => { calls.push(r); return { accountId: "a9", contactId: "c9", opportunityId: null }; },
  });
  it("rejects a Lead that is already Qualified or Disqualified without calling the server", async () => {
    const calls: unknown[] = [];
    for (const status of ["qualified", "disqualified"] as const) {
      expect(await qualifyLead(svc(calls), lead({ status }), choice())).toEqual({ status: "invalid", message: "status" });
    }
    expect(calls).toEqual([]);
  });
  it("needs a company to create an Account and a last name to create a Contact", async () => {
    const calls: unknown[] = [];
    expect(await qualifyLead(svc(calls), lead({ companyName: " " }), choice())).toEqual({ status: "invalid", message: "company" });
    expect(await qualifyLead(svc(calls), lead({ lastName: "" }), choice())).toEqual({ status: "invalid", message: "lastName" });
    expect(await qualifyLead(svc(calls), lead({ companyName: "", lastName: "" }), choice({ accountId: "a1", contactId: "c1" }))).toMatchObject({ status: "saved" });
    expect(calls).toHaveLength(1);
  });
  it("rejects a revenue that is not a number", async () => {
    expect(await qualifyLead(svc([]), lead(), choice({ estimatedRevenue: "abc" }))).toEqual({ status: "invalid", message: "revenue" });
  });
  it("returns the ids the server created", async () => {
    expect(await qualifyLead(svc([]), lead(), choice())).toEqual({
      status: "saved", record: { accountId: "a9", contactId: "c9", opportunityId: null },
    });
  });
});
