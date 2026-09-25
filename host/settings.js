// Observatory settings, shared by the TV page (index.html) and the phone controls (remote.html).
// A plain script that defines window.OBS. Anything that arrives over the Cast channel or out of
// storage goes through normalize() before it is used.
(function () {
  "use strict";

  const APP_ID = "FB21C379";                                     // Google Cast app; receiver URL is /host/
  const NS = "urn:x-cast:io.github.mitchyc24.observatory";       // custom message channel, JSON
  const KEY = "observatory.settings";                            // localStorage key (prefixed per AGENTS.md)
  const MAX_STATS = 8;

  const LANGS = {
    en: { name: "English", locale: "en-CA" },
    fr: { name: "Français", locale: "fr-CA" },
    es: { name: "Español", locale: "es-ES" },
    de: { name: "Deutsch", locale: "de-DE" },
  };
  // The TV shows the chosen stats in this order.
  const STATS = ["population", "births", "co2", "iss", "quakes", "kp", "aqi", "daylight",
                 "moon", "year", "clocks", "wiki", "satellites", "btc", "eth", "fx"];
  const REGIONS = ["canada", "ottawa-gatineau"];                 // keep in step with REGIONS in build_data.py
  const LOCAL_SHARES = [25, 50, 75];                             // % of headlines that are local
  const THEMES = ["auto", "light", "dark"];

  const DEFAULTS = {
    lang: "en",
    news: { langs: ["en"], region: "ottawa-gatineau", local: 25, sources: {} },
    stats: ["population", "births", "co2", "iss", "quakes", "kp", "btc"],
    theme: "auto",
  };

  function defaults(lang) {
    const d = JSON.parse(JSON.stringify(DEFAULTS));
    if (LANGS[lang]) { d.lang = lang; d.news.langs = [lang]; }
    return d;
  }

  function normalize(raw) {
    const r = raw && typeof raw === "object" ? raw : {};
    const lang = LANGS[r.lang] ? r.lang : DEFAULTS.lang;
    const d = defaults(lang);
    const n = r.news && typeof r.news === "object" ? r.news : {};

    let langs = Array.isArray(n.langs) ? n.langs.filter((l, i, a) => LANGS[l] && a.indexOf(l) === i) : d.news.langs;
    if (!langs.length) langs = [lang];

    const sources = {};
    if (n.sources && typeof n.sources === "object") {
      for (const [id, on] of Object.entries(n.sources).slice(0, 200)) {
        if (/^[a-z0-9-]{1,40}$/.test(id) && typeof on === "boolean") sources[id] = on;
      }
    }

    const picked = Array.isArray(r.stats) ? r.stats : d.stats;
    const stats = STATS.filter((s) => picked.includes(s)).slice(0, MAX_STATS);

    return {
      lang,
      news: {
        langs,
        region: n.region === "" || REGIONS.includes(n.region) ? n.region : d.news.region,
        local: LOCAL_SHARES.includes(n.local) ? n.local : d.news.local,
        sources,
      },
      stats,
      theme: THEMES.includes(r.theme) ? r.theme : d.theme,
    };
  }

  // Returns { settings, stored } — stored is false when nothing was saved yet.
  function load(fallbackLang) {
    try {
      const v = localStorage.getItem(KEY);
      if (v) return { settings: normalize(JSON.parse(v)), stored: true };
    } catch { /* private mode, bad JSON */ }
    return { settings: defaults(fallbackLang), stored: false };
  }

  function save(settings) {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* full or blocked */ }
  }

  // A source is on unless the settings say otherwise; sources marked default:false start off.
  function sourceOn(settings, src) {
    const o = settings.news.sources[src.id];
    return typeof o === "boolean" ? o : src.default !== false;
  }

  // Region ids a setting covers: Ottawa–Gatineau includes national Canadian news too.
  const REGION_PARENTS = { "ottawa-gatineau": "canada" };
  function regionScope(region) {
    const out = [];
    for (let r = region; r; r = REGION_PARENTS[r]) out.push(r);
    return out;
  }

  // ---------------------------------------------------------------- strings
  // {name} placeholders are filled by t(). Keys missing in a language fall back to English.
  const STR = {
    en: {
      "est": "est.",
      "stat.population.l": "people on Earth",
      "stat.births.l": "born today", "stat.births.died": "{n} died",
      "stat.co2.l": "CO₂ emitted today",
      "stat.iss.l": "ISS altitude", "stat.iss.daylight": "in sunlight", "stat.iss.eclipsed": "in Earth’s shadow",
      "stat.quakes.l": "earthquakes M2.5+ in 24 h", "stat.quakes.largest": "largest M{m} {place}",
      "stat.kp.l": "geomagnetic index", "stat.kp.storm": "storm", "stat.kp.active": "active", "stat.kp.wind": "solar wind {v} km/s",
      "stat.aqi.l": "air quality in {home}",
      "aqi.0": "good", "aqi.1": "moderate", "aqi.2": "poor for sensitive groups", "aqi.3": "unhealthy", "aqi.4": "very unhealthy", "aqi.5": "hazardous",
      "stat.daylight.l": "of daylight in {home}", "stat.daylight.delta": "{d} min vs yesterday",
      "stat.moon.lit": "of the Moon lit",
      "moon.0": "new moon", "moon.1": "waxing crescent", "moon.2": "first quarter", "moon.3": "waxing gibbous",
      "moon.4": "full moon", "moon.5": "waning gibbous", "moon.6": "last quarter", "moon.7": "waning crescent",
      "stat.year.l": "of {year} gone", "stat.year.day": "day {d} of {n}",
      "city.tokyo": "Tokyo", "city.london": "London", "city.delhi": "New Delhi",
      "stat.wiki.l": "Wikipedia edits per minute", "stat.wiki.all": "all languages",
      "stat.satellites.l": "satellites in the GEO belt", "stat.satellites.src": "positions from CelesTrak",
      "stat.btc.l": "bitcoin", "stat.eth.l": "ether", "stat.fx.l": "1 US dollar",

      "wx.clear": "clear", "wx.mostlyclear": "mostly clear", "wx.partly": "partly cloudy", "wx.overcast": "overcast",
      "wx.fog": "fog", "wx.rimefog": "freezing fog", "wx.drizzle1": "light drizzle", "wx.drizzle": "drizzle",
      "wx.drizzle3": "heavy drizzle", "wx.fdrizzle": "freezing drizzle", "wx.rain1": "light rain", "wx.rain": "rain",
      "wx.rain3": "heavy rain", "wx.frain": "freezing rain", "wx.snow1": "light snow", "wx.snow": "snow",
      "wx.snow3": "heavy snow", "wx.grains": "snow grains", "wx.showers": "showers", "wx.showers3": "heavy showers",
      "wx.snowshowers": "snow showers", "wx.storm": "thunderstorm", "wx.hail": "thunderstorm with hail",
      "wx.line": "{cond} · feels {feels}° · {min}° / {max}° · wind {wind} km/h",
      "wx.sunrise": "sunrise", "wx.sunset": "sunset",
      "foot.news": "news {n} min ago", "foot.geo": "{n} satellites in the GEO belt · not to scale",
      "foot.stale": "stale: {list}", "foot.waiting": "waiting for data",
      "qr": "scan to<br>take the controls",

      "ui.title": "Observatory controls",
      "ui.cast.idle": "Not on a TV yet. Tap the Cast icon to put the Observatory on one.",
      "ui.cast.connecting": "Connecting…",
      "ui.cast.on": "On {device}. Changes show up right away.",
      "ui.cast.none": "This browser can’t reach a TV. Open this page in Chrome on Android or a computer to control one. Your choices are still saved here.",
      "ui.saved": "Saved", "ui.sent": "Sent to the TV",
      "ui.language": "Language", "ui.language.help": "For the screen and for this page.",
      "ui.news": "News",
      "ui.news.langs": "Headline languages", "ui.news.langs.help": "Pick one or more.",
      "ui.news.local": "Local news", "ui.news.local.off": "Off",
      "ui.news.share": "Share of local headlines",
      "ui.news.sources": "Sources",
      "ui.news.world": "World", "ui.news.localgroup": "Local",
      "ui.news.how": "World headlines come from news agencies and public broadcasters in several countries. The screen takes turns between outlets so none of them dominates, and every headline names its source.",
      "ui.news.count": "{n} headlines", "ui.news.empty": "nothing right now",
      "ui.news.nolocal": "No local sources in the languages you picked.",
      "ui.news.pending": "The list of sources appears after the next data update.",
      "kind.wire": "news agency", "kind.public": "public broadcaster", "kind.state": "state-funded",
      "kind.un": "United Nations", "kind.aggregator": "many outlets, unvetted",
      "ui.stats": "Stats", "ui.stats.count": "{n} of {max} on",
      "ui.stats.full": "That’s {max}. Turn one off to pick another.",
      "ui.display": "Display", "ui.theme": "Theme",
      "ui.theme.auto": "Day and night", "ui.theme.auto.help": "Light from sunrise to sunset at home, dark otherwise.",
      "ui.theme.light": "Always light", "ui.theme.dark": "Always dark",
      "ui.preview": "Preview in this browser", "ui.home": "miApps",
      "region.canada": "Canada", "region.ottawa-gatineau": "Ottawa–Gatineau",
      "name.population": "People on Earth", "desc.population": "Estimated world population, counting up.",
      "name.births": "Births and deaths today", "desc.births": "Estimated, since midnight UTC.",
      "name.co2": "CO₂ emitted today", "desc.co2": "Fossil CO₂ since midnight UTC, estimated.",
      "name.iss": "Space station", "desc.iss": "ISS altitude and speed, live.",
      "name.quakes": "Earthquakes", "desc.quakes": "M2.5 and up in the last 24 hours, from USGS.",
      "name.kp": "Space weather", "desc.kp": "Geomagnetic Kp index and solar wind, from NOAA.",
      "name.aqi": "Air quality", "desc.aqi": "US AQI and PM2.5 at home.",
      "name.daylight": "Daylight", "desc.daylight": "Hours of daylight at home, and the change since yesterday.",
      "name.moon": "Moon phase", "desc.moon": "The phase, and how much of the Moon is lit.",
      "name.year": "Year progress", "desc.year": "How much of the year has gone.",
      "name.clocks": "World clocks", "desc.clocks": "Tokyo, London and New Delhi.",
      "name.wiki": "Wikipedia edits", "desc.wiki": "Edits per minute across every language, live.",
      "name.satellites": "Geostationary satellites", "desc.satellites": "How many CelesTrak tracks in the GEO belt.",
      "name.btc": "Bitcoin", "desc.btc": "Price in CAD and the 24-hour change.",
      "name.eth": "Ether", "desc.eth": "Price in USD and the 24-hour change.",
      "name.fx": "US dollar", "desc.fx": "Against the Canadian dollar, euro, pound and yen.",
    },

    fr: {
      "est": "estim.",
      "stat.population.l": "personnes sur Terre",
      "stat.births.l": "naissances aujourd’hui", "stat.births.died": "{n} décès",
      "stat.co2.l": "CO₂ émis aujourd’hui",
      "stat.iss.l": "altitude de l’ISS", "stat.iss.daylight": "au soleil", "stat.iss.eclipsed": "dans l’ombre de la Terre",
      "stat.quakes.l": "séismes M2,5+ en 24 h", "stat.quakes.largest": "le plus fort M{m} {place}",
      "stat.kp.l": "indice géomagnétique", "stat.kp.storm": "tempête", "stat.kp.active": "actif", "stat.kp.wind": "vent solaire {v} km/s",
      "stat.aqi.l": "qualité de l’air à {home}",
      "aqi.0": "bonne", "aqi.1": "moyenne", "aqi.2": "mauvaise pour les personnes sensibles", "aqi.3": "mauvaise", "aqi.4": "très mauvaise", "aqi.5": "dangereuse",
      "stat.daylight.l": "de clarté à {home}", "stat.daylight.delta": "{d} min depuis hier",
      "stat.moon.lit": "de la Lune éclairée",
      "moon.0": "nouvelle lune", "moon.1": "premier croissant", "moon.2": "premier quartier", "moon.3": "gibbeuse croissante",
      "moon.4": "pleine lune", "moon.5": "gibbeuse décroissante", "moon.6": "dernier quartier", "moon.7": "dernier croissant",
      "stat.year.l": "de {year} écoulé", "stat.year.day": "jour {d} sur {n}",
      "city.tokyo": "Tokyo", "city.london": "Londres", "city.delhi": "New Delhi",
      "stat.wiki.l": "modifications Wikipédia par minute", "stat.wiki.all": "toutes langues",
      "stat.satellites.l": "satellites géostationnaires", "stat.satellites.src": "positions CelesTrak",
      "stat.btc.l": "bitcoin", "stat.eth.l": "ether", "stat.fx.l": "1 dollar américain",

      "wx.clear": "dégagé", "wx.mostlyclear": "plutôt dégagé", "wx.partly": "partiellement nuageux", "wx.overcast": "couvert",
      "wx.fog": "brouillard", "wx.rimefog": "brouillard givrant", "wx.drizzle1": "bruine légère", "wx.drizzle": "bruine",
      "wx.drizzle3": "forte bruine", "wx.fdrizzle": "bruine verglaçante", "wx.rain1": "pluie légère", "wx.rain": "pluie",
      "wx.rain3": "forte pluie", "wx.frain": "pluie verglaçante", "wx.snow1": "neige légère", "wx.snow": "neige",
      "wx.snow3": "forte neige", "wx.grains": "neige en grains", "wx.showers": "averses", "wx.showers3": "fortes averses",
      "wx.snowshowers": "averses de neige", "wx.storm": "orage", "wx.hail": "orage avec grêle",
      "wx.line": "{cond} · ressenti {feels}° · {min}° / {max}° · vent {wind} km/h",
      "wx.sunrise": "lever", "wx.sunset": "coucher",
      "foot.news": "actualités il y a {n} min", "foot.geo": "{n} satellites géostationnaires · pas à l’échelle",
      "foot.stale": "en retard : {list}", "foot.waiting": "en attente des données",
      "qr": "scannez pour<br>prendre les commandes",

      "ui.title": "Commandes d’Observatory",
      "ui.cast.idle": "Pas encore sur une télé. Touchez l’icône Cast pour y afficher Observatory.",
      "ui.cast.connecting": "Connexion…",
      "ui.cast.on": "Sur {device}. Les changements s’affichent tout de suite.",
      "ui.cast.none": "Ce navigateur ne peut pas joindre de télé. Ouvrez cette page dans Chrome sur Android ou sur un ordinateur pour en commander une. Vos choix sont quand même enregistrés ici.",
      "ui.saved": "Enregistré", "ui.sent": "Envoyé à la télé",
      "ui.language": "Langue", "ui.language.help": "Pour l’écran et pour cette page.",
      "ui.news": "Actualités",
      "ui.news.langs": "Langues des titres", "ui.news.langs.help": "Choisissez-en une ou plusieurs.",
      "ui.news.local": "Nouvelles locales", "ui.news.local.off": "Désactivées",
      "ui.news.share": "Part des titres locaux",
      "ui.news.sources": "Sources",
      "ui.news.world": "Monde", "ui.news.localgroup": "Local",
      "ui.news.how": "Les titres du monde viennent d’agences de presse et de médias publics de plusieurs pays. L’écran alterne entre eux pour qu’aucun ne domine, et chaque titre indique sa source.",
      "ui.news.count": "{n} titres", "ui.news.empty": "rien pour l’instant",
      "ui.news.nolocal": "Aucune source locale dans les langues choisies.",
      "ui.news.pending": "La liste des sources apparaîtra à la prochaine mise à jour des données.",
      "kind.wire": "agence de presse", "kind.public": "média public", "kind.state": "financé par l’État",
      "kind.un": "Nations unies", "kind.aggregator": "nombreux médias, non vérifiés",
      "ui.stats": "Statistiques", "ui.stats.count": "{n} sur {max} activées",
      "ui.stats.full": "C’est le maximum de {max}. Désactivez-en une pour en choisir une autre.",
      "ui.display": "Affichage", "ui.theme": "Thème",
      "ui.theme.auto": "Jour et nuit", "ui.theme.auto.help": "Clair du lever au coucher du soleil à la maison, sombre le reste du temps.",
      "ui.theme.light": "Toujours clair", "ui.theme.dark": "Toujours sombre",
      "ui.preview": "Aperçu dans ce navigateur", "ui.home": "miApps",
      "region.canada": "Canada", "region.ottawa-gatineau": "Ottawa–Gatineau",
      "name.population": "Population mondiale", "desc.population": "Estimation qui augmente en temps réel.",
      "name.births": "Naissances et décès aujourd’hui", "desc.births": "Estimation depuis minuit UTC.",
      "name.co2": "CO₂ émis aujourd’hui", "desc.co2": "CO₂ fossile depuis minuit UTC, estimation.",
      "name.iss": "Station spatiale", "desc.iss": "Altitude et vitesse de l’ISS, en direct.",
      "name.quakes": "Séismes", "desc.quakes": "Magnitude 2,5 et plus, dernières 24 heures, selon l’USGS.",
      "name.kp": "Météo spatiale", "desc.kp": "Indice géomagnétique Kp et vent solaire, selon la NOAA.",
      "name.aqi": "Qualité de l’air", "desc.aqi": "Indice américain (AQI) et PM2,5 à la maison.",
      "name.daylight": "Durée du jour", "desc.daylight": "Heures de clarté à la maison et variation depuis hier.",
      "name.moon": "Phase de la Lune", "desc.moon": "La phase et la part éclairée.",
      "name.year": "Avancement de l’année", "desc.year": "La part de l’année déjà écoulée.",
      "name.clocks": "Horloges du monde", "desc.clocks": "Tokyo, Londres et New Delhi.",
      "name.wiki": "Modifications Wikipédia", "desc.wiki": "Par minute, toutes langues confondues, en direct.",
      "name.satellites": "Satellites géostationnaires", "desc.satellites": "Le nombre suivi par CelesTrak.",
      "name.btc": "Bitcoin", "desc.btc": "Prix en CAD et variation sur 24 heures.",
      "name.eth": "Ether", "desc.eth": "Prix en USD et variation sur 24 heures.",
      "name.fx": "Dollar américain", "desc.fx": "Face au dollar canadien, à l’euro, à la livre et au yen.",
    },

    es: {
      "est": "estim.",
      "stat.population.l": "personas en la Tierra",
      "stat.births.l": "nacimientos hoy", "stat.births.died": "{n} muertes",
      "stat.co2.l": "CO₂ emitido hoy",
      "stat.iss.l": "altitud de la EEI", "stat.iss.daylight": "al sol", "stat.iss.eclipsed": "en la sombra de la Tierra",
      "stat.quakes.l": "sismos M2,5+ en 24 h", "stat.quakes.largest": "el mayor M{m} {place}",
      "stat.kp.l": "índice geomagnético", "stat.kp.storm": "tormenta", "stat.kp.active": "activo", "stat.kp.wind": "viento solar {v} km/s",
      "stat.aqi.l": "calidad del aire en {home}",
      "aqi.0": "buena", "aqi.1": "moderada", "aqi.2": "mala para grupos sensibles", "aqi.3": "mala", "aqi.4": "muy mala", "aqi.5": "peligrosa",
      "stat.daylight.l": "de luz en {home}", "stat.daylight.delta": "{d} min respecto a ayer",
      "stat.moon.lit": "de la Luna iluminada",
      "moon.0": "luna nueva", "moon.1": "luna creciente", "moon.2": "cuarto creciente", "moon.3": "gibosa creciente",
      "moon.4": "luna llena", "moon.5": "gibosa menguante", "moon.6": "cuarto menguante", "moon.7": "luna menguante",
      "stat.year.l": "de {year} transcurrido", "stat.year.day": "día {d} de {n}",
      "city.tokyo": "Tokio", "city.london": "Londres", "city.delhi": "Nueva Delhi",
      "stat.wiki.l": "ediciones de Wikipedia por minuto", "stat.wiki.all": "todos los idiomas",
      "stat.satellites.l": "satélites geoestacionarios", "stat.satellites.src": "posiciones de CelesTrak",
      "stat.btc.l": "bitcoin", "stat.eth.l": "ether", "stat.fx.l": "1 dólar estadounidense",

      "wx.clear": "despejado", "wx.mostlyclear": "mayormente despejado", "wx.partly": "parcialmente nublado", "wx.overcast": "cubierto",
      "wx.fog": "niebla", "wx.rimefog": "niebla helada", "wx.drizzle1": "llovizna ligera", "wx.drizzle": "llovizna",
      "wx.drizzle3": "llovizna intensa", "wx.fdrizzle": "llovizna helada", "wx.rain1": "lluvia ligera", "wx.rain": "lluvia",
      "wx.rain3": "lluvia intensa", "wx.frain": "lluvia helada", "wx.snow1": "nevada ligera", "wx.snow": "nieve",
      "wx.snow3": "nevada intensa", "wx.grains": "granos de nieve", "wx.showers": "chubascos", "wx.showers3": "chubascos intensos",
      "wx.snowshowers": "chubascos de nieve", "wx.storm": "tormenta", "wx.hail": "tormenta con granizo",
      "wx.line": "{cond} · sensación {feels}° · {min}° / {max}° · viento {wind} km/h",
      "wx.sunrise": "amanecer", "wx.sunset": "atardecer",
      "foot.news": "noticias de hace {n} min", "foot.geo": "{n} satélites geoestacionarios · no a escala",
      "foot.stale": "desactualizado: {list}", "foot.waiting": "esperando datos",
      "qr": "escanea para<br>tomar el control",

      "ui.title": "Controles de Observatory",
      "ui.cast.idle": "Todavía no está en una tele. Toca el icono de Cast para mostrar Observatory.",
      "ui.cast.connecting": "Conectando…",
      "ui.cast.on": "En {device}. Los cambios se ven al instante.",
      "ui.cast.none": "Este navegador no puede conectar con una tele. Abre esta página en Chrome en Android o en un ordenador para controlarla. Tus elecciones se guardan aquí de todos modos.",
      "ui.saved": "Guardado", "ui.sent": "Enviado a la tele",
      "ui.language": "Idioma", "ui.language.help": "Para la pantalla y para esta página.",
      "ui.news": "Noticias",
      "ui.news.langs": "Idiomas de los titulares", "ui.news.langs.help": "Elige uno o varios.",
      "ui.news.local": "Noticias locales", "ui.news.local.off": "Desactivadas",
      "ui.news.share": "Proporción de titulares locales",
      "ui.news.sources": "Fuentes",
      "ui.news.world": "Mundo", "ui.news.localgroup": "Local",
      "ui.news.how": "Los titulares del mundo vienen de agencias de noticias y medios públicos de varios países. La pantalla va alternando entre ellos para que ninguno domine, y cada titular indica su fuente.",
      "ui.news.count": "{n} titulares", "ui.news.empty": "nada por ahora",
      "ui.news.nolocal": "No hay fuentes locales en los idiomas elegidos.",
      "ui.news.pending": "La lista de fuentes aparecerá en la próxima actualización de datos.",
      "kind.wire": "agencia de noticias", "kind.public": "medio público", "kind.state": "financiado por el Estado",
      "kind.un": "Naciones Unidas", "kind.aggregator": "muchos medios, sin verificar",
      "ui.stats": "Estadísticas", "ui.stats.count": "{n} de {max} activadas",
      "ui.stats.full": "Ya hay {max}. Desactiva una para elegir otra.",
      "ui.display": "Pantalla", "ui.theme": "Tema",
      "ui.theme.auto": "Día y noche", "ui.theme.auto.help": "Claro desde el amanecer hasta el atardecer en casa y oscuro el resto del tiempo.",
      "ui.theme.light": "Siempre claro", "ui.theme.dark": "Siempre oscuro",
      "ui.preview": "Vista previa en este navegador", "ui.home": "miApps",
      "region.canada": "Canadá", "region.ottawa-gatineau": "Ottawa–Gatineau",
      "name.population": "Población mundial", "desc.population": "Estimación que sube en tiempo real.",
      "name.births": "Nacimientos y muertes hoy", "desc.births": "Estimación desde la medianoche UTC.",
      "name.co2": "CO₂ emitido hoy", "desc.co2": "CO₂ fósil desde la medianoche UTC, estimación.",
      "name.iss": "Estación espacial", "desc.iss": "Altitud y velocidad de la EEI, en vivo.",
      "name.quakes": "Sismos", "desc.quakes": "Magnitud 2,5 o más en las últimas 24 horas, según el USGS.",
      "name.kp": "Clima espacial", "desc.kp": "Índice geomagnético Kp y viento solar, según la NOAA.",
      "name.aqi": "Calidad del aire", "desc.aqi": "Índice estadounidense (AQI) y PM2,5 en casa.",
      "name.daylight": "Horas de luz", "desc.daylight": "Horas de luz en casa y el cambio desde ayer.",
      "name.moon": "Fase lunar", "desc.moon": "La fase y cuánto de la Luna está iluminado.",
      "name.year": "Progreso del año", "desc.year": "Cuánto del año ha pasado.",
      "name.clocks": "Relojes del mundo", "desc.clocks": "Tokio, Londres y Nueva Delhi.",
      "name.wiki": "Ediciones de Wikipedia", "desc.wiki": "Por minuto, en todos los idiomas, en vivo.",
      "name.satellites": "Satélites geoestacionarios", "desc.satellites": "Cuántos sigue CelesTrak en la órbita geoestacionaria.",
      "name.btc": "Bitcoin", "desc.btc": "Precio en CAD y cambio en 24 horas.",
      "name.eth": "Ether", "desc.eth": "Precio en USD y cambio en 24 horas.",
      "name.fx": "Dólar estadounidense", "desc.fx": "Frente al dólar canadiense, el euro, la libra y el yen.",
    },

    de: {
      "est": "geschätzt",
      "stat.population.l": "Menschen auf der Erde",
      "stat.births.l": "Geburten heute", "stat.births.died": "{n} Todesfälle",
      "stat.co2.l": "CO₂-Ausstoß heute",
      "stat.iss.l": "Höhe der ISS", "stat.iss.daylight": "im Sonnenlicht", "stat.iss.eclipsed": "im Erdschatten",
      "stat.quakes.l": "Erdbeben M2,5+ in 24 h", "stat.quakes.largest": "stärkstes M{m} {place}",
      "stat.kp.l": "geomagnetischer Index", "stat.kp.storm": "Sturm", "stat.kp.active": "aktiv", "stat.kp.wind": "Sonnenwind {v} km/s",
      "stat.aqi.l": "Luftqualität in {home}",
      "aqi.0": "gut", "aqi.1": "mäßig", "aqi.2": "schlecht für Empfindliche", "aqi.3": "ungesund", "aqi.4": "sehr ungesund", "aqi.5": "gefährlich",
      "stat.daylight.l": "Tageslicht in {home}", "stat.daylight.delta": "{d} Min. gegenüber gestern",
      "stat.moon.lit": "des Mondes beleuchtet",
      "moon.0": "Neumond", "moon.1": "zunehmende Sichel", "moon.2": "erstes Viertel", "moon.3": "zunehmender Mond",
      "moon.4": "Vollmond", "moon.5": "abnehmender Mond", "moon.6": "letztes Viertel", "moon.7": "abnehmende Sichel",
      "stat.year.l": "von {year} vergangen", "stat.year.day": "Tag {d} von {n}",
      "city.tokyo": "Tokio", "city.london": "London", "city.delhi": "Neu-Delhi",
      "stat.wiki.l": "Wikipedia-Bearbeitungen pro Minute", "stat.wiki.all": "alle Sprachen",
      "stat.satellites.l": "geostationäre Satelliten", "stat.satellites.src": "Positionen von CelesTrak",
      "stat.btc.l": "Bitcoin", "stat.eth.l": "Ether", "stat.fx.l": "1 US-Dollar",

      "wx.clear": "klar", "wx.mostlyclear": "überwiegend klar", "wx.partly": "teilweise bewölkt", "wx.overcast": "bedeckt",
      "wx.fog": "Nebel", "wx.rimefog": "gefrierender Nebel", "wx.drizzle1": "leichter Nieselregen", "wx.drizzle": "Nieselregen",
      "wx.drizzle3": "starker Nieselregen", "wx.fdrizzle": "gefrierender Nieselregen", "wx.rain1": "leichter Regen", "wx.rain": "Regen",
      "wx.rain3": "starker Regen", "wx.frain": "gefrierender Regen", "wx.snow1": "leichter Schneefall", "wx.snow": "Schneefall",
      "wx.snow3": "starker Schneefall", "wx.grains": "Schneegriesel", "wx.showers": "Regenschauer", "wx.showers3": "starke Regenschauer",
      "wx.snowshowers": "Schneeschauer", "wx.storm": "Gewitter", "wx.hail": "Gewitter mit Hagel",
      "wx.line": "{cond} · gefühlt {feels}° · {min}° / {max}° · Wind {wind} km/h",
      "wx.sunrise": "Sonnenaufgang", "wx.sunset": "Sonnenuntergang",
      "foot.news": "Nachrichten von vor {n} Min.", "foot.geo": "{n} geostationäre Satelliten · nicht maßstabsgetreu",
      "foot.stale": "veraltet: {list}", "foot.waiting": "warte auf Daten",
      "qr": "scannen, um<br>zu steuern",

      "ui.title": "Observatory-Steuerung",
      "ui.cast.idle": "Noch auf keinem Fernseher. Tippe auf das Cast-Symbol, um Observatory dort zu zeigen.",
      "ui.cast.connecting": "Verbinde…",
      "ui.cast.on": "Auf {device}. Änderungen erscheinen sofort.",
      "ui.cast.none": "Dieser Browser erreicht keinen Fernseher. Öffne die Seite in Chrome auf Android oder am Computer, um einen zu steuern. Deine Auswahl wird trotzdem hier gespeichert.",
      "ui.saved": "Gespeichert", "ui.sent": "An den Fernseher gesendet",
      "ui.language": "Sprache", "ui.language.help": "Für den Bildschirm und diese Seite.",
      "ui.news": "Nachrichten",
      "ui.news.langs": "Sprachen der Schlagzeilen", "ui.news.langs.help": "Eine oder mehrere wählen.",
      "ui.news.local": "Lokale Nachrichten", "ui.news.local.off": "Aus",
      "ui.news.share": "Anteil lokaler Schlagzeilen",
      "ui.news.sources": "Quellen",
      "ui.news.world": "Welt", "ui.news.localgroup": "Lokal",
      "ui.news.how": "Die Welt-Schlagzeilen stammen von Nachrichtenagenturen und öffentlich-rechtlichen Sendern aus mehreren Ländern. Der Bildschirm wechselt zwischen ihnen, damit keiner überwiegt, und jede Schlagzeile nennt ihre Quelle.",
      "ui.news.count": "{n} Schlagzeilen", "ui.news.empty": "gerade nichts",
      "ui.news.nolocal": "Keine lokalen Quellen in den gewählten Sprachen.",
      "ui.news.pending": "Die Quellenliste erscheint nach der nächsten Datenaktualisierung.",
      "kind.wire": "Nachrichtenagentur", "kind.public": "öffentlich-rechtlich", "kind.state": "staatlich finanziert",
      "kind.un": "Vereinte Nationen", "kind.aggregator": "viele Medien, ungeprüft",
      "ui.stats": "Statistiken", "ui.stats.count": "{n} von {max} aktiv",
      "ui.stats.full": "Das sind {max}. Schalte eine aus, um eine andere zu wählen.",
      "ui.display": "Anzeige", "ui.theme": "Design",
      "ui.theme.auto": "Tag und Nacht", "ui.theme.auto.help": "Hell von Sonnenauf- bis Sonnenuntergang zu Hause, sonst dunkel.",
      "ui.theme.light": "Immer hell", "ui.theme.dark": "Immer dunkel",
      "ui.preview": "Vorschau in diesem Browser", "ui.home": "miApps",
      "region.canada": "Kanada", "region.ottawa-gatineau": "Ottawa–Gatineau",
      "name.population": "Weltbevölkerung", "desc.population": "Schätzung, zählt live mit.",
      "name.births": "Geburten und Todesfälle heute", "desc.births": "Schätzung seit Mitternacht UTC.",
      "name.co2": "CO₂-Ausstoß heute", "desc.co2": "Fossiles CO₂ seit Mitternacht UTC, geschätzt.",
      "name.iss": "Raumstation", "desc.iss": "Höhe und Geschwindigkeit der ISS, live.",
      "name.quakes": "Erdbeben", "desc.quakes": "Magnitude 2,5 und mehr in den letzten 24 Stunden, laut USGS.",
      "name.kp": "Weltraumwetter", "desc.kp": "Geomagnetischer Kp-Index und Sonnenwind, laut NOAA.",
      "name.aqi": "Luftqualität", "desc.aqi": "US-AQI und PM2,5 zu Hause.",
      "name.daylight": "Tageslicht", "desc.daylight": "Stunden Tageslicht zu Hause und die Änderung seit gestern.",
      "name.moon": "Mondphase", "desc.moon": "Die Phase und wie viel vom Mond beleuchtet ist.",
      "name.year": "Jahresfortschritt", "desc.year": "Wie viel vom Jahr schon vergangen ist.",
      "name.clocks": "Weltuhren", "desc.clocks": "Tokio, London und Neu-Delhi.",
      "name.wiki": "Wikipedia-Bearbeitungen", "desc.wiki": "Pro Minute über alle Sprachen, live.",
      "name.satellites": "Geostationäre Satelliten", "desc.satellites": "Wie viele CelesTrak im geostationären Gürtel verfolgt.",
      "name.btc": "Bitcoin", "desc.btc": "Preis in CAD und Änderung in 24 Stunden.",
      "name.eth": "Ether", "desc.eth": "Preis in USD und Änderung in 24 Stunden.",
      "name.fx": "US-Dollar", "desc.fx": "Gegenüber kanadischem Dollar, Euro, Pfund und Yen.",
    },
  };

  function t(lang, key, vars) {
    let s = (STR[lang] && STR[lang][key]) ?? STR.en[key] ?? key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    return s;
  }

  window.OBS = {
    APP_ID, NS, KEY, MAX_STATS, LANGS, STATS, REGIONS, LOCAL_SHARES, THEMES, DEFAULTS,
    defaults, normalize, load, save, sourceOn, regionScope, t,
  };
})();
