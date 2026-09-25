#!/usr/bin/env python3
"""Build host/data/data.json for the Chromecast dashboard.

Usage: build_data.py <previous.json> <output.json>

Every source is fetched independently. If one fails, its block is carried
over from previous.json (with the old fetched_at, so the receiver can show
staleness) and the run still succeeds.
"""
import email.utils
import gzip
import html
import zlib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta

UA = "Mozilla/5.0 (compatible; mitchyc24-observatory/1.1; +https://mitchyc24.github.io/host/)"
FEED_ACCEPT = "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5"
NOW = datetime.now(timezone.utc)


def get(url, timeout=25, as_json=True, raw=False):
    accept = FEED_ACCEPT if raw else "application/json, */*;q=0.5"
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept, "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw_bytes = r.read()
        encoding = (r.headers.get("Content-Encoding") or "").lower()
    if encoding == "gzip" or raw_bytes[:2] == b"\x1f\x8b":
        raw_bytes = gzip.decompress(raw_bytes)
    elif encoding == "deflate":
        raw_bytes = zlib.decompress(raw_bytes)
    if raw:                      # bytes, so XML parsers honour the feed's declared encoding
        return raw_bytes.lstrip(b"\xef\xbb\xbf \t\r\n")
    raw = raw_bytes
    if as_json:
        return json.loads(raw.decode("utf-8", "replace"))
    return raw.decode("utf-8", "replace")


def stamp(payload):
    return {"fetched_at": NOW.isoformat(timespec="seconds"), **payload}


# ---------------------------------------------------------------- news sources
# World news comes from news agencies and public broadcasters in several countries,
# in each language the controls offer. The TV takes turns between sources, so the
# list sets the balance: no outlet can crowd out the others. Sources marked
# default=False (state-funded outlets) start switched off but can be turned on in
# the controls. Local sources carry a region and fall back to
# that region's centre when a headline names no place.
#
# kind: wire | public | state | un | aggregator.  country: ISO 3166 code (UN for the UN).
# urls are tried in order; the first that parses wins. Keep ids stable: the
# controls store on/off choices by id.

REGIONS = {                              # keep in step with OBS.REGIONS in host/settings.js
    "canada": (56.1, -106.3),
    "ottawa-gatineau": (45.42, -75.70),
}


def gnews(site, hl="en-US", gl="US", ceid="US:en"):
    """Google News search feed for one site (or site section): the only keyless feed of the
    AP and Reuters wires, and the fallback when a broadcaster's own feed won't answer."""
    q = urllib.parse.quote(f"site:{site} when:1d")
    return f"https://news.google.com/rss/search?q={q}&hl={hl}&gl={gl}&ceid={ceid}"


def source(id, name, lang, kind, country, urls, region=None, default=True):
    return {"id": id, "name": name, "lang": lang, "kind": kind, "country": country,
            "urls": urls, "region": region, "default": default}


