"""Idempotently define the Sales CRM Custom APIs in salesapp_solution (Web API, caller's `dataverse` sign-in).

Each Custom API is implemented by a plug-in type of the one assembly that register_plugin.py uploads, so run that first
(deploy.py --plugin does). No execute privilege is set: the plug-in runs as the caller and every write it makes is checked
against the caller's role privileges.
"""
import crm_model
import dv

TYPE_BOOLEAN, TYPE_DATETIME, TYPE_ENTITYREFERENCE, TYPE_MONEY, TYPE_STRING, TYPE_GUID = 0, 1, 5, 8, 10, 12
PLUGIN_NAMESPACE = "NVDB.SalesCrm.Plugins."
ID_COLUMN = {"customapirequestparameters": "customapirequestparameterid", "customapiresponseproperties": "customapiresponsepropertyid"}


def _p(uniquename, kind, optional=True, entity=None, description=None):
    return {"uniquename": uniquename, "type": kind, "optional": optional, "entity": entity, "description": description or uniquename}


CUSTOM_APIS = [
    {
        "uniquename": "nvdb_AddActivity",
        "name": "Add Activity",
        "description": "Creates a Task, Phone Call or Appointment regarding a Lead, Opportunity, Account or Contact, as the caller.",
        "plugintype": PLUGIN_NAMESPACE + "AddActivity",
        "bindingtype": 0,
        "isfunction": False,
        "inputs": [
            _p("ParentType", TYPE_STRING, optional=False, description="nvdb_lead, nvdb_opportunity, account or contact"),
            _p("ParentId", TYPE_GUID, optional=False, description="Id of the parent record"),
            _p("ActivityType", TYPE_STRING, optional=False, description="task, phonecall or appointment"),
            _p("Subject", TYPE_STRING, optional=False),
            _p("DueDate", TYPE_DATETIME, optional=False),
            _p("Description", TYPE_STRING),
        ],
        "outputs": [_p("ActivityId", TYPE_GUID, optional=False)],
    },
    {
        "uniquename": "nvdb_AddNote",
        "name": "Add Note",
        "description": "Creates a Note on a Lead, Opportunity, Account or Contact, as the caller.",
        "plugintype": PLUGIN_NAMESPACE + "AddNote",
        "bindingtype": 0,
        "isfunction": False,
        "inputs": [
            _p("ParentType", TYPE_STRING, optional=False, description="nvdb_lead, nvdb_opportunity, account or contact"),
            _p("ParentId", TYPE_GUID, optional=False, description="Id of the parent record"),
            _p("Text", TYPE_STRING, optional=False),
            _p("Subject", TYPE_STRING),
        ],
        "outputs": [_p("NoteId", TYPE_GUID, optional=False)],
    },
    {
        "uniquename": "nvdb_QualifyLead",
        "name": "Qualify Lead",
        "description": "Qualifies a Lead into an Account, a Contact and optionally an Opportunity in one transaction, as the caller.",
        "plugintype": PLUGIN_NAMESPACE + "QualifyLead",
        "bindingtype": 0,
        "isfunction": False,
        "inputs": [
            _p("LeadId", TYPE_ENTITYREFERENCE, optional=False, entity="nvdb_lead", description="The Lead to qualify"),
            _p("AccountId", TYPE_GUID, description="Existing Account to use; omit to create one from the Lead"),
            _p("ContactId", TYPE_GUID, description="Existing Contact to use; omit to create one from the Lead"),
            _p("CreateOpportunity", TYPE_BOOLEAN, optional=False, description="Create an Opportunity; required because an unset Boolean cannot default to true"),
            _p("OpportunityName", TYPE_STRING, description="Opportunity name (default: the Lead topic)"),
            _p("EstimatedRevenue", TYPE_MONEY, description="Opportunity estimated revenue"),
            _p("EstimatedCloseDate", TYPE_DATETIME, description="Opportunity estimated close date"),
        ],
        "outputs": [
            _p("AccountId", TYPE_GUID, optional=False),
            _p("ContactId", TYPE_GUID, optional=False),
            _p("OpportunityId", TYPE_GUID, optional=False, description="Empty Guid when no Opportunity was created"),
        ],
    }
]


def _first(path):
    rows = dv.get(path).get("value", [])
    return rows[0] if rows else None


def _plugin_type_id(type_name):
    row = _first(f"plugintypes?$select=plugintypeid&$filter=typename eq '{type_name}'")
    if not row:
        raise RuntimeError(f"Plug-in type {type_name} is not registered; run register_plugin.py first")
    return row["plugintypeid"]


def ensure_api(api):
    body = {
        "uniquename": api["uniquename"],
        "name": api["name"],
        "displayname": api["name"],
        "description": api["description"],
        "bindingtype": api["bindingtype"],
        "isfunction": api["isfunction"],
        "isprivate": False,
        "allowedcustomprocessingsteptype": 0,
        "executeprivilegename": None,
        "PluginTypeId@odata.bind": f"/plugintypes({_plugin_type_id(api['plugintype'])})",
    }
    existing = _first(f"customapis?$select=customapiid&$filter=uniquename eq '{api['uniquename']}'")
    if existing:
        patch = {k: v for k, v in body.items() if k not in ("uniquename", "bindingtype", "isfunction")}
        dv.request("PATCH", f"customapis({existing['customapiid']})", body=patch)
        dv.say(f"= Custom API {api['uniquename']} updated")
        return existing["customapiid"]
    _, headers, _ = dv.request("POST", "customapis", body=body, solution=crm_model.SOLUTION)
    dv.say(f"+ Custom API {api['uniquename']} created")
    return dv.entity_id(headers)


def ensure_parameters(api_id, entity_set, relation, params):
    for p in params:
        existing = _first(f"{entity_set}?$select={ID_COLUMN[entity_set]}&$filter=uniquename eq '{p['uniquename']}' and _customapiid_value eq {api_id}")
        body = {"name": p["uniquename"], "displayname": p["uniquename"], "description": p["description"], "type": p["type"]}
        if entity_set == "customapirequestparameters":
            body["isoptional"] = p["optional"]
        if p["entity"]:
            body["logicalentityname"] = p["entity"]
        if existing:
            dv.request("PATCH", f"{entity_set}({existing[ID_COLUMN[entity_set]]})", body=body)
            continue
        body.update({"uniquename": p["uniquename"], "CustomAPIId@odata.bind": f"/customapis({api_id})"})
        dv.request("POST", entity_set, body=body, solution=crm_model.SOLUTION)
        dv.say(f"  + {relation} {p['uniquename']}")


def run():
    for api in CUSTOM_APIS:
        api_id = ensure_api(api)
        ensure_parameters(api_id, "customapirequestparameters", "input", api["inputs"])
        ensure_parameters(api_id, "customapiresponseproperties", "output", api["outputs"])


if __name__ == "__main__":
    run()
