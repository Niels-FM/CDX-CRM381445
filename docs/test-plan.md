# Test plan and acceptance gate

Spec: issue #14 (acceptance gate), ticket #23. Environment: org7c6707f4. Terms follow `GLOSSARY.md`.

Three test seams (spec):

1. **Dataverse Custom API surface**: live Python scripts in `scripts\`, calling the Web API as Rep, other Rep and Manager through `MSCRMCallerID` impersonation. Each script grants the roles to the demo users for the run, uses unique `[test]` data and removes both again.
2. **Client domain module**: vitest, mocked services (`cd app; npm test`).
3. **Manual per-role UI checklist** (below). No browser E2E in v1.

## How to run

```
cd scripts
python test_qualify_lead.py        # scenario 1 (and the Qualify guards)
python test_role_isolation.py      # scenario 2
python test_undisqualify_guard.py  # scenario 3 (Leads, also Lead visibility)
python test_opportunity_guard.py   # scenario 3 (Opportunities)
python test_timeline_apis.py       # scenario 5 (and Timeline re-point on Qualify)
python -m unittest discover -s tests   # offline script tests
cd ..\app; npm test                # scenario 4 and the client domain logic
dotnet test plugins\SalesCrm.Plugins.Tests   # pure plug-in rules (not run for #23)
```

Defaults: Rep A `alans@`, Rep B `amya@`, Manager `allieb@` (`@CRM381445.OnMicrosoft.com`); override with the script flags.

## Acceptance gate (spec #14)

Status column: what was **actually run** on 2026-10-29 against org7c6707f4 (branch `ticket/23-acceptance-gate`). "API/unit" means the automated seam only; it does not mean the UI was checked.

| # | Scenario | Automated evidence | Result of the run | Still manual (UI) |
|---|---|---|---|---|
| 1 | Qualify is atomic (forced failure leaves no partial Account, Contact or Opportunity) and the Lead Timeline moves to the Opportunity | `test_qualify_lead.py` (300-character Opportunity name fails after Account and Contact were created; Lead untouched; Activities and Notes re-pointed), `test_timeline_apis.py` (API-created items follow the Lead) | API: pass | Qualify dialog |
| 2 | Rep B cannot see or edit Rep A's Leads or Opportunities, but reads all Accounts and Contacts | `test_role_isolation.py` (new for #23), `test_undisqualify_guard.py` (Lead visibility) | API: pass | Lists as Rep B |
| 3 | A Rep cannot reopen Won/Lost or un-disqualify even through the API; a Manager can | `test_opportunity_guard.py`, `test_undisqualify_guard.py` | API: pass | Buttons as Rep and Manager |
| 4 | A Kanban drag updates Stage and default probability; drops into Won/Lost are guarded | `app\src\domain\pipeline.test.ts` (`moveToStage`, `dropOpportunity`, `closeWon/Lost`), `opportunityService.test.ts` | Unit: pass (87 vitest tests) | The drag/drop gesture itself |
| 5 | AddActivity and AddNote set Regarding correctly and appear on the Timeline | `test_timeline_apis.py` (Regarding for Lead, Opportunity, Account, Contact via `_regardingobjectid_value` and `lookuplogicalname`), `timeline.test.ts` (merge, paging, filter) | API and unit: pass | Timeline UI |

**Gate verdict:** the API-seam and unit parts of all five scenarios pass. The gate is **not complete** until the human has ticked the manual checklist below, because scenarios 1, 4 and 5 have a UI half that was never exercised in a browser.

### Unverified (honest list)

- The Qualify dialog (suggested Account/Contact, skip Opportunity) in the browser.
- The Timeline UI (composer, Planned/History, filter, Load more, mark done, edit/delete) in the browser.
- The Dashboard (KPIs against seed data, Me/Team, `activitypointer` regarding annotation, Lead `createdon`).
- The `client.executeAsync` Custom API calls (`nvdb_QualifyLead`, `nvdb_AddActivity`, `nvdb_AddNote`) from the code app as a test user. The live scripts call the same APIs through the Web API, not through the Power Apps SDK.
- Kanban drag/drop, Accounts/Contacts/Leads/search screens as a test user, and a Manager qualifying another user's Lead from the UI (button is owner-only in the UI; the API allows it).
- That the three demo users have a Power Apps Premium licence and the app is shared with them.
- `dotnet test` for the plug-in rules and the deployed app bundle were not run for #23.

## Manual per-role checklist (for the human to tick)

> **Not ticked.** Each box is to be ticked by a person using the app in a browser as that user, once per release. Nothing below was done by the agent that wrote this plan.

Preparation: roles assigned and app shared as in the README; `python scripts\seed.py --owners repA@... repB@...` run; test data you create is prefixed `[test]`.

### Rep A (Sales Rep)

- [ ] App opens on the Dashboard; six KPI tiles, pipeline chart and "Today and overdue" list load; Refresh works; no Me/Team effect beyond own records.
- [ ] Leads: list shows only own Leads; filter box works; create a Lead; the duplicate warning shows for the same email and can be ignored.
- [ ] Disqualify a Lead with a reason; it becomes read-only; no un-disqualify succeeds (error from the server).
- [ ] Qualify an own Lead (**scenario 1**): dialog preselects a matching Account and Contact; create new and pick existing both work; unticking Opportunity skips it; Lead becomes Qualified.
- [ ] After Qualify, the Opportunity Timeline contains the Lead's former Activities and Notes.
- [ ] Pipeline: four Stage columns with count and value; drag a card to another Stage; probability becomes 10/25/60/90 (**scenario 4**) and stays editable.
- [ ] Drop on Won asks for confirmation; drop on Lost asks for a reason; closed cards cannot be dragged.
- [ ] Card dot: grey none, green planned, red overdue.
- [ ] Opportunity page: summary panel, clickable Stage stepper, Won/Lost, closed record is read-only, Reopen fails with the server message (**scenario 3**).
- [ ] Timeline (**scenario 5**): add a Note, Task, Call and Meeting; they appear (Planned or History); mark a Task done; filter by type; Load more after 25 items; edit and delete own items.
- [ ] Accounts and Contacts: lists, create/edit with duplicate warnings, own Timeline plus read-only Opportunities list.
- [ ] Global search finds Account, Contact, Lead and Opportunity, grouped.

### Rep B (Sales Rep)

- [ ] Leads and Pipeline do not show Rep A's records; Dashboard numbers cover only own records (**scenario 2**).
- [ ] Accounts and Contacts lists show every record, including ones created by Rep A.
- [ ] Opening a link to one of Rep A's Opportunities shows an error or nothing, not the record.
- [ ] Global search does not return Rep A's Leads or Opportunities.
- [ ] Rep B cannot edit or delete Rep A's Timeline items on a shared Account.

### Manager (Sales Manager)

- [ ] Dashboard Me/Team toggle; Team covers the whole team, Me only own.
- [ ] Leads and Pipeline show all Reps' records; assign a Lead and an Opportunity to another user; delete one.
- [ ] Un-disqualify a Lead succeeds (**scenario 3**).
- [ ] Reopen a Won and a Lost Opportunity succeeds and clears closed date and lost reason (**scenario 3**).
- [ ] Edit and delete another user's Note and Activity.
- [ ] Qualify another user's Lead (API allows; UI button may be owner-only: record the result).

### Result

| Role | Tester | Date | App version | Pass / fail |
|---|---|---|---|---|
| Rep A | | | | |
| Rep B | | | | |
| Manager | | | | |
