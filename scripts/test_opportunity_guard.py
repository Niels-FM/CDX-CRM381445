"""Live API-seam test for the Opportunity guard: Lost needs a reason, Won/Lost are read-only, only a Manager can reopen.

Same mechanics as test_undisqualify_guard.py (impersonation, temporary role grants, cleanup).

    python scripts/test_opportunity_guard.py [--rep EMAIL] [--manager EMAIL]
"""
import argparse
import sys

import crm_model
import dv
import test_undisqualify_guard as g

OPEN = crm_model.choice_value("nvdb_opportunitystatus", "Open")
LOST = crm_model.choice_value("nvdb_opportunitystatus", "Lost")


def patch(opp_id, uid, body):
    """Return (error text or None, None)."""
    try:
        dv.request("PATCH", f"nvdb_opportunities({opp_id})", body=body, headers=g.as_user(uid))
        return None, None
    except dv.DataverseError as e:
        return str(e), None


def status_of(opp_id):
    return dv.get(f"nvdb_opportunities({opp_id})?$select=nvdb_opportunitystatus")["nvdb_opportunitystatus"]


def expect_rejected(failures, label, err, text):
    if err and text in err:
        dv.say(f"ok: {label} rejected ({err})")
    else:
        failures.append(f"{label}: expected rejection containing '{text}', got {err!r}")


def run(rep_email, manager_email):
    base = dv.load_env()["DATAVERSE_URL"].rstrip("/")
    rep, manager = g.user_id(rep_email), g.user_id(manager_email)
    granted = []
    for uid, role in ((rep, crm_model.ROLE_NAMES[crm_model.REP]), (manager, crm_model.ROLE_NAMES[crm_model.MANAGER])):
        rid = g.role_id(role)
        if not g.has_role(uid, rid):
            g.assign(uid, rid, base)
            granted.append((uid, rid))
    account_id = opp_id = None
    failures = []
    try:
        _, headers, _ = dv.request("POST", "accounts", body={"name": "[test] opportunity guard"}, headers=g.as_user(rep))
        account_id = dv.entity_id(headers)
        _, headers, _ = dv.request(
            "POST", "nvdb_opportunities", headers=g.as_user(rep),
            body={"nvdb_name": "[test] guard", "nvdb_Accountid@odata.bind": f"/accounts({account_id})"},
        )
        opp_id = dv.entity_id(headers)

        err, _ = patch(opp_id, rep, {"nvdb_opportunitystatus": LOST})
        expect_rejected(failures, "Lost without a reason", err, "reason")
        if status_of(opp_id) != OPEN:
            failures.append("Opportunity became Lost without a reason")

        err, _ = patch(opp_id, rep, {"nvdb_opportunitystatus": LOST, "nvdb_lostreason": "test"})
        if err:
            failures.append(f"Lost with a reason was rejected: {err}")
        else:
            dv.say("ok: Lost with a reason accepted")

        err, _ = patch(opp_id, rep, {"nvdb_opportunitystatus": OPEN})
        expect_rejected(failures, "Rep reopen", err, "Sales Manager")
        if status_of(opp_id) != LOST:
            failures.append("Rep reopen changed the status despite the rejection")

        err, _ = patch(opp_id, manager, {"nvdb_opportunitystatus": OPEN})
        if err:
            failures.append(f"Manager reopen was rejected: {err}")
        elif status_of(opp_id) != OPEN:
            failures.append("Manager reopen did not persist")
        else:
            dv.say("ok: Manager reopened the Opportunity")
    finally:
        if opp_id:
            dv.request("DELETE", f"nvdb_opportunities({opp_id})")
        if account_id:
            dv.request("DELETE", f"accounts({account_id})")
        for uid, rid in granted:
            g.unassign(uid, rid)
    for f in failures:
        dv.say(f"FAIL: {f}")
    return 1 if failures else 0


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--rep", default="alans@CRM381445.OnMicrosoft.com")
    p.add_argument("--manager", default="allieb@CRM381445.OnMicrosoft.com")
    a = p.parse_args()
    sys.exit(run(a.rep, a.manager))
