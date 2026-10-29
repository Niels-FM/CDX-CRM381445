import { getClient, type DataClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";
import type { DashboardActivity, DashboardLead, DashboardService } from "../domain/dashboard.ts";
import type { ActivityKind, ParentType } from "../domain/timeline.ts";

const PAGE_SIZE = 5000;
const FORMATTED = "@OData.Community.Display.V1.FormattedValue";
const KIND_BY_CODE: Record<string, ActivityKind> = { task: "task", phonecall: "call", appointment: "meeting" };
const PARENT_TYPES: ParentType[] = ["nvdb_lead", "nvdb_opportunity", "account", "contact"];

interface LeadRow {
  nvdb_leadid: string;
  createdon: string;
  _ownerid_value: string;
}
interface ActivityRow {
  activityid: string;
  activitytypecode: string;
  subject: string | null;
  scheduledend: string;
  regardingobjecttypecode: string | null;
  _regardingobjectid_value: string | null;
  _ownerid_value: string;
}

export function createDataverseDashboardService(client: DataClient): DashboardService {
  const must = <T>(r: { success: boolean; data: T; error?: unknown }): T => {
    if (!r.success) {
      const e = r.error;
      throw e instanceof Error ? e : new Error(e ? JSON.stringify(e) : "Dataverse request failed");
    }
    return r.data;
  };

  return {
    async listLeads(q) {
      const r = await client.retrieveMultipleRecordsAsync<LeadRow>("nvdb_leads", {
        select: ["nvdb_leadid", "createdon", "_ownerid_value"],
        orderBy: ["nvdb_leadid"],
        maxPageSize: PAGE_SIZE,
        skipToken: q.skipToken,
      });
      const items: DashboardLead[] = must(r).map((row) => ({ id: row.nvdb_leadid, createdOn: row.createdon, ownerId: row._ownerid_value }));
      return { items, skipToken: r.skipToken };
    },
    async listOpenActivities(q) {
      const r = await client.retrieveMultipleRecordsAsync<ActivityRow>("activitypointers", {
        select: ["activityid", "activitytypecode", "subject", "scheduledend", "regardingobjecttypecode", "_regardingobjectid_value", "_ownerid_value"],
        filter: "statecode eq 0 and scheduledend ne null",
        orderBy: ["scheduledend", "activityid"],
        maxPageSize: PAGE_SIZE,
        skipToken: q.skipToken,
      });
      const items: DashboardActivity[] = must(r)
        .filter((row) => KIND_BY_CODE[row.activitytypecode])
        .map((row) => ({
          id: row.activityid,
          subject: row.subject ?? "",
          kind: KIND_BY_CODE[row.activitytypecode],
          due: row.scheduledend,
          ownerId: row._ownerid_value,
          regardingId: row._regardingobjectid_value ?? "",
          regardingType: PARENT_TYPES.find((t) => t === row.regardingobjecttypecode) ?? null,
          regardingName: String((row as unknown as Record<string, unknown>)[`_regardingobjectid_value${FORMATTED}`] ?? ""),
        }));
      return { items, skipToken: r.skipToken };
    },
  };
}

let instance: DashboardService | undefined;
export function getDashboardService(): DashboardService {
  instance ??= createDataverseDashboardService(getClient(dataSourcesInfo));
  return instance;
}
