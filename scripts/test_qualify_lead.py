"""Live API-seam test for the nvdb_QualifyLead Custom API (ticket #18).

Calls the Web API directly, impersonating existing enabled users (MSCRMCallerID): a Sales Rep and a Sales Manager qualify
Leads; guards, atomicity and Timeline move are checked. Roles are assigned for the run and removed again; every [test]
record created here is deleted afterwards.

    python scripts/test_qualify_lead.py [--rep EMAIL] [--other-rep EMAIL] [--manager EMAIL]

Run it after `python scripts/deploy.py --plugin`. Needs System Administrator (to impersonate and to assign roles).
Right after a (re)registration the platform can answer "Error while trying to get the assembly" for a few minutes; reruns retry.
"""
import argparse
import sys
import time
import uuid

import crm_model
import dv
from test_undisqualify_guard import as_user, assign, has_role, role_id, unassign, user_id

CHOICE = crm_model.choice_value
RUN = uuid.uuid4().hex[:8]


def lead_ref(lead_id):
    return {"@odata.type": "Microsoft.Dynamics.CRM.nvdb_lead", "nvdb_leadid": lead_id}


def call(uid, lead_id, attempts=6, **params):
    """POST nvdb_QualifyLead as the user; retry only the 'assembly not loaded yet' error."""
    body = {"LeadId": lead_ref(lead_id), "CreateOpportunity": True, **params}
    for i in range(attempts):
        try:
            return dv.request("POST", "nvdb_QualifyLead", body=body, headers=as_user(uid))[2]
        except dv.DataverseError as e:
            if "trying to get the assembly" not in str(e) or i == attempts - 1:
                raise
            time.sleep(10)


def rejection(uid, lead_id, expected, **params):
    try:
        call(uid, lead_id, **params)
    except dv.DataverseError as e:
        return None if any(x in str(e) for x in expected.split("|")) else f"rejected for another reason: {e}"
    return "was not rejected"