NEWS_SOURCES = [
    # world, English
    source("ap", "AP", "en", "wire", "US", [gnews("apnews.com")]),
    source("reuters", "Reuters", "en", "wire", "GB", [gnews("reuters.com")]),
    source("bbc-world", "BBC World", "en", "public", "GB", ["https://feeds.bbci.co.uk/news/world/rss.xml"]),
    source("dw-en", "DW", "en", "public", "DE", ["https://rss.dw.com/rdf/rss-en-world", "https://rss.dw.com/rdf/rss-en-all"]),
    source("f24-en", "France 24", "en", "public", "FR", ["https://www.france24.com/en/rss"]),
    source("npr-world", "NPR", "en", "public", "US", ["https://feeds.npr.org/1004/rss.xml"]),
    source("cbc-world", "CBC World", "en", "public", "CA", ["https://www.cbc.ca/webfeed/rss/rss-world", gnews("cbc.ca/news/world", "en-CA", "CA", "CA:en")]),
    source("un-en", "UN News", "en", "un", "UN", ["https://news.un.org/feed/subscribe/en/news/all/rss.xml"]),
    source("aljazeera", "Al Jazeera", "en", "state", "QA", ["https://www.aljazeera.com/xml/rss/all.xml"], default=False),
    # world, French
    source("f24-fr", "France 24", "fr", "public", "FR", ["https://www.france24.com/fr/rss"]),
    source("rfi-fr", "RFI", "fr", "public", "FR", ["https://www.rfi.fr/fr/rss"]),
    source("dw-fr", "DW", "fr", "public", "DE", [gnews("dw.com/fr", "fr", "FR", "FR:fr")]),   # DW has no French RSS feed
    source("bbc-afrique", "BBC Afrique", "fr", "public", "GB", ["https://feeds.bbci.co.uk/afrique/rss.xml"]),
    source("un-fr", "ONU Info", "fr", "un", "UN", ["https://news.un.org/feed/subscribe/fr/news/all/rss.xml"]),
    # world, Spanish
    source("bbc-mundo", "BBC Mundo", "es", "public", "GB", ["https://feeds.bbci.co.uk/mundo/rss.xml"]),
    source("dw-es", "DW", "es", "public", "DE", ["https://rss.dw.com/rdf/rss-es-all", "https://rss.dw.com/rdf/rss-sp-all"]),
    source("f24-es", "France 24", "es", "public", "FR", ["https://www.france24.com/es/rss"]),
    source("rfi-es", "RFI", "es", "public", "FR", ["https://www.rfi.fr/es/rss"]),
    source("un-es", "Noticias ONU", "es", "un", "UN", ["https://news.un.org/feed/subscribe/es/news/all/rss.xml"]),
    # world, German
    source("tagesschau", "tagesschau", "de", "public", "DE", ["https://www.tagesschau.de/ausland/index~rss2.xml", "https://www.tagesschau.de/xml/rss2/"]),
    source("dlf", "Deutschlandfunk", "de", "public", "DE", ["https://www.deutschlandfunk.de/nachrichten-100.rss"]),
    source("dw-de", "DW", "de", "public", "DE", ["https://rss.dw.com/rdf/rss-de-all"]),
    source("orf", "ORF", "de", "public", "AT", ["https://rss.orf.at/news.xml"]),
    source("srf", "SRF", "de", "public", "CH", ["https://www.srf.ch/news/bnf/rss/1646", "https://www.srf.ch/news/bnf/rss/1922"]),
    # local: Canada, and Ottawa–Gatineau (which also shows the Canada sources)
    source("cbc-canada", "CBC", "en", "public", "CA", ["https://www.cbc.ca/webfeed/rss/rss-canada", gnews("cbc.ca/news/canada", "en-CA", "CA", "CA:en")], region="canada"),
    source("rc-canada", "Radio-Canada", "fr", "public", "CA", ["https://ici.radio-canada.ca/rss/4159", "https://ici.radio-canada.ca/rss/1000524"], region="canada"),
    source("cbc-ottawa", "CBC Ottawa", "en", "public", "CA", ["https://www.cbc.ca/webfeed/rss/rss-canada-ottawa", gnews("cbc.ca/news/canada/ottawa", "en-CA", "CA", "CA:en")], region="ottawa-gatineau"),
    source("rc-ottawa", "Radio-Canada Ottawa-Gatineau", "fr", "public", "CA", ["https://ici.radio-canada.ca/rss/6102"], region="ottawa-gatineau"),
]
PER_SOURCE = 12          # newest items kept per source
MAX_AGE = timedelta(hours=48)


