"""Idempotently load [seed]-prefixed sample data. Safe to re-run: existing records are matched by name and left alone."""
import argparse
from datetime import date, datetime, time, timedelta, timezone

import dv
import crm_model as m
import seed_data as s

SETS = {"nvdb_lead": "nvdb_leads", "nvdb_opportunity": "nvdb_opportunities", "account": "accounts", "contact": "contacts"}
ACTIVITY_SETS = {"task": "tasks", "phonecall": "phonecalls", "appointment": "appointments"}
DONE = {"task": (1, 5), "phonecall": (1, 4), "appointment": (1, 3)}


def q(value):
    return value.replace("'", "''")


def find(entity_set, key, value, id_field):
    rows = dv.get(f"{entity_set}?$filter={key} eq '{q(value)}'&$select={id_field}&$top=1")["value"]
    return rows[0][id_field] if rows else None


def create(entity_set, body):
    _, headers, _ = dv.request("POST", entity_set, body)
    return dv.entity_id(headers)


def ensure(entity_set, key, value, id_field, body, counts):
    existing = find(entity_set, key, value, id_field)
    if existing:
        counts["existing"] += 1
        return existing
    counts["created"] += 1
    return create(entity_set, body)


def ref(entity_set, record_id):
    return f"/{entity_set}({record_id})"


def at(days, hour=9):
    d = date.today() + timedelta(days=days)
    return datetime.combine(d, time(hour), tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def owner_for(index, owners):
    return ref("systemusers", owners[index % len(owners)]) if owners else None


def user_id(email):
    rows = dv.get(f"systemusers?$filter=internalemailaddress eq '{q(email)}'&$select=systemuserid")["value"]
    if not rows:
        raise SystemExit(f"No user with email {email}; create the user first (see README).")
    return rows[0]["systemuserid"]


def run(owner_emails=()):
    owners = [user_id(e) for e in owner_emails]
    stats = {}

    def counts(name):
        return stats.setdefault(name, {"created": 0, "existing": 0})

    accounts = {}
    for a in s.ACCOUNTS:
        accounts[a["name"]] = ensure("accounts", "name", a["name"], "accountid", {
            "name": a["name"], "telephone1": a["phone"], "websiteurl": a["website"], "address1_city": a["city"]}, counts("Accounts"))

    contacts = {}
    for c in s.CONTACTS:
        contacts[c["key"]] = ensure("contacts", "emailaddress1", c["email"], "contactid", {
            "firstname": c["firstname"], "lastname": c["lastname"], "emailaddress1": c["email"], "jobtitle": c["jobtitle"],
            "parentcustomerid_account@odata.bind": ref("accounts", accounts[c["account"]])}, counts("Contacts"))

    leads = {}
    for i, l in enumerate(s.LEADS):
        body = {
            "nvdb_topic": l["topic"], "nvdb_firstname": l["firstname"], "nvdb_lastname": l["lastname"], "nvdb_companyname": l["company"],
            "nvdb_jobtitle": l["jobtitle"], "nvdb_email": l["email"], "nvdb_phone": l["phone"],
            "nvdb_source": m.choice_value("nvdb_source", l["source"]), "nvdb_rating": m.choice_value("nvdb_rating", l["rating"]),
            "nvdb_leadstatus": m.choice_value("nvdb_leadstatus", l["status"]),
        }
        if l.get("disqualifyreason"):
            body["nvdb_disqualifyreason"] = l["disqualifyreason"]
        if l.get("account"):
            body["nvdb_Accountid@odata.bind"] = ref("accounts", accounts[l["account"]])
            body["nvdb_Contactid@odata.bind"] = ref("contacts", contacts[l["contact"]])
        if owner_for(i, owners):
            body["ownerid@odata.bind"] = owner_for(i, owners)
        leads[l["topic"]] = ensure("nvdb_leads", "nvdb_topic", l["topic"], "nvdb_leadid", body, counts("Leads"))

    opps = {}
    for i, o in enumerate(s.OPPORTUNITIES):
        body = {
            "nvdb_name": o["name"], "nvdb_stage": m.choice_value("nvdb_stage", o["stage"]),
            "nvdb_opportunitystatus": m.choice_value("nvdb_opportunitystatus", o["status"]),
            "nvdb_estimatedrevenue": o["revenue"], "nvdb_probability": m.stage_probability(o["stage"]),
            "nvdb_estimatedclosedate": at(o["closein"])[:10],
            "nvdb_Accountid@odata.bind": ref("accounts", accounts[o["account"]]),
            "nvdb_Contactid@odata.bind": ref("contacts", contacts[o["contact"]]),
        }
        if o["status"] == "Won":
            body["nvdb_probability"] = 100
        if o["status"] == "Lost":
            body["nvdb_probability"] = 0
            body["nvdb_lostreason"] = o["lostreason"]
        if o["status"] != "Open":
            body["nvdb_closeddate"] = at(-o["closedago"])[:10]
        if owner_for(i, owners):
            body["ownerid@odata.bind"] = owner_for(i, owners)
        opps[o["name"]] = ensure("nvdb_opportunities", "nvdb_name", o["name"], "nvdb_opportunityid", body, counts("Opportunities"))

    parents = {"nvdb_lead": leads, "nvdb_opportunity": opps}

    for a in s.ACTIVITIES:
        pid = parents[a["parent_type"]][a["parent"]]
        entity_set, id_field = ACTIVITY_SETS[a["type"]], "activityid"
        found = dv.get(f"{entity_set}?$filter=subject eq '{q(a['subject'])}' and _regardingobjectid_value eq {pid}&$select={id_field}&$top=1")["value"]
        if found:
            counts("Activities")["existing"] += 1
            continue
        body = {"subject": a["subject"], "scheduledend": at(a["due"]),
                f"regardingobjectid_{a['parent_type']}_{a['type']}@odata.bind": ref(SETS[a["parent_type"]], pid)}
        if a["type"] == "appointment":
            body["scheduledstart"] = at(a["due"], 9)
            body["scheduledend"] = at(a["due"], 10)
        if a["type"] == "phonecall":
            body.update({"directioncode": True, "phonenumber": "+31 20 555 0199"})
        new_id = create(entity_set, body)
        if a["done"]:
            state, status = DONE[a["type"]]
            dv.request("PATCH", f"{entity_set}({new_id})", {"statecode": state, "statuscode": status})
        counts("Activities")["created"] += 1

    for n in s.NOTES:
        pid = parents[n["parent_type"]][n["parent"]]
        found = dv.get(f"annotations?$filter=subject eq '{q(n['subject'])}' and _objectid_value eq {pid}&$select=annotationid&$top=1")["value"]
        if found:
            counts("Notes")["existing"] += 1
            continue
        create("annotations", {"subject": n["subject"], "notetext": n["text"],
                               f"objectid_{n['parent_type']}@odata.bind": ref(SETS[n["parent_type"]], pid)})
        counts("Notes")["created"] += 1

    for name, c in stats.items():
        dv.say(f"{name}: {c['created']} created, {c['existing']} already there")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--owners", nargs="*", default=[], help="emails of Rep A / Rep B: seeded Leads and Opportunities alternate between them")
    run(p.parse_args().owners)
