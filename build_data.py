#!/usr/bin/env python3
"""Build host/data/data.json for the Chromecast dashboard.

Usage: build_data.py <previous.json> <output.json>

Every source is fetched independently. If one fails, its block is carried
over from previous.json (with the old fetched_at, so the receiver can show
staleness) and the run still succeeds.
"""
import html
import json
import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta

UA = "mitchyc24-tv-dashboard/1.0 (+https://mitchyc24.github.io/host/)"
NOW = datetime.now(timezone.utc)


def get(url, timeout=25, as_json=True):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    if as_json:
        return json.loads(raw.decode("utf-8", "replace"))
    return raw.decode("utf-8", "replace")


def stamp(payload):
    return {"fetched_at": NOW.isoformat(timespec="seconds"), **payload}


# ---------------------------------------------------------------- geocoding
# Compact centroid table for RSS headlines and GDELT sourcecountry fallback.
# name -> (lat, lon). Cities first so they win over their country.
PLACES = {
    "Washington": (38.9, -77.0), "New York": (40.7, -74.0), "Los Angeles": (34.1, -118.2),
    "Ottawa": (45.4, -75.7), "Toronto": (43.7, -79.4), "Montreal": (45.5, -73.6),
    "Vancouver": (49.3, -123.1), "London": (51.5, -0.1), "Paris": (48.9, 2.3),
    "Berlin": (52.5, 13.4), "Brussels": (50.8, 4.4), "Moscow": (55.8, 37.6),
    "Kyiv": (50.4, 30.5), "Beijing": (39.9, 116.4), "Shanghai": (31.2, 121.5),
    "Hong Kong": (22.3, 114.2), "Taipei": (25.0, 121.6), "Tokyo": (35.7, 139.7),
    "Seoul": (37.6, 127.0), "Delhi": (28.6, 77.2), "Mumbai": (19.1, 72.9),
    "Tehran": (35.7, 51.4), "Jerusalem": (31.8, 35.2), "Tel Aviv": (32.1, 34.8),
    "Gaza": (31.5, 34.5), "Beirut": (33.9, 35.5), "Damascus": (33.5, 36.3),
    "Baghdad": (33.3, 44.4), "Riyadh": (24.7, 46.7), "Dubai": (25.2, 55.3),
    "Cairo": (30.0, 31.2), "Nairobi": (-1.3, 36.8), "Lagos": (6.5, 3.4),
    "Johannesburg": (-26.2, 28.0), "Sydney": (-33.9, 151.2), "Melbourne": (-37.8, 145.0),
    "Auckland": (-36.8, 174.8), "Mexico City": (19.4, -99.1), "São Paulo": (-23.5, -46.6),
    "Sao Paulo": (-23.5, -46.6), "Buenos Aires": (-34.6, -58.4), "Brasilia": (-15.8, -47.9),
    "Caracas": (10.5, -66.9), "Havana": (23.1, -82.4), "Islamabad": (33.7, 73.0),
    "Kabul": (34.5, 69.2), "Bangkok": (13.8, 100.5), "Jakarta": (-6.2, 106.8),
    "Manila": (14.6, 121.0), "Singapore": (1.3, 103.8), "Hanoi": (21.0, 105.8),
    "Ankara": (39.9, 32.9), "Istanbul": (41.0, 29.0), "Athens": (38.0, 23.7),
    "Rome": (41.9, 12.5), "Madrid": (40.4, -3.7), "Lisbon": (38.7, -9.1),
    "Warsaw": (52.2, 21.0), "Stockholm": (59.3, 18.1), "Oslo": (59.9, 10.8),
    "Helsinki": (60.2, 24.9), "Copenhagen": (55.7, 12.6), "Dublin": (53.3, -6.3),
    "Geneva": (46.2, 6.1), "Vienna": (48.2, 16.4), "Khartoum": (15.6, 32.5),
    "Addis Ababa": (9.0, 38.7), "Kinshasa": (-4.3, 15.3), "Pyongyang": (39.0, 125.8),
    "Silicon Valley": (37.4, -122.1), "Wall Street": (40.7, -74.0), "Pentagon": (38.9, -77.1),
    "White House": (38.9, -77.0), "Kremlin": (55.8, 37.6), "Downing Street": (51.5, -0.1),
    "Antarctica": (-80.0, 0.0), "Arctic": (85.0, -40.0), "Greenland": (72.0, -40.0),
    # countries / regions
    "United States": (39.8, -98.6), "U.S.": (39.8, -98.6), "US ": (39.8, -98.6), "America": (39.8, -98.6),
    "Canada": (56.1, -106.3), "Canadian": (56.1, -106.3), "Quebec": (52.9, -73.5), "Ontario": (51.3, -85.3),
    "Mexico": (23.6, -102.6), "Brazil": (-14.2, -51.9), "Argentina": (-38.4, -63.6), "Chile": (-35.7, -71.5),
    "Colombia": (4.6, -74.3), "Venezuela": (6.4, -66.6), "Peru": (-9.2, -75.0), "Cuba": (21.5, -77.8),
    "Haiti": (19.0, -72.3), "UK": (54.0, -2.0), "Britain": (54.0, -2.0), "British": (54.0, -2.0),
    "England": (52.4, -1.5), "Scotland": (56.5, -4.2), "Wales": (52.1, -3.8), "Ireland": (53.4, -8.2),
    "France": (46.2, 2.2), "French": (46.2, 2.2), "Germany": (51.2, 10.5), "German": (51.2, 10.5),
    "Spain": (40.5, -3.7), "Portugal": (39.4, -8.2), "Italy": (41.9, 12.6), "Italian": (41.9, 12.6),
    "Netherlands": (52.1, 5.3), "Dutch": (52.1, 5.3), "Belgium": (50.5, 4.5), "Switzerland": (46.8, 8.2),
    "Austria": (47.5, 14.6), "Poland": (51.9, 19.1), "Polish": (51.9, 19.1), "Ukraine": (48.4, 31.2),
    "Ukrainian": (48.4, 31.2), "Russia": (61.5, 105.3), "Russian": (61.5, 105.3), "Belarus": (53.7, 28.0),
    "Sweden": (60.1, 18.6), "Norway": (60.5, 8.5), "Finland": (61.9, 25.7), "Denmark": (56.3, 9.5),
    "Iceland": (65.0, -19.0), "Baltic": (57.0, 24.0), "Balkans": (43.0, 20.0), "Serbia": (44.0, 21.0),
    "Greece": (39.1, 21.8), "Turkey": (38.9, 35.2), "Turkish": (38.9, 35.2), "Cyprus": (35.1, 33.4),
    "Israel": (31.0, 34.9), "Israeli": (31.0, 34.9), "Palestinian": (31.9, 35.2), "West Bank": (32.0, 35.3),
    "Lebanon": (33.9, 35.9), "Syria": (34.8, 39.0), "Syrian": (34.8, 39.0), "Iraq": (33.2, 43.7),
    "Iran": (32.4, 53.7), "Iranian": (32.4, 53.7), "Saudi": (23.9, 45.1), "Yemen": (15.6, 48.5),
    "Houthi": (15.6, 48.5), "Red Sea": (20.0, 38.5), "Qatar": (25.4, 51.2), "UAE": (23.4, 53.8),
    "Emirates": (23.4, 53.8), "Jordan": (30.6, 36.2), "Egypt": (26.8, 30.8), "Egyptian": (26.8, 30.8),
    "Libya": (26.3, 17.2), "Tunisia": (33.9, 9.5), "Algeria": (28.0, 1.7), "Morocco": (31.8, -7.1),
    "Sudan": (12.9, 30.2), "Sudanese": (12.9, 30.2), "Ethiopia": (9.1, 40.5), "Somalia": (5.2, 46.2),
    "Kenya": (-0.0, 37.9), "Nigeria": (9.1, 8.7), "Nigerian": (9.1, 8.7), "Ghana": (7.9, -1.0),
    "Congo": (-4.0, 21.8), "Rwanda": (-1.9, 29.9), "Uganda": (1.4, 32.3), "Tanzania": (-6.4, 34.9),
    "Mali": (17.6, -4.0), "Niger": (17.6, 8.1), "South Africa": (-30.6, 22.9), "Zimbabwe": (-19.0, 29.2),
    "Mozambique": (-18.7, 35.5), "Madagascar": (-18.8, 46.9), "Afghanistan": (33.9, 67.7),
    "Afghan": (33.9, 67.7), "Pakistan": (30.4, 69.3), "Pakistani": (30.4, 69.3), "India": (20.6, 79.0),
    "Indian": (20.6, 79.0), "Kashmir": (34.0, 76.0), "Bangladesh": (23.7, 90.4), "Sri Lanka": (7.9, 80.8),
    "Nepal": (28.4, 84.1), "Myanmar": (21.9, 95.9), "Thailand": (15.9, 100.9), "Thai": (15.9, 100.9),
    "Vietnam": (14.1, 108.3), "Cambodia": (12.6, 105.0), "Malaysia": (4.2, 102.0), "Indonesia": (-0.8, 113.9),
    "Philippines": (12.9, 121.8), "Filipino": (12.9, 121.8), "China": (35.9, 104.2), "Chinese": (35.9, 104.2),
    "Taiwan": (23.7, 121.0), "Taiwanese": (23.7, 121.0), "Japan": (36.2, 138.3), "Japanese": (36.2, 138.3),
    "South Korea": (35.9, 127.8), "North Korea": (40.3, 127.5), "Korean": (37.0, 127.5), "Mongolia": (46.9, 103.8),
    "Kazakhstan": (48.0, 66.9), "Australia": (-25.3, 133.8), "Australian": (-25.3, 133.8),
    "New Zealand": (-40.9, 174.9), "Pacific": (0.0, -160.0), "Papua": (-6.3, 143.9), "Fiji": (-17.7, 178.1),
    "Europe": (50.0, 10.0), "European": (50.0, 10.0), "EU ": (50.8, 4.4), "NATO": (50.8, 4.4),
    "Africa": (2.0, 20.0), "African": (2.0, 20.0), "Asia": (34.0, 100.0), "Middle East": (29.0, 45.0),
    "Latin America": (-10.0, -60.0), "Caribbean": (18.0, -70.0), "Alaska": (64.0, -150.0),
    "California": (36.8, -119.4), "Texas": (31.0, -100.0), "Florida": (27.8, -81.7), "Hawaii": (20.5, -157.5),
}
PLACE_KEYS = sorted(PLACES.keys(), key=len, reverse=True)


