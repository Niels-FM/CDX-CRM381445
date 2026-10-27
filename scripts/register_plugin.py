"""Idempotent registration of the Sales CRM plug-in assembly and its steps (Web API, caller's `dataverse` sign-in).

`pac plugin push` only uploads an assembly that already exists and never registers steps, so this script owns the whole
registration: assembly (upload or update), plug-in types, steps and images, all inside salesapp_solution.
Later Custom API plug-in types (nvdb_QualifyLead, ...) are added to TYPES here, in the same assembly.
"""
import base64
import os
import subprocess

import crm_model
import dv

PROJECT_DIR = os.path.join(dv.ROOT, "plugins", "SalesCrm.Plugins")
ASSEMBLY_NAME = "NVDB.SalesCrm.Plugins"
DLL = os.path.join(PROJECT_DIR, "bin", "Release", "net462", ASSEMBLY_NAME + ".dll")

# One entry per plug-in step: type, message, table, stage (20 = pre-operation), filtering attributes, pre-image attributes.
STEPS = [
    {
        "type": "NVDB.SalesCrm.Plugins.LeadUnDisqualifyGuard",
        "name": "nvdb_lead Update: only a Sales Manager can un-disqualify (pre-operation)",
        "message": "Update",
        "table": "nvdb_lead",
        "stage": 20,
        "filtering": "nvdb_leadstatus",
        "preimage": "nvdb_leadstatus",
    },
]
# Plug-in types without a step (Custom API implementations); the Custom API tickets append to this list.
TYPES = [s["type"] for s in STEPS]


def build():
    code, out = dv.run_cli(["dotnet", "build", "-c", "Release", PROJECT_DIR])
    if code:
        dv.say(out)
        raise SystemExit("plugin build failed")


def public_key_token():
    ps = f"[BitConverter]::ToString([Reflection.AssemblyName]::GetAssemblyName('{DLL}').GetPublicKeyToken()).Replace('-','').ToLower()"
    return subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, text=True).stdout.strip()


def assembly_version():
    ps = f"[Reflection.AssemblyName]::GetAssemblyName('{DLL}').Version.ToString()"
    return subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, text=True).stdout.strip()


def _first(path):
    rows = dv.get(path).get("value", [])
    return rows[0] if rows else None


def upsert_assembly(solution):
    with open(DLL, "rb") as f:
        content = base64.b64encode(f.read()).decode()
    existing = _first(f"pluginassemblies?$select=pluginassemblyid&$filter=name eq '{ASSEMBLY_NAME}'")
    body = {"content": content}
    if existing:
        body.update({"version": assembly_version(), "publickeytoken": public_key_token()})
        dv.request("PATCH", f"pluginassemblies({existing['pluginassemblyid']})", body=body)
        dv.say(f"plugin: updated assembly {ASSEMBLY_NAME}")
        return existing["pluginassemblyid"]
    body.update(
        {
            "name": ASSEMBLY_NAME,
            "isolationmode": 2,
            "sourcetype": 0,
            "culture": "neutral",
            "version": assembly_version(),
            "publickeytoken": public_key_token(),
        }
    )
    _, headers, _ = dv.request("POST", "pluginassemblies", body=body, solution=solution)
    dv.say(f"plugin: registered assembly {ASSEMBLY_NAME}")
    return dv.entity_id(headers)


def ensure_type(assembly_id, type_name, solution):
    found = _first(f"plugintypes?$select=plugintypeid&$filter=typename eq '{type_name}' and _pluginassemblyid_value eq {assembly_id}")
    if found:
        return found["plugintypeid"]
    body = {
        "typename": type_name,
        "name": type_name,
        "friendlyname": type_name.rsplit(".", 1)[-1],
        "pluginassemblyid@odata.bind": f"/pluginassemblies({assembly_id})",
    }
    _, headers, _ = dv.request("POST", "plugintypes", body=body, solution=solution)
    return dv.entity_id(headers)


def ensure_step(step, type_id, solution):
    existing = _first(f"sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid&$filter=name eq '{step['name']}'")
    if existing:
        step_id = existing["sdkmessageprocessingstepid"]
    else:
        message = _first(f"sdkmessages?$select=sdkmessageid&$filter=name eq '{step['message']}'")
        flt = _first(
            f"sdkmessagefilters?$select=sdkmessagefilterid&$filter=primaryobjecttypecode eq '{step['table']}' "
            f"and _sdkmessageid_value eq {message['sdkmessageid']}"
        )
        body = {
            "name": step["name"],
            "stage": step["stage"],
            "mode": 0,
            "rank": 1,
            "supporteddeployment": 0,
            "filteringattributes": step["filtering"],
            "sdkmessageid@odata.bind": f"/sdkmessages({message['sdkmessageid']})",
            "sdkmessagefilterid@odata.bind": f"/sdkmessagefilters({flt['sdkmessagefilterid']})",
            "plugintypeid@odata.bind": f"/plugintypes({type_id})",
        }
        _, headers, _ = dv.request("POST", "sdkmessageprocessingsteps", body=body, solution=solution)
        step_id = dv.entity_id(headers)
        dv.say(f"plugin: registered step {step['name']}")
    if step.get("preimage") and not _first(f"sdkmessageprocessingstepimages?$select=sdkmessageprocessingstepimageid&$filter=_sdkmessageprocessingstepid_value eq {step_id}"):
        dv.request(
            "POST",
            "sdkmessageprocessingstepimages",
            body={
                "name": "PreImage",
                "entityalias": "PreImage",
                "imagetype": 0,
                "messagepropertyname": "Target",
                "attributes": step["preimage"],
                "sdkmessageprocessingstepid@odata.bind": f"/sdkmessageprocessingsteps({step_id})",
            },
        )
        dv.say("plugin: registered pre-image")


def run(skip_build=False):
    if not skip_build:
        build()
    solution = crm_model.SOLUTION
    assembly_id = upsert_assembly(solution)
    type_ids = {t: ensure_type(assembly_id, t, solution) for t in TYPES}
    for step in STEPS:
        ensure_step(step, type_ids[step["type"]], solution)


if __name__ == "__main__":
    run()
