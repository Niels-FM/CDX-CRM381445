import { getClient, type DataClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";
import type {
  ActivityDraft,
  ActivityKind,
  OpenActivity,
  ParentRef,
  TimelineItem,
  TimelineService,
} from "../domain/timeline.ts";
import { TIMELINE_PAGE_SIZE } from "../domain/timeline.ts";

const FORMATTED = "@OData.Community.Display.V1.FormattedValue";

/** Dataverse activity type code, entity set and the status pair that means "done" for each Activity kind. */
const ACTIVITY: Record<ActivityKind, { code: string; set: string; done: { statecode: number; statuscode: number } }> = {
  task: { code: "task", set: "tasks", done: { statecode: 1, statuscode: 5 } },
  call: { code: "phonecall", set: "phonecalls", done: { statecode: 1, statuscode: 2 } },
  meeting: { code: "appointment", set: "appointments", done: { statecode: 1, statuscode: 3 } },
};
const KIND_BY_CODE: Record<string, ActivityKind> = { task: "task", phonecall: "call", appointment: "meeting" };
const NOTES = "annotations";
const ACTIVITIES = "activitypointers";
/** Any registered data source resolves the environment for an unbound Custom API call. */
const API_SOURCE = "accounts";

const param = (name: string, type: string, format?: string) => ({ name, in: "body", required: false, type, ...(format ? { format } : {}) });
const api = (name: string, parameters: ReturnType<typeof param>[]) => ({ path: `/api/data/v9.2/${name}`, method: "POST", parameters, responses: {} });

/** The generated data source info has no Custom API metadata, so the unbound actions are declared here. */
const withTimelineApis = {
  ...dataSourcesInfo,
  [API_SOURCE]: {
    ...dataSourcesInfo[API_SOURCE],
    apis: {
      nvdb_AddActivity: api("nvdb_AddActivity", [param("ParentType", "string"), param("ParentId", "string"), param("ActivityType", "string"), param("Subject", "string"), param("DueDate", "string", "date-time"), param("Description", "string")]),
      nvdb_AddNote: api("nvdb_AddNote", [param("ParentType", "string"), param("ParentId", "string"), param("Text", "string"), param("Subject", "string")]),
    },
  },
};

interface ActivityRow {
  activityid: string;
  activitytypecode: string;
  subject: string | null;
  description: string | null;
  scheduledend: string | null;
  modifiedon: string;
  statecode: number;
  _ownerid_value: string;
}
interface NoteRow {
  annotationid: string;
  subject: string | null;
  notetext: string | null;
  modifiedon: string;
  _ownerid_value: string;
}

const ownerName = (r: object) => String((r as Record<string, unknown>)[`_ownerid_value${FORMATTED}`] ?? "");

const fromActivity = (r: ActivityRow, planned: boolean): TimelineItem => ({
  id: r.activityid,
  kind: KIND_BY_CODE[r.activitytypecode] ?? "task",
  subject: r.subject ?? "",
  text: r.description ?? "",
  date: (planned ? r.scheduledend : r.modifiedon) ?? r.modifiedon,
  done: r.statecode !== 0,
  ownerId: r._ownerid_value,
  ownerName: ownerName(r),
});
const fromNote = (r: NoteRow): TimelineItem => ({
  id: r.annotationid,
  kind: "note",
  subject: r.subject ?? "",
  text: r.notetext ?? "",
  date: r.modifiedon,
  done: true,
  ownerId: r._ownerid_value,
  ownerName: ownerName(r),
});

const kindFilter = (kinds: ActivityKind[]) => `(${kinds.map((k) => `activitytypecode eq '${ACTIVITY[k].code}'`).join(" or ")})`;

export function createDataverseTimelineService(client: DataClient): TimelineService {
  const must = <T>(r: { success: boolean; data: T; error?: unknown }): T => {
    if (!r.success) {
      const e = r.error;
      throw e instanceof Error ? e : new Error(e ? JSON.stringify(e) : "Dataverse request failed");
    }
    return r.data;
  };
  const setOf = (item: TimelineItem) => (item.kind === "note" ? NOTES : ACTIVITY[item.kind].set);

  async function activities(parent: ParentRef, filter: string, orderBy: string[], planned: boolean, skipToken?: string) {
    const r = await client.retrieveMultipleRecordsAsync<ActivityRow>(ACTIVITIES, {
      select: ["activityid", "activitytypecode", "subject", "description", "scheduledend", "modifiedon", "statecode", "_ownerid_value"],
      filter: `_regardingobjectid_value eq ${parent.id} and ${filter}`,
      orderBy,
      maxPageSize: TIMELINE_PAGE_SIZE,
      skipToken,
    });
    return { items: must(r).map((row) => fromActivity(row, planned)), skipToken: r.skipToken };
  }

  async function execute(operationName: string, body: Record<string, unknown>) {
    must(await client.executeAsync({ dataverseRequest: { action: "customapi", parameters: { operationName, tableName: API_SOURCE, body } } }));
  }

  return {
    listPlanned: (parent, q) => activities(parent, `statecode eq 0 and ${kindFilter(q.kinds)}`, ["scheduledend", "activityid"], true, q.skipToken),
    listDoneActivities: (parent, q) => activities(parent, `statecode ne 0 and ${kindFilter(q.kinds)}`, ["modifiedon desc", "activityid"], false, q.skipToken),
    async listNotes(parent, q) {
      const r = await client.retrieveMultipleRecordsAsync<NoteRow>(NOTES, {
        select: ["annotationid", "subject", "notetext", "modifiedon", "_ownerid_value"],
        filter: `_objectid_value eq ${parent.id}`,
        orderBy: ["modifiedon desc", "annotationid"],
        maxPageSize: TIMELINE_PAGE_SIZE,
        skipToken: q.skipToken,
      });
      return { items: must(r).map(fromNote), skipToken: r.skipToken };
    },
    async listOpenActivities(q) {
      const r = await client.retrieveMultipleRecordsAsync<{ scheduledend: string | null; _regardingobjectid_value: string }>(ACTIVITIES, {
        select: ["scheduledend", "_regardingobjectid_value"],
        filter: "statecode eq 0 and regardingobjecttypecode eq 'nvdb_opportunity'",
        orderBy: ["activityid"],
        maxPageSize: 5000,
        skipToken: q.skipToken,
      });
      const items: OpenActivity[] = must(r)
        .filter((row) => row.scheduledend)
        .map((row) => ({ regardingId: row._regardingobjectid_value, due: row.scheduledend! }));
      return { items, skipToken: r.skipToken };
    },
    addActivity: (parent, d: ActivityDraft) =>
      execute("nvdb_AddActivity", {
        ParentType: parent.type,
        ParentId: parent.id,
        ActivityType: ACTIVITY[d.kind].code,
        Subject: d.subject,
        DueDate: new Date(d.due).toISOString(),
        ...(d.description ? { Description: d.description } : {}),
      }),
    addNote: (parent, text) => execute("nvdb_AddNote", { ParentType: parent.type, ParentId: parent.id, Text: text }),
    async markDone(item) {
      if (item.kind === "note") return;
      must(await client.updateRecordAsync(setOf(item), item.id, ACTIVITY[item.kind].done));
    },
    async updateItem(item, patch) {
      const body: Record<string, unknown> =
        item.kind === "note" ? { notetext: patch.text } : { subject: patch.subject ?? item.subject, description: patch.text };
      must(await client.updateRecordAsync(setOf(item), item.id, body));
    },
    async deleteItem(item) {
      must(await client.deleteRecordAsync(setOf(item), item.id));
    },
  };
}

let instance: TimelineService | undefined;
export function getTimelineService(): TimelineService {
  instance ??= createDataverseTimelineService(getClient(withTimelineApis));
  return instance;
}
