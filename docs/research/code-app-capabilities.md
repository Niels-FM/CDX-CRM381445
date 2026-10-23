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
