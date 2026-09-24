#!/usr/bin/env python3
"""Check apps.json against the files in the repo.

Usage: python3 .github/scripts/check_apps.py

Prints OK and exits 0 when the registry is sound; otherwise lists every problem
(as GitHub annotations when run in Actions) and exits 1. Standard library only.
"""
import json
import os
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REGISTRY = ROOT / "apps.json"
APPS_DIR = ROOT / "apps"

REQUIRED = {"id", "name", "tagline", "path", "icon", "category", "status", "added"}
OPTIONAL = {"entry", "action", "color", "tags", "platforms", "updated", "links", "aliases"}
STATUSES = {"stable", "beta", "prototype", "archived"}
PLATFORMS = {"phone", "tablet", "desktop", "tv"}
ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
COLOR_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")
IMAGE_RE = re.compile(r"\.(svg|png|jpe?g|webp|gif|avif)$", re.I)

errors = []


def error(msg):
    errors.append(msg)


def site_file(href):
    """Resolve a site-root-relative href to the file Pages would serve, or None if it would 404."""
    clean = re.split(r"[?#]", href, maxsplit=1)[0]
    p = ROOT / clean
    if clean == "" or clean.endswith("/") or p.is_dir():
        p = p / "index.html"
    return p if p.is_file() else None


def is_relative(href):
    return not re.match(r"^[a-z][a-z0-9+.-]*:|^/", href, re.I) and ".." not in href.split("/")


def parse_day(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:  # 2026-02-30 and friends
        return None


def check_entry(i, a, seen_ids, seen_aliases):
    label = f"apps[{i}]" + (f" ({a['id']})" if isinstance(a, dict) and isinstance(a.get("id"), str) else "")
    if not isinstance(a, dict):
        return error(f"{label}: must be an object")

    missing = sorted(k for k in REQUIRED if not (isinstance(a.get(k), str) and a[k].strip()))
    if missing:
        error(f"{label}: missing or empty {', '.join(missing)}")
    unknown = sorted(set(a) - REQUIRED - OPTIONAL)
    if unknown:
        error(f"{label}: unknown field(s) {', '.join(unknown)} (see the table in AGENTS.md)")

    app_id = a.get("id") if isinstance(a.get("id"), str) else ""
    if app_id:
        if not ID_RE.match(app_id):
            error(f"{label}: id must be lowercase words joined by hyphens, like tide-clock")
        if app_id in seen_ids:
            error(f"{label}: id is already used by another entry")
        seen_ids.add(app_id)

    path = a.get("path") if isinstance(a.get("path"), str) else ""
    if path:
        if not is_relative(path) or not path.endswith("/"):
            error(f"{label}: path must be a folder relative to the site root, ending in '/': got {path!r}")
        elif not (ROOT / path).is_dir():
            error(f"{label}: path {path} does not exist")
        else:
            if path.startswith("apps/") and path != f"apps/{app_id}/":
                error(f"{label}: an app under apps/ must live in apps/{app_id}/ (its id), not {path}")
            entry = a.get("entry") or "index.html"
            if not isinstance(entry, str) or not is_relative(entry) or site_file(path + entry) is None:
                error(f"{label}: entry file {path}{entry} does not exist")

    if a.get("status") and a["status"] not in STATUSES:
        error(f"{label}: status must be one of {', '.join(sorted(STATUSES))}")

    icon = a.get("icon")
    if isinstance(icon, str) and IMAGE_RE.search(icon):
        if not is_relative(icon) or not (ROOT / icon).is_file():
            error(f"{label}: icon image {icon} does not exist (paths are relative to the site root)")
    elif isinstance(icon, str) and len(icon) > 16:
        error(f"{label}: icon should be an emoji or an image path")

    if "color" in a and not (isinstance(a["color"], str) and COLOR_RE.match(a["color"])):
        error(f"{label}: color must be a hex colour like #D7262E")

    for key in ("tags", "platforms", "aliases"):
        if key in a and not (isinstance(a[key], list) and all(isinstance(x, str) and x for x in a[key])):
            error(f"{label}: {key} must be a list of strings")
    if isinstance(a.get("platforms"), list):
        bad = sorted(set(a["platforms"]) - PLATFORMS)
        if bad:
            error(f"{label}: unknown platform(s) {', '.join(bad)}; use {', '.join(sorted(PLATFORMS))}")

    added = parse_day(a.get("added"))
    if a.get("added") and not added:
        error(f"{label}: added must be a date, YYYY-MM-DD")
    if "updated" in a:
        updated = parse_day(a["updated"])
        if not updated:
            error(f"{label}: updated must be a date, YYYY-MM-DD")
        elif added and updated < added:
            error(f"{label}: updated ({updated}) is before added ({added})")

    if "links" in a:
        if not isinstance(a["links"], list):
            error(f"{label}: links must be a list of {{label, href}} objects")
        else:
            for j, link in enumerate(a["links"]):
                if not (isinstance(link, dict) and isinstance(link.get("label"), str) and isinstance(link.get("href"), str)):
                    error(f"{label}: links[{j}] needs a label and an href")
                elif is_relative(link["href"]) and site_file(link["href"]) is None:
                    error(f"{label}: links[{j}] points at {link['href']}, which does not exist")

    if isinstance(a.get("aliases"), list):
        for alias in a["aliases"]:
            if not isinstance(alias, str):
                continue
            if not is_relative(alias):
                error(f"{label}: alias {alias!r} must be relative to the site root, without a leading '/'")
            elif site_file(alias) is not None:
                error(f"{label}: alias {alias} is a real page, so the 404 redirect would never run")
            key = alias.rstrip("/").lower()
            if key in seen_aliases:
                error(f"{label}: alias {alias} is also claimed by {seen_aliases[key]}")
            seen_aliases[key] = app_id or label


def main():
    try:
        data = json.loads(REGISTRY.read_text(encoding="utf-8"))
    except FileNotFoundError:
        error("apps.json is missing")
        return report(0)
    except json.JSONDecodeError as e:
        error(f"apps.json is not valid JSON: line {e.lineno}, column {e.colno}: {e.msg}")
        return report(0)

    if not isinstance(data, dict) or not isinstance(data.get("apps"), list):
        error('apps.json must be an object with an "apps" list')
        return report(0)
    hub = data.get("hub")
    if not (isinstance(hub, dict) and isinstance(hub.get("repo"), str) and "/" in hub["repo"]):
        error('apps.json needs "hub": {"repo": "owner/name"}; the hub builds its GitHub links from it')

    seen_ids, seen_aliases = set(), {}
    for i, a in enumerate(data["apps"]):
        check_entry(i, a, seen_ids, seen_aliases)

    # Every folder in apps/ is an app and must be on the hub. _template and friends are exempt.
    registered = {a.get("path") for a in data["apps"] if isinstance(a, dict)}
    if APPS_DIR.is_dir():
        for d in sorted(p for p in APPS_DIR.iterdir() if p.is_dir()):
            if d.name.startswith(("_", ".")):
                continue
            if f"apps/{d.name}/" not in registered:
                error(f"apps/{d.name}/ is not in apps.json; add an entry so it shows on the hub")
            if not (d / "index.html").is_file():
                error(f"apps/{d.name}/ has no index.html")

    return report(len(data["apps"]))


def report(count):
    if errors:
        gha = os.environ.get("GITHUB_ACTIONS") == "true"
        for msg in errors:
            print(f"::error file=apps.json::{msg}" if gha else f"error: {msg}")
        print(f"\n{len(errors)} problem(s) in the app registry.")
        return 1
    print(f"OK: {count} app(s) registered, all paths resolve.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