class Scenario:
    def __init__(self, rep, other_rep, manager):
        self.rep, self.other_rep, self.manager = rep, other_rep, manager
        self.failures = []
        self.cleanup = []  # (entity set, id)

    def check(self, ok, text):
        if ok:
            dv.say(f"ok: {text}")
        else:
            self.failures.append(text)

    def new_lead(self, owner, label, **extra):
        body = {"nvdb_topic": f"[test] qualify {RUN} {label}", "nvdb_firstname": "Quinn", "nvdb_lastname": f"Qualify{RUN}",
                "nvdb_companyname": f"[test] Qualify Co {RUN} {label}", "nvdb_jobtitle": "CTO", "nvdb_email": f"quinn.{RUN}.{label}@example.test",
                "nvdb_phone": "0612345678", **extra}
        _, headers, _ = dv.request("POST", "nvdb_leads", body=body, headers=as_user(owner))
        lead_id = dv.entity_id(headers)
        self.cleanup.append(("nvdb_leads", lead_id))
        return lead_id

    def add_timeline(self, lead_id, owner):
        _, h, _ = dv.request("POST", "tasks", headers=as_user(owner), body={
            "subject": f"[test] open task {RUN}", "regardingobjectid_nvdb_lead_task@odata.bind": f"/nvdb_leads({lead_id})"})
        open_task = dv.entity_id(h)
        _, h, _ = dv.request("POST", "tasks", headers=as_user(owner), body={
            "subject": f"[test] done task {RUN}", "regardingobjectid_nvdb_lead_task@odata.bind": f"/nvdb_leads({lead_id})"})
        done_task = dv.entity_id(h)
        dv.request("PATCH", f"tasks({done_task})", body={"statecode": 1, "statuscode": 5}, headers=as_user(owner))
        _, h, _ = dv.request("POST", "annotations", headers=as_user(owner), body={
            "subject": f"[test] note {RUN}", "notetext": "history", "objectid_nvdb_lead@odata.bind": f"/nvdb_leads({lead_id})"})
        return open_task, done_task, dv.entity_id(h)

    def track(self, result):
        self.cleanup += [("nvdb_opportunities", result.get("OpportunityId")), ("contacts", result["ContactId"]), ("accounts", result["AccountId"])]

    def full_qualify(self):
        lead = self.new_lead(self.rep, "full")
        open_task, done_task, note = self.add_timeline(lead, self.rep)
        r = call(self.rep, lead, OpportunityName=f"[test] deal {RUN}", EstimatedRevenue=12345, EstimatedCloseDate="2027-01-31")
        self.track(r)
        l = dv.get(f"nvdb_leads({lead})?$select=nvdb_leadstatus,_nvdb_accountid_value,_nvdb_contactid_value")
        self.check(l["nvdb_leadstatus"] == CHOICE("nvdb_leadstatus", "Qualified"), "Lead is Qualified")
        self.check(l["_nvdb_accountid_value"] == r["AccountId"] and l["_nvdb_contactid_value"] == r["ContactId"], "Lead Account/Contact lookups filled")
        acc = dv.get(f"accounts({r['AccountId']})?$select=name")
        self.check(acc["name"] == f"[test] Qualify Co {RUN} full", "Account created from company name")
        con = dv.get(f"contacts({r['ContactId']})?$select=firstname,lastname,jobtitle,emailaddress1,telephone1,_parentcustomerid_value")
        self.check((con["firstname"], con["lastname"], con["jobtitle"], con["emailaddress1"], con["telephone1"])
                   == ("Quinn", f"Qualify{RUN}", "CTO", f"quinn.{RUN}.full@example.test", "0612345678"), "Contact mapped from Lead")
        self.check(con["_parentcustomerid_value"] == r["AccountId"], "new Contact belongs to the new Account")
        o = dv.get(f"nvdb_opportunities({r['OpportunityId']})?$select=nvdb_name,nvdb_stage,nvdb_opportunitystatus,nvdb_probability,nvdb_estimatedrevenue,nvdb_estimatedclosedate,_nvdb_sourceleadid_value,_nvdb_accountid_value,_nvdb_contactid_value")
        self.check(o["nvdb_stage"] == CHOICE("nvdb_stage", "Qualify") and o["nvdb_opportunitystatus"] == CHOICE("nvdb_opportunitystatus", "Open"), "Opportunity starts at Qualify / Open")
        self.check(o["_nvdb_sourceleadid_value"] == lead and o["nvdb_name"] == f"[test] deal {RUN}", "Opportunity has source Lead and the chosen name")
        self.check(o["nvdb_estimatedrevenue"] == 12345 and str(o["nvdb_estimatedclosedate"]).startswith("2027-01-31"), "Opportunity revenue and close date set")
        self.check(o["_nvdb_accountid_value"] == r["AccountId"] and o["_nvdb_contactid_value"] == r["ContactId"], "Opportunity Account/Contact set")
        for entity_set, rid, label in (("tasks", open_task, "open Task"), ("tasks", done_task, "completed Task")):
            t = dv.get(f"{entity_set}({rid})?$select=_regardingobjectid_value,statecode")
            self.check(t["_regardingobjectid_value"] == r["OpportunityId"], f"{label} moved to the Opportunity")
            if label == "completed Task":
                self.check(t["statecode"] == 1, "completed Task is still completed")
        n = dv.get(f"annotations({note})?$select=_objectid_value")
        self.check(n["_objectid_value"] == r["OpportunityId"], "Note moved to the Opportunity")

    def existing_parties(self):
        lead = self.new_lead(self.rep, "existing")
        _, h, _ = dv.request("POST", "accounts", body={"name": f"[test] Existing Acct {RUN}"})
        acc = dv.entity_id(h)
        self.cleanup.append(("accounts", acc))
        _, h, _ = dv.request("POST", "contacts", body={"lastname": f"Existing{RUN}"})
        con = dv.entity_id(h)
        self.cleanup.append(("contacts", con))
        # reps read all Accounts/Contacts, and need Append To on them (own records only), so the existing ones are rep-owned
        for es, rid in (("accounts", acc), ("contacts", con)):
            dv.request("PATCH", f"{es}({rid})", body={"ownerid@odata.bind": f"/systemusers({self.rep})"})
        r = call(self.rep, lead, AccountId=acc, ContactId=con)
        self.cleanup.append(("nvdb_opportunities", r["OpportunityId"]))
        self.check(r["AccountId"] == acc and r["ContactId"] == con, "existing Account and Contact are used as chosen")
        created = dv.get(f"accounts?$select=accountid&$filter=contains(name,'[test] Qualify Co {RUN} existing')")["value"]
        self.check(not created, "no duplicate Account created when an existing one is chosen")

    def without_opportunity(self):
        lead = self.new_lead(self.rep, "noopp")
        task, _, _ = self.add_timeline(lead, self.rep)
        r = call(self.rep, lead, CreateOpportunity=False)
        self.track(r)
        self.check(r["OpportunityId"] == "00000000-0000-0000-0000-000000000000", "no Opportunity id returned when skipped")
        opps = dv.get(f"nvdb_opportunities?$select=nvdb_opportunityid&$filter=_nvdb_sourceleadid_value eq {lead}")["value"]
        self.check(not opps, "no Opportunity created when skipped")
        t = dv.get(f"tasks({task})?$select=_regardingobjectid_value")
        self.check(t["_regardingobjectid_value"] == lead, "Timeline stays on the Lead when no Opportunity is created")
        self.check(dv.get(f"nvdb_leads({lead})?$select=nvdb_leadstatus")["nvdb_leadstatus"] == CHOICE("nvdb_leadstatus", "Qualified"), "Lead still Qualified")

    def guards(self):
        lead = self.new_lead(self.rep, "guard")
        msg = rejection(self.other_rep, lead, "Lead owner or a Sales Manager|ReadAccess")
        self.check(msg is None, "another Rep cannot qualify (%s)" % msg)
        self.check(dv.get(f"nvdb_leads({lead})?$select=nvdb_leadstatus")["nvdb_leadstatus"] == CHOICE("nvdb_leadstatus", "New"), "rejected call changed nothing")
        r = call(self.manager, lead)
        self.track(r)
        self.check(True, "Manager qualified another user's Lead")
        msg = rejection(self.rep, lead, "cannot be qualified")
        self.check(msg is None, "already Qualified Lead is rejected (%s)" % msg)
        dq = self.new_lead(self.rep, "dq", nvdb_leadstatus=CHOICE("nvdb_leadstatus", "Disqualified"), nvdb_disqualifyreason="test")
        msg = rejection(self.rep, dq, "cannot be qualified")
        self.check(msg is None, "Disqualified Lead is rejected (%s)" % msg)
        msg = rejection(self.manager, dq, "cannot be qualified")
        self.check(msg is None, "Disqualified Lead is rejected for a Manager too (%s)" % msg)

    def atomic(self):
        lead = self.new_lead(self.rep, "atomic")
        before = dv.get(f"accounts?$select=accountid&$filter=contains(name,'[test] Qualify Co {RUN} atomic')")["value"]
        # a name over the 200 character limit makes the Opportunity create fail after the Account and Contact were created
        msg = rejection(self.rep, lead, "", OpportunityName="x" * 300)
        self.check(msg is None or "another reason" in msg, "forced failure is rejected")
        accounts = dv.get(f"accounts?$select=accountid&$filter=contains(name,'[test] Qualify Co {RUN} atomic')")["value"]
        contacts = dv.get(f"contacts?$select=contactid&$filter=lastname eq 'Qualify{RUN}' and emailaddress1 eq 'quinn.{RUN}.atomic@example.test'")["value"]
        l = dv.get(f"nvdb_leads({lead})?$select=nvdb_leadstatus,_nvdb_accountid_value")
        self.check(not accounts and not before, "forced failure leaves no partial Account")
        self.check(not contacts, "forced failure leaves no partial Contact")
        self.check(l["nvdb_leadstatus"] == CHOICE("nvdb_leadstatus", "New") and l["_nvdb_accountid_value"] is None, "forced failure leaves the Lead untouched")


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
    s = Scenario(rep, other_rep, manager)
    try:
        for step in (s.full_qualify, s.existing_parties, s.without_opportunity, s.guards, s.atomic):
            try:
                step()
            except dv.DataverseError as e:
                s.failures.append(f"{step.__name__} raised {e}")
    finally:
        for entity_set, rid in reversed(s.cleanup):
            if rid and rid != "00000000-0000-0000-0000-000000000000":
                try:
                    dv.request("DELETE", f"{entity_set}({rid})")
                except dv.DataverseError:
                    pass
        for entity_set, key, col in (("accounts", "accountid", "name"), ("contacts", "contactid", "lastname")):
            rows = dv.get(f"{entity_set}?$select={key}&$filter=contains({col},'{RUN}')")["value"]
            for row in rows:
                dv.request("DELETE", f"{entity_set}({row[key]})")
        for uid, rid in granted:
            unassign(uid, rid)
    for f in s.failures:
        dv.say(f"FAIL: {f}")
    return 1 if s.failures else 0


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--rep", default="alans@CRM381445.OnMicrosoft.com")
    p.add_argument("--manager", default="allieb@CRM381445.OnMicrosoft.com")
    p.add_argument("--other-rep", default="amya@CRM381445.OnMicrosoft.com")
    a = p.parse_args()
    sys.exit(run(a.rep, a.manager, a.other_rep))
