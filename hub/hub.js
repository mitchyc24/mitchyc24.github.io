// miApps hub: reads apps.json and renders the launcher. No build step, no dependencies.
(() => {
  "use strict";

  const REGISTRY = "apps.json";
  const RECENT_KEY = "miapps.recent";
  const RECENT_MIN_APPS = 6;   // the "Recently opened" row only earns its space once the grid is long
  const PLATFORMS = { phone: "Phone", tablet: "Tablet", desktop: "Desktop", tv: "TV" };
  const BADGES = { beta: "Beta", prototype: "Prototype", archived: "Archived" };
  const ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    code: '<path d="m9 8-5 4 5 4M15 8l5 4-5 4"/>',
    arrow: '<path d="M7 17 17 7M9 7h8v8"/>',
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    q: $("q"), chips: $("chips"), grid: $("grid"), status: $("status"), count: $("count"),
    request: $("request"), recentWrap: $("recent-wrap"), recent: $("recent"),
    archiveWrap: $("archive-wrap"), archive: $("archive"),
  };
  const state = { hub: {}, apps: [], q: "", cat: "" };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  const recentIds = () => { const v = store.get(RECENT_KEY, []); return Array.isArray(v) ? v : []; };

  // ------------------------------------------------------------ helpers
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "vars") for (const [name, val] of Object.entries(v)) el.style.setProperty(name, val);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  }

  function icon(name) {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("aria-hidden", "true");
    s.innerHTML = ICONS[name];
    return s;
  }

  const isExternal = (p) => /^https?:\/\//i.test(p);
  const launchHref = (a) => isExternal(a.path) ? a.path : a.path + (a.entry || "");
  const sourceHref = (a) => {
    const { repo, branch = "main" } = state.hub;
    return repo && !isExternal(a.path) ? `https://github.com/${repo}/tree/${branch}/${a.path}` : null;
  };

  function requestHref(name) {
    const repo = state.hub.repo || "mitchyc24/mitchyc24.github.io";
    const u = new URL(`https://github.com/${repo}/issues/new`);
    u.searchParams.set("template", "new-app.yml");
    if (name) {
      u.searchParams.set("title", `[New app]: ${name}`);
      u.searchParams.set("name", name);
    }
    return u.href;
  }

  function parseDay(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }

  function fmtDay(d) {
    const opts = { month: "short", day: "numeric" };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
    return d.toLocaleDateString(undefined, opts);
  }

  function normalize(raw) {
    if (!raw || typeof raw !== "object" || !raw.id || !raw.name || !raw.path) {
      console.warn("miApps: skipping registry entry without id/name/path", raw);
      return null;
    }
    const a = {
      ...raw,
      tagline: raw.tagline || "",
      category: raw.category || "Other",
      status: raw.status || "stable",
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      platforms: Array.isArray(raw.platforms) ? raw.platforms : [],
      links: Array.isArray(raw.links) ? raw.links.filter((l) => l && l.href && l.label) : [],
      color: /^#[0-9a-f]{3,8}$/i.test(raw.color || "") ? raw.color : null,
    };
    a._added = parseDay(a.added);
    a._updated = parseDay(a.updated) || a._added;
    a._hay = [a.name, a.id, a.tagline, a.category, ...a.tags].join(" ").toLowerCase();
    return a;
  }

  // ------------------------------------------------------------ pieces
  function tile(a) {
    const looksLikeFile = /\.(svg|png|jpe?g|webp|gif|avif)$/i.test(a.icon || "");
    return h("div", { class: "tile", "aria-hidden": "true" },
      looksLikeFile ? h("img", { src: a.icon, alt: "", loading: "lazy" }) : (a.icon || a.name.slice(0, 1)));
  }

  function card(a) {
    const meta = [a.category, ...a.platforms.map((p) => PLATFORMS[p] || p)];
    if (a._updated) meta.push(`Updated ${fmtDay(a._updated)}`);
    const src = sourceHref(a);

    return h("article", { class: "card", "data-app": a.id, vars: a.color ? { "--app": a.color } : null },
      tile(a),
      h("div", { class: "body" },
        h("div", { class: "name-row" },
          h("h3", { class: "name" }, h("a", { class: "launch", href: launchHref(a) }, a.name)),
          BADGES[a.status] && h("span", { class: "badge" }, BADGES[a.status])),
        a.tagline && h("p", { class: "tagline" }, a.tagline),
        h("p", { class: "meta" }, meta.flatMap((m, i) => [i ? " · " : null, h("span", null, m)]))),
      h("div", { class: "actions" },
        h("span", { class: "open-hint", "aria-hidden": "true" }, a.action || "Open", icon("arrow")),
        a.links.map((l) => h("a", { class: "act", href: l.href }, l.label)),
        src && h("a", { class: "src", href: src, title: "Source on GitHub", "aria-label": `${a.name} source on GitHub` }, icon("code"))));
  }

  function requestCard() {
    const name = state.q.trim();
    return h("article", { class: "card card-request" },
      h("div", { class: "tile", "aria-hidden": "true" }, icon("plus")),
      h("div", { class: "body" },
        h("div", { class: "name-row" },
          h("h3", { class: "name" }, h("a", { class: "launch", href: requestHref(name) },
            name ? `Request “${name}”` : "Request a new app"))),
        h("p", { class: "tagline" },
          "Describe it in a GitHub issue. It gets built in its own folder in this repo and shows up here.")));
  }

  function chip(label, value, n) {
    return h("button", { class: "chip", type: "button", "data-cat": value, "aria-pressed": String(state.cat === value) },
      label, h("span", { class: "n" }, String(n)));
  }

  // ------------------------------------------------------------ render
  function render() {
    const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    const filtering = terms.length > 0 || state.cat !== "";
    const match = (a) => (!state.cat || a.category === state.cat) && terms.every((t) => a._hay.includes(t));

    const live = state.apps.filter((a) => a.status !== "archived");
    const archived = state.apps.filter((a) => a.status === "archived");
    const shown = live.filter(match);
    const shownArchived = archived.filter(match);

    els.grid.replaceChildren(...shown.map(card), requestCard());
    els.archive.replaceChildren(...shownArchived.map(card));
    els.archiveWrap.hidden = shownArchived.length === 0;

    if (filtering && shown.length + shownArchived.length === 0) {
      const where = state.cat ? ` in ${state.cat}` : "";
      els.status.textContent = state.q.trim() ? `No apps match “${state.q.trim()}”${where}.` : `No apps${where} yet.`;
    } else {
      els.status.textContent = "";
    }

    for (const b of els.chips.querySelectorAll(".chip")) b.setAttribute("aria-pressed", String(b.dataset.cat === state.cat));
    els.request.href = requestHref(state.q.trim());
    renderRecent(filtering || live.length < RECENT_MIN_APPS);
  }

  function renderRecent(hide) {
    const byId = new Map(state.apps.map((a) => [a.id, a]));
    const recent = recentIds().map((id) => byId.get(id)).filter(Boolean).slice(0, 5);
    els.recentWrap.hidden = hide || recent.length === 0;
    if (els.recentWrap.hidden) return;
    els.recent.replaceChildren(...recent.map((a) =>
      h("a", { class: "pill", href: launchHref(a), "data-app": a.id, vars: a.color ? { "--app": a.color } : null }, tile(a), a.name)));
  }

  function renderChips() {
    const counts = new Map();
    for (const a of state.apps) if (a.status !== "archived") counts.set(a.category, (counts.get(a.category) || 0) + 1);
    const cats = [...counts.keys()].sort((x, y) => x.localeCompare(y));
    els.chips.hidden = cats.length < 2;
    if (els.chips.hidden) return;
    const total = [...counts.values()].reduce((s, n) => s + n, 0);
    els.chips.replaceChildren(chip("All", "", total), ...cats.map((c) => chip(c, c, counts.get(c))));
  }

  function syncUrl() {
    const u = new URL(location.href);
    state.q.trim() ? u.searchParams.set("q", state.q.trim()) : u.searchParams.delete("q");
    state.cat ? u.searchParams.set("category", state.cat) : u.searchParams.delete("category");
    history.replaceState(null, "", u);
  }

  // ------------------------------------------------------------ events
  els.q.addEventListener("input", () => { state.q = els.q.value; render(); syncUrl(); });
  els.q.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && els.q.value) { els.q.value = ""; state.q = ""; render(); syncUrl(); }
  });
  els.chips.addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    state.cat = b.dataset.cat === state.cat ? "" : b.dataset.cat;
    render(); syncUrl();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest("input, textarea, select, [contenteditable]")) return;
    e.preventDefault();
    els.q.focus();
  });
  // Remember what was opened, for the "Recently opened" row.
  document.addEventListener("click", (e) => {
    const link = e.target.closest("a");
    const host = link && link.closest("[data-app]");
    if (!host || link.classList.contains("src")) return;
    const id = host.dataset.app;
    store.set(RECENT_KEY, [id, ...recentIds().filter((x) => x !== id)].slice(0, 8));
  });

  // ------------------------------------------------------------ boot
  async function boot() {
    const params = new URLSearchParams(location.search);
    state.q = els.q.value = params.get("q") || "";
    state.cat = params.get("category") || "";

    try {
      const res = await fetch(REGISTRY, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.hub = data.hub || {};
      state.apps = (Array.isArray(data.apps) ? data.apps : []).map(normalize).filter(Boolean)
        .sort((x, y) => (y._updated || 0) - (x._updated || 0) || x.name.localeCompare(y.name));
    } catch (err) {
      console.error("miApps: could not load", REGISTRY, err);
      els.status.replaceChildren(`Couldn’t load ${REGISTRY}. `,
        location.protocol === "file:"
          ? h("span", null, "Browsers block that from a file:// page. Serve the folder instead: ", h("code", null, "python3 -m http.server"), ".")
          : "Try reloading the page.");
      els.grid.replaceChildren(requestCard());
      return;
    }

    const live = state.apps.filter((a) => a.status !== "archived").length;
    els.count.textContent = `${live} app${live === 1 ? "" : "s"}`;
    renderChips();
    render();
  }

  boot();
})();
