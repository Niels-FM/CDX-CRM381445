import { describe, expect, it } from "vitest";
import { opportunityBody, toOpportunity, type OpportunityRow } from "./opportunityService.ts";

describe("opportunityBody", () => {
  it("binds Account and Contact through the typed navigation properties", () => {
    expect(opportunityBody({ accountId: "a1", contactId: null })).toEqual({
      "nvdb_Accountid@odata.bind": "/accounts(a1)",
      "nvdb_Contactid@odata.bind": null,
    });
  });

  it("maps Stage and Status to the Dataverse choice values", () => {
    expect(opportunityBody({ stage: "propose", status: "lost", lostReason: "Price" })).toEqual({
      nvdb_stage: 534210002,
      nvdb_opportunitystatus: 534210002,
      nvdb_lostreason: "Price",
    });
  });

  it("reopen clears the closed date and lost reason", () => {
    expect(opportunityBody({ status: "open", closedDate: null, lostReason: "" })).toEqual({
      nvdb_opportunitystatus: 534210000,
      nvdb_closeddate: null,
      nvdb_lostreason: null,
    });
  });
});

describe("toOpportunity", () => {
  it("maps a row and resolves names", () => {
    const row: OpportunityRow = {
      nvdb_opportunityid: "o1", nvdb_name: "Deal", nvdb_stage: 534210003, nvdb_opportunitystatus: 534210001, nvdb_estimatedrevenue: 5,
      nvdb_estimatedclosedate: "2026-11-01T00:00:00Z", nvdb_probability: 90, nvdb_lostreason: null, nvdb_closeddate: "2026-10-27",
      _nvdb_accountid_value: "a1", _nvdb_contactid_value: null, _ownerid_value: "u1",
    };
    const o = toOpportunity(row, { accounts: new Map([["a1", "Contoso"]]), contacts: new Map(), users: new Map([["u1", "Rep A"]]) });
    expect(o).toMatchObject({ stage: "close", status: "won", accountName: "Contoso", ownerName: "Rep A", estimatedCloseDate: "2026-11-01" });
  });
});
