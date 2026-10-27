"""Live API-seam test for Lead visibility and the un-disqualify guard (ticket #17).

Calls the Web API directly, impersonating existing enabled users (MSCRMCallerID), so the UI is bypassed: a Rep sees only
own Leads, a Manager sees all; a Sales Rep must NOT be able to move a Disqualified Lead back, a Sales Manager must.
Roles are assigned to the users for the duration of the run and removed again; the test Lead is deleted afterwards.

    python scripts/test_undisqualify_guard.py [--rep EMAIL] [--other-rep EMAIL] [--manager EMAIL]

Run it after `python scripts/deploy.py --plugin`. Needs System Administrator (to impersonate and to assign roles).
Right after a (re)registration the platform can answer "Error while trying to get the assembly" for a few minutes; just rerun.
"""
import argparse
import sys
import time

import crm_model
import dv

DISQUALIFIED = crm_model.choice_value("nvdb_leadstatus", "Disqualified")
NEW = crm_model.choice_value("nvdb_leadstatus", "New")


def user_id(email):
    rows = dv.get(f"systemusers?$select=systemuserid&$filter=internalemailaddress eq '{email}' and isdisabled eq false")["value"]
    if not rows:
        raise SystemExit(f"No enabled user {email}")
    return rows[0]["systemuserid"]


def role_id(name):
    return dv.get(f"roles?$select=roleid&$filter=name eq '{name}'")["value"][0]["roleid"]


def has_role(uid, rid):
    return bool(dv.get(f"systemusers({uid})/systemuserroles_association?$select=roleid&$filter=roleid eq {rid}")["value"])


def assign(uid, rid, base):
    dv.request("POST", f"systemusers({uid})/systemuserroles_association/$ref", body={"@odata.id": f"{base}/api/data/v9.2/roles({rid})"})


def unassign(uid, rid):
    dv.request("DELETE", f"systemusers({uid})/systemuserroles_association({rid})/$ref")


def as_user(uid):
    return {"MSCRMCallerID": uid}


def patch_status(lead_id, uid, status, attempts=6):
    """PATCH as the user; a freshly registered assembly can fail to load on a sandbox node for a while, so retry that error only."""
    for i in range(attempts):
        try:
            return dv.request("PATCH", f"nvdb_leads({lead_id})", body={"nvdb_leadstatus": status}, headers=as_user(uid))
        except dv.DataverseError as e:
            if "trying to get the assembly" not in str(e) or i == attempts - 1:
                raise
            time.sleep(10)


def status_of(lead_id):
    return dv.get(f"nvdb_leads({lead_id})?$select=nvdb_leadstatus")["nvdb_leadstatus"]


def run(rep_email, manager_email, other_rep_email):
    base = dv.load_env()["DATAVERSE_URL"].rstrip("/")
    rep, manager, other_rep = user_id(rep_email), user_id(manager_email), user_id(other_rep_email)
    granted = []
    rep_role = crm_model.ROLE_NAMES[crm_model.REP]
    for uid, role in ((rep, rep_role), (other_rep, rep_role), (manager, crm_model.ROLE_NAMES[crm_model.MANAGER])):
        rid = role_id(role)
        if not has_role(uid, rid):
            assign(uid, rid, base)
            granted.append((uid, rid))
    lead_id = None
    failures = []
    try:
        _, headers, _ = dv.request(
            "POST", "nvdb_leads", headers=as_user(rep),
            body={"nvdb_topic": "[test] guard", "nvdb_lastname": "Guard", "nvdb_leadstatus": DISQUALIFIED, "nvdb_disqualifyreason": "test"},
        )
        lead_id = dv.entity_id(headers)

        def visible_to(uid):
            rows = dv.request("GET", f"nvdb_leads?$select=nvdb_leadid&$filter=nvdb_leadid eq {lead_id}", headers=as_user(uid))[2]["value"]
            return bool(rows)

        for who, uid, expected in (("owner", rep, True), ("another Rep", other_rep, False), ("Manager", manager, True)):
            if visible_to(uid) == expected:
                dv.say(f"ok: Lead {'visible' if expected else 'hidden'} for {who}")
            else:
                failures.append(f"Lead visibility for {who} should be {expected}")

        try:
            patch_status(lead_id, rep, NEW)
            failures.append("Rep un-disqualified a Lead; the guard did not fire")
        except dv.DataverseError as e:
            if "Sales Manager" in str(e):
                dv.say(f"ok: Rep rejected ({e})")
            else:
                failures.append(f"Rep was rejected for another reason: {e}")
        if status_of(lead_id) != DISQUALIFIED:
            failures.append("Lead status changed despite the rejection")

        try:
            patch_status(lead_id, manager, NEW)
            dv.say("ok: Manager un-disqualified the Lead")
        except dv.DataverseError as e:
            failures.append(f"Manager was rejected: {e}")
        if status_of(lead_id) != NEW:
            failures.append("Manager's change did not persist")

        try:
            patch_status(lead_id, rep, DISQUALIFIED)
            dv.say("ok: Rep can still disqualify an own Lead")
        except dv.DataverseError as e:
            failures.append(f"Rep could not disqualify an own Lead: {e}")
    finally:
        if lead_id:
            dv.request("DELETE", f"nvdb_leads({lead_id})")
        for uid, rid in granted:
            unassign(uid, rid)
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
