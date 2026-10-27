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
- The plug-in stage builds `plugins\SalesCrm.Plugins` (net462, signed; one assembly, later Custom API types are added to it) and registers it with `register_plugin.py` (Web API: assembly, types, steps, images, inside `salesapp_solution`; idempotent). `pac plugin push` was not used because it only uploads an existing assembly and cannot register steps. Needs `dotnet` on PATH. Changing the signing key needs delete + re-register of the assembly.
- `pac solution export` hit MFA, so `export_solution.py` uses the Web API ExportSolution action plus `pac solution unpack`.
- The test users are documented, not created.
- Accounts and Contacts (#16): lists with filter box, create/edit pages, soft duplicate warnings (Account by name, Contact by email), read-only Opportunities panel (empty until the pipeline ticket). Client logic is in pp\src\domain\customers.ts (unit tested on a mocked CustomerService); pp\src\data\customerService.ts is the thin Dataverse seam on the SDK DataClient, with hand-declared data sources. Not verified against a live environment (no pa sign-in): data-source info, the parentcustomerid_account@odata.bind write and skipToken paging still need a first run as a test user.
- Leads (#17): list with filter box (name, company, email), create/edit, Status New/Contacted/Disqualified (Qualified is set only by Qualify, #18), disqualify with required reason, soft duplicate warning on same email or name+company. Client logic is in `app\src\domain\leads.ts` (unit tested on a mocked `LeadService`); `app\src\data\leadService.ts` uses the generated `nvdb_leads` data source. Qualified and Disqualified Leads are read-only.
- Un-disqualify guard (#17): plug-in `LeadUnDisqualifyGuard` on `nvdb_lead` Update, pre-operation (filtering attribute `nvdb_leadstatus`, pre-image `PreImage`). It rejects moving a Lead out of Disqualified unless the caller directly holds the Sales Manager role (roles via teams are not checked; System Administrators are rejected too). The app shows the button to the owner and surfaces the server error for a Rep; the app does not know the user's role.
- Live check of the guard and of Lead visibility: `python scripts\test_undisqualify_guard.py` (impersonates demo users `alans@`, `amya@`, `allieb@` via MSCRMCallerID, grants Sales Rep / Sales Manager for the run and removes them again; override with `--rep --other-rep --manager`). Right after (re)registering the plug-in the platform may answer "Error while trying to get the assembly" for a few minutes; rerun.
- Not done for #17: the Lead UI is not verified in the browser as a test user (no `pa app push` by this ticket); `solutions\` was not re-exported after registering the plug-in (`python scripts\export_solution.py`).
