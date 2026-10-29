"""Sample data for the Sales CRM. Every record is [seed]-prefixed so it is easy to find and remove."""

PREFIX = "[seed] "


def missing(existing, desired):
    have = set(existing)
    return [d for d in desired if d not in have]


ACCOUNTS = [
    {"name": PREFIX + n, "phone": p, "website": w, "city": c}
    for n, p, w, c in [
        ("Contoso Logistics", "+31 20 555 0101", "https://contoso-logistics.example.com", "Amsterdam"),
        ("Fabrikam Foods", "+31 10 555 0102", "https://fabrikam-foods.example.com", "Rotterdam"),
        ("Northwind Energy", "+31 30 555 0103", "https://northwind-energy.example.com", "Utrecht"),
        ("Adventure Works Retail", "+31 40 555 0104", "https://adventure-works.example.com", "Eindhoven"),
        ("Tailspin Travel", "+31 70 555 0105", "https://tailspin-travel.example.com", "Den Haag"),
        ("Wingtip Health", "+31 50 555 0106", "https://wingtip-health.example.com", "Groningen"),
    ]
]
_A = [a["name"] for a in ACCOUNTS]

CONTACTS = [
    {"key": k, "firstname": PREFIX + f, "lastname": l, "email": f"{k}@seed.example.com", "jobtitle": j, "account": _A[a]}
    for k, f, l, j, a in [
        ("anna.devries", "Anna", "de Vries", "Logistics Director", 0),
        ("bram.jansen", "Bram", "Jansen", "Procurement Lead", 0),
        ("carla.bakker", "Carla", "Bakker", "CFO", 1),
        ("daan.visser", "Daan", "Visser", "Operations Manager", 1),
        ("eva.smit", "Eva", "Smit", "Head of IT", 2),
        ("finn.meijer", "Finn", "Meijer", "Sustainability Lead", 2),
        ("gina.mulder", "Gina", "Mulder", "Retail Director", 3),
        ("hugo.bos", "Hugo", "Bos", "Buyer", 4),
        ("iris.peters", "Iris", "Peters", "Managing Director", 4),
        ("jan.dekker", "Jan", "Dekker", "Clinic Manager", 5),
    ]
]

LEADS = [
    {"topic": PREFIX + t, "firstname": f, "lastname": l, "company": c, "jobtitle": j, "email": f"{f.lower()}.{l.lower()}@lead.example.com",
     "phone": "+31 6 5550 01%02d" % i, "source": src, "rating": r, "status": st, **extra}
    for i, (t, f, l, c, j, src, r, st, extra) in enumerate([
        ("Website enquiry Litware", "Lars", "Hoek", "Litware", "IT Manager", "Web", "Warm", "New", {}),
        ("Trade show Proseware", "Mila", "Kok", "Proseware", "Buyer", "Event", "Hot", "New", {}),
        ("Referral Alpine Ski House", "Noah", "Brouwer", "Alpine Ski House", "Owner", "Referral", "Hot", "Contacted", {}),
        ("Cold call Coho Winery", "Olivia", "Hendriks", "Coho Winery", "Manager", "Cold call", "Cold", "Contacted", {}),
        ("Webinar Lucerne Publishing", "Pim", "Vos", "Lucerne Publishing", "Editor", "Web", "Warm", "Contacted", {}),
        ("Referral Margie's Travel", "Quinn", "Maas", "Margie's Travel", "Director", "Referral", "Hot", "New", {}),
        ("Contoso follow-up", "Anna", "de Vries", "Contoso Logistics", "Logistics Director", "Referral", "Hot", "Qualified", {"account": _A[0], "contact": "anna.devries"}),
        ("Fabrikam intro", "Carla", "Bakker", "Fabrikam Foods", "CFO", "Event", "Warm", "Qualified", {"account": _A[1], "contact": "carla.bakker"}),
        ("Northwind inbound", "Eva", "Smit", "Northwind Energy", "Head of IT", "Web", "Warm", "Qualified", {"account": _A[2], "contact": "eva.smit"}),
        ("Southridge Video", "Ruben", "Prins", "Southridge Video", "Producer", "Cold call", "Cold", "Disqualified", {"disqualifyreason": "No budget this year"}),
        ("Trey Research enquiry", "Sanne", "Verhoeven", "Trey Research", "Researcher", "Other", "Cold", "Disqualified", {"disqualifyreason": "Competitor already contracted"}),
        ("Blue Yonder Airlines", "Tom", "Wolters", "Blue Yonder Airlines", "Fleet Manager", "Event", "Hot", "New", {}),
    ])
]
for _l in LEADS:
    _l["disqualifyreason"] = _l.get("disqualifyreason")

