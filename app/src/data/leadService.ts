import { getClient, type DataClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";
import { odataString, type ListQuery, type Page } from "../domain/customers.ts";
import { leadTopic, type Lead, type LeadDraft, type LeadRating, type LeadService, type LeadSource, type LeadStatus } from "../domain/leads.ts";

const PAGE_SIZE = 25;
const DUPLICATE_LIMIT = 10;
const LEADS = "nvdb_leads";
const OPTION_BASE = 534210000;

const optionList = <T extends string>(keys: readonly T[]) => ({
  toValue: (k: T | null) => (k === null ? null : OPTION_BASE + keys.indexOf(k)),
  fromValue: (v: number | null | undefined): T | null => (v == null ? null : (keys[v - OPTION_BASE] ?? null)),
});
const sources = optionList<LeadSource>(["web", "referral", "event", "coldCall", "other"]);
const ratings = optionList<LeadRating>(["hot", "warm", "cold"]);
const statuses = optionList<LeadStatus>(["new", "contacted", "qualified", "disqualified"]);

interface LeadRow {
  nvdb_leadid: string;
  nvdb_topic: string | null;
  nvdb_firstname: string | null;
  nvdb_lastname: string | null;
  nvdb_companyname: string | null;
  nvdb_jobtitle: string | null;
  nvdb_email: string | null;
  nvdb_phone: string | null;
  nvdb_source: number | null;
  nvdb_rating: number | null;
  nvdb_leadstatus: number | null;
  nvdb_disqualifyreason: string | null;
  _ownerid_value: string;
}

const SELECT = [
  "nvdb_leadid", "nvdb_topic", "nvdb_firstname", "nvdb_lastname", "nvdb_companyname", "nvdb_jobtitle", "nvdb_email", "nvdb_phone",
  "nvdb_source", "nvdb_rating", "nvdb_leadstatus", "nvdb_disqualifyreason", "_ownerid_value",
];

const toLead = (r: LeadRow): Lead => ({
  id: r.nvdb_leadid,
  topic: r.nvdb_topic ?? "",
  firstName: r.nvdb_firstname ?? "",
  lastName: r.nvdb_lastname ?? "",
  companyName: r.nvdb_companyname ?? "",
  jobTitle: r.nvdb_jobtitle ?? "",
  email: r.nvdb_email ?? "",
  phone: r.nvdb_phone ?? "",
  source: sources.fromValue(r.nvdb_source),
  rating: ratings.fromValue(r.nvdb_rating),
  status: statuses.fromValue(r.nvdb_leadstatus) ?? "new",
  disqualifyReason: r.nvdb_disqualifyreason ?? "",
  ownerId: r._ownerid_value,
});

const leadBody = (d: LeadDraft) => ({
  nvdb_topic: leadTopic(d),
  nvdb_firstname: d.firstName || null,
  nvdb_lastname: d.lastName,
  nvdb_companyname: d.companyName || null,
  nvdb_jobtitle: d.jobTitle || null,
  nvdb_email: d.email || null,
  nvdb_phone: d.phone || null,
  nvdb_source: sources.toValue(d.source),
  nvdb_rating: ratings.toValue(d.rating),
});

export function createDataverseLeadService(client: DataClient): LeadService {
  const must = <T>(r: { success: boolean; data: T; error?: unknown }): T => {
    if (!r.success) {
      const e = r.error;
      throw e instanceof Error ? e : new Error(e ? JSON.stringify(e) : "Dataverse request failed");
    }
    return r.data;
  };

  const getLead = async (id: string) => toLead(must(await client.retrieveRecordAsync<LeadRow>(LEADS, id, { select: SELECT })));

  return {
    async listLeads(q: ListQuery): Promise<Page<Lead>> {
      const r = await client.retrieveMultipleRecordsAsync<LeadRow>(LEADS, {
        select: SELECT, filter: q.filter, orderBy: ["nvdb_topic", "nvdb_leadid"], maxPageSize: PAGE_SIZE, skipToken: q.skipToken,
      });
      return { items: must(r).map(toLead), skipToken: r.skipToken };
    },
    getLead,
    async findLeadDuplicates(p) {
      const parts = [
        p.email && `nvdb_email eq ${odataString(p.email)}`,
        p.companyName && `nvdb_companyname eq ${odataString(p.companyName)}`,
      ].filter(Boolean);
      if (!parts.length) return [];
      const rows = must(
        await client.retrieveMultipleRecordsAsync<LeadRow>(LEADS, { select: SELECT, filter: parts.join(" or "), top: DUPLICATE_LIMIT }),
      );
      return rows.map(toLead);
    },
    async createLead(d) {
      const row = must(await client.createRecordAsync<object, LeadRow>(LEADS, leadBody(d)));
      return getLead(row.nvdb_leadid);
    },
    async updateLead(id, d) {
      must(await client.updateRecordAsync(LEADS, id, leadBody(d)));
      return getLead(id);
    },
    async setStatus(id, status, reason) {
      must(await client.updateRecordAsync(LEADS, id, { nvdb_leadstatus: statuses.toValue(status), nvdb_disqualifyreason: reason || null }));
      return getLead(id);
    },
  };
}

let instance: LeadService | undefined;
export function getLeadService(): LeadService {
  instance ??= createDataverseLeadService(getClient(dataSourcesInfo));
  return instance;
}
