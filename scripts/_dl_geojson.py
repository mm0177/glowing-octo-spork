import urllib.request, json, pathlib, sys

# Try multiple sources in order
SOURCES = [
    "https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson",
    "https://raw.githubusercontent.com/Subhash9325/GeoJson-Data-of-Indian-States/master/Indian_States",
    "https://raw.githubusercontent.com/datameet/maps/gh-pages/States/Admin2.geojson",
    "https://raw.githubusercontent.com/datameet/maps/master/States/Admin2.geojson",
]

data = None
for url in SOURCES:
    print(f"Trying: {url}")
    try:
        data = urllib.request.urlopen(url, timeout=30).read()
        print(f"  OK ({len(data)//1024} KB)")
        break
    except Exception as e:
        print(f"  Failed: {e}")

if data is None:
    print("All sources failed. Check internet connection.", file=sys.stderr)
    sys.exit(1)

pathlib.Path("public/data").mkdir(parents=True, exist_ok=True)
pathlib.Path("public/data/india-states.geojson").write_bytes(data)
g = json.loads(data)
print(f"Done. {len(g['features'])} state features -> public/data/india-states.geojson")

