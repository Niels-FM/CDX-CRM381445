# Sales CRM (Power Apps code app on Dataverse)

Tables `nvdb_lead` and `nvdb_opportunity`, the Sales Rep / Sales Manager security roles, seed data and a Vite + React + TypeScript app shell. Terms follow `GLOSSARY.md`.

## Setup

1. Copy `.env` (gitignored) with `DATAVERSE_URL`, `SOLUTION_NAME=salesapp_solution`, `PUBLISHER_PREFIX=nvdb`.
2. Be signed in to the Dataverse CLI / `pac` for the environment. Install the Power Apps CLI: `npm i -g @microsoft/power-apps-cli` (command `pa`), then `pa auth login --account <you>`.
3. Prerequisites: code apps enabled on the environment (admin center > Environments > Settings > Product > Features > Power Apps code apps); users need a Power Apps Premium or pay-as-you-go licence.

## Scripts (`scripts\`)

| Script | Purpose |
|---|---|
| `deploy.py` | Entry point. Runs preflight, then stages `--tables --roles --plugin --app` (none given = all); `--skip-<stage>`, `--no-push`, `--no-export`, `--preflight-only` |
| `build_tables.py` | Idempotent creation of the tables, Choices and lookups |
| `build_roles.py` | Idempotent Sales Rep / Sales Manager roles and privileges |
| `seed.py` | Idempotent `[seed]`-prefixed data; `--owners repA@x repB@x` alternates owners of Leads and Opportunities |
| `export_solution.py` | Exports and unpacks `salesapp_solution` into `solutions\` |
| `preflight.py` | Checks auth, solution, tables, roles, `pa` access |

Unit tests: `cd scripts; python -m unittest discover -s tests`.

Beyond the matrix in ticket #5, roles also get Append/AppendTo on activities and notes, and Read on reference tables (user, team, business unit, currency, organization, canvasapp) so the app opens.

## Create Rep A / Rep B / Manager test users

1. In the Microsoft 365 admin center (or Entra) create three users: Rep A, Rep B, Manager. Give each a Power Apps Premium licence and add them to the environment.
2. In the Power Platform admin center > Environment > Settings > Users, assign roles manually: Rep A and Rep B get **Sales Rep**; Manager gets **Sales Manager**.
3. Run `python scripts\seed.py --owners repA@domain repB@domain` to spread Leads and Opportunities over both reps.
4. Share the code app with the three users.

## Assign roles and share the app (manual)

Neither is scripted. Do both for every new user:

1. **Licence**: the user needs a Power Apps Premium (or pay-as-you-go environment) licence and must be added to the environment (Power Platform admin center > Environments > the environment > Settings > Users + permissions > Users > Add user).
2. **Role**: open the user > Manage security roles > tick exactly one of **Sales Rep** (own Leads and Opportunities, reads all Accounts and Contacts) or **Sales Manager** (whole business unit, Delete, Assign, reopen, un-disqualify). Do not add a broad built-in role such as Basic User; it would widen what the user sees. The Manager guards check the role assigned to the user directly, not through a team.
3. **Share the app**: make.powerapps.com > the environment > Apps > the code app (`nvdb_salescrm`) > Share, add the user (or a security group) and tick the option to also grant the data permissions if offered. Co-owner is not needed.
4. Have the user open the app and run the checklist in `docs\test-plan.md`.

## Tests and release

Acceptance gate, live API-seam tests and the manual per-role checklist: `docs\test-plan.md`. A release is a version bump of `salesapp_solution` (`Other\Solution.xml`, currently 1.0.1.0) plus a git tag.

## App (`app\`)

`npm install`, `npm run build`, `npm run lint`, `npm test` (vitest). All Dataverse terms live in `src\labels.ts`.
Push: `python scripts\deploy.py --app` (runs `pa app init` if `power.config.json` is missing, then `pa app push --solution-id <id>`).

## Status

- Done: `pa app push` (`deploy.py --app`) succeeded and `solutions\` was re-exported (plug-in assembly, steps, roles, canvas app). Not done: opening the app as a test user; Leads and Pipeline still need a manual check in the browser.
- Both plug-in guards pass live (`scripts\test_undisqualify_guard.py`, `scripts\test_opportunity_guard.py`). Sales Rep and Sales Manager need Read on `plugintype` and `pluginassembly` (in the role matrix in `crm_model.py`), or every guarded Update fails with 403 `missing prvReadPluginType`.
- The plug-in stage builds `plugins\SalesCrm.Plugins` (net462, signed; one assembly, later Custom API types are added to it) and registers it with `register_plugin.py` (Web API: assembly, types, steps, images, inside `salesapp_solution`; idempotent). `pac plugin push` was not used because it only uploads an existing assembly and cannot register steps. Needs `dotnet` on PATH. Changing the signing key needs delete + re-register of the assembly.
- `pac solution export` hit MFA, so `export_solution.py` uses the Web API ExportSolution action plus `pac solution unpack`.
- The test users are documented, not created.
- Accounts and Contacts (#16): lists with filter box, create/edit pages, soft duplicate warnings (Account by name, Contact by email), read-only Opportunities panel (empty until the pipeline ticket). Client logic is in pp\src\domain\customers.ts (unit tested on a mocked CustomerService); pp\src\data\customerService.ts is the thin Dataverse seam on the SDK DataClient, with hand-declared data sources. Not verified against a live environment (no pa sign-in): data-source info, the parentcustomerid_account@odata.bind write and skipToken paging still need a first run as a test user.
- Leads (#17): list with filter box (name, company, email), create/edit, Status New/Contacted/Disqualified (Qualified is set only by Qualify, #18), disqualify with required reason, soft duplicate warning on same email or name+company. Client logic is in `app\src\domain\leads.ts` (unit tested on a mocked `LeadService`); `app\src\data\leadService.ts` uses the generated `nvdb_leads` data source. Qualified and Disqualified Leads are read-only.
- Un-disqualify guard (#17): plug-in `LeadUnDisqualifyGuard` on `nvdb_lead` Update, pre-operation (filtering attribute `nvdb_leadstatus`, pre-image `PreImage`). It rejects moving a Lead out of Disqualified unless the caller directly holds the Sales Manager role (roles via teams are not checked; System Administrators are rejected too). The app shows the button to the owner and surfaces the server error for a Rep; the app does not know the user's role.
- Live check of the guard and of Lead visibility: `python scripts\test_undisqualify_guard.py` (impersonates demo users `alans@`, `amya@`, `allieb@` via MSCRMCallerID, grants Sales Rep / Sales Manager for the run and removes them again; override with `--rep --other-rep --manager`). Right after (re)registering the plug-in the platform may answer "Error while trying to get the assembly" for a few minutes; rerun.
- Not done for #17: the Lead UI is not verified in the browser as a test user.
- Qualify Lead (#18): Custom API `nvdb_QualifyLead` (unbound action, plug-in type `QualifyLead` in the same assembly, defined idempotently by `scripts\build_customapis.py`, which `deploy.py --plugin` runs after `register_plugin.py`). Inputs `LeadId`, `CreateOpportunity` (required: an unset Boolean arrives as false, so "default true" cannot be honoured; the app must always send it), optional `AccountId`, `ContactId`, `OpportunityName` (default Lead topic), `EstimatedRevenue`, `EstimatedCloseDate`; outputs `AccountId`, `ContactId`, `OpportunityId` (empty Guid when skipped). Runs in the main operation, so one transaction, and as the caller (no elevation; only the Manager role lookup uses SYSTEM). Only the Lead owner or a Sales Manager may call it; Qualified/Disqualified Leads are rejected. Without a chosen Account/Contact it creates them from the Lead (company name needed for the Account, last name for the Contact; the new Contact belongs to the new Account). The Opportunity starts Qualify / Open / 10% with the Lead as source. Activities (also completed ones) and Notes of the Lead move to the Opportunity; with no Opportunity they stay on the Lead. No execute privilege is set on the API. Reps and Managers also got Read on `asyncoperation` (System Job), which Dataverse checks when activities are written. Pure rules are in `QualifyLeadRules` (unit tests: `dotnet test plugins\SalesCrm.Plugins.Tests`); live check: `python scripts\test_qualify_lead.py` (same users and role grant/removal as the guard tests; forced failure uses a 300-character Opportunity name, which fails after the Account and Contact were created).
- Qualify dialog (#18): `Qualify` button on an open Lead (owner) opens `QualifyDialog` (suggested Account by exact company name and Contact by exact email preselected, or "create new from the Lead", optional Opportunity with name/revenue/close date). Logic and request building are in `app\src\domain\qualify.ts` (unit tested on mocked services); `app\src\data\qualifyService.ts` calls the Custom API through `client.executeAsync` with a hand-declared `apis` entry on the `nvdb_leads` data source (generated `dataSourcesInfo.ts` has none). Not verified: the dialog and that `executeAsync` call in the browser as a test user, and a Manager qualifying another user's Lead from the UI (button is owner-only; the API allows it).
- Global search (#22): box in the top bar, parallel contains() queries on Account (name, phone, website), Contact (full name, email, phone), Lead (topic, first/last name, company, email) and Opportunity (name); min 2 characters, 300 ms debounce, 5 hits per entity, grouped, links to the record. Results follow the caller's security roles (queries run as the user); a failing entity is reported while the others still show. Logic in `app\src\domain\search.ts` (unit tested), thin seam `app\src\data\searchService.ts`. Not verified against live Dataverse or in the browser.
- Timeline and composer (#20): Custom APIs `nvdb_AddActivity` (ParentType `nvdb_lead|nvdb_opportunity|account|contact`, ParentId, ActivityType `task|phonecall|appointment`, Subject, DueDate, optional Description; output `ActivityId`) and `nvdb_AddNote` (ParentType, ParentId, Text, optional Subject; output `NoteId`), plug-in types `AddActivity`/`AddNote` run as the caller and set Regarding (pure rules in `TimelineRules`). The `Timeline` component (Lead, Opportunity, Account, Contact pages) has a composer, Planned (open, by due date) and History (done activities plus notes, newest first) tabs, type filter, Load more, mark done, edit/delete; the Kanban card shows a next-activity dot (grey none, green planned, red overdue). Logic in `app\src\domain\timeline.ts` (unit tested), seam `app\src\data\timelineService.ts`. Security follows the roles: Reps read/edit/delete only their own activities and notes (Basic depth) and have AppendTo on Account/Contact at Basic depth, so they can only add items to Accounts/Contacts they own; the UI shows edit/delete on every visible item. Live check `python scripts\test_timeline_apis.py` (Regarding for all four parents, the `lookuplogicalname` annotation, validation, own-item rules, and that `nvdb_QualifyLead` re-points API-created items to the Opportunity) passes. Not verified: the Timeline UI and the `executeAsync` custom API call in the browser as a test user, and the owner-name annotation.- Dashboard (#21): landing page with Me/Team toggle, six KPI tiles (open pipeline value, open Opportunities, Won/Lost this month, new Leads this month, overdue Activities), pipeline-by-Stage bar chart, Today and overdue Activity list linking to the record, manual Refresh (no polling). Computed client-side with skipToken paging (max 40 pages per source). Me filters on the current user as owner; Team shows everything the caller's security role can read (a Rep sees only own records either way). Logic in `app\src\domain\dashboard.ts` (unit tested), seam `app\src\data\dashboardService.ts`. Not verified against live Dataverse or in the browser (KPIs vs seed data, `activitypointer` regarding type/name annotation, Leads `createdon`).