# ---------------------------------------------------------------- geocoding
# Headlines are placed on the globe by the first place name they mention; a city
# beats a country, which beats a continent. Names are matched whole and case-sensitive;
# STEMS match the start of a word in any case, for adjectives ("israélien", "russische").
CITIES = {
    "Washington": (38.9, -77.0), "New York": (40.7, -74.0), "Los Angeles": (34.1, -118.2),
    "Ottawa": (45.4, -75.7), "Gatineau": (45.48, -75.70), "Toronto": (43.7, -79.4), "Montreal": (45.5, -73.6),
    "Vancouver": (49.3, -123.1), "Calgary": (51.0, -114.1), "Edmonton": (53.5, -113.5), "Winnipeg": (49.9, -97.1),
    "Halifax": (44.6, -63.6), "Regina": (50.4, -104.6), "Saskatoon": (52.1, -106.7), "Kanata": (45.3, -75.9),
    "Parliament Hill": (45.42, -75.70),
    "London": (51.5, -0.1), "Paris": (48.9, 2.3),
    "Berlin": (52.5, 13.4), "Brussels": (50.8, 4.4), "Moscow": (55.8, 37.6),
    "Kyiv": (50.4, 30.5), "Kiev": (50.4, 30.5), "Beijing": (39.9, 116.4), "Shanghai": (31.2, 121.5),
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
    "Rome": (41.9, 12.5), "Madrid": (40.4, -3.7), "Barcelona": (41.4, 2.2), "Lisbon": (38.7, -9.1),
    "Warsaw": (52.2, 21.0), "Stockholm": (59.3, 18.1), "Oslo": (59.9, 10.8),
    "Helsinki": (60.2, 24.9), "Copenhagen": (55.7, 12.6), "Dublin": (53.3, -6.3),
    "Geneva": (46.2, 6.1), "Vienna": (48.2, 16.4), "Zurich": (47.4, 8.5), "Munich": (48.1, 11.6),
    "Hamburg": (53.6, 10.0), "Cologne": (50.9, 7.0), "Frankfurt": (50.1, 8.7), "Khartoum": (15.6, 32.5),
    "Addis Ababa": (9.0, 38.7), "Kinshasa": (-4.3, 15.3), "Pyongyang": (39.0, 125.8),
    "Bogotá": (4.7, -74.1), "Bogota": (4.7, -74.1), "Lima": (-12.0, -77.0), "Quito": (-0.2, -78.5),
    "Dakar": (14.7, -17.4), "Abidjan": (5.3, -4.0), "Bamako": (12.6, -8.0), "Algiers": (36.8, 3.1),
    "Silicon Valley": (37.4, -122.1), "Wall Street": (40.7, -74.0), "Pentagon": (38.9, -77.1),
    "White House": (38.9, -77.0), "Kremlin": (55.8, 37.6), "Downing Street": (51.5, -0.1),
}
COUNTRIES = {
    "United States": (39.8, -98.6), "U.S.": (39.8, -98.6), "US": (39.8, -98.6), "USA": (39.8, -98.6),
    "Canada": (56.1, -106.3), "Canadian": (56.1, -106.3), "Quebec": (52.9, -73.5), "Ontario": (51.3, -85.3),
    "Alberta": (54.5, -115.0), "British Columbia": (54.0, -125.0), "Manitoba": (55.0, -97.0),
    "Saskatchewan": (54.0, -106.0), "Nova Scotia": (45.0, -63.0), "New Brunswick": (46.5, -66.2),
    "Newfoundland": (49.0, -56.0), "Prince Edward Island": (46.4, -63.2), "Yukon": (63.0, -135.0),
    "Nunavut": (70.0, -90.0), "Northwest Territories": (64.8, -119.2),
    "Mexico": (23.6, -102.6), "Brazil": (-14.2, -51.9), "Argentina": (-38.4, -63.6), "Chile": (-35.7, -71.5),
    "Colombia": (4.6, -74.3), "Venezuela": (6.4, -66.6), "Peru": (-9.2, -75.0), "Cuba": (21.5, -77.8),
    "Ecuador": (-1.8, -78.2), "Bolivia": (-16.3, -63.6), "Paraguay": (-23.4, -58.4), "Uruguay": (-32.5, -55.8),
    "Guatemala": (15.8, -90.2), "Honduras": (15.2, -86.2), "Nicaragua": (12.9, -85.2), "El Salvador": (13.8, -88.9),
    "Costa Rica": (9.7, -83.8), "Panama": (8.5, -80.8), "Dominican Republic": (18.7, -70.2),
    "Haiti": (19.0, -72.3), "UK": (54.0, -2.0), "Britain": (54.0, -2.0), "British": (54.0, -2.0),
    "England": (52.4, -1.5), "Scotland": (56.5, -4.2), "Wales": (52.1, -3.8), "Ireland": (53.4, -8.2),
    "France": (46.2, 2.2), "French": (46.2, 2.2), "Germany": (51.2, 10.5), "German": (51.2, 10.5),
    "Spain": (40.5, -3.7), "Portugal": (39.4, -8.2), "Italy": (41.9, 12.6), "Italian": (41.9, 12.6),
    "Netherlands": (52.1, 5.3), "Dutch": (52.1, 5.3), "Belgium": (50.5, 4.5), "Switzerland": (46.8, 8.2),
    "Austria": (47.5, 14.6), "Poland": (51.9, 19.1), "Polish": (51.9, 19.1), "Ukraine": (48.4, 31.2),
    "Ukrainian": (48.4, 31.2), "Russia": (61.5, 105.3), "Russian": (61.5, 105.3), "Belarus": (53.7, 28.0),
    "Sweden": (60.1, 18.6), "Norway": (60.5, 8.5), "Finland": (61.9, 25.7), "Denmark": (56.3, 9.5),
    "Iceland": (65.0, -19.0), "Serbia": (44.0, 21.0), "Hungary": (47.2, 19.5), "Romania": (45.9, 25.0),
    "Greece": (39.1, 21.8), "Turkey": (38.9, 35.2), "Türkiye": (38.9, 35.2), "Turkish": (38.9, 35.2), "Cyprus": (35.1, 33.4),
    "Israel": (31.0, 34.9), "Israeli": (31.0, 34.9), "Palestinian": (31.9, 35.2), "West Bank": (32.0, 35.3),
    "Lebanon": (33.9, 35.9), "Syria": (34.8, 39.0), "Syrian": (34.8, 39.0), "Iraq": (33.2, 43.7),
    "Iran": (32.4, 53.7), "Iranian": (32.4, 53.7), "Saudi": (23.9, 45.1), "Yemen": (15.6, 48.5),
    "Houthi": (15.6, 48.5), "Qatar": (25.4, 51.2), "UAE": (23.4, 53.8),
    "Emirates": (23.4, 53.8), "Jordan": (30.6, 36.2), "Egypt": (26.8, 30.8), "Egyptian": (26.8, 30.8),
    "Libya": (26.3, 17.2), "Tunisia": (33.9, 9.5), "Algeria": (28.0, 1.7), "Morocco": (31.8, -7.1),
    "Sudan": (12.9, 30.2), "Sudanese": (12.9, 30.2), "South Sudan": (7.9, 29.7), "Ethiopia": (9.1, 40.5), "Somalia": (5.2, 46.2),
    "Kenya": (-0.0, 37.9), "Nigeria": (9.1, 8.7), "Nigerian": (9.1, 8.7), "Ghana": (7.9, -1.0),
    "Congo": (-4.0, 21.8), "Rwanda": (-1.9, 29.9), "Uganda": (1.4, 32.3), "Tanzania": (-6.4, 34.9),
    "Senegal": (14.5, -14.5), "Ivory Coast": (7.5, -5.5), "Côte d'Ivoire": (7.5, -5.5), "Côte d’Ivoire": (7.5, -5.5),
    "Burkina Faso": (12.2, -1.6), "Cameroon": (7.4, 12.4), "Chad": (15.5, 18.7),
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
    "New Zealand": (-40.9, 174.9), "Papua": (-6.3, 143.9), "Fiji": (-17.7, 178.1),
    "Greenland": (72.0, -40.0), "Alaska": (64.0, -150.0),
    "California": (36.8, -119.4), "Texas": (31.0, -100.0), "Florida": (27.8, -81.7), "Hawaii": (20.5, -157.5),
}
AREAS = {
    "Europe": (50.0, 10.0), "European": (50.0, 10.0), "EU": (50.8, 4.4), "NATO": (50.8, 4.4),
    "Africa": (2.0, 20.0), "African": (2.0, 20.0), "Sahel": (15.0, 0.0), "Asia": (34.0, 100.0),
    "Middle East": (29.0, 45.0), "Latin America": (-10.0, -60.0), "Caribbean": (18.0, -70.0),
    "Balkans": (43.0, 20.0), "Baltic": (57.0, 24.0), "Red Sea": (20.0, 38.5), "Pacific": (0.0, -160.0),
    "Antarctica": (-80.0, 0.0), "Arctic": (85.0, -40.0), "America": (39.8, -98.6),
}
# Other languages' names for places above: alias -> English name.
ALIASES = {
    # French
    "États-Unis": "United States", "Etats-Unis": "United States", "Washington": "Washington",
    "Royaume-Uni": "UK", "Grande-Bretagne": "Britain", "Angleterre": "England", "Écosse": "Scotland", "Irlande": "Ireland",
    "Allemagne": "Germany", "Espagne": "Spain", "Italie": "Italy", "Pays-Bas": "Netherlands", "Belgique": "Belgium",
    "Suisse": "Switzerland", "Autriche": "Austria", "Pologne": "Poland", "Suède": "Sweden", "Norvège": "Norway",
    "Finlande": "Finland", "Danemark": "Denmark", "Islande": "Iceland", "Grèce": "Greece", "Turquie": "Turkey",
    "Chypre": "Cyprus", "Serbie": "Serbia", "Hongrie": "Hungary", "Roumanie": "Romania", "Biélorussie": "Belarus",
    "Russie": "Russia", "Israël": "Israel", "Cisjordanie": "West Bank", "Liban": "Lebanon", "Syrie": "Syria",
    "Irak": "Iraq", "Arabie saoudite": "Saudi", "Yémen": "Yemen", "Jordanie": "Jordan", "Égypte": "Egypt",
    "Libye": "Libya", "Tunisie": "Tunisia", "Algérie": "Algeria", "Maroc": "Morocco", "Soudan": "Sudan",
    "Soudan du Sud": "South Sudan", "Éthiopie": "Ethiopia", "Somalie": "Somalia", "Nigeria": "Nigeria",
    "Afrique du Sud": "South Africa", "Tanzanie": "Tanzania", "Ouganda": "Uganda", "Cameroun": "Cameroon",
    "Tchad": "Chad", "Sénégal": "Senegal", "RDC": "Congo", "République démocratique du Congo": "Congo",
    "Afghanistan": "Afghanistan", "Inde": "India", "Cachemire": "Kashmir", "Birmanie": "Myanmar",
    "Thaïlande": "Thailand", "Cambodge": "Cambodia", "Malaisie": "Malaysia", "Indonésie": "Indonesia",
    "Chine": "China", "Taïwan": "Taiwan", "Japon": "Japan", "Corée du Sud": "South Korea", "Corée du Nord": "North Korea",
    "Mongolie": "Mongolia", "Australie": "Australia", "Nouvelle-Zélande": "New Zealand",
    "Mexique": "Mexico", "Brésil": "Brazil", "Argentine": "Argentina", "Chili": "Chile", "Colombie": "Colombia",
    "Pérou": "Peru", "Équateur": "Ecuador", "Bolivie": "Bolivia", "Haïti": "Haiti", "République dominicaine": "Dominican Republic",
    "Groenland": "Greenland", "Californie": "California", "Floride": "Florida",
    "Québec": "Quebec", "Colombie-Britannique": "British Columbia", "Nouvelle-Écosse": "Nova Scotia",
    "Nouveau-Brunswick": "New Brunswick", "Terre-Neuve": "Newfoundland", "Île-du-Prince-Édouard": "Prince Edward Island",
    "Territoires du Nord-Ouest": "Northwest Territories", "Colline du Parlement": "Parliament Hill",
    "Montréal": "Montreal", "Londres": "London", "Moscou": "Moscow", "Pékin": "Beijing", "Bruxelles": "Brussels",
    "Genève": "Geneva", "Varsovie": "Warsaw", "Le Caire": "Cairo", "Jérusalem": "Jerusalem", "Beyrouth": "Beirut",
    "Damas": "Damascus", "Bagdad": "Baghdad", "Téhéran": "Tehran", "Séoul": "Seoul", "Mexico": "Mexico",
    "Lisbonne": "Lisbon", "Athènes": "Athens", "Alger": "Algiers", "Bogota": "Bogota",
    "Europe": "Europe", "Afrique": "Africa", "Asie": "Asia", "Moyen-Orient": "Middle East", "Proche-Orient": "Middle East",
    "Amérique latine": "Latin America", "Caraïbes": "Caribbean", "mer Rouge": "Red Sea", "Arctique": "Arctic",
    "Antarctique": "Antarctica", "OTAN": "NATO", "UE": "EU",
    # Spanish
    "Estados Unidos": "United States", "EE.UU.": "United States", "EEUU": "United States", "Reino Unido": "UK",
    "Inglaterra": "England", "Escocia": "Scotland", "Irlanda": "Ireland", "Alemania": "Germany", "Francia": "France",
    "España": "Spain", "Italia": "Italy", "Países Bajos": "Netherlands", "Bélgica": "Belgium", "Suiza": "Switzerland",
    "Polonia": "Poland", "Suecia": "Sweden", "Noruega": "Norway", "Finlandia": "Finland", "Dinamarca": "Denmark",
    "Islandia": "Iceland", "Grecia": "Greece", "Turquía": "Turkey", "Chipre": "Cyprus", "Hungría": "Hungary",
    "Rumania": "Romania", "Rumanía": "Romania", "Bielorrusia": "Belarus", "Rusia": "Russia", "Ucrania": "Ukraine",
    "Cisjordania": "West Bank", "Líbano": "Lebanon", "Siria": "Syria", "Irán": "Iran", "Arabia Saudita": "Saudi",
    "Arabia Saudí": "Saudi", "Jordania": "Jordan", "Egipto": "Egypt", "Libia": "Libya", "Túnez": "Tunisia",
    "Argelia": "Algeria", "Marruecos": "Morocco", "Sudán": "Sudan", "Etiopía": "Ethiopia", "Kenia": "Kenya",
    "Sudáfrica": "South Africa", "Camerún": "Cameroon", "Afganistán": "Afghanistan", "Pakistán": "Pakistan",
    "Tailandia": "Thailand", "Camboya": "Cambodia", "Malasia": "Malaysia", "Filipinas": "Philippines",
    "Japón": "Japan", "Corea del Sur": "South Korea", "Corea del Norte": "North Korea", "Taiwán": "Taiwan",
    "Nueva Zelanda": "New Zealand", "Canadá": "Canada", "México": "Mexico", "Brasil": "Brazil", "Perú": "Peru",
    "Panamá": "Panama", "Haití": "Haiti", "República Dominicana": "Dominican Republic", "Groenlandia": "Greenland",
    "Londres": "London", "Moscú": "Moscow", "Pekín": "Beijing", "Bruselas": "Brussels", "Ginebra": "Geneva",
    "Varsovia": "Warsaw", "Viena": "Vienna", "El Cairo": "Cairo", "Jerusalén": "Jerusalem", "Damasco": "Damascus",
    "Teherán": "Tehran", "Kiev": "Kyiv", "Seúl": "Seoul", "Ciudad de México": "Mexico City", "La Habana": "Havana",
    "Lisboa": "Lisbon", "Atenas": "Athens", "Estambul": "Istanbul",
    "Europa": "Europe", "África": "Africa", "Oriente Medio": "Middle East", "Oriente Próximo": "Middle East",
    "Medio Oriente": "Middle East", "América Latina": "Latin America", "Latinoamérica": "Latin America",
    "Caribe": "Caribbean", "Mar Rojo": "Red Sea", "Ártico": "Arctic", "Antártida": "Antarctica", "OTAN": "NATO",
    # German
    "Vereinigte Staaten": "United States", "Großbritannien": "UK", "Deutschland": "Germany", "Frankreich": "France",
    "Spanien": "Spain", "Italien": "Italy", "Niederlande": "Netherlands", "Belgien": "Belgium", "Schweiz": "Switzerland",
    "Österreich": "Austria", "Polen": "Poland", "Schweden": "Sweden", "Norwegen": "Norway", "Finnland": "Finland",
    "Dänemark": "Denmark", "Griechenland": "Greece", "Türkei": "Turkey", "Zypern": "Cyprus", "Serbien": "Serbia",
    "Ungarn": "Hungary", "Rumänien": "Romania", "Weißrussland": "Belarus", "Russland": "Russia",
    "Westjordanland": "West Bank", "Libanon": "Lebanon", "Syrien": "Syria", "Saudi-Arabien": "Saudi",
    "Jemen": "Yemen", "Jordanien": "Jordan", "Ägypten": "Egypt", "Libyen": "Libya", "Tunesien": "Tunisia",
    "Algerien": "Algeria", "Marokko": "Morocco", "Südsudan": "South Sudan", "Äthiopien": "Ethiopia",
    "Somalia": "Somalia", "Südafrika": "South Africa", "Kamerun": "Cameroon", "Tschad": "Chad",
    "Indien": "India", "Thailand": "Thailand", "Kambodscha": "Cambodia", "Indonesien": "Indonesia",
    "Philippinen": "Philippines", "Südkorea": "South Korea", "Nordkorea": "North Korea", "Mongolei": "Mongolia",
    "Kasachstan": "Kazakhstan", "Australien": "Australia", "Neuseeland": "New Zealand", "Kanada": "Canada",
    "Mexiko": "Mexico", "Brasilien": "Brazil", "Argentinien": "Argentina", "Kolumbien": "Colombia", "Kuba": "Cuba",
    "Grönland": "Greenland", "Kalifornien": "California",
    "Moskau": "Moscow", "Peking": "Beijing", "Brüssel": "Brussels", "Genf": "Geneva", "Warschau": "Warsaw",
    "Wien": "Vienna", "Kairo": "Cairo", "Damaskus": "Damascus", "Kiew": "Kyiv", "Rom": "Rome", "Lissabon": "Lisbon",
    "Athen": "Athens", "München": "Munich", "Köln": "Cologne", "Zürich": "Zurich",
    "Afrika": "Africa", "Asien": "Asia", "Nahost": "Middle East", "Nahen Osten": "Middle East",
    "Lateinamerika": "Latin America", "Karibik": "Caribbean", "Rotes Meer": "Red Sea", "Arktis": "Arctic",
    "Antarktis": "Antarctica",
}
STEMS = {
    # French adjectives
    "américain": "United States", "canadien": "Canada", "québécois": "Quebec", "mexicain": "Mexico",
    "brésilien": "Brazil", "britannique": "UK", "allemand": "Germany", "russe": "Russia", "ukrainien": "Ukraine",
    "israélien": "Israel", "palestinien": "Palestinian", "iranien": "Iran", "syrien": "Syria", "libanais": "Lebanon",
    "égyptien": "Egypt", "saoudien": "Saudi", "soudanais": "Sudan", "chinois": "China", "japonais": "Japan",
    "taïwanais": "Taiwan", "nord-coréen": "North Korea", "sud-coréen": "South Korea", "européen": "Europe",
    "africain": "Africa", "haïtien": "Haiti", "vénézuélien": "Venezuela", "cubain": "Cuba",
    # Spanish adjectives
    "estadounidense": "United States", "canadiense": "Canada", "mexican": "Mexico", "brasileñ": "Brazil",
    "británic": "UK", "alemán": "Germany", "alemana": "Germany", "ruso": "Russia", "rusa": "Russia",
    "ucranian": "Ukraine", "israelí": "Israel", "palestin": "Palestinian", "iraní": "Iran", "sirio": "Syria",
    "libanés": "Lebanon", "egipci": "Egypt", "saudí": "Saudi", "chino": "China", "japonés": "Japan",
    "japonesa": "Japan", "norcorean": "North Korea", "surcorean": "South Korea", "europe": "Europe",
    "african": "Africa", "venezolan": "Venezuela", "colombian": "Colombia", "argentin": "Argentina",
    "chilen": "Chile", "peruan": "Peru", "cuban": "Cuba",
    # German adjectives
    "amerikanisch": "United States", "kanadisch": "Canada", "mexikanisch": "Mexico", "brasilianisch": "Brazil",
    "britisch": "UK", "deutsch": "Germany", "französisch": "France", "italienisch": "Italy", "spanisch": "Spain",
    "polnisch": "Poland", "österreichisch": "Austria", "russisch": "Russia", "ukrainisch": "Ukraine",
    "israelisch": "Israel", "palästinens": "Palestinian", "iranisch": "Iran", "syrisch": "Syria",
    "libanesisch": "Lebanon", "ägyptisch": "Egypt", "saudisch": "Saudi", "türkisch": "Turkey",
    "chinesisch": "China", "japanisch": "Japan", "nordkorean": "North Korea", "südkorean": "South Korea",
    "indisch": "India", "europäisch": "Europe", "afrikanisch": "Africa",
}