def geocode(text):
    for k in PLACE_KEYS:
        if re.search(r"(?<![A-Za-z])" + re.escape(k) + r"(?![a-z])", text):
            return PLACES[k]
    return None


# ---------------------------------------------------------------- sources
def src_news():
    items = []

    # 1) GDELT GEO API: recent English-language coverage, points with headline html
    try:
        url = ("https://api.gdeltproject.org/api/v2/geo/geo?query=sourcelang:english"
               "&mode=PointData&format=GeoJSON&timespan=2h&maxpoints=60")
        gj = get(url)
        for f in gj.get("features", []):
            p = f.get("properties", {})
            g = f.get("geometry", {}).get("coordinates", [])
            m = re.search(r'<a href="([^"]+)"[^>]*>([^<]{15,})</a>', p.get("html", ""))
            if len(g) == 2 and m:
                items.append({
                    "title": html.unescape(m.group(2)).strip(),
                    "url": m.group(1),
                    "source": re.sub(r"^https?://(www\.)?([^/]+).*$", r"\2", m.group(1)),
                    "place": p.get("name", ""),
                    "lat": round(float(g[1]), 2), "lon": round(float(g[0]), 2),
                    "kind": "gdelt",
                })
    except Exception as e:  # noqa: BLE001
        print("gdelt geo failed:", e)

    # 2) Curated RSS feeds, geocoded by keyword
    feeds = [
        ("BBC World", "https://feeds.bbci.co.uk/news/world/rss.xml"),
        ("CBC World", "https://www.cbc.ca/webfeed/rss/rss-world"),
        ("CBC Canada", "https://www.cbc.ca/webfeed/rss/rss-canada"),
        ("Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml"),
    ]
    for name, url in feeds:
        try:
            root = ET.fromstring(get(url, as_json=False))
            for it in root.iter("item"):
                title = (it.findtext("title") or "").strip()
                link = (it.findtext("link") or "").strip()
                desc = re.sub("<[^>]+>", "", it.findtext("description") or "")
                loc = geocode(title) or geocode(desc)
                if title and loc:
                    items.append({"title": title, "url": link, "source": name,
                                  "place": "", "lat": loc[0], "lon": loc[1], "kind": "rss"})
        except Exception as e:  # noqa: BLE001
            print("rss failed:", name, e)

    # dedupe on title prefix, curated feeds first
    seen, out = set(), []
    for it in sorted(items, key=lambda x: 0 if x["kind"] == "rss" else 1):
        key = re.sub(r"\W+", "", it["title"].lower())[:40]
        if key in seen:
            continue
        seen.add(key)
        out.append(it)
    if not out:
        raise RuntimeError("no news items")
    return stamp({"items": out[:80]})


