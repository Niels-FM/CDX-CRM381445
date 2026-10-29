"""Live API-seam test for the Timeline Custom APIs nvdb_AddActivity / nvdb_AddNote and own-item edit/delete (ticket #20).

Impersonates enabled users (MSCRMCallerID) exactly like test_undisqualify_guard.py: temporary role grants, `[test]` data, cleanup.
Checks: Regarding is set for Lead, Opportunity, Account and Contact (read back through `_regardingobjectid_value` with the
`lookuplogicalname` annotation, which the Timeline relies on), Notes show under `_objectid_value`, validation errors,
a Rep cannot edit or delete another Rep's Note/Activity while a Manager can.

    python scripts/test_timeline_apis.py [--rep EMAIL] [--other-rep EMAIL] [--manager EMAIL]

Run after `python scripts/deploy.py --plugin`.
"""
import argparse
import sys
import time

import crm_model
import dv
import test_undisqualify_guard as g

ANNOTATION = {"Prefer": 'odata.include-annotations="Microsoft.Dynamics.CRM.lookuplogicalname"'}
LOGICAL = "_regardingobjectid_value@Microsoft.Dynamics.CRM.lookuplogicalname"
DUE = "2030-01-15T09:00:00Z"
STATE_COMPLETED = 1


def call(action, uid, body, attempts=6):
    """POST an unbound Custom API as the user; retry the transient fresh-assembly error only."""
    for i in range(attempts):
        try:
            return dv.request("POST", action, body=body, headers=g.as_user(uid))[2]
        except dv.DataverseError as e:
            if "trying to get the assembly" not in str(e) or i == attempts - 1:
                raise
            time.sleep(10)


def rejected(uid, method, path, body=None):
    try:
        dv.request(method, path, body=body, headers=g.as_user(uid))
        return None
    except dv.DataverseError as e:
        return e


