import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import preflight as p

GOOD = {
    "tools": {"dataverse": True, "pac": True, "node": True, "pa": True},
    "env": {"DATAVERSE_URL": "https://x.crm.dynamics.com", "SOLUTION_NAME": "salesapp_solution", "PUBLISHER_PREFIX": "nvdb"},
    "dataverse": {"ok": True, "error": None},
    "solution": {"exists": True, "managed": False, "prefix": "nvdb"},
    "deployer_roles": ["System Administrator"],
    "pa": {"ok": True, "error": None},
}


def facts(**over):
    return {**GOOD, **over}


class PreflightTests(unittest.TestCase):
    def test_all_good_has_no_problems(self):
        self.assertEqual(p.problems(GOOD, {"tables", "roles", "plugin", "app"}), [])

    def test_missing_env_values_are_named(self):
        f = facts(env={"DATAVERSE_URL": "https://x"})
        msgs = p.problems(f, {"tables"})
        self.assertTrue(any("SOLUTION_NAME" in m and ".env" in m for m in msgs))

    def test_missing_dataverse_cli_tells_how_to_install(self):
        msgs = p.problems(facts(tools={**GOOD["tools"], "dataverse": False}), {"tables"})
        self.assertTrue(any("dataverse" in m and "auth create" in m for m in msgs))

    def test_unreachable_dataverse_reports_the_error(self):
        msgs = p.problems(facts(dataverse={"ok": False, "error": "AADSTS50076 MFA"}), {"tables"})
        self.assertTrue(any("AADSTS50076" in m for m in msgs))

    def test_missing_or_managed_solution(self):
        self.assertTrue(any("not found" in m for m in p.problems(facts(solution={"exists": False}), {"tables"})))
        self.assertTrue(any("unmanaged" in m for m in p.problems(facts(solution={"exists": True, "managed": True, "prefix": "nvdb"}), {"tables"})))

    def test_wrong_publisher_prefix(self):
        msgs = p.problems(facts(solution={"exists": True, "managed": False, "prefix": "new"}), {"tables"})
        self.assertTrue(any("nvdb" in m and "new" in m for m in msgs))

    def test_deployer_needs_customizer_and_maker_or_admin(self):
        self.assertTrue(p.problems(facts(deployer_roles=["System Customizer"]), {"tables"}))
        self.assertTrue(p.problems(facts(deployer_roles=["Environment Maker"]), {"tables"}))
        self.assertEqual(p.problems(facts(deployer_roles=["System Customizer", "Environment Maker"]), {"tables"}), [])

    def test_app_stage_needs_node_pa_and_a_working_session(self):
        msgs = p.problems(facts(tools={**GOOD["tools"], "pa": False}), {"app"})
        self.assertTrue(any("npm i -g @microsoft/power-apps-cli" in m for m in msgs))
        msgs = p.problems(facts(pa={"ok": False, "error": "not signed in"}), {"app"})
        self.assertTrue(any("pa auth login" in m and "code apps" in m.lower() for m in msgs))

    def test_stages_not_selected_are_not_checked(self):
        f = facts(tools={**GOOD["tools"], "pa": False, "pac": False}, pa={"ok": False, "error": "x"})
        self.assertEqual(p.problems(f, {"tables", "roles"}), [])

    def test_plugin_stage_needs_pac(self):
        msgs = p.problems(facts(tools={**GOOD["tools"], "pac": False}), {"plugin"})
        self.assertTrue(any("pac" in m for m in msgs))


if __name__ == "__main__":
    unittest.main()
