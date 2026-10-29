"""Thin Dataverse Web API client that reuses the `dataverse` CLI sign-in (no secrets, no extra login)."""
import json
import os
import re
import shutil
import subprocess
import sys
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "/api/data/v9.2/"
SCRATCH = os.path.join(ROOT, ".dataverse")  # gitignored


class DataverseError(RuntimeError):
    def __init__(self, status, message):
        super().__init__(f"HTTP {status}: {message}")
        self.status = status


def load_env(path=None):
    path = path or os.path.join(ROOT, ".env")
    env = {}
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"')
    return {**env, **{k: v for k, v in os.environ.items() if k in env or k in ("DATAVERSE_URL", "SOLUTION_NAME")}}


def cli_path():
    return shutil.which("dataverse.cmd") or shutil.which("dataverse")


def run_cli(args, timeout=300, cwd=None):
    """Run a CLI that may be a .cmd shim (dataverse, pa, npm); arguments are quoted so cmd.exe keeps & intact."""
    exe = shutil.which(args[0]) or args[0]
    r = subprocess.run(" ".join(f'"{c}"' for c in [exe, *args[1:]]), capture_output=True, text=True, encoding="utf-8", timeout=timeout, cwd=cwd)
    return r.returncode, (r.stdout + r.stderr).strip()


def request(method, path, body=None, headers=None, solution=None, url=None):
    """Return (status, response_headers, parsed_json_or_None). Raises DataverseError on >= 400."""
    exe = cli_path()
    if not exe:
        raise RuntimeError("The `dataverse` CLI is not on PATH (install it and run `dataverse auth create`).")
    cmd = [exe, "api", "request", "--target", "dataverse", "--method", method, "--path", path if path.startswith("/") else API + path, "-i"]
    if url:
        cmd += ["--environment", url]
    hdrs = dict(headers or {})
    if solution:
        hdrs["MSCRM.SolutionUniqueName"] = solution
    for k, v in hdrs.items():
        cmd += ["--header", f"{k}:{v}"]
    body_file = None
    if body is not None:
        os.makedirs(SCRATCH, exist_ok=True)
        body_file = os.path.join(SCRATCH, f"body-{uuid.uuid4().hex}.json")
        with open(body_file, "w", encoding="utf-8") as f:
            json.dump(body, f)
        cmd += ["--body-file", body_file]
    try:
        out = subprocess.run(" ".join(f'"{c}"' for c in cmd), capture_output=True, text=True, encoding="utf-8", timeout=300).stdout
    finally:
        if body_file and os.path.exists(body_file):
            os.remove(body_file)
    return _parse(out)


def _parse(out):
    m = re.match(r"HTTP/[\d.]+ (\d+)", out)
    if not m:
        raise DataverseError(0, out.strip()[:500] or "no response from dataverse CLI")
    status = int(m.group(1))
    head, _, text = out.partition("\r\n\r\n") if "\r\n\r\n" in out else out.partition("\n\n")
    headers = {}
    for line in head.splitlines()[1:]:
        if ":" in line:
            k, v = line.split(":", 1)
            headers[k.strip().lower()] = v.strip()
    data = None
    text = text.strip()
    if text:
        try:
            data = json.loads(text)
        except ValueError:
            data = text
    if status >= 400:
        msg = data.get("error", {}).get("message") if isinstance(data, dict) else data
        raise DataverseError(status, msg)
    return status, headers, data


def get(path, **kw):
    return request("GET", path, **kw)[2]


def exists(path):
    try:
        request("GET", path)
        return True
    except DataverseError as e:
        if e.status == 404:
            return False
        raise


def entity_id(headers):
    m = re.search(r"\(([0-9a-fA-F-]{36})\)", headers.get("odata-entityid", ""))
    return m.group(1) if m else None


def say(msg):
    print(msg, flush=True)


def solution_id(name=None):
    name = name or load_env().get("SOLUTION_NAME", "salesapp_solution")
    rows = get(f"solutions?$filter=uniquename eq '{name}'&$select=solutionid")["value"]
    if not rows:
        raise RuntimeError(f"Solution {name} not found")
    return rows[0]["solutionid"]


if __name__ == "__main__":
    sys.exit(print(json.dumps(get(sys.argv[1]), indent=2)) or 0)