def run(rep_email, manager_email, other_rep_email):
    base = dv.load_env()["DATAVERSE_URL"].rstrip("/")
    rep, manager, other = g.user_id(rep_email), g.user_id(manager_email), g.user_id(other_rep_email)
    granted = []
    for uid, role in ((rep, crm_model.ROLE_NAMES[crm_model.REP]), (other, crm_model.ROLE_NAMES[crm_model.REP]), (manager, crm_model.ROLE_NAMES[crm_model.MANAGER])):
        rid = g.role_id(role)
        if not g.has_role(uid, rid):
            g.assign(uid, rid, base)
            granted.append((uid, rid))
    failures = []
    parents = {}
    created = []

    def check(cond, label):
        if cond:
            dv.say(f"ok: {label}")
        else:
            failures.append(label)

    try:
        for table, entity_set, body in (
            ("nvdb_lead", "nvdb_leads", {"nvdb_topic": "[test] timeline", "nvdb_lastname": "Timeline"}),
            ("account", "accounts", {"name": "[test] timeline account"}),
            ("contact", "contacts", {"lastname": "[test] timeline contact"}),
        ):
            _, h, _ = dv.request("POST", entity_set, body=body, headers=g.as_user(rep))
            parents[table] = dv.entity_id(h)
        _, h, _ = dv.request(
            "POST", "nvdb_opportunities", headers=g.as_user(rep),
            body={"nvdb_name": "[test] timeline opp", "nvdb_Accountid@odata.bind": f"/accounts({parents['account']})"},
        )
        parents["nvdb_opportunity"] = dv.entity_id(h)

        for table, pid in parents.items():
            for kind in ("task", "phonecall", "appointment"):
                r = call("nvdb_AddActivity", rep, {"ParentType": table, "ParentId": pid, "ActivityType": kind, "Subject": f"[test] {kind}", "DueDate": DUE})
                aid = r["ActivityId"]
                row = dv.request("GET", f"activitypointers({aid})?$select=subject,_regardingobjectid_value,activitytypecode", headers={**g.as_user(rep), **ANNOTATION})[2]
                check(row["_regardingobjectid_value"] == pid and row.get(LOGICAL) == table and row["activitytypecode"] == kind, f"{kind} regarding {table} (lookuplogicalname annotation present)")
            note = call("nvdb_AddNote", rep, {"ParentType": table, "ParentId": pid, "Text": "[test] note"})["NoteId"]
            row = dv.request("GET", f"annotations?$select=notetext,_objectid_value&$filter=annotationid eq {note}", headers=g.as_user(rep))[2]["value"]
            check(bool(row) and row[0]["_objectid_value"] == pid, f"note on {table}")

        pid = parents["nvdb_opportunity"]
        listed = dv.request("GET", f"activitypointers?$select=subject&$filter=_regardingobjectid_value eq {pid}", headers=g.as_user(rep))[2]["value"]
        check(len(listed) == 3, "Timeline query by regarding id returns the three activities")

        err = rejected(rep, "POST", "nvdb_AddActivity", {"ParentType": "nvdb_opportunity", "ParentId": pid, "ActivityType": "task", "Subject": " ", "DueDate": DUE})
        check(err is not None and "subject" in str(err).lower(), "activity without subject rejected")
        err = rejected(rep, "POST", "nvdb_AddNote", {"ParentType": "nvdb_opportunity", "ParentId": pid, "Text": " "})
        check(err is not None and "text" in str(err).lower(), "note without text rejected")
        err = rejected(rep, "POST", "nvdb_AddNote", {"ParentType": "systemuser", "ParentId": pid, "Text": "x"})
        check(err is not None, "unsupported parent type rejected")

        own_note = call("nvdb_AddNote", rep, {"ParentType": "nvdb_opportunity", "ParentId": pid, "Text": "[test] own note"})["NoteId"]
        own_task = call("nvdb_AddActivity", rep, {"ParentType": "nvdb_opportunity", "ParentId": pid, "ActivityType": "task", "Subject": "[test] own task", "DueDate": DUE})["ActivityId"]
        check(rejected(rep, "PATCH", f"annotations({own_note})", {"notetext": "edited"}) is None, "Rep edits own Note")
        check(rejected(other, "PATCH", f"annotations({own_note})", {"notetext": "hacked"}) is not None, "other Rep cannot edit the Note")
        check(rejected(other, "DELETE", f"annotations({own_note})") is not None, "other Rep cannot delete the Note")
        check(rejected(other, "PATCH", f"tasks({own_task})", {"subject": "hacked"}) is not None, "other Rep cannot edit the Activity")
        check(rejected(rep, "PATCH", f"tasks({own_task})", {"statecode": STATE_COMPLETED, "statuscode": 5}) is None, "Rep marks own task done")
        check(dv.get(f"tasks({own_task})?$select=statecode")["statecode"] == STATE_COMPLETED, "task is completed (moves to History)")
        check(rejected(manager, "PATCH", f"annotations({own_note})", {"notetext": "by manager"}) is None, "Manager edits any Note")
        check(rejected(manager, "DELETE", f"annotations({own_note})") is None, "Manager deletes any Note")
        check(rejected(rep, "DELETE", f"tasks({own_task})") is None, "Rep deletes own Activity")
        # Qualify re-point (#18): Timeline items created through the APIs follow the Lead to its Opportunity
        _, h, _ = dv.request("POST", "nvdb_leads", headers=g.as_user(rep), body={
            "nvdb_topic": "[test] timeline qualify", "nvdb_lastname": "TimelineQ", "nvdb_companyname": "[test] timeline qualify co"})
        qlead = dv.entity_id(h)
        created.append(("nvdb_leads", qlead))
        qtask = call("nvdb_AddActivity", rep, {"ParentType": "nvdb_lead", "ParentId": qlead, "ActivityType": "task", "Subject": "[test] q task", "DueDate": DUE})["ActivityId"]
        qnote = call("nvdb_AddNote", rep, {"ParentType": "nvdb_lead", "ParentId": qlead, "Text": "[test] q note"})["NoteId"]
        q = dv.request("POST", "nvdb_QualifyLead", headers=g.as_user(rep), body={
            "LeadId": {"@odata.type": "Microsoft.Dynamics.CRM.nvdb_lead", "nvdb_leadid": qlead}, "CreateOpportunity": True})[2]
        created += [("nvdb_opportunities", q["OpportunityId"]), ("contacts", q["ContactId"]), ("accounts", q["AccountId"])]
        check(dv.get(f"tasks({qtask})?$select=_regardingobjectid_value")["_regardingobjectid_value"] == q["OpportunityId"], "Qualify moves an API-created Activity to the Opportunity")
        check(dv.get(f"annotations({qnote})?$select=_objectid_value")["_objectid_value"] == q["OpportunityId"], "Qualify moves an API-created Note to the Opportunity")
    finally:
        for entity_set, rid in created:
            try:
                dv.request("DELETE", f"{entity_set}({rid})")
            except dv.DataverseError as e:
                dv.say(f"cleanup of {entity_set} failed: {e}")
        for table, entity_set in (("nvdb_opportunity", "nvdb_opportunities"), ("nvdb_lead", "nvdb_leads"), ("contact", "contacts"), ("account", "accounts")):
            if table in parents:
                try:
                    dv.request("DELETE", f"{entity_set}({parents[table]})")
                except dv.DataverseError as e:
                    dv.say(f"cleanup of {table} failed: {e}")
        for uid, rid in granted:
            g.unassign(uid, rid)
    for f in failures:
        dv.say(f"FAIL: {f}")
    return 1 if failures else 0


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--rep", default="alans@CRM381445.OnMicrosoft.com")
    p.add_argument("--manager", default="allieb@CRM381445.OnMicrosoft.com")
    p.add_argument("--other-rep", default="amya@CRM381445.OnMicrosoft.com")
    a = p.parse_args()
    sys.exit(run(a.rep, a.manager, a.other_rep))
