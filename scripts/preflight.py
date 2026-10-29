"""Preflight for `deploy`: gather facts about the machine and environment, then turn them into clear problems."""
import shutil

import dv

REQUIRED_ENV = ("DATAVERSE_URL", "SOLUTION_NAME", "PUBLISHER_PREFIX")
FIX_LOGIN = "run `dataverse auth create` (or `pac auth create`) and complete the sign-in, then retry"


def problems(f, stages):
    """Pure: turn gathered facts into a list of actionable messages for the selected stages."""
    out = []
    tools = f["tools"]
    missing_env = [k for k in REQUIRED_ENV if not f["env"].get(k)]
    if missing_env:
        out.append(f"Missing {', '.join(missing_env)} in .env. Copy the values from the README setup section.")
    if not tools["dataverse"]:
        out.append("The `dataverse` CLI is not on PATH. Install it, then run `dataverse auth create` for this environment.")
    elif not f["dataverse"]["ok"]:
        out.append(f"Cannot reach Dataverse at {f['env'].get('DATAVERSE_URL')}: {f['dataverse']['error']}. {FIX_LOGIN}.")
    elif f["solution"] is not None:
        sol = f["solution"]
        name = f["env"].get("SOLUTION_NAME")
        if not sol["exists"]:
            out.append(f"Solution {name} not found in the environment. Create it (unmanaged, publisher prefix {f['env'].get('PUBLISHER_PREFIX')}) first.")
        else:
            if sol["managed"]:
                out.append(f"Solution {name} is managed; deploy needs the unmanaged solution.")
            want = f["env"].get("PUBLISHER_PREFIX")
            if want and sol["prefix"] != want:
                out.append(f"Solution {name} uses publisher prefix '{sol['prefix']}' but .env expects '{want}'.")
        roles = set(f["deployer_roles"])
        if "System Administrator" not in roles and not {"System Customizer", "Environment Maker"} <= roles:
            out.append("The deploying user needs System Administrator, or both System Customizer and Environment Maker. "
                       f"Current roles: {', '.join(sorted(roles)) or 'none'}.")
    if "plugin" in stages and not tools["pac"]:
        out.append("The `pac` CLI is required for the plug-in stage. Install the Power Platform CLI and run `pac auth create`.")
    if "app" in stages:
        if not tools["node"]:
            out.append("Node.js is required for the app stage. Install the Node.js LTS release.")
        if not tools["pa"]:
            out.append("The Power Apps CLI is missing. Run `npm i -g @microsoft/power-apps-cli`.")
        elif not f["pa"]["ok"]:
            out.append(f"The `pa` CLI cannot reach the environment ({f['pa']['error']}). Run `pa auth login --account <you>` for this tenant; "
                       "also confirm code apps are enabled (admin center > Environments > Settings > Product > Features > Power Apps code apps) "
                       "and that users hold a Power Apps Premium or pay-as-you-go licence.")
    return out


def _run(cmd, timeout=120):
    return dv.run_cli(cmd, timeout=timeout)


def gather(stages):
    env = dv.load_env()
    tools = {t: bool(shutil.which(t)) for t in ("dataverse", "pac", "node", "pa")}
    f = {"tools": tools, "env": env, "dataverse": {"ok": False, "error": None}, "solution": None, "deployer_roles": [], "pa": {"ok": True, "error": None}}
    if tools["dataverse"] and env.get("DATAVERSE_URL"):
        try:
            who = dv.get("WhoAmI")
            f["dataverse"]["ok"] = True
            sol = dv.get(f"solutions?$filter=uniquename eq '{env.get('SOLUTION_NAME', '')}'&$select=ismanaged&$expand=publisherid($select=customizationprefix)")["value"]
            f["solution"] = {"exists": bool(sol)}
            if sol:
                f["solution"].update(managed=sol[0]["ismanaged"], prefix=sol[0]["publisherid"]["customizationprefix"])
            roles = dv.get(f"systemusers({who['UserId']})/systemuserroles_association?$select=name")["value"]
            f["deployer_roles"] = [r["name"] for r in roles]
        except Exception as e:  # noqa: BLE001 - surfaced verbatim in the message
            f["dataverse"]["error"] = str(e)[:300]
    if "app" in stages and tools["pa"] and f["dataverse"]["ok"]:
        code, out = _run(["pa", "app", "list", "--environment-id", environment_id(), "--non-interactive", "--json"])
        f["pa"] = {"ok": code == 0, "error": " ".join(out.split())[:200] if out else f"exit code {code}"}
    return f


def environment_id():
    d = dv.get("RetrieveCurrentOrganization(AccessType=Microsoft.Dynamics.CRM.EndpointAccessType'Default')")
    return d["Detail"]["EnvironmentId"]


def check(stages):
    """Return True when every selected stage is ready; print every problem found."""
    found = problems(gather(stages), stages)
    for msg in found:
        print(f"PREFLIGHT FAILED: {msg}")
    if not found:
        print("Preflight OK")
    return not found


if __name__ == "__main__":
    raise SystemExit(0 if check({"tables", "roles", "plugin", "app"}) else 1)
