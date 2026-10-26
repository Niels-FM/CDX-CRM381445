"""deploy: one entry point that builds the Sales CRM into the environment.

Stages run in order: tables, roles, plugin (plug-in + Custom APIs), app. With no switches every stage runs.

    python scripts/deploy.py                      # everything
    python scripts/deploy.py --tables --roles     # only these stages
    python scripts/deploy.py --skip-app           # everything except the app
    python scripts/deploy.py --app --no-push      # build the app but do not push it
    python scripts/deploy.py --preflight-only     # just run the checks
"""
import argparse
import os
import sys

import dv
import preflight

STAGES = ("tables", "roles", "plugin", "app")
APP_DIR = os.path.join(dv.ROOT, "app")
PLUGIN_DIR = os.path.join(dv.ROOT, "plugin")


def stage_tables():
    import build_tables
    build_tables.run()


def stage_roles():
    import build_roles
    build_roles.run()


def stage_plugin():
    projects = [f for f in os.listdir(PLUGIN_DIR) if f.endswith(".csproj")] if os.path.isdir(PLUGIN_DIR) else []
    if not projects:
        dv.say("plugin: no plugin project yet (added by a later ticket); nothing to deploy")
        return
    code, out = dv.run_cli(["pac", "plugin", "push", "--pluginId", os.environ["NVDB_PLUGIN_ID"]], cwd=PLUGIN_DIR)
    dv.say(out)
    if code:
        raise SystemExit("plugin push failed")
    apis = os.path.join(os.path.dirname(__file__), "build_customapis.py")
    if os.path.exists(apis):
        import build_customapis
        build_customapis.run()


def stage_app(push=True):
    if not os.path.isdir(os.path.join(APP_DIR, "node_modules")):
        _step(["npm", "install"], "npm install")
    _step(["npm", "run", "build"], "npm run build")
    if not push:
        dv.say("app: built (push skipped)")
        return
    env_id = preflight.environment_id()
    if not os.path.exists(os.path.join(APP_DIR, "power.config.json")):
        _step(["pa", "app", "init", "--environment-id", env_id, "--display-name", "Sales CRM", "--app-type", "CodeApp",
               "--build-path", "./dist", "--non-interactive"], "pa app init")
    _step(["pa", "app", "push", "--environment-id", env_id, "--solution-id", dv.solution_id(), "--non-interactive"], "pa app push")


def _step(cmd, label):
    dv.say(f"app: {label}")
    code, out = dv.run_cli(cmd, cwd=APP_DIR)
    if code:
        dv.say(out)
        raise SystemExit(f"{label} failed (exit {code})")


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    for s in STAGES:
        p.add_argument(f"--{s}", action="store_true", help=f"run the {s} stage")
        p.add_argument(f"--skip-{s}", action="store_true", help=f"skip the {s} stage")
    p.add_argument("--no-push", action="store_true", help="app stage: build only, do not call `pa app push`")
    p.add_argument("--no-export", action="store_true", help="do not export/unpack the solution after tables/roles")
    p.add_argument("--preflight-only", action="store_true")
    a = p.parse_args(argv)

    chosen = {s for s in STAGES if getattr(a, s)} or set(STAGES)
    stages = [s for s in STAGES if s in chosen and not getattr(a, f"skip_{s}")]
    needs = set(stages)
    if "app" in needs and a.no_push:
        needs.discard("app")  # a build needs no environment access
    if not preflight.check(needs):
        return 1
    if a.preflight_only:
        return 0
    for s in stages:
        dv.say(f"== {s}")
        stage_app(push=not a.no_push) if s == "app" else globals()[f"stage_{s}"]()
    if {"tables", "roles"} & set(stages) and not a.no_export:
        dv.say("== export")
        import export_solution
        export_solution.run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
