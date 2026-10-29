import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import build_customapis as c
import register_plugin


class QualifyLeadDefinitionTests(unittest.TestCase):
    def setUp(self):
        self.api = next(a for a in c.CUSTOM_APIS if a["uniquename"] == "nvdb_QualifyLead")

    def test_is_unbound_action(self):
        self.assertEqual(self.api["bindingtype"], 0)
        self.assertFalse(self.api["isfunction"])

    def test_inputs_and_outputs_follow_the_spec(self):
        self.assertEqual(
            [(p["uniquename"], p["optional"]) for p in self.api["inputs"]],
            [("LeadId", False), ("AccountId", True), ("ContactId", True), ("CreateOpportunity", False),
             ("OpportunityName", True), ("EstimatedRevenue", True), ("EstimatedCloseDate", True)],
        )
        self.assertEqual([p["uniquename"] for p in self.api["outputs"]], ["AccountId", "ContactId", "OpportunityId"])

    def test_implementing_type_is_registered_in_the_assembly(self):
        self.assertIn(self.api["plugintype"], register_plugin.TYPES)


if __name__ == "__main__":
    unittest.main()
