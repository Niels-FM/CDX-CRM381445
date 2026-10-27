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

## App (`app\`)

`npm install`, `npm run build`, `npm run lint`, `npm test` (vitest). All Dataverse terms live in `src\labels.ts`.
Push: `python scripts\deploy.py --app` (runs `pa app init` if `power.config.json` is missing, then `pa app push --solution-id <id>`).

## Status

- Not done: the first `pa app push` and opening the app as a test user. `pa` needs an interactive MFA browser sign-in for this tenant, which could not be done unattended. The app builds (`deploy.py --app --no-push`).
- The plugin stage is a stub until the plug-in/Custom API tickets land.
- `pac solution export` hit MFA, so `export_solution.py` uses the Web API ExportSolution action plus `pac solution unpack`.
- The test users are documented, not created.
- Accounts and Contacts (#16): lists with filter box, create/edit pages, soft duplicate warnings (Account by name, Contact by email), read-only Opportunities panel (filled from `nvdb_opportunity` since #19). Client logic is in pp\src\domain\customers.ts (unit tested on a mocked CustomerService); pp\src\data\customerService.ts is the thin Dataverse seam on the SDK DataClient, with hand-declared data sources. Not verified against a live environment (no pa sign-in): data-source info, the parentcustomerid_account@odata.bind write and skipToken paging still need a first run as a test user.
- Opportunity pipeline (#19): Pipeline route with a chevron-header Kanban (Open Opportunities per Stage, value and count, drag/drop, "+ Add Opportunity" per column, Won/Lost drop zones while dragging) and a List view (filter, Status filter, includes Won/Lost); Opportunity page with summary panel, clickable Stage stepper, Won / Lost / Reopen and an edit form. Stage change resets probability to 10/25/60/90 (editable afterwards); Won sets the closed date, Lost needs a reason and sets it too; Won/Lost are read-only in the UI. Client rules are in `app\src\domain\pipeline.ts` (unit tested on a mocked `OpportunityService`); `app\src\data\opportunityService.ts` is the Dataverse seam (data sources `nvdb_opportunities` and `systemusers` registered with `pa app add data-source`; Account/Contact are bound with the typed `nvdb_Accountid` / `nvdb_Contactid` `@odata.bind` properties, verified against the metadata). Errors from Dataverse (including the plug-in's rejection message) are shown in the UI. Not yet in the pipeline view: next-Activity dot and Timeline (Activities tickets); the UI does not know the caller's role, so Reopen is shown on every closed Opportunity and a Rep gets the server's rejection message.
- Server guard (#19): `plugins\SalesCrm.Plugins\OpportunityGuard.cs` (type `NVDB.SalesCrm.Plugins.OpportunityGuard`, pure rules in `OpportunityGuardRules.cs`, `dotnet test plugins\SalesCrm.Plugins.Tests`). On `nvdb_opportunity` Update, pre-operation (no filtering attributes, no image): a Won/Lost record rejects every update except Status back to Open, and that reopen needs the caller to hold the Sales Manager role (directly or via a team). Also rejects Status Lost without a Lost reason. Verified live with a temporary registration (separate assembly, removed again): Lost without reason rejected, Won record edit rejected, reopen as a user without Sales Manager rejected, reopen after joining a team holding Sales Manager allowed. It was not verified with real Rep A / Rep B / Manager users (not created, see above); "Rep isolation on Opportunities" rests on the Basic-depth Read in the role matrix and still needs that two-rep check.
- Plug-in deployment (#19) is NOT done: `NVDB.SalesCrm.Plugins` is already registered from ticket #17 with only `LeadUnDisqualifyGuard`, and uploading this branch's DLL would drop that type. After merging #17 and #19, append this entry to `STEPS` in `scripts\register_plugin.py` and run `python scripts\deploy.py --plugin`: `{"type": "NVDB.SalesCrm.Plugins.OpportunityGuard", "name": "nvdb_opportunity Update: Won/Lost read-only, Manager-only reopen (pre-operation)", "message": "Update", "table": "nvdb_opportunity", "stage": 20, "filtering": None}` (omit `preimage`; the guard retrieves the stored Status itself).
