"""Live API-seam test for acceptance scenario 2: Rep B cannot see or edit Rep A's Leads and Opportunities
but can read all Accounts and Contacts; a Manager sees everything; a Rep cannot delete.

Same mechanics as test_undisqualify_guard.py (impersonation, temporary role grants, cleanup).

    python scripts/test_role_isolation.py [--rep-a EMAIL] [--rep-b EMAIL] [--manager EMAIL]
"""
import argparse
import sys

import crm_model
import dv
import test_undisqualify_guard as g


def visible(entity_set, key, rid, uid):
    rows = dv.request("GET", f"{entity_set}?$select={key}&$filter={key} eq {rid}", headers=g.as_user(uid))[2]["value"]
    return bool(rows)


def rejected(method, path, uid, body=None):
    try:
        dv.request(method, path, body=body, headers=g.as_user(uid))
        return None
    except dv.DataverseError as e:
        return str(e)


def run(rep_a_email, rep_b_email, manager_email):
    base = dv.load_env()["DATAVERSE_URL"].rstrip("/")
    rep_a, rep_b, manager = g.user_id(rep_a_email), g.user_id(rep_b_email), g.user_id(manager_email)
    granted = []
    rep_role = crm_model.ROLE_NAMES[crm_model.REP]
    for uid, role in ((rep_a, rep_role), (rep_b, rep_role), (manager, crm_model.ROLE_NAMES[crm_model.MANAGER])):
        rid = g.role_id(role)
        if not g.has_role(uid, rid):
            g.assign(uid, rid, base)
            granted.append((uid, rid))
    created = []
    failures = []

    def check(ok, label):
        dv.say(f"{'ok' if ok else 'FAIL'}: {label}")
        if not ok:
            failures.append(label)

    def create(entity_set, body):
        _, headers, _ = dv.request("POST", entity_set, body=body, headers=g.as_user(rep_a))
        rid = dv.entity_id(headers)
        created.append((entity_set, rid))
        return rid

    try:
        account = create("accounts", {"name": "[test] isolation account"})
        contact = create("contacts", {"lastname": "[test] isolation contact"})
        lead = create("nvdb_leads", {"nvdb_topic": "[test] isolation lead", "nvdb_lastname": "Isolation"})
        opp = create("nvdb_opportunities", {"nvdb_name": "[test] isolation opp", "nvdb_Accountid@odata.bind": f"/accounts({account})"})

        for who, uid, expected in (("Rep A", rep_a, True), ("Rep B", rep_b, False), ("Manager", manager, True)):
            check(visible("nvdb_leads", "nvdb_leadid", lead, uid) == expected, f"Lead {'visible' if expected else 'hidden'} for {who}")
            check(visible("nvdb_opportunities", "nvdb_opportunityid", opp, uid) == expected, f"Opportunity {'visible' if expected else 'hidden'} for {who}")
        for entity_set, key, rid, label in (("accounts", "accountid", account, "Account"), ("contacts", "contactid", contact, "Contact")):
            check(visible(entity_set, key, rid, rep_b), f"Rep B reads Rep A's {label}")

        check(rejected("PATCH", f"nvdb_leads({lead})", rep_b, {"nvdb_topic": "[test] hijacked"}) is not None, "Rep B cannot edit Rep A's Lead")
        check(rejected("PATCH", f"nvdb_opportunities({opp})", rep_b, {"nvdb_name": "[test] hijacked"}) is not None, "Rep B cannot edit Rep A's Opportunity")
        check(rejected("DELETE", f"nvdb_leads({lead})", rep_a) is not None, "Rep A cannot delete an own Lead")
        check(rejected("DELETE", f"nvdb_opportunities({opp})", rep_a) is not None, "Rep A cannot delete an own Opportunity")
        check(rejected("PATCH", f"nvdb_opportunities({opp})", rep_a, {"nvdb_name": "[test] renamed"}) is None, "Rep A can edit an own Opportunity")
        names = dv.get(f"nvdb_leads({lead})?$select=nvdb_topic")["nvdb_topic"], dv.get(f"nvdb_opportunities({opp})?$select=nvdb_name")["nvdb_name"]
        check(names == ("[test] isolation lead", "[test] renamed"), "Rep B's rejected edits changed nothing")
        check(rejected("DELETE", f"nvdb_leads({lead})", manager) is None, "Manager can delete a Lead")
        created.remove(("nvdb_leads", lead))
    finally:
        for entity_set, rid in reversed(created):
            dv.request("DELETE", f"{entity_set}({rid})")
        for uid, rid in granted:
            g.unassign(uid, rid)
    return 1 if failures else 0


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--rep-a", default="alans@CRM381445.OnMicrosoft.com")
    p.add_argument("--rep-b", default="amya@CRM381445.OnMicrosoft.com")
    p.add_argument("--manager", default="allieb@CRM381445.OnMicrosoft.com")
    a = p.parse_args()
    sys.exit(run(a.rep_a, a.rep_b, a.manager))
