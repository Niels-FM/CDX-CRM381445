"""Idempotently create nvdb_lead and nvdb_opportunity (tables, Choices, lookups) in salesapp_solution."""
import dv
import crm_model as m

SOLUTION = m.SOLUTION


def label(text):
    return {
        "@odata.type": "Microsoft.Dynamics.CRM.Label",
        "LocalizedLabels": [{"@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", "Label": text, "LanguageCode": m.LCID}],
    }


def level(value="None"):
    return {"Value": value}


def schema_name(logical):
    prefix, _, rest = logical.partition("_")
    return f"{prefix}_{rest[:1].upper()}{rest[1:]}"


def attribute_payload(logical, display, kind, opts):
    base = {"SchemaName": schema_name(logical), "DisplayName": label(display), "RequiredLevel": level()}
    if kind in ("string", "email", "phone"):
        fmt = {"string": "Text", "email": "Email", "phone": "Phone"}[kind]
        return {**base, "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata", "AttributeType": "String",
                "FormatName": level(fmt), "MaxLength": opts.get("max", 100)}
    if kind == "money":
        return {**base, "@odata.type": "Microsoft.Dynamics.CRM.MoneyAttributeMetadata", "AttributeType": "Money",
                "PrecisionSource": 2}
    if kind == "int":
        return {**base, "@odata.type": "Microsoft.Dynamics.CRM.IntegerAttributeMetadata", "AttributeType": "Integer",
                "Format": "None", "MinValue": opts.get("min", 0), "MaxValue": opts.get("max", 100)}
    if kind == "date":
        return {**base, "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata", "AttributeType": "DateTime",
                "Format": "DateOnly", "DateTimeBehavior": level("DateOnly")}
    if kind == "choice":
        options = m.CHOICES[opts["choice"]]
        payload = {
            **base,
            "@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
            "AttributeType": "Picklist",
            "OptionSet": {
                "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
                "IsGlobal": False,
                "OptionSetType": "Picklist",
                "Options": [{"Value": v, "Label": label(l)} for l, v in options],
            },
        }
        if "default" in opts:
            payload["DefaultFormValue"] = m.choice_value(opts["choice"], opts["default"])
        return payload
    raise ValueError(kind)


def entity_payload(logical, spec):
    pname, pdisplay = spec["primary"]
    return {
        "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
        "SchemaName": schema_name(logical),
        "DisplayName": label(spec["display"]),
        "DisplayCollectionName": label(spec["plural"]),
        "Description": label(f"Sales CRM {spec['display']}"),
        "OwnershipType": "UserOwned",
        "HasActivities": True,
        "HasNotes": True,
        "Attributes": [{
            "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
            "AttributeType": "String",
            "SchemaName": schema_name(pname),
            "IsPrimaryName": True,
            "RequiredLevel": level("ApplicationRequired"),
            "MaxLength": 200,
            "FormatName": level("Text"),
            "DisplayName": label(pdisplay),
        }],
    }


def relationship_payload(table, column, display, target, required):
    return {
        "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
        "SchemaName": m.relationship_name(table, column, target),
        "ReferencedEntity": target,
        "ReferencedAttribute": "nvdb_leadid" if target == "nvdb_lead" else f"{target}id",
        "ReferencingEntity": table,
        "Lookup": {
            "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
            "AttributeType": "Lookup",
            "SchemaName": schema_name(column),
            "DisplayName": label(display),
            "RequiredLevel": level("ApplicationRequired" if required else "None"),
        },
        "AssociatedMenuConfiguration": {"Behavior": "UseCollectionName", "Group": "Details", "Order": 10000},
        "CascadeConfiguration": {
            "Assign": "NoCascade", "Delete": "Restrict" if required else "RemoveLink", "Merge": "NoCascade",
            "Reparent": "NoCascade", "Share": "NoCascade", "Unshare": "NoCascade",
        },
    }


def ensure_table(logical, spec):
    if dv.exists(f"EntityDefinitions(LogicalName='{logical}')?$select=LogicalName"):
        dv.say(f"= table {logical} exists")
    else:
        dv.request("POST", "EntityDefinitions", entity_payload(logical, spec), solution=SOLUTION)
        dv.say(f"+ table {logical} created (HasActivities, HasNotes)")


def ensure_column(table, logical, display, kind, opts):
    if dv.exists(f"EntityDefinitions(LogicalName='{table}')/Attributes(LogicalName='{logical}')?$select=LogicalName"):
        dv.say(f"= {table}.{logical} exists")
        return
    dv.request("POST", f"EntityDefinitions(LogicalName='{table}')/Attributes",
               attribute_payload(logical, display, kind, opts), solution=SOLUTION)
    dv.say(f"+ {table}.{logical} created")


def ensure_lookup(table, logical, display, target, required):
    if dv.exists(f"EntityDefinitions(LogicalName='{table}')/Attributes(LogicalName='{logical}')?$select=LogicalName"):
        dv.say(f"= {table}.{logical} exists")
        return
    dv.request("POST", "RelationshipDefinitions", relationship_payload(table, logical, display, target, required), solution=SOLUTION)
    dv.say(f"+ {table}.{logical} -> {target} created")


def verify():
    """Check the irreversible and structural flags; raises when something is off."""
    problems = []
    for logical, spec in m.TABLES.items():
        d = dv.get(f"EntityDefinitions(LogicalName='{logical}')?$select=HasActivities,HasNotes,OwnershipType")
        if not (d["HasActivities"] and d["HasNotes"]):
            problems.append(f"{logical}: HasActivities/HasNotes not both true")
        if d["OwnershipType"] != "UserOwned":
            problems.append(f"{logical}: OwnershipType is {d['OwnershipType']}")
    if problems:
        raise RuntimeError("; ".join(problems))
    dv.say("verified: both tables UserOwned with HasActivities and HasNotes")


def run():
    for logical, spec in m.TABLES.items():
        ensure_table(logical, spec)
    # Lead first: the opportunity has a lookup to it.
    for logical, spec in m.TABLES.items():
        for col, disp, kind, opts in spec["columns"]:
            ensure_column(logical, col, disp, kind, opts)
        for col, disp, target, required in spec["lookups"]:
            ensure_lookup(logical, col, disp, target, required)
    dv.request("POST", "PublishAllXml")
    verify()


if __name__ == "__main__":
    run()
