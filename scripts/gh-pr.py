#!/usr/bin/env python3
"""Token-frugal gh/CI summarizer for this repo.

Single helper for every `gh pr` / CI summarization case, via subcommands.
Each subcommand fetches the JSON it needs (or reads it from stdin with `-`),
prints a short grouped summary, and exits non-zero when something is wrong —
so callers never pipe raw `gh` output through jq/grep into their context.

Usage:
    scripts/gh-pr.py checks  [PR]     # CI status rollup (exit 1=failed, 2=pending)
    scripts/gh-pr.py reviews [PR]     # human/bot review decision (exit 1=changes, 2=pending)

PR may be a number; omit it to use the PR for the current branch. Pass `-` as
PR to read the corresponding `gh pr view --json ...` payload from stdin instead.
"""
import json
import subprocess
import sys

PASS = {"SUCCESS", "NEUTRAL", "SKIPPED"}
FAIL = {"FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"}
# everything else (QUEUED, IN_PROGRESS, PENDING, EXPECTED, WAITING, REQUESTED) => pending


def gh_json(pr, fields):
    """Run `gh pr view [PR] --json <fields>` and return parsed JSON."""
    cmd = ["gh", "pr", "view"]
    if pr and pr != "-":
        cmd.append(str(pr))
    cmd += ["--json", fields]
    out = subprocess.run(cmd, capture_output=True, text=True)
    if out.returncode != 0:
        sys.stderr.write(out.stderr.strip() + "\n")
        sys.exit(3)
    return json.loads(out.stdout)


def load(pr, fields):
    if pr == "-":
        return json.load(sys.stdin)
    return gh_json(pr, fields)


def norm_check(c):
    """Normalize a statusCheckRollup entry -> (name, bucket)."""
    name = c.get("name") or c.get("context") or "?"
    if c.get("status") and c.get("status") != "COMPLETED":
        return name, "pending"
    state = (c.get("conclusion") or c.get("state") or "").upper()
    if state in PASS:
        return name, "pass"
    if state in FAIL:
        return name, "fail"
    if not state:  # StatusContext PENDING has empty conclusion but state=PENDING
        return name, "pending"
    return name, "pending"


def cmd_checks(pr):
    data = load(pr, "statusCheckRollup,state")
    rollup = data.get("statusCheckRollup") or []
    buckets = {"pass": [], "fail": [], "pending": []}
    for c in rollup:
        name, b = norm_check(c)
        buckets[b].append(name)
    total = len(rollup)
    print(f"PR state: {data.get('state', '?')}  |  checks: {total}  "
          f"(pass {len(buckets['pass'])} / fail {len(buckets['fail'])} / pending {len(buckets['pending'])})")
    if buckets["fail"]:
        print("FAILED:  " + ", ".join(sorted(buckets["fail"])))
    if buckets["pending"]:
        print("PENDING: " + ", ".join(sorted(buckets["pending"])))
    if buckets["fail"]:
        sys.exit(1)
    if buckets["pending"]:
        sys.exit(2)
    print("All checks green." if total else "No CI checks configured.")
    sys.exit(0)


def cmd_reviews(pr):
    data = load(pr, "reviews,reviewDecision")
    decision = data.get("reviewDecision") or "PENDING"
    latest = {}  # author -> (state, isBot)
    for r in data.get("reviews") or []:
        author = (r.get("author") or {})
        login = author.get("login", "?")
        is_bot = author.get("__typename") == "Bot" or login.endswith("[bot]") or "bot" in login.lower()
        latest[login] = (r.get("state", "?"), is_bot)
    humans = {k: v[0] for k, v in latest.items() if not v[1]}
    bots = {k: v[0] for k, v in latest.items() if v[1]}
    print(f"reviewDecision: {decision}")
    if humans:
        print("humans:  " + ", ".join(f"{k}={s}" for k, s in sorted(humans.items())))
    else:
        print("humans:  (none yet)")
    if bots:
        print("bots:    " + ", ".join(f"{k}={s}" for k, s in sorted(bots.items())))
    if decision == "APPROVED":
        sys.exit(0)
    if decision == "CHANGES_REQUESTED" or "CHANGES_REQUESTED" in humans.values():
        sys.exit(1)
    sys.exit(2)


def main():
    if len(sys.argv) < 2:
        sys.stderr.write(__doc__)
        sys.exit(64)
    sub = sys.argv[1]
    pr = sys.argv[2] if len(sys.argv) > 2 else None
    if sub == "checks":
        cmd_checks(pr)
    elif sub == "reviews":
        cmd_reviews(pr)
    else:
        sys.stderr.write(f"unknown subcommand: {sub}\n")
        sys.stderr.write(__doc__)
        sys.exit(64)


if __name__ == "__main__":
    main()
