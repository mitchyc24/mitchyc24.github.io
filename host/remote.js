// Observatory controls: edit the settings in settings.js and hand them to the TV.
// Every change is saved on this device. With a Cast session it is also sent to the TV
// over the custom channel; a ?dev preview open in this browser follows along through storage.
(() => {
  "use strict";

  const navLang = (navigator.languages || [navigator.language || "en"]).map((l) => String(l).slice(0, 2)).find((l) => OBS.LANGS[l]);
  let SET = OBS.load(navLang).settings;
  let data = null;                   // data.json, for the list of news sources
  let session = null;                // the Cast session, while connected
  let castState = "pending";         // pending | none | idle | connecting | on

  const T = (key, vars) => OBS.t(SET.lang, key, vars);
  const $ = (id) => document.getElementById(id);

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k in el && typeof v === "boolean") el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false && kid !== "") el.append(kid);
    return el;
  }

  // A pill (radio or checkbox) for the .seg groups.
  function pill(type, name, value, label, checked, disabled) {
    return h("label", null,
      h("input", { type, name, value, id: `${name}-${value}`, checked, disabled }),
      h("span", null, label));
  }
  // A row with a native control, a name and a line of detail.
  function row(type, name, value, label, meta, checked, disabled, quiet) {
    return h("label", { class: "row" },
      h("input", { type, name, value, id: `${name}-${value}`, checked, disabled }),
      h("span", { class: "name" }, label),
      meta && h("span", { class: quiet ? "meta quiet" : "meta" }, meta));
  }

  function regionName(code) {
    if (!code) return null;
    try { return new Intl.DisplayNames([OBS.LANGS[SET.lang].locale], { type: "region" }).of(code); } catch { return code; }
  }

  // ------------------------------------------------------------ render
  function render() {
    const focused = document.activeElement && document.activeElement.id;
    document.documentElement.lang = SET.lang;
    document.title = T("ui.title");
    for (const el of document.querySelectorAll("[data-t]")) el.textContent = T(el.dataset.t);

    $("langs").replaceChildren(...Object.entries(OBS.LANGS).map(([code, l]) =>
      pill("radio", "lang", code, l.name, SET.lang === code)));

    $("newsLangs").replaceChildren(...Object.entries(OBS.LANGS).map(([code, l]) =>
      pill("checkbox", "newsLang", code, l.name, SET.news.langs.includes(code))));
    $("regions").replaceChildren(
      pill("radio", "region", "", T("ui.news.local.off"), !SET.news.region),
      ...OBS.REGIONS.map((r) => pill("radio", "region", r, T("region." + r), SET.news.region === r)));
    $("shareSet").disabled = !SET.news.region;
    $("shares").replaceChildren(...OBS.LOCAL_SHARES.map((p) =>
      pill("radio", "share", String(p), `${p} %`.replace(" ", SET.lang === "en" ? "" : " "), SET.news.local === p)));
    renderSources();

    const n = SET.stats.length, full = n >= OBS.MAX_STATS;
    $("statCount").textContent = T("ui.stats.count", { n, max: OBS.MAX_STATS });
    $("statCount").classList.toggle("full", full);
    $("statHelp").textContent = full ? T("ui.stats.full", { max: OBS.MAX_STATS }) : "";
    $("stats").replaceChildren(...OBS.STATS.map((id) => {
      const on = SET.stats.includes(id);
      return row("checkbox", "stat", id, T("name." + id), T("desc." + id), on, full && !on);
    }));

    $("themes").replaceChildren(...OBS.THEMES.map((th) =>
      row("radio", "theme", th, T("ui.theme." + th), th === "auto" ? T("ui.theme.auto.help") : null, SET.theme === th)));

    renderCast();
    if (focused && $(focused)) $(focused).focus({ preventScroll: true });
  }

  function renderSources() {
    const box = $("sources");
    const list = data && data.news && Array.isArray(data.news.sources) ? data.news.sources : null;
    if (!list) { box.replaceChildren(h("p", { class: "note" }, T("ui.news.pending"))); return; }

    const langs = SET.news.langs, scope = OBS.regionScope(SET.news.region), many = langs.length > 1;
    const sourceRow = (s) => {
      const meta = [many && s.lang.toUpperCase(), T("kind." + s.kind), s.kind === "un" ? null : regionName(s.country),
        s.n ? T("ui.news.count", { n: s.n }) : T("ui.news.empty")].filter(Boolean).join(" · ");
      return row("checkbox", "source", s.id, s.name, meta, OBS.sourceOn(SET, s), false, !s.n);
    };
    const world = list.filter((s) => !s.region && langs.includes(s.lang));
    const local = list.filter((s) => s.region && scope.includes(s.region) && langs.includes(s.lang));

    const out = [h("p", { class: "group-label" }, T("ui.news.world")), h("div", { class: "rows" }, world.map(sourceRow))];
    if (SET.news.region) {
      out.push(h("p", { class: "group-label" }, `${T("ui.news.localgroup")} · ${T("region." + SET.news.region)}`));
      out.push(local.length ? h("div", { class: "rows" }, local.map(sourceRow)) : h("p", { class: "note" }, T("ui.news.nolocal")));
    }
    box.replaceChildren(...out);
  }

  function renderCast() {
    const el = $("castStatus");
    el.dataset.state = castState;
    el.textContent =
      castState === "on" ? T("ui.cast.on", { device: deviceName() }) :
      castState === "connecting" ? T("ui.cast.connecting") :
      castState === "idle" ? T("ui.cast.idle") :
      castState === "none" ? T("ui.cast.none") : "";
  }
  function deviceName() {
    try { return session.getCastDevice().friendlyName || "TV"; } catch { return "TV"; }
  }

  let toastTimer = 0;
  function toast(text) {
    const el = $("toast");
    el.textContent = text; el.classList.add("on");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("on"), 1600);
  }

  // ------------------------------------------------------------ changes
  function update(mutate) {
    const next = JSON.parse(JSON.stringify(SET));
    mutate(next);
    SET = OBS.normalize(next);
    OBS.save(SET);
    render();
    send();
  }

  function send() {
    if (!session) { toast(T("ui.saved")); return; }
    session.sendMessage(OBS.NS, { type: "settings", settings: SET })
      .then(() => toast(T("ui.sent")), (err) => { console.warn("cast send", err); toast(T("ui.saved")); });
  }

  $("main").addEventListener("change", (e) => {
    const input = e.target;
    const { name, value, checked } = input;
    if (name === "lang") update((s) => {
      // Headlines follow the language switch unless several were picked on purpose.
      if (s.news.langs.length === 1 && s.news.langs[0] === s.lang) s.news.langs = [value];
      s.lang = value;
    });
    else if (name === "newsLang") {
      if (!checked && SET.news.langs.length === 1) { input.checked = true; return; }   // keep at least one
      update((s) => { s.news.langs = checked ? [...s.news.langs, value] : s.news.langs.filter((l) => l !== value); });
    }
    else if (name === "region") update((s) => { s.news.region = value; });
    else if (name === "share") update((s) => { s.news.local = Number(value); });
    else if (name === "source") update((s) => { s.news.sources[value] = checked; });
    else if (name === "stat") {
      if (checked && SET.stats.length >= OBS.MAX_STATS) { input.checked = false; return; }
      update((s) => { s.stats = checked ? [...s.stats, value] : s.stats.filter((x) => x !== value); });
    }
    else if (name === "theme") update((s) => { s.theme = value; });
  });

  // Another tab (or a second controls page) changed the settings.
  addEventListener("storage", (e) => {
    if (e.key !== OBS.KEY || !e.newValue) return;
    try { SET = OBS.normalize(JSON.parse(e.newValue)); render(); } catch { /* ignore */ }
  });

  // ------------------------------------------------------------ Cast
  // Chrome on Android and desktop has the Cast sender; other browsers call back with false.
  window.__onGCastApiAvailable = (ok) => {
    if (!ok || !window.cast || !cast.framework) { castState = "none"; renderCast(); return; }
    const ctx = cast.framework.CastContext.getInstance();
    ctx.setOptions({ receiverApplicationId: OBS.APP_ID, autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED });
    ctx.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, (e) => {
      const st = cast.framework.SessionState;
      if (e.sessionState === st.SESSION_STARTED || e.sessionState === st.SESSION_RESUMED) attach(ctx.getCurrentSession());
      else if (e.sessionState === st.SESSION_STARTING) { castState = "connecting"; renderCast(); }
      else if (e.sessionState === st.SESSION_ENDED || e.sessionState === st.SESSION_START_FAILED) { session = null; castState = "idle"; renderCast(); }
    });
    $("castbtn").hidden = false;
    castState = "idle";
    const current = ctx.getCurrentSession();
    if (current) attach(current); else renderCast();
  };
  setTimeout(() => { if (castState === "pending") { castState = "none"; renderCast(); } }, 8000);

  function attach(s) {
    if (!s || s === session) return;
    session = s; castState = "on"; renderCast();
    s.addMessageListener(OBS.NS, (ns, raw) => {
      let m; try { m = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return; }
      if (!m || m.type !== "state") return;
      if (m.stored) {                       // the TV has been set up: show what it is showing
        SET = OBS.normalize(m.settings); OBS.save(SET); render();
      } else {                              // a TV with no settings yet takes this phone's
        send();
      }
    });
    s.sendMessage(OBS.NS, { type: "hello" }).catch((err) => console.warn("cast hello", err));
  }

  // ------------------------------------------------------------ boot
  render();
  fetch("data/data.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { data = d; renderSources(); })
    .catch(() => { /* the source list says it is pending */ });
})();
