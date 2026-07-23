#!/usr/bin/env python3
"""refresh-data.py — pull the latest headline figures from Our World in Data
and write them to compass/live-data.json, so the Timeline view can show
current values with the date they were refreshed.

This is the first step toward genuinely live data: the app itself is static
and offline-first (its CSP blocks cross-origin fetches), so the refresh has to
happen here, in CI, where the network is open. Runs monthly via
.github/workflows/refresh-data.yml.

Deliberately non-destructive: every metric is fetched in its own try/except,
a failure just skips that metric, and the file is only rewritten when a value
actually changed. A wrong slug or a changed OWID schema can never break the
site — worst case the file is left exactly as it was.

The OWID grapher slugs and column matchers below are best-effort. The first
live run will show, in the workflow log, which metrics parsed and which need
a slug or column tweak; adjust CONFIG and re-run. Nothing ships broken in the
meantime because the app falls back to its hand-reviewed anchors.
"""
from __future__ import annotations

import csv
import io
import json
import sys
import urllib.request
from datetime import date, timezone, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "compass" / "live-data.json"

# metric key -> (OWID grapher slug, substring to match the value column,
#                entity to read, whether higher counts are a share in %)
# Column match is case-insensitive and picks the first data column whose header
# contains the substring; if only one value column exists it is used directly.
CONFIG = {
    "poverty":   {"slug": "share-of-population-in-extreme-poverty", "col": "poverty", "entity": "World"},
    "childmort": {"slug": "child-mortality",                        "col": "mortality", "entity": "World"},
    "literacy":  {"slug": "cross-country-literacy-rates",           "col": "literacy", "entity": "World"},
    "lifeexp":   {"slug": "life-expectancy",                        "col": "life expectancy", "entity": "World"},
    "co2":       {"slug": "co2-concentration-long-run",             "col": "co2", "entity": "World"},
}

GRAPHER = "https://ourworldindata.org/grapher/{slug}.csv?csvType=full&useColumnShortNames=false"


def fetch_latest(cfg: dict) -> tuple[int, float] | None:
    url = GRAPHER.format(slug=cfg["slug"])
    req = urllib.request.Request(url, headers={"User-Agent": "impact-compass-refresh/1.0"})
    with urllib.request.urlopen(req, timeout=45) as r:
        text = r.read().decode("utf-8")
    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        return None
    header = [h.strip() for h in rows[0]]
    # locate columns
    try:
        i_entity = next(i for i, h in enumerate(header) if h.lower() in ("entity", "country", "location"))
        i_year = next(i for i, h in enumerate(header) if h.lower() == "year")
    except StopIteration:
        return None
    meta_idx = {i_entity, i_year}
    if "code" in [h.lower() for h in header]:
        meta_idx.add([h.lower() for h in header].index("code"))
    value_cols = [i for i in range(len(header)) if i not in meta_idx]
    if not value_cols:
        return None
    want = cfg["col"].lower()
    i_val = next((i for i in value_cols if want in header[i].lower()), value_cols[0])
    best_year, best_val = None, None
    for row in rows[1:]:
        if len(row) <= max(i_entity, i_year, i_val):
            continue
        if row[i_entity].strip() != cfg["entity"]:
            continue
        try:
            y = int(float(row[i_year]))
            v = float(row[i_val])
        except (ValueError, IndexError):
            continue
        if best_year is None or y > best_year:
            best_year, best_val = y, round(v, 2)
    if best_year is None:
        return None
    return best_year, best_val


def main() -> None:
    data = json.loads(OUT.read_text()) if OUT.exists() else {"metrics": {}}
    metrics = data.get("metrics", {})
    changed = False
    ok, failed = [], []
    for key, cfg in CONFIG.items():
        try:
            res = fetch_latest(cfg)
            if not res:
                failed.append(f"{key} (no World row parsed)")
                continue
            year, val = res
            prev = metrics.get(key, {})
            if prev.get("year") != year or prev.get("value") != val:
                metrics[key] = {"year": year, "value": val}
                changed = True
            ok.append(f"{key}={val} ({year})")
        except Exception as e:  # noqa: BLE001 — never let one metric break the run
            failed.append(f"{key} ({type(e).__name__}: {e})")

    print("refreshed:", ", ".join(ok) or "none")
    if failed:
        print("skipped:", ", ".join(failed))

    if changed and ok:
        data["metrics"] = metrics
        data["source"] = "Our World in Data (auto-refreshed)"
        # UTC date; avoids importing a tz db
        data["updated"] = datetime.now(timezone.utc).date().isoformat()
        OUT.write_text(json.dumps(data, indent=2) + "\n")
        print("wrote", OUT.name)
    else:
        print("no changes")
    # Never fail the job just because a source moved.
    sys.exit(0)


if __name__ == "__main__":
    main()