def _place_table():
    """name -> (tier, lat, lon); tier 0 city, 1 country or province, 2 wider area."""
    table = {}
    for tier, group in enumerate((CITIES, COUNTRIES, AREAS)):
        for name, (lat, lon) in group.items():
            table.setdefault(name, (tier, lat, lon))
    for alias, english in ALIASES.items():
        if english in table:
            table.setdefault(alias, table[english])
    return table


PLACE_TABLE = _place_table()
STEM_TABLE = {stem: PLACE_TABLE[english] for stem, english in STEMS.items() if english in PLACE_TABLE}
_alt = lambda keys: "|".join(re.escape(k) for k in sorted(keys, key=len, reverse=True))
NAME_RE = re.compile(r"(?<!\w)(" + _alt(PLACE_TABLE) + r")(?!\w)")
STEM_RE = re.compile(r"(?<!\w)(" + _alt(STEM_TABLE) + r")", re.I)


def geocode(text):
    """(place, lat, lon) for the most specific place in text, else None."""
    best = None
    for m in NAME_RE.finditer(text):
        tier, lat, lon = PLACE_TABLE[m.group(1)]
        if best is None or tier < best[0]:
            best = (tier, m.group(1), lat, lon)
    if best is None or best[0] > 1:
        m = STEM_RE.search(text)
        if m:
            tier, lat, lon = STEM_TABLE[m.group(1).lower()]
            if best is None or tier < best[0]:
                best = (tier, "", lat, lon)
    return best and best[1:]