def src_onthisday():
    d = NOW
    url = f"https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/{d.month:02d}/{d.day:02d}"
    data = get(url)
    ev = [{"year": e.get("year"), "text": e.get("text", "")} for e in data.get("events", [])
          if e.get("text") and len(e["text"]) < 160]
    ev.sort(key=lambda e: e["year"] or 0, reverse=True)
    return stamp({"date": f"{d.month:02d}-{d.day:02d}", "events": ev[:12]})


def src_geo_belt():
    from sgp4.api import Satrec, jday
    tle = get("https://celestrak.org/NORAD/elements/gp.php?GROUP=geo&FORMAT=tle", as_json=False)
    lines = [l.strip() for l in tle.splitlines() if l.strip()]
    jd, fr = jday(NOW.year, NOW.month, NOW.day, NOW.hour, NOW.minute, NOW.second)
    # GMST for ECI -> lon conversion
    t = (jd + fr - 2451545.0) / 36525.0
    gmst = (280.46061837 + 360.98564736629 * (jd + fr - 2451545.0)
            + 0.000387933 * t * t - t * t * t / 38710000.0) % 360.0
    import math
    sats = []
    for i in range(0, len(lines) - 2, 3):
        name, l1, l2 = lines[i], lines[i + 1], lines[i + 2]
        try:
            s = Satrec.twoline2rv(l1, l2)
            err, r, _ = s.sgp4(jd, fr)
            if err:
                continue
            x, y, z = r
            rho = math.hypot(x, y)
            lat = math.degrees(math.atan2(z, rho))
            lon = (math.degrees(math.atan2(y, x)) - gmst + 540) % 360 - 180
            alt = math.sqrt(x * x + y * y + z * z) - 6371.0
            tag = "wgs" if "WGS" in name.upper() else ("mil" if re.search(r"SKYNET|MUOS|AEHF|SICRAL|SYRACUSE|MILSTAR|XTAR|ANIK", name.upper()) else "geo")
            sats.append({"n": name.strip(), "lat": round(lat, 2), "lon": round(lon, 2), "alt": round(alt), "t": tag})
        except Exception:  # noqa: BLE001
            continue
    if not sats:
        raise RuntimeError("no GEO sats")
    return stamp({"count": len(sats), "sats": sats})


