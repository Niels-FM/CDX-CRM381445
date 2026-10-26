import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import crm_model as m
import seed_data as s


class ChoiceTests(unittest.TestCase):
    def test_choice_labels_follow_the_spec(self):
        labels = lambda name: [label for label, _ in m.CHOICES[name]]
        self.assertEqual(labels("nvdb_source"), ["Web", "Referral", "Event", "Cold call", "Other"])
        self.assertEqual(labels("nvdb_rating"), ["Hot", "Warm", "Cold"])
        self.assertEqual(labels("nvdb_leadstatus"), ["New", "Contacted", "Qualified", "Disqualified"])
        self.assertEqual(labels("nvdb_stage"), ["Qualify", "Develop", "Propose", "Close"])
        self.assertEqual(labels("nvdb_opportunitystatus"), ["Open", "Won", "Lost"])

    def test_choice_values_use_the_publisher_prefix_and_are_unique(self):
        for name, options in m.CHOICES.items():
            values = [v for _, v in options]
            self.assertEqual(len(values), len(set(values)), name)
            self.assertTrue(all(v // 10000 == 53421 for v in values), name)

    def test_default_probability_by_stage(self):
        got = [m.stage_probability(label) for label, _ in m.CHOICES["nvdb_stage"]]
        self.assertEqual(got, [10, 25, 60, 90])


class RoleMatrixTests(unittest.TestCase):
    def depth(self, role, table, action):
        return m.role_matrix(role).get((table, action))

    def test_rep_cannot_delete_leads_or_opportunities(self):
        for t in ("nvdb_lead", "nvdb_opportunity"):
            self.assertIsNone(self.depth("rep", t, "Delete"))
            for a in ("Create", "Read", "Write", "Append", "AppendTo", "Assign"):
                self.assertEqual(self.depth("rep", t, a), "Basic")

    def test_rep_reads_accounts_at_business_unit_but_writes_own(self):
        self.assertEqual(self.depth("rep", "account", "Read"), "Local")
        self.assertEqual(self.depth("rep", "contact", "Read"), "Local")
        self.assertEqual(self.depth("rep", "account", "Write"), "Basic")
        self.assertIsNone(self.depth("rep", "account", "Delete"))

    def test_rep_owns_activities_and_notes_with_delete(self):
        for t in ("task", "phonecall", "appointment", "annotation"):
            for a in ("Create", "Read", "Write", "Delete"):
                self.assertEqual(self.depth("rep", t, a), "Basic")

    def test_manager_has_business_unit_depth_and_delete(self):
        for t in ("nvdb_lead", "nvdb_opportunity"):
            for a in ("Create", "Read", "Write", "Append", "AppendTo", "Assign", "Delete"):
                self.assertEqual(self.depth("manager", t, a), "Local")

    def test_both_roles_read_reference_tables(self):
        for role in ("rep", "manager"):
            for t in ("systemuser", "team", "businessunit", "transactioncurrency"):
                self.assertIsNotNone(self.depth(role, t, "Read"), (role, t))


class SeedTests(unittest.TestCase):
    def test_volumes_match_the_spec(self):
        self.assertEqual(len(s.ACCOUNTS), 6)
        self.assertEqual(len(s.CONTACTS), 10)
        self.assertEqual(len(s.LEADS), 12)
        self.assertEqual(len(s.OPPORTUNITIES), 10)
        self.assertGreaterEqual(len(s.ACTIVITIES) + len(s.NOTES), 20)

    def test_everything_is_seed_prefixed(self):
        names = [a["name"] for a in s.ACCOUNTS] + [o["name"] for o in s.OPPORTUNITIES] + [l["topic"] for l in s.LEADS]
        names += [c["firstname"] for c in s.CONTACTS] + [a["subject"] for a in s.ACTIVITIES] + [n["subject"] for n in s.NOTES]
        self.assertTrue(all(n.startswith(s.PREFIX) for n in names), [n for n in names if not n.startswith(s.PREFIX)])

    def test_opportunities_cover_all_stages_won_and_lost(self):
        open_stages = {o["stage"] for o in s.OPPORTUNITIES if o["status"] == "Open"}
        self.assertEqual(open_stages, {"Qualify", "Develop", "Propose", "Close"})
        self.assertTrue(any(o["status"] == "Won" for o in s.OPPORTUNITIES))
        self.assertTrue(any(o["status"] == "Lost" and o.get("lostreason") for o in s.OPPORTUNITIES))

    def test_leads_cover_every_status_and_disqualified_has_reason(self):
        self.assertEqual({l["status"] for l in s.LEADS}, {"New", "Contacted", "Qualified", "Disqualified"})
        for l in s.LEADS:
            if l["status"] == "Disqualified":
                self.assertTrue(l.get("disqualifyreason"))

    def test_references_resolve(self):
        accounts = {a["name"] for a in s.ACCOUNTS}
        contacts = {c["key"] for c in s.CONTACTS}
        for c in s.CONTACTS:
            self.assertIn(c["account"], accounts)
        for o in s.OPPORTUNITIES:
            self.assertIn(o["account"], accounts)
            self.assertIn(o["contact"], contacts)

    def test_activity_parents_exist(self):
        parents = {("nvdb_lead", l["topic"]) for l in s.LEADS} | {("nvdb_opportunity", o["name"]) for o in s.OPPORTUNITIES}
        for item in s.ACTIVITIES + s.NOTES:
            self.assertIn((item["parent_type"], item["parent"]), parents)

    def test_missing_only_returns_what_is_not_there_yet(self):
        self.assertEqual(s.missing(["[seed] A"], ["[seed] A", "[seed] B"]), ["[seed] B"])
        self.assertEqual(s.missing(["[seed] A", "[seed] B"], ["[seed] A", "[seed] B"]), [])


if __name__ == "__main__":
    unittest.main()
