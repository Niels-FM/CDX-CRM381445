# Code App capabilities and Dataverse limits (issue #2)

Researched 2026-10-23. Sources are Microsoft Learn and official `microsoft/*` GitHub repos only. Facts marked **[not documented]** have no primary-source statement; treat as unknown and spike before relying on them.

Sources:
- [Overview](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview)
- [Architecture](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/architecture)
- [Connect to Dataverse](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-dataverse)
- [Connect to data (connectors, connection references)](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-data)
- [Add flows](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/add-flows)
- [Add Dataverse action/function](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/add-dataverse-action-function)
- [ALM](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/alm)
- [System configuration](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/system-limits-configuration)
- [Web API: paging](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query/page-results), [batch/change sets](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/execute-batch-operations-using-web-api), [service protection limits](https://learn.microsoft.com/power-apps/developer/data-platform/api-limits)
- [`pac code` (legacy)](https://learn.microsoft.com/power-platform/developer/cli/reference/code)
- [microsoft/PowerAppsCodeApps](https://github.com/microsoft/PowerAppsCodeApps), [Dataverse sample](https://github.com/microsoft/PowerAppsCodeApps/tree/main/samples/Dataverse)

## Status and tooling

- Code apps are generally available (repo README). Single-page apps only; React/Vue etc. allowed (Architecture). The `starter` template is React + Vite + Tailwind + TanStack Query + React Router.
- SDK: npm `@microsoft/power-apps` (latest on npm: 1.5.0 at research time). Flows and Dataverse actions/functions need >= 1.1.1.
- **`pac code push` is legacy.** Current CLI is the npm-based `pa` CLI: `pa app init`, `pa app add data-source`, `pa app run`, `npm run build` then `pa app push`. `pac code` is preview and "will be deprecated in a future release" (pac code page). Design/docs should say `pa app push`.
- Node.js LTS (Dataverse sample requires v22+), Git, an environment with Dataverse and "Enable code apps" turned on in the admin center (Overview).

## Dataverse data access

Supported by the generated services (`src/generated/services/<Table>Service.ts`, models in `generated/models`):
- Create, Retrieve (`get`), RetrieveMultiple (`getAll`), Update, Delete.
- `getAll` options: `select`, `filter` (OData string), `orderBy`, `top`, `skip`, `skipToken`, `maxPageSize`. Docs say always use `select`.
- Delegation for Filter, Sort, Top; paging supported. Formatted values (labels) for choice/option set columns are retrievable. Table metadata retrievable.
- Image and file columns: upload/download/delete (**preview**).
- Works for standard and custom tables: add each with `pa app add data-source --connector dataverse --table <logical-name>`. **One native Dataverse table per command.** Schema changes: `pa app refresh data-source`.
- Update only the changed properties (docs warn full-record updates trigger business logic/auditing).

### Lookups
- Written with `@odata.bind`, e.g. `contact['parentcustomerid_account@odata.bind'] = '/accounts(<id>)'`; cleared with `null`. Associate-on-create is supported (same approach).
- Read as `_<column>_value` GUIDs; the sample resolves display names with a second `get` call. `$expand` use is **[not documented]** for the services.
- Docs say lookup ergonomics are still being improved.

### Explicitly unsupported (Connect to Dataverse)
- **Polymorphic lookups.** Impact: `regardingobjectid` on task/appointment/phonecall and `objectid` on annotation are polymorphic; so are `customerid`/`parentcustomerid` on contact/opportunity. Linking activities and notes to an nvdb_lead / nvdb_opportunity / account therefore needs a spike. A per-target typed lookup (e.g. `regardingobjectid_account@odata.bind`) may work but is not documented for the SDK.
- Schema/metadata CRUD (tables/columns must be created elsewhere, e.g. a solution).
- **FetchXML** (no aggregates/joins via the service; use OData `$filter`/`orderBy`, client-side grouping for Kanban).
- Alternate keys.

## Atomic Account + Contact + Opportunity on lead qualification

- Dataverse supports atomicity via Web API `$batch` **change sets** (all-or-nothing, rollback on failure; `Content-ID` references like `$1` allow linking records created in the same change set), equivalent to `ExecuteTransaction`.
- The code app docs do **not** document a batch/change-set or deep-insert API on the generated services (**[not documented]**; no "batch" hits in the official repo besides a sample-data doc). Do not assume the SDK can send change sets. The Dataverse sample says it uses generated services "exclusively (no direct API calls)".
- Documented atomic-capable options that the SDK does support:
  1. **Dataverse Custom API (unbound action) implemented by a plug-in**: server-side, one transaction. Add with `pa app find-dataverse-api` / `pa app add dataverse-api --api-name <Name>`; generates a typed `<Name>Service`. Unbound functions, unbound actions and bound actions (first arg is the record id) are demonstrated in the Dataverse sample (`WhoAmI`, `SetAutoNumberSeed`, `ConvertOwnerTeamToAccessTeam`). Typing: GUID = `string`, lookup params = `Record<string, unknown>`, complex returns = `Record<string, unknown>`.
  2. **Instant, solution-aware cloud flow with Power Apps trigger** (only that trigger type is supported; not atomic by itself: separate actions are separate calls unless the flow calls a Custom API).
- The built-in `QualifyLead` action targets the standard `lead` table; it does not know `nvdb_lead`, so a custom API is needed. (Inference; standard `lead` is not used in this plan.)
- Service protection limits (per user, 5-minute sliding window): 6,000 requests; 20 min combined execution time. Atomic server-side calls reduce request count.

## Timeline / Kanban UI

- No primary source says code apps can host the model-driven **Timeline control** or PCF components (PCF docs cover model-driven/canvas hosts). **[not documented]** Plan on a custom React timeline built from separate queries on task/appointment/phonecall/annotation (merge and sort client-side) and a custom Kanban (group by choice/status client-side). Whether `activitypointer` can be added as a data source was not verified.
- Notes (`annotation`) are standard table rows; file/image *columns* have upload/download (preview). Annotation `documentbody` handling via the service is **[not documented]**.

## Paging and limits

- Dataverse returns up to **5,000 rows per page** by default; max page size 5,000. **`$skip` is not supported**; page with `@odata.nextLink`/`$skiptoken` (SDK exposes `skipToken`). `$top` is ignored if `maxpagesize` is used. Always specify a deterministic order (include the primary key) when paging.
- The SDK option list includes `skip`, but Dataverse does not support `$skip`: prefer `skipToken` (inferred from the two docs; verify in a spike).
- "Delegation" is a canvas term; here it means filter/sort/top are sent to Dataverse as OData.

## Auth and security

- Microsoft Entra authentication handled by the Power Apps host; calls run as the signed-in user, so Dataverse security roles apply (flows doc: end users need e.g. the App Opener role or equivalent Dataverse permissions to invoke flows).
- Managed Platform policies apply: DLP, sharing limits, Conditional Access per app, app quarantine, tenant isolation, B2B. Not supported: Secure Implicit Connections, Power Apps for Windows.
- **Compiled assets are hosted on a publicly accessible endpoint without IP restriction**; never embed secrets or sensitive data in the bundle (System configuration). Restrict via Conditional Access.

## Hosting, deployment, ALM

- `pa app push` publishes the built app to the environment. With Dataverse, the app is placed in a solution automatically (preferred solution, else Default) or explicitly via `--solution-id <GUID>` / `PA_CLI_SOLUTION_ID` (names not accepted). Existing apps keep their membership unless `--solution-id` is passed.
- Move across environments by solution export/import or Power Platform Pipelines. Use **connection references** for connector data sources (`--connection-ref`, `--solution-id`).
- Not supported: Power Platform Git integration (keep the app source in this repo), Power BI integration, SharePoint forms.
- Header can be hidden: `pa app set-setting --show-header false` or `?hideNavBar=true`.

## Licensing

- End users need one of: Power Apps Premium license, pay-as-you-go, an App Pass, or auto-claim of a premium license (Overview). Plan for premium licences for all CRM users.

## Constraints that drive the design

1. Treat atomic qualification as a server-side **Custom API** (plug-in) called from the app; do not rely on client-side multi-step writes or SDK change sets.
2. Polymorphic lookups (activities/notes regarding, customer) are unsupported: spike how to set `regardingobjectid`/`objectid` for nvdb_* records.
3. No FetchXML, no `$skip`: Kanban/timeline use OData filter + `skipToken` paging + client-side grouping/merging.
4. Timeline and Kanban are custom React components.
5. Tables/columns/Custom API are created via solution outside the code app; the app consumes generated services.
6. Always `select` specific columns; update only changed fields.
7. Use `pa` CLI (not `pac code`), solution-targeted pushes, connection references.
8. Premium licensing and Dataverse security roles apply to every user.

## Open spikes (not answered by primary sources)

- Setting polymorphic lookups on task/appointment/phonecall/annotation via generated services.
- Batch/change-set or deep-insert availability from the SDK.
- `$expand` and `activitypointer` availability.
- Annotation attachment upload (`documentbody`).

## Polymorphic lookups spike (follow-up)

Legend: **[doc]** documented, **[src]** read from SDK source (`@microsoft/power-apps@1.5.0`), **[inferred]**, **[unverified]** needs a spike.

### 1. Typed navigation-property binding
- **[doc]** A polymorphic lookup is set like any single-valued navigation property: `"<NavProp>@odata.bind": "<entityset>(<id>)"`; names are case-sensitive, don't guess. Source: Learn "Use multi-table lookup columns" (webapi/multitable-lookup) and "Associate and disassociate tables" (webapi/associate-disassociate-entities-using-web-api).
- **[doc]** Nav-prop names per Web API reference: `activitypointer`: `regardingobjectid_account`, `regardingobjectid_contact`; `task`: `regardingobjectid_account_task`, `regardingobjectid_contact_task` (suffix = activity type); `annotation`: `objectid_account`, `objectid_contact`, `objectid_task`, `objectid_phonecall`, `objectid_appointment`. Refs: webapi/reference/task, /annotation.
- **[inferred]** Custom tables: `regardingobjectid_nvdb_lead_task`, `objectid_nvdb_lead`. Confirm from `$metadata` / relationship metadata.
- **[doc]** Custom tables need `HasActivities=true` and `HasNotes=true` at creation (cannot be disabled afterwards) to get these relationships. `nvdb_lead` does not exist yet in the dev env (MCP describe), so set both when creating.
- **[src]** `createRecordAsync<TInput,TResult>(table, record)` passes the payload through as the JSON body; the SDK does not strip `@odata.bind` keys. The official sample (`samples/Dataverse/src/hooks/useContacts.ts`, `LOOKUPS.md`) uses an `any` object with `'msa_managingpartnerid@odata.bind'` and `parentcustomerid_account@odata.bind` (polymorphic Customer).
- **[unverified]** The opaque host runtime accepts `regardingobjectid_*_task@odata.bind` on TasksService create. Clearing a lookup: LOOKUPS.md says `null`, the sample comment says separate `$ref` DELETE; unverified.

### 2. Raw request vs generated models
- **[src]** `DataClient` exposes CRUD, file/image upload/download, and `executeAsync`. `executeAsync` supports only `getEntityMetadata` and `customapi` (needs the API registered via `pa app add dataverse-api`). No raw URL request, no `$batch`/change-set. Other actions return "Unsupported Dataverse action".
- Workaround: cast the payload to `any` / bypass generated types; no codegen workaround is needed for binding. Each table (`task`, `phonecall`, `appointment`, `annotation`, `activitypointer`, `nvdb_*`) must be added with `pa app add data-source --connector dataverse --table <name>`.

### 3. Reading
- **[src]** `IOperationOptions` has `select, filter, orderBy, top, skip, count, skipToken, maxPageSize, partitionId` only, so **no `$expand`**.
- **[doc]** Read `_regardingobjectid_value` plus annotations `Microsoft.Dynamics.CRM.lookuplogicalname`, `associatednavigationproperty`, `OData.Community.Display.V1.FormattedValue`.
- **[src/inferred]** The SDK sends `Prefer: odata.include-annotations=*`, so annotations should be on returned records. **[unverified]** that they survive in `result.data`.
- Resolve parent names on demand with a per-type `get`.

### 4. Fallback: single-target lookup columns per parent
- Works with ordinary generated types (plain lookup bind), but activity tables are standard; custom lookups bypass native Regarding, fragment the timeline (one filter per column) and need extra columns per parent type. Not recommended.

### 5. Fallback: Custom API `nvdb_AddActivity` / `nvdb_AddNote`
- **[doc]** Custom API params support String, Guid, EntityReference, Entity, etc.; Code Apps can call them via generated services (`add-dataverse-action-function`). Wrapper takes `ParentType` (String), `ParentId` (Guid), `ActivityType`, fields; plug-in creates the record and sets Regarding in one transaction. Same mechanism as atomic qualification. Cost: plug-in dev/deploy.

### 6. Timeline across types
- **[doc]** `activitypointer` holds common columns (`activitytypecode`, `subject`, `scheduledstart/end`, `statecode`, `regardingobjectid`, `ownerid`, `prioritycode`); every activity has a matching row with the same `activityid`; retrieving mixed types via it is the intended use (activitypointer-activity-entity).
- Query: `filter=_regardingobjectid_value eq <id>`, `orderBy` date + key, `skipToken` paging. Notes are not activities: query `annotation` with `_objectid_value eq <id>` separately, merge/sort client-side. **[unverified]** `activitypointer` as a Code App data source.

### Ranked recommendation
1. Typed `@odata.bind` via generated Task/PhoneCall/Appointment/Annotation services with an `any` payload and a small (parentType, activityType) to nav-prop helper; nvdb tables created with HasActivities/HasNotes.
2. Custom API wrapper `nvdb_AddActivity`/`nvdb_AddNote` as guaranteed fallback if the host rejects bind keys.
3. Per-parent lookup columns: last resort.

Spike checklist: create task with `regardingobjectid_account_task@odata.bind`; create note with `objectid_account@odata.bind`; check `lookuplogicalname` on read; add `activitypointer` as data source and filter by regarding; test clearing a lookup; confirm nvdb nav-prop names in `$metadata`.
