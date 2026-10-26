"""Export salesapp_solution (unmanaged) and unpack it into solutions/salesapp_solution for git.

Uses the Web API ExportSolution action (same dataverse CLI sign-in as the other scripts) and
`pac solution unpack`, which works offline, so no separate `pac auth` session is needed.
"""
import base64
import os
import subprocess

import dv
import crm_model as m

ZIP = os.path.join(dv.ROOT, "solutions", "salesapp_solution.zip")
FOLDER = os.path.join(dv.ROOT, "solutions", "salesapp_solution")


def run():
    dv.say("Publishing customizations")
    dv.request("POST", "PublishAllXml")
    dv.say("Exporting solution")
    data = dv.request("POST", "ExportSolution", {"SolutionName": m.SOLUTION, "Managed": False})[2]
    os.makedirs(os.path.dirname(ZIP), exist_ok=True)
    with open(ZIP, "wb") as f:
        f.write(base64.b64decode(data["ExportSolutionFile"]))
    dv.say(f"Unpacking to {os.path.relpath(FOLDER, dv.ROOT)}")
    subprocess.run(["pac", "solution", "unpack", "--zipfile", ZIP, "--folder", FOLDER, "--packagetype", "Unmanaged",
                    "--allowDelete", "true", "--allowWrite", "true", "--clobber", "true"], check=True)


if __name__ == "__main__":
    run()
