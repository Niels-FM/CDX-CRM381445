"""Pure definitions of the Sales CRM schema and security roles (no I/O)."""

OPTION_PREFIX = 53421
SOLUTION = "salesapp_solution"
PREFIX = "nvdb"
LCID = 1033


def _opts(*labels):
    return [(label, OPTION_PREFIX * 10000 + i) for i, label in enumerate(labels)]


CHOICES = {
    "nvdb_source": _opts("Web", "Referral", "Event", "Cold call", "Other"),
    "nvdb_rating": _opts("Hot", "Warm", "Cold"),
    "nvdb_leadstatus": _opts("New", "Contacted", "Qualified", "Disqualified"),
    "nvdb_stage": _opts("Qualify", "Develop", "Propose", "Close"),
    "nvdb_opportunitystatus": _opts("Open", "Won", "Lost"),
}

STAGE_PROBABILITY = {"Qualify": 10, "Develop": 25, "Propose": 60, "Close": 90}


def stage_probability(stage):
    return STAGE_PROBABILITY[stage]


def choice_value(choice, label):
    return dict(CHOICES[choice])[label]


# kind: string | memo | email | phone | money | int | date | choice | lookup
TABLES = {
    "nvdb_lead": {
        "display": "Lead",
        "plural": "Leads",
        "primary": ("nvdb_topic", "Topic"),
        "columns": [
            ("nvdb_firstname", "First name", "string", {"max": 100}),
            ("nvdb_lastname", "Last name", "string", {"max": 100}),
            ("nvdb_companyname", "Company name", "string", {"max": 200}),
            ("nvdb_jobtitle", "Job title", "string", {"max": 100}),
            ("nvdb_email", "Email", "email", {}),
            ("nvdb_phone", "Phone", "phone", {}),
            ("nvdb_source", "Source", "choice", {"choice": "nvdb_source"}),
            ("nvdb_rating", "Rating", "choice", {"choice": "nvdb_rating"}),
            ("nvdb_leadstatus", "Status", "choice", {"choice": "nvdb_leadstatus", "default": "New"}),
            ("nvdb_disqualifyreason", "Disqualify reason", "string", {"max": 500}),
        ],
        "lookups": [
            ("nvdb_accountid", "Account", "account", False),
            ("nvdb_contactid", "Contact", "contact", False),
        ],
    },
    "nvdb_opportunity": {
        "display": "Opportunity",
        "plural": "Opportunities",
        "primary": ("nvdb_name", "Name"),
        "columns": [
            ("nvdb_stage", "Stage", "choice", {"choice": "nvdb_stage", "default": "Qualify"}),
            ("nvdb_opportunitystatus", "Status", "choice", {"choice": "nvdb_opportunitystatus", "default": "Open"}),
            ("nvdb_estimatedrevenue", "Estimated revenue", "money", {}),
            ("nvdb_estimatedclosedate", "Estimated close date", "date", {}),
            ("nvdb_probability", "Probability", "int", {"min": 0, "max": 100}),
            ("nvdb_lostreason", "Lost reason", "string", {"max": 500}),
            ("nvdb_closeddate", "Closed date", "date", {}),
        ],
        "lookups": [
            ("nvdb_accountid", "Account", "account", True),
            ("nvdb_contactid", "Contact", "contact", False),
            ("nvdb_sourceleadid", "Source lead", "nvdb_lead", False),
        ],
    },
}


def relationship_name(table, lookup_column, target):
    return f"nvdb_{target.removeprefix('nvdb_')}_{table.removeprefix('nvdb_')}_{lookup_column.removeprefix('nvdb_')}"


# --- security roles -------------------------------------------------------

REP, MANAGER = "rep", "manager"
ROLE_NAMES = {REP: "Sales Rep", MANAGER: "Sales Manager"}

_CUSTOM = ("nvdb_lead", "nvdb_opportunity")
_PARTIES = ("account", "contact")
_ACTIVITY = ("task", "phonecall", "appointment", "annotation")
_REFERENCE = ("systemuser", "team", "businessunit", "transactioncurrency", "organization", "canvasapp")

# Privilege-name suffix after prv<Action> for each table (activity types share the Activity privileges).
PRIVILEGE_ENTITY = {
    "nvdb_lead": "nvdb_Lead",
    "nvdb_opportunity": "nvdb_Opportunity",
    "account": "Account",
    "contact": "Contact",
    "task": "Activity",
    "phonecall": "Activity",
    "appointment": "Activity",
    "annotation": "Note",
    "activitypointer": "Activity",
    "systemuser": "User",
    "team": "Team",
    "businessunit": "BusinessUnit",
    "transactioncurrency": "TransactionCurrency",
    "organization": "Organization",
    "canvasapp": "CanvasApp",
}


def role_matrix(role):
    """Return {(table, action): depth}; depth is Basic (user), Local (business unit) or Global."""
    own = "Basic" if role == REP else "Local"
    m = {}
    for t in _CUSTOM:
        for a in ("Create", "Read", "Write", "Append", "AppendTo", "Assign"):
            m[(t, a)] = own
        if role == MANAGER:
            m[(t, "Delete")] = "Local"
    for t in _PARTIES:
        for a in ("Create", "Write", "Append", "AppendTo", "Assign"):
            m[(t, a)] = own
        m[(t, "Read")] = "Local"
        if role == MANAGER:
            m[(t, "Delete")] = "Local"
    for t in _ACTIVITY:
        for a in ("Create", "Read", "Write", "Delete", "Append", "AppendTo"):
            m[(t, a)] = own
    m[("activitypointer", "Read")] = own
    for t in _REFERENCE:
        m[(t, "Read")] = "Global"
    return m