OPPORTUNITIES = [
    {"name": PREFIX + n, "account": _A[a], "contact": c, "stage": st, "status": s, "revenue": rev, "closein": days, **extra}
    for n, a, c, st, s, rev, days, extra in [
        ("Contoso fleet tracking", 0, "anna.devries", "Qualify", "Open", 25000, 60, {}),
        ("Fabrikam cold chain", 1, "carla.bakker", "Qualify", "Open", 40000, 75, {}),
        ("Northwind smart meters", 2, "eva.smit", "Develop", "Open", 85000, 45, {}),
        ("Adventure Works POS rollout", 3, "gina.mulder", "Develop", "Open", 60000, 50, {}),
        ("Tailspin booking portal", 4, "hugo.bos", "Propose", "Open", 120000, 30, {}),
        ("Wingtip patient app", 5, "jan.dekker", "Propose", "Open", 95000, 35, {}),
        ("Contoso warehouse analytics", 0, "bram.jansen", "Close", "Open", 150000, 14, {}),
        ("Fabrikam supplier portal", 1, "daan.visser", "Close", "Open", 70000, 10, {}),
        ("Northwind sustainability report", 2, "finn.meijer", "Close", "Won", 55000, -20, {"closedago": 20}),
        ("Tailspin loyalty programme", 4, "iris.peters", "Propose", "Lost", 45000, -15, {"closedago": 15, "lostreason": "Lost to competitor on price"}),
    ]
]

# type: task | phonecall | appointment; due is days from today (negative = overdue)
ACTIVITIES = [
    {"type": t, "subject": PREFIX + subj, "parent_type": pt, "parent": PREFIX + p, "due": due, "done": done}
    for t, subj, pt, p, due, done in [
        ("task", "Send intro mail to Litware", "nvdb_lead", "Website enquiry Litware", 1, False),
        ("phonecall", "Call Proseware buyer", "nvdb_lead", "Trade show Proseware", 0, False),
        ("task", "Prepare Alpine demo", "nvdb_lead", "Referral Alpine Ski House", -2, False),
        ("phonecall", "Follow up Coho Winery", "nvdb_lead", "Cold call Coho Winery", -5, True),
        ("appointment", "Meet Blue Yonder", "nvdb_lead", "Blue Yonder Airlines", 3, False),
        ("task", "Scope fleet tracking", "nvdb_opportunity", "Contoso fleet tracking", 2, False),
        ("phonecall", "Discovery call Fabrikam", "nvdb_opportunity", "Fabrikam cold chain", -1, False),
        ("appointment", "Workshop Northwind meters", "nvdb_opportunity", "Northwind smart meters", 5, False),
        ("task", "Send POS proposal", "nvdb_opportunity", "Adventure Works POS rollout", 0, False),
        ("task", "Draft Tailspin proposal", "nvdb_opportunity", "Tailspin booking portal", -3, True),
        ("appointment", "Proposal review Wingtip", "nvdb_opportunity", "Wingtip patient app", 4, False),
        ("phonecall", "Negotiate Contoso analytics", "nvdb_opportunity", "Contoso warehouse analytics", 1, False),
        ("task", "Collect signed order Fabrikam", "nvdb_opportunity", "Fabrikam supplier portal", -4, False),
        ("task", "Send thank-you to Northwind", "nvdb_opportunity", "Northwind sustainability report", -18, True),
    ]
]

NOTES = [
    {"subject": PREFIX + subj, "text": text, "parent_type": pt, "parent": PREFIX + p}
    for subj, text, pt, p in [
        ("Lead context", "Found us via the website contact form.", "nvdb_lead", "Website enquiry Litware"),
        ("Event notes", "Spoke at the booth, interested in a pilot.", "nvdb_lead", "Trade show Proseware"),
        ("Referral source", "Introduced by an existing customer.", "nvdb_lead", "Referral Alpine Ski House"),
        ("Budget check", "Budget confirmed for next quarter.", "nvdb_opportunity", "Contoso fleet tracking"),
        ("Requirements", "Needs integration with existing ERP.", "nvdb_opportunity", "Northwind smart meters"),
        ("Competitor", "Incumbent vendor is Fabrikam Systems.", "nvdb_opportunity", "Tailspin booking portal"),
        ("Decision maker", "CFO signs off above 100k.", "nvdb_opportunity", "Contoso warehouse analytics"),
        ("Lost reason detail", "Competitor undercut by 15 percent.", "nvdb_opportunity", "Tailspin loyalty programme"),
    ]
]