def src_markets():
    out = {}
    try:
        cg = get("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd,cad&include_24hr_change=true")
        out["btc_usd"] = cg["bitcoin"]["usd"]
        out["btc_cad"] = cg["bitcoin"]["cad"]
        out["btc_24h"] = round(cg["bitcoin"].get("usd_24h_change", 0), 2)
        out["eth_usd"] = cg["ethereum"]["usd"]
        out["eth_24h"] = round(cg["ethereum"].get("usd_24h_change", 0), 2)
    except Exception as e:  # noqa: BLE001
        print("coingecko failed:", e)
    try:
        fx = get("https://api.frankfurter.app/latest?from=USD&to=CAD,EUR,GBP,JPY")
        out["usd_cad"] = fx["rates"]["CAD"]
        out["usd_eur"] = fx["rates"]["EUR"]
        out["usd_gbp"] = fx["rates"]["GBP"]
        out["usd_jpy"] = fx["rates"]["JPY"]
        out["fx_date"] = fx.get("date")
    except Exception as e:  # noqa: BLE001
        print("frankfurter failed:", e)
    if not out:
        raise RuntimeError("no market data")
    return stamp(out)


def src_world():
    """Static bases for client-side extrapolated counters (est.)."""
    return stamp({
        # UN WPP 2024-era estimates; adjust yearly.
        "population": {"base": 8_231_000_000, "base_iso": "2025-07-01T00:00:00Z", "per_year": 70_000_000},
        "births_per_sec": 4.2,
        "deaths_per_sec": 1.9,
        "co2_tonnes_per_sec": 1180,      # ~37.4 Gt/yr fossil CO2
        "internet_users_per_sec": 5.0,
    })


SOURCES = {
    "news": src_news,
    "onthisday": src_onthisday,
    "geo_belt": src_geo_belt,
    "markets": src_markets,
    "world": src_world,
}


def main(prev_path, out_path):
    try:
        with open(prev_path, encoding="utf-8") as f:
            prev = json.load(f)
    except Exception:  # noqa: BLE001
        prev = {}

    data = {"meta": {"built_at": NOW.isoformat(timespec="seconds"), "ok": [], "failed": []}}
    for name, fn in SOURCES.items():
        t0 = time.time()
        try:
            data[name] = fn()
            data["meta"]["ok"].append(name)
            print(f"{name}: ok ({time.time()-t0:.1f}s)")
        except Exception as e:  # noqa: BLE001
            print(f"{name}: FAILED {e}")
            data["meta"]["failed"].append(name)
            if name in prev:
                data[name] = prev[name]
                data[name]["stale"] = True

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print("wrote", out_path, len(json.dumps(data)), "bytes")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