# ---------------------------------------------------------------- feeds
def _local(tag):
    return tag.rsplit("}", 1)[-1]


def _text(s):
    s = html.unescape(re.sub(r"<[^>]+>", " ", s or ""))
    return re.sub(r"\s+", " ", s).strip()


def _when(s):
    if not s:
        return None
    try:
        d = email.utils.parsedate_to_datetime(s)
    except (TypeError, ValueError, IndexError):
        try:
            d = datetime.fromisoformat(s.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
    return (d if d.tzinfo else d.replace(tzinfo=timezone.utc)).astimezone(timezone.utc)


def parse_feed(raw):
    """Items from RSS 2.0, RSS 1.0 (RDF) or Atom: [{title, link, desc, ts}]."""
    root = ET.fromstring(raw)
    items = []
    for el in root.iter():
        if _local(el.tag) not in ("item", "entry"):
            continue
        f = {}
        for ch in el:
            name = _local(ch.tag)
            if name == "link":
                href = ch.get("href")
                if href and ch.get("rel", "alternate") == "alternate":
                    f.setdefault("link", href)
                elif (ch.text or "").strip():
                    f.setdefault("link", ch.text.strip())
            elif name in ("title", "description", "summary", "pubDate", "date", "published", "updated") and ch.text:
                f.setdefault(name, ch.text)
        title = _text(f.get("title"))
        if title:
            items.append({"title": title, "link": f.get("link", ""),
                          "desc": _text(f.get("description") or f.get("summary"))[:400],
                          "ts": _when(f.get("pubDate") or f.get("date") or f.get("published") or f.get("updated"))})
    return items


GNEWS_SUFFIX = re.compile(r"\s+[-–|]\s+[^-–|]{2,40}$")     # Google News appends " - Publisher"


def fetch_source(src):
    """(items, status) for one feed source; never raises."""
    errors = []
    for url in src["urls"]:
        try:
            raw = get(url, timeout=20, as_json=False, raw=True)
            try:
                items = parse_feed(raw)
            except ET.ParseError as e:
                errors.append(f"{url}: {e} (starts {raw[:40]!r})")
                continue
            if items:
                return items, {"ok": True, "url": url}
            errors.append(f"{url}: no items")
        except Exception as e:  # noqa: BLE001
            errors.append(f"{url}: {e}")
    return [], {"ok": False, "error": "; ".join(errors)[:300]}


def src_news():
    gha = os.environ.get("GITHUB_ACTIONS") == "true"
    feeds = NEWS_SOURCES
    with ThreadPoolExecutor(max_workers=8) as pool:
        fetched = dict(zip((s["id"] for s in feeds), pool.map(fetch_source, feeds)))

    items, seen, sources = [], set(), []
    for src in NEWS_SOURCES:
        raw, status = fetched.get(src["id"], ([], {"ok": False, "error": "not fetched"}))
        fresh = [r for r in raw if not r.get("ts") or NOW - r["ts"] <= MAX_AGE]
        fresh.sort(key=lambda r: r.get("ts") or NOW, reverse=True)
        kept = 0
        for r in fresh:
            if kept >= PER_SOURCE:
                break
            title = GNEWS_SUFFIX.sub("", r["title"]) if "news.google.com" in status.get("url", "") else r["title"]
            key = re.sub(r"\W+", "", title.lower())[:48]
            if not key or key in seen:
                continue
            hit = geocode(title) or geocode(r.get("desc", ""))
            if hit:
                place, lat, lon = hit
            elif src["region"]:                               # local news with no place named: home region
                place, (lat, lon) = "", REGIONS[src["region"]]
            else:                                             # still fine for the ticker
                place, lat, lon = "", None, None
            seen.add(key)
            kept += 1
            item = {"title": title, "url": r.get("link", ""), "src": src["id"], "source": src["name"],
                    "lang": src["lang"], "kind": "rss", "place": place, "lat": lat, "lon": lon}
            if r.get("ts"):
                item["ts"] = r["ts"].isoformat(timespec="seconds")
            if src["region"]:
                item["region"] = src["region"]
            items.append(item)

        meta = {k: src[k] for k in ("id", "name", "lang", "kind", "country", "region", "default")}
        sources.append({**meta, "n": kept, "ok": status["ok"]})
        line = f"  {src['id']:<12} {src['lang']}  {'ok ' if status['ok'] else 'FAIL'} {kept:>3} items"
        print(line + ("" if status["ok"] else f"  {status.get('error', '')}"))
        if gha and not status["ok"]:
            print(f"::warning title=News source {src['id']} failed::{status.get('error', '')}")

    if not items:
        raise RuntimeError("no news items")
    return stamp({"items": items, "sources": sources})


def src_onthisday():
    d = NOW
    by_lang = {}
    for lang in ("en", "fr", "es", "de"):
        url = f"https://{lang}.wikipedia.org/api/rest_v1/feed/onthisday/events/{d.month:02d}/{d.day:02d}"
        try:
            data = get(url)
            ev = [{"year": e.get("year"), "text": e.get("text", "")} for e in data.get("events", [])
                  if e.get("text") and len(e["text"]) < 160]
            ev.sort(key=lambda e: e["year"] or 0, reverse=True)
            if ev:
                by_lang[lang] = ev[:12]
        except Exception as e:  # noqa: BLE001
            print(f"  onthisday {lang} failed: {e}")
    if not by_lang:
        raise RuntimeError("no on-this-day events")
    # "events" stays for receivers that predate by_lang
    return stamp({"date": f"{d.month:02d}-{d.day:02d}", "events": by_lang.get("en") or next(iter(by_lang.values())),
                  "by_lang": by_lang})


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
