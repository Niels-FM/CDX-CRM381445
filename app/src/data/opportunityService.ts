import { getClient, type DataClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";
import {
  STAGES,
  type Opportunity,
  type OpportunityPatch,
  type OpportunityService,
  type Stage,
  type Status,
} from "../domain/pipeline.ts";
import type { Page } from "../domain/customers.ts";

const OPPORTUNITIES = "nvdb_opportunities";
const ACCOUNTS = "accounts";
const CONTACTS = "contacts";
const USERS = "systemusers";
const PAGE_SIZE = 100;
const ID_CHUNK = 20;

/** Choice values from the generated model (nvdb_stage / nvdb_opportunitystatus). */
const STAGE_BASE = 534210000;
const STATUSES: Status[] = ["open", "won", "lost"];
const stageValue = (s: Stage) => STAGE_BASE + STAGES.indexOf(s);
const statusValue = (s: Status) => STAGE_BASE + STATUSES.indexOf(s);

export interface OpportunityRow {
  nvdb_opportunityid: string;
  nvdb_name: string | null;
  nvdb_stage: number | null;
  nvdb_opportunitystatus: number | null;
  nvdb_estimatedrevenue: number | null;
  nvdb_estimatedclosedate: string | null;
  nvdb_probability: number | null;
  nvdb_lostreason: string | null;
  nvdb_closeddate: string | null;
  _nvdb_accountid_value: string | null;
  _nvdb_contactid_value: string | null;
  _ownerid_value: string;
}

export const OPPORTUNITY_SELECT = [
  "nvdb_opportunityid", "nvdb_name", "nvdb_stage", "nvdb_opportunitystatus", "nvdb_estimatedrevenue", "nvdb_estimatedclosedate",
  "nvdb_probability", "nvdb_lostreason", "nvdb_closeddate", "_nvdb_accountid_value", "_nvdb_contactid_value", "_ownerid_value",
];

export const toOpportunity = (r: OpportunityRow, names: { accounts: Map<string, string>; contacts: Map<string, string>; users: Map<string, string> }): Opportunity => ({
  id: r.nvdb_opportunityid,
  name: r.nvdb_name ?? "",
  accountId: r._nvdb_accountid_value ?? "",
  accountName: (r._nvdb_accountid_value && names.accounts.get(r._nvdb_accountid_value)) || "",
  contactId: r._nvdb_contactid_value,
  contactName: (r._nvdb_contactid_value && names.contacts.get(r._nvdb_contactid_value)) || "",
  stage: STAGES[(r.nvdb_stage ?? STAGE_BASE) - STAGE_BASE] ?? "qualify",
  status: STATUSES[(r.nvdb_opportunitystatus ?? STAGE_BASE) - STAGE_BASE] ?? "open",
  estimatedRevenue: r.nvdb_estimatedrevenue,
  estimatedCloseDate: r.nvdb_estimatedclosedate?.slice(0, 10) ?? null,
  probability: r.nvdb_probability,
  lostReason: r.nvdb_lostreason ?? "",
  closedDate: r.nvdb_closeddate?.slice(0, 10) ?? null,
  ownerId: r._ownerid_value,
  ownerName: names.users.get(r._ownerid_value) ?? "",
});

/** Dataverse column names and the typed navigation properties (nvdb_Accountid / nvdb_Contactid) for a patch. */
export function opportunityBody(p: OpportunityPatch): Record<string, unknown> {
  const b: Record<string, unknown> = {};
  if (p.name !== undefined) b.nvdb_name = p.name;
  if (p.accountId !== undefined) b["nvdb_Accountid@odata.bind"] = p.accountId ? `/accounts(${p.accountId})` : null;
  if (p.contactId !== undefined) b["nvdb_Contactid@odata.bind"] = p.contactId ? `/contacts(${p.contactId})` : null;
  if (p.estimatedRevenue !== undefined) b.nvdb_estimatedrevenue = p.estimatedRevenue;
  if (p.estimatedCloseDate !== undefined) b.nvdb_estimatedclosedate = p.estimatedCloseDate;
  if (p.probability !== undefined) b.nvdb_probability = p.probability;
  if (p.stage !== undefined) b.nvdb_stage = stageValue(p.stage);
  if (p.status !== undefined) b.nvdb_opportunitystatus = statusValue(p.status);
  if (p.lostReason !== undefined) b.nvdb_lostreason = p.lostReason || null;
  if (p.closedDate !== undefined) b.nvdb_closeddate = p.closedDate;
  return b;
}

export function createDataverseOpportunityService(client: DataClient): OpportunityService {
  const must = <T>(r: { success: boolean; data: T; error?: unknown }): T => {
    if (!r.success) {
      const e = r.error;
      throw e instanceof Error ? e : new Error(e ? JSON.stringify(e) : "Dataverse request failed");
    }
    return r.data;
  };

  async function namesOf(source: string, key: string, nameColumn: string, ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((i): i is string => !!i))];
    const chunks: string[][] = [];
    for (let i = 0; i < unique.length; i += ID_CHUNK) chunks.push(unique.slice(i, i + ID_CHUNK));
    const out = new Map<string, string>();
    await Promise.all(
      chunks.map(async (chunk) => {
        const rows = must(
          await client.retrieveMultipleRecordsAsync<Record<string, string | null>>(source, {
            select: [key, nameColumn],
            filter: chunk.map((i) => `${key} eq ${i}`).join(" or "),
          }),
        );
        for (const r of rows) out.set(r[key] as string, r[nameColumn] ?? "");
      }),
    );
    return out;
  }

  async function hydrate(rows: OpportunityRow[]): Promise<Opportunity[]> {
    const [accounts, contacts, users] = await Promise.all([
      namesOf(ACCOUNTS, "accountid", "name", rows.map((r) => r._nvdb_accountid_value)),
      namesOf(CONTACTS, "contactid", "fullname", rows.map((r) => r._nvdb_contactid_value)),
      namesOf(USERS, "systemuserid", "fullname", rows.map((r) => r._ownerid_value)),
    ]);
    return rows.map((r) => toOpportunity(r, { accounts, contacts, users }));
  }

  const get = async (id: string) => {
    const row = must(await client.retrieveRecordAsync<OpportunityRow>(OPPORTUNITIES, id, { select: OPPORTUNITY_SELECT }));
    return (await hydrate([row]))[0];
  };

  return {
    async listOpportunities(q): Promise<Page<Opportunity>> {
      const r = await client.retrieveMultipleRecordsAsync<OpportunityRow>(OPPORTUNITIES, {
        select: OPPORTUNITY_SELECT, orderBy: ["createdon desc", "nvdb_opportunityid"], maxPageSize: PAGE_SIZE, skipToken: q.skipToken,
      });
      return { items: await hydrate(must(r)), skipToken: r.skipToken };
    },
    getOpportunity: get,
    async createOpportunity(d) {
      const row = must(
        await client.createRecordAsync<object, OpportunityRow>(OPPORTUNITIES, opportunityBody({
          name: d.name, accountId: d.accountId, contactId: d.contactId, estimatedRevenue: d.estimatedRevenue,
          estimatedCloseDate: d.estimatedCloseDate, probability: d.probability, stage: d.stage,
        })),
      );
      return get(row.nvdb_opportunityid);
    },
    async updateOpportunity(id, patch) {
      must(await client.updateRecordAsync(OPPORTUNITIES, id, opportunityBody(patch)));
      return get(id);
    },
  };
}

let instance: OpportunityService | undefined;
export function getOpportunityService(): OpportunityService {
  instance ??= createDataverseOpportunityService(getClient(dataSourcesInfo));
  return instance;
}
