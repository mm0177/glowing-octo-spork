#!/usr/bin/env python3
"""
Download India states GeoJSON from the datameet/maps GitHub repository
and save it to public/data/india-states.geojson.

Usage:
  python3 scripts/download_india_geojson.py

Requirements:
  pip install requests
"""

import json
import pathlib
import sys
import urllib.request

# datameet/maps India state boundaries (simplified, CC-0)
GEOJSON_URL = (
    "https://raw.githubusercontent.com/datameet/maps/master/States/Admin2.geojson"
)

OUTPUT = pathlib.Path("public/data/india-states.geojson")


def normalise(name: str) -> str:
    return " ".join(name.strip().upper().split())


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    print(f"Downloading India states GeoJSON from:\n  {GEOJSON_URL}")
    try:
        with urllib.request.urlopen(GEOJSON_URL, timeout=30) as resp:
            raw = resp.read()
    except Exception as exc:
        print(f"ERROR: download failed — {exc}", file=sys.stderr)
        print(
            "\nManual alternative: download the file yourself and save to:\n"
            f"  {OUTPUT.resolve()}",
            file=sys.stderr,
        )
        sys.exit(1)

    geojson = json.loads(raw)

    # Normalise state name property; datameet uses ST_NM
    fixed_count = 0
    for feature in geojson.get("features", []):
        props = feature.get("properties", {})
        raw_name = props.get("ST_NM", props.get("state_name", props.get("NAME_1", "")))
        normalised = normalise(str(raw_name))
        feature["properties"]["state_name"] = normalised  # add canonical key
        fixed_count += 1

    OUTPUT.write_text(json.dumps(geojson, ensure_ascii=False), encoding="utf-8")
    size_kb = OUTPUT.stat().st_size / 1024
    print(
        f"Saved {fixed_count} state features → {OUTPUT}  ({size_kb:.0f} KB)"
    )

    states = sorted(
        f["properties"].get("state_name", "?")
        for f in geojson.get("features", [])
    )
    print(f"\nStates included ({len(states)}):")
    for s in states:
        print(f"  {s}")


if __name__ == "__main__":
    main()
