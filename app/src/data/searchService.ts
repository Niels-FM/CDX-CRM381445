import { getClient, type DataClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";
import type { SearchHit, SearchKind, SearchService } from "../domain/search.ts";

interface Spec {
  table: string;
  select: string[];
  orderBy: string;
  toHit: (r: Record<string, string | null>) => SearchHit;
}

const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");

export const SEARCH_SPECS: Record<SearchKind, Spec> = {
  account: {
    table: "accounts",
    select: ["accountid", "name", "telephone1", "websiteurl"],
    orderBy: "name",
    toHit: (r) => ({ id: r.accountid!, title: r.name ?? "", subtitle: join(r.telephone1, r.websiteurl) }),
  },
  contact: {
    table: "contacts",
    select: ["contactid", "fullname", "emailaddress1", "telephone1"],
    orderBy: "fullname",
    toHit: (r) => ({ id: r.contactid!, title: r.fullname ?? "", subtitle: join(r.emailaddress1, r.telephone1) }),
  },
  lead: {
    table: "nvdb_leads",
    select: ["nvdb_leadid", "nvdb_topic", "nvdb_companyname", "nvdb_email"],
    orderBy: "nvdb_topic",
    toHit: (r) => ({ id: r.nvdb_leadid!, title: r.nvdb_topic ?? "", subtitle: join(r.nvdb_companyname, r.nvdb_email) }),
  },
  opportunity: {
    table: "nvdb_opportunities",
    select: ["nvdb_opportunityid", "nvdb_name"],
    orderBy: "nvdb_name",
    toHit: (r) => ({ id: r.nvdb_opportunityid!, title: r.nvdb_name ?? "", subtitle: "" }),
  },
};

export function createDataverseSearchService(client: DataClient): SearchService {
  const run = (kind: SearchKind) => async (filter: string, top: number): Promise<SearchHit[]> => {
    const s = SEARCH_SPECS[kind];
    const r = await client.retrieveMultipleRecordsAsync<Record<string, string | null>>(s.table, {
      select: s.select, filter, orderBy: [s.orderBy], top,
    });
    if (!r.success) throw r.error instanceof Error ? r.error : new Error("Search request failed");
    return r.data.map(s.toHit);
  };
  return { account: run("account"), contact: run("contact"), lead: run("lead"), opportunity: run("opportunity") };
}

let instance: SearchService | undefined;
export function getSearchService(): SearchService {
  instance ??= createDataverseSearchService(getClient(dataSourcesInfo));
  return instance;
}
