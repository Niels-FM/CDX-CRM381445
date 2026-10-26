"""Idempotently create the Sales Rep and Sales Manager security roles in salesapp_solution."""
import dv
import crm_model as m

DEPTH_RANK = {"Basic": 0, "Local": 1, "Deep": 2, "Global": 3}
ROLE_COMPONENT_TYPE = 20


def privilege_names(role):
    """Return {privilege_name_lower: depth}; shared privileges (e.g. Activity) keep the widest depth."""
    out = {}
    for (table, action), depth in m.role_matrix(role).items():
        name = f"prv{action}{m.PRIVILEGE_ENTITY[table]}".lower()
        if name not in out or DEPTH_RANK[depth] > DEPTH_RANK[out[name]]:
            out[name] = depth
    return out


def root_business_unit():
    return dv.get("businessunits?$filter=parentbusinessunitid eq null&$select=businessunitid")["value"][0]["businessunitid"]


def privilege_ids():
    rows = []
    page = dv.get("privileges?$select=name,privilegeid")
    rows += page["value"]
    while page.get("@odata.nextLink"):
        page = dv.get(page["@odata.nextLink"].split("/api/data/v9.2/", 1)[1])
        rows += page["value"]
    return {r["name"].lower(): r["privilegeid"] for r in rows}


def ensure_role(name, bu):
    rows = dv.get(f"roles?$filter=name eq '{name}' and _businessunitid_value eq {bu}&$select=roleid")["value"]
    if rows:
        dv.say(f"= role {name} exists")
        role_id = rows[0]["roleid"]
    else:
        _, headers, _ = dv.request("POST", "roles", {"name": name, "businessunitid@odata.bind": f"/businessunits({bu})"}, solution=m.SOLUTION)
        role_id = dv.entity_id(headers)
        dv.say(f"+ role {name} created")
    dv.request("POST", "AddSolutionComponent", {
        "ComponentId": role_id, "ComponentType": ROLE_COMPONENT_TYPE, "SolutionUniqueName": m.SOLUTION, "AddRequiredComponents": False})
    return role_id


def apply_privileges(role_key, role_id, bu, ids):
    wanted = privilege_names(role_key)
    missing = sorted(n for n in wanted if n not in ids)
    if missing:
        raise RuntimeError(f"Unknown privileges for {m.ROLE_NAMES[role_key]}: {missing}")
    payload = [{"@odata.type": "Microsoft.Dynamics.CRM.RolePrivilege", "PrivilegeId": ids[n], "Depth": d, "BusinessUnitId": bu}
               for n, d in wanted.items()]
    dv.request("POST", f"roles({role_id})/Microsoft.Dynamics.CRM.ReplacePrivilegesRole", {"Privileges": payload})
    dv.say(f"  {m.ROLE_NAMES[role_key]}: {len(payload)} privileges set")
    return wanted


def verify(role_key, role_id, wanted, ids):
    got = dv.get(f"RetrieveRolePrivilegesRole(RoleId={role_id})")["RolePrivileges"]
    by_id = {p["PrivilegeId"]: p["Depth"] for p in got}
    wrong = [n for n, d in wanted.items() if by_id.get(ids[n]) != d]
    if wrong:
        raise RuntimeError(f"{m.ROLE_NAMES[role_key]} privileges differ from the matrix: {wrong[:5]} ")
    extra = len(by_id) - len(wanted)
    dv.say(f"  verified {m.ROLE_NAMES[role_key]}: all {len(wanted)} matrix privileges at the right depth (+{extra} added by Dataverse)")


def run():
    bu = root_business_unit()
    ids = privilege_ids()
    for key in (m.REP, m.MANAGER):
        role_id = ensure_role(m.ROLE_NAMES[key], bu)
        wanted = apply_privileges(key, role_id, bu, ids)
        verify(key, role_id, wanted, ids)


if __name__ == "__main__":
    run()
