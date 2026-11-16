// miApps command station: public information gathered in one place.
// Same-origin data comes from host/data/data.json (rebuilt every 15 minutes by GitHub Actions for
// Observatory). Everything else is fetched live from keyless, CORS-enabled public APIs.
(() => {
  "use strict";

  const DATA = "host/data/data.json";
  const PLACE_KEY = "miapps.station.place";
  const NEWS_PAGE = 8;
  const API = {
    quakes: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson",
    iss: "https://api.wheretheiss.at/v1/satellites/25544",
    kp: "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json",
    weather: (p) => "https://api.open-meteo.com/v1/forecast?latitude=" + p.lat.toFixed(3) + "&longitude=" + p.lon.toFixed(3) +
      "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m" +
      "&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max&timezone=auto&forecast_days=1",
    geocode: (q) => "https://geocoding-api.open-meteo.com/v1/search?count=5&language=en&name=" + encodeURIComponent(q),
  };

  const root = document.getElementById("station");
  if (!root) return;
  const $ = (id) => document.getElementById(id);
  const h = window.miHub.h;

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  const state = { data: null, newsShown: NEWS_PAGE, kp: null, iss: null, visible: false, started: false };

  // ------------------------------------------------------------ helpers
  async function getJSON(url, ms = 12000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try {
      const res = await fetch(url, { signal: ctl.signal, cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally { clearTimeout(t); }
  }

  const num = (n, digits = 0) => Number(n).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const isNum = (n) => typeof n === "number" && Number.isFinite(n);

  function ago(when) {
    const t = when instanceof Date ? when : new Date(when);
    const s = Math.round((Date.now() - t.getTime()) / 1000);
    if (!Number.isFinite(s)) return "";
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return `${Math.floor(s / 86400)} d ago`;
  }

  const latlon = (lat, lon) =>
    `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}`;

  const stat = (label, value, note) =>
    h("div", { class: "stat" }, h("dt", null, label), h("dd", null, value, note && h("small", null, note)));

  const empty = (text) => h("li", { class: "empty" }, text);
  const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : null);

  // ------------------------------------------------------------ clocks + counters
  function tick() {
    const now = new Date();
    $("st-utc").textContent = now.toISOString().slice(11, 19);
    $("st-local").textContent = now.toLocaleTimeString(undefined, { hour12: false });
    if (state.visible) renderWorld(now);
  }

  function renderWorld(now) {
    const w = state.data && state.data.world;
    const box = $("p-world");
    if (!w || !w.population) { box.hidden = true; return; }
    box.hidden = false;
    const p = w.population;
    const years = (now - new Date(p.base_iso)) / (365.25 * 86400e3);
    const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
    const secs = (now - midnight) / 1000;
    const rows = [stat("World population", num(p.base + p.per_year * years))];
    if (isNum(w.births_per_sec)) rows.push(stat("Births today", num(w.births_per_sec * secs)));
    if (isNum(w.deaths_per_sec)) rows.push(stat("Deaths today", num(w.deaths_per_sec * secs)));
    if (isNum(w.co2_tonnes_per_sec)) rows.push(stat("CO₂ emitted today", num(w.co2_tonnes_per_sec * secs), "tonnes"));
    $("world-stats").replaceChildren(...rows);
  }

  // ------------------------------------------------------------ built data (news, markets, on this day)
  async function loadData() {
    try {
      state.data = await getJSON(DATA);
    } catch (err) {
      console.warn("station: could not load", DATA, err);
      state.data = null;
    }
    const d = state.data;
    const built = d && d.meta && d.meta.built_at;
    $("st-built").textContent = !d ? "Feed unavailable" : d.meta && d.meta.sample ? "Sample data" : built ? `Feed built ${ago(built)}` : "";
    setupNews();
    renderNews();
    renderMarkets();
    renderOtd();
    renderOrbit();
    renderWorld(new Date());
  }

  function setupNews() {
    const items = (state.data && state.data.news && state.data.news.items) || [];
    const langs = [...new Set(items.map((i) => i.lang).filter(Boolean))].sort();
    const sel = $("news-lang");
    sel.hidden = langs.length < 2;
    if (sel.hidden) return;
    const names = (() => { try { return new Intl.DisplayNames(undefined, { type: "language" }); } catch { return null; } })();
    const label = (l) => { try { return (names && names.of(l)) || l; } catch { return l; } };
    const keep = sel.value || (langs.includes((navigator.language || "").slice(0, 2)) ? navigator.language.slice(0, 2) : "");
    sel.replaceChildren(h("option", { value: "" }, "All languages"), ...langs.map((l) => h("option", { value: l }, label(l))));
    sel.value = keep;
  }

  function renderNews() {
    const list = $("news-list");
    const news = state.data && state.data.news;
    const items = (news && news.items) || [];
    if (!items.length) {
      list.replaceChildren(empty(state.data ? "No headlines in the feed right now." : "Headlines are unavailable right now."));
      $("news-more").hidden = true;
      return;
    }
    const lang = $("news-lang").value;
    const terms = $("news-q").value.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = items
      .filter((i) => i && i.title && (!lang || i.lang === lang))
      .filter((i) => { const hay = `${i.title} ${i.source || ""} ${i.place || ""}`.toLowerCase(); return terms.every((t) => hay.includes(t)); })
      .sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")));
    const shown = hits.slice(0, state.newsShown);
    list.replaceChildren(...(shown.length ? shown.map((i) => {
      const url = safeUrl(i.url);
      const meta = [i.source, i.place, i.ts && ago(i.ts)].filter(Boolean).join(" · ");
      return h("li", null,
        url ? h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, i.title) : h("span", null, i.title),
        meta && h("small", null, meta));
    }) : [empty("No headlines match that filter.")]));
    $("news-more").hidden = hits.length <= state.newsShown;
    const n = (news.sources || []).filter((s) => s && s.ok !== false).length;
    $("news-src").textContent = `${hits.length} headline${hits.length === 1 ? "" : "s"}` + (n ? ` from ${n} sources` : "");
  }

  function renderMarkets() {
    const m = state.data && state.data.markets;
    const box = $("p-markets");
    const rows = [];
    const change = (c) => (isNum(c) ? `${c > 0 ? "+" : ""}${c.toFixed(2)}% 24 h` : null);
    if (m) {
      if (isNum(m.btc_usd)) rows.push(stat("Bitcoin", `US$${num(m.btc_usd)}`, change(m.btc_24h)));
      if (isNum(m.eth_usd)) rows.push(stat("Ethereum", `US$${num(m.eth_usd, 2)}`, change(m.eth_24h)));
      for (const [key, code, digits] of [["usd_cad", "CAD", 4], ["usd_eur", "EUR", 4], ["usd_gbp", "GBP", 4], ["usd_jpy", "JPY", 2]]) {
        if (isNum(m[key])) rows.push(stat(`1 USD in ${code}`, num(m[key], digits)));
      }
    }
    box.hidden = rows.length === 0;
    if (box.hidden) return;
    $("markets-stats").replaceChildren(...rows);
    $("markets-tag").textContent = m.fetched_at ? `Updated ${ago(m.fetched_at)}` : "";
  }

  function renderOtd() {
    const o = state.data && state.data.onthisday;
    const box = $("p-otd");
    const lang = (navigator.language || "en").slice(0, 2);
    const events = o && ((o.by_lang && o.by_lang[lang]) || o.events) || [];
    box.hidden = events.length === 0;
    if (box.hidden) return;
    $("otd-list").replaceChildren(...events.slice(0, 5).map((e) =>
      h("li", null, h("b", null, String(e.year)), h("span", null, e.text))));
    const m = /^(\d\d)-(\d\d)$/.exec(o.date || "");
    $("otd-tag").textContent = m ? new Date(2000, +m[1] - 1, +m[2]).toLocaleDateString(undefined, { month: "long", day: "numeric" }) : "";
  }

  // ------------------------------------------------------------ live sources
  async function loadQuakes() {
    const list = $("quake-list");
    try {
      const j = await getJSON(API.quakes);
      const rows = (j.features || [])
        .map((f) => f.properties).filter((p) => p && isNum(p.mag))
        .sort((a, b) => b.time - a.time).slice(0, 6);
      list.replaceChildren(...(rows.length ? rows.map((p) => {
        const url = safeUrl(p.url);
        return h("li", null,
          h("b", { class: p.mag >= 6 ? "hot" : null }, `M${p.mag.toFixed(1)}`),
          h("span", null,
            url ? h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, p.place || "Unknown location") : (p.place || "Unknown location"),
            h("small", null, ago(p.time))));
      }) : [empty("No M4.5+ earthquakes in the last 24 hours.")]));
    } catch (err) {
      console.warn("station: quakes", err);
      list.replaceChildren(empty("Earthquake feed is unavailable right now."));
    }
  }

  const KP_SCALE = [[9, "G5 extreme storm"], [8, "G4 severe storm"], [7, "G3 strong storm"], [6, "G2 moderate storm"],
    [5, "G1 minor storm"], [4, "Active"], [3, "Unsettled"], [0, "Quiet"]];

  async function loadKp() {
    try {
      const j = await getJSON(API.kp);
      const last = Array.isArray(j) ? j[j.length - 1] : null;
      // The product is a list of objects; it used to be rows under a header row.
      const kp = Number(Array.isArray(last) ? last[1] : last && last.Kp);
      const at = Array.isArray(last) ? last[0] : last && last.time_tag;
      state.kp = Number.isFinite(kp) ? { kp, at } : null;
    } catch (err) {
      console.warn("station: kp", err);
      state.kp = null;
    }
    renderOrbit();
  }

  async function loadIss() {
    try {
      const j = await getJSON(API.iss, 8000);
      state.iss = isNum(j.latitude) && isNum(j.longitude) ? j : null;
    } catch (err) {
      console.warn("station: iss", err);
      state.iss = null;
    }
    renderOrbit();
  }

  function renderOrbit() {
    const rows = [];
    const i = state.iss;
    if (i) {
      rows.push(stat("ISS is over", latlon(i.latitude, i.longitude), i.visibility === "eclipsed" ? "in Earth’s shadow" : "in sunlight"));
      if (isNum(i.altitude) && isNum(i.velocity)) rows.push(stat("ISS altitude and speed", `${num(i.altitude)} km`, `${num(i.velocity)} km/h`));
    }
    if (state.kp) {
      const label = KP_SCALE.find(([min]) => state.kp.kp >= min)[1];
      rows.push(stat("Geomagnetic activity", `Kp ${state.kp.kp.toFixed(1)}`, label));
    }
    const geo = state.data && state.data.geo_belt;
    if (geo && isNum(geo.count)) rows.push(stat("Geostationary satellites tracked", num(geo.count)));
    $("orbit-stats").replaceChildren(...(rows.length ? rows : [h("div", { class: "empty" }, "Orbit data is unavailable right now.")]));
  }

  // ------------------------------------------------------------ local conditions
  const WMO = [[0, "Clear sky"], [1, "Mostly clear"], [2, "Partly cloudy"], [3, "Overcast"], [48, "Fog"], [57, "Drizzle"],
    [67, "Rain"], [77, "Snow"], [82, "Rain showers"], [86, "Snow showers"], [99, "Thunderstorm"]];
  const wmo = (code) => (WMO.find(([max]) => code <= max) || [0, "—"])[1];
  const hhmm = (iso) => (typeof iso === "string" && iso.includes("T") ? iso.split("T")[1].slice(0, 5) : "—");

  function getPlace() {
    const p = store.get(PLACE_KEY, null);
    return p && isNum(p.lat) && isNum(p.lon) ? p : null;
  }

  function showPlaceForm(show) {
    $("place-form").hidden = !show;
    $("place-results").replaceChildren();
    $("local-change").hidden = show || !getPlace();
    if (show) $("place-q").value = "";
  }

  async function loadLocal() {
    const body = $("local-body");
    const p = getPlace();
    if (!p) {
      body.replaceChildren(h("p", { class: "empty" }, "Choose a place to see its weather, sunrise and sunset."));
      showPlaceForm(true);
      return;
    }
    showPlaceForm(false);
    body.replaceChildren(h("p", { class: "empty" }, `Loading ${p.name}…`));
    try {
      const j = await getJSON(API.weather(p));
      const c = j.current, d = j.daily;
      body.replaceChildren(
        h("p", { class: "place-name" }, p.name),
        h("p", { class: "big" }, `${Math.round(c.temperature_2m)}°C`, h("small", null, wmo(c.weather_code))),
        h("dl", { class: "stats" },
          stat("Feels like", `${Math.round(c.apparent_temperature)}°C`),
          stat("Wind", `${Math.round(c.wind_speed_10m)} km/h`),
          stat("High / low", `${Math.round(d.temperature_2m_max[0])}° / ${Math.round(d.temperature_2m_min[0])}°`),
          stat("Chance of precipitation", `${d.precipitation_probability_max[0] ?? "—"}%`),
          stat("Sunrise", hhmm(d.sunrise[0])),
          stat("Sunset", hhmm(d.sunset[0]))));
    } catch (err) {
      console.warn("station: weather", err);
      body.replaceChildren(h("p", { class: "empty" }, `Weather for ${p.name} is unavailable right now.`));
    }
  }

  function setPlace(p) {
    store.set(PLACE_KEY, p);
    loadLocal();
  }

  $("local-change").addEventListener("click", () => { showPlaceForm(true); $("place-q").focus(); });

  $("place-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = $("place-q").value.trim();
    const out = $("place-results");
    if (q.length < 2) return;
    out.replaceChildren(empty("Searching…"));
    try {
      const j = await getJSON(API.geocode(q));
      const hits = j.results || [];
      out.replaceChildren(...(hits.length ? hits.map((r) => {
        const name = [r.name, r.admin1, r.country].filter(Boolean).join(", ");
        const b = h("button", { type: "button", class: "link-btn" }, name);
        b.addEventListener("click", () => setPlace({ name, lat: r.latitude, lon: r.longitude }));
        return h("li", null, b);
      }) : [empty(`No place found for “${q}”.`)]));
    } catch (err) {
      console.warn("station: geocode", err);
      out.replaceChildren(empty("Place search is unavailable right now."));
    }
  });

  $("place-geo").addEventListener("click", () => {
    const out = $("place-results");
    if (!navigator.geolocation) { out.replaceChildren(empty("This browser can’t share a location. Search for a city instead.")); return; }
    out.replaceChildren(empty("Waiting for your location…"));
    navigator.geolocation.getCurrentPosition(
      // Two decimals is about a kilometre: enough for weather, and no more precise than it needs to be.
      (pos) => setPlace({ name: "Your location", lat: +pos.coords.latitude.toFixed(2), lon: +pos.coords.longitude.toFixed(2) }),
      () => out.replaceChildren(empty("Couldn’t get your location. Search for a city instead.")),
      { maximumAge: 600000, timeout: 15000 });
  });

  // ------------------------------------------------------------ wiring
  $("news-q").addEventListener("input", () => { state.newsShown = NEWS_PAGE; renderNews(); });
  $("news-lang").addEventListener("change", () => { state.newsShown = NEWS_PAGE; renderNews(); });
  $("news-more").addEventListener("click", () => { state.newsShown += NEWS_PAGE; renderNews(); });

  function refresh() {
    loadData();
    loadQuakes();
    loadKp();
    loadIss();
    loadLocal();
  }
  $("st-refresh").addEventListener("click", refresh);

  tick();
  setInterval(tick, 1000);
  // Nothing is fetched until the station is about to scroll into view; the ISS only polls while it is on screen.
  setInterval(() => { if (state.visible && !document.hidden) loadIss(); }, 15000);
  setInterval(() => { if (state.visible && !document.hidden) { loadData(); loadQuakes(); loadKp(); } }, 5 * 60000);

  const start = (visible) => {
    state.visible = visible;
    if (visible && !state.started) { state.started = true; refresh(); }
  };
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => start(entries.some((e) => e.isIntersecting)), { rootMargin: "300px" }).observe(root);
  } else {
    start(true);
  }
})();
