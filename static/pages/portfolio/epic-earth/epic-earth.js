(() => {
  const $ = (sel) => document.querySelector(sel);

  const elDate = $("#epic-date");
  const elCollection = $("#epic-collection");
  const elLoad = $("#epic-load");
  const elPlay = $("#epic-play");
  const elPause = $("#epic-pause");
  const elSpeed = $("#epic-speed");
  const elSpeedVal = $("#epic-speed-val");
  const elStatus = $("#epic-status");
  const elFrame = $("#epic-frame");

  // Configuration
  const metadataBase = "/nasa_data"; // where CLI saves JSON (root-relative)
  const apiBase = "https://epic.gsfc.nasa.gov/api";
  const archiveBase = "https://epic.gsfc.nasa.gov/archive";
  const imageFormat = "png"; // use png by default for animation

  let timer = null;
  let frames = [];        // array of preloaded Image objects
  let urls = [];          // corresponding URLs
  let idx = 0;
  let speed = parseInt(elSpeed.value, 10);

  function fmtDateParts(dateStr) {
    // dateStr: YYYY-MM-DD
    const [y, m, d] = dateStr.split("-");
    return { y, m, d };
  }

  function filenameFor(collection, dateStr) {
    return `${collection}_${dateStr.replaceAll("-", "_")}.json`;
  }

  function status(msg) {
    elStatus.textContent = msg;
  }

  function setControlsLoading(loading) {
    elLoad.disabled = loading;
    elPlay.disabled = loading || urls.length === 0;
    elPause.disabled = loading || urls.length === 0;
  }

  async function fetchLocalMetadata(collection, dateStr) {
    const file = filenameFor(collection, dateStr);
    const url = `${metadataBase}/${file}`;
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) {
      throw new Error(`Local metadata not found: ${url}`);
    }
    return res.json();
  }

  async function fetchApiMetadata(collection, dateStr) {
    const url = `${apiBase}/${collection}/date/${dateStr}`;
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) {
      throw new Error(`API error ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  function urlFromMeta(item, collection) {
    const image = item.image;
    const dateStr = item.date.split(" ")[0];
    const { y, m, d } = fmtDateParts(dateStr);
    return `${archiveBase}/${collection}/${y}/${m}/${d}/${imageFormat}/${image}.${imageFormat}`;
  }

  async function loadFor(collection, dateStr) {
    stop();
    status("Loading metadata...");
    setControlsLoading(true);
    urls = [];
    frames = [];
    idx = 0;

    let meta;
    try {
      meta = await fetchLocalMetadata(collection, dateStr);
    } catch (_) {
      // Fallback to API if local JSON is missing
      meta = await fetchApiMetadata(collection, dateStr);
    }

    if (!Array.isArray(meta) || meta.length === 0) {
      status("No images for that date.");
      setControlsLoading(false);
      return;
    }

    urls = meta.map((m) => urlFromMeta(m, collection));
    status(`Found ${urls.length} frames. Preloading...`);

    // Preload images
    await Promise.all(
      urls.map(
        (u, i) =>
          new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
              frames[i] = img;
              resolve();
            };
            img.onerror = () => {
              // skip broken frames
              frames[i] = null;
              resolve();
            };
            img.src = u;
          })
      )
    );

    // Filter out any failed preloads
    const filtered = [];
    const filteredUrls = [];
    frames.forEach((img, i) => {
      if (img) {
        filtered.push(img);
        filteredUrls.push(urls[i]);
      }
    });
    frames = filtered;
    urls = filteredUrls;

    if (frames.length === 0) {
      status("Failed to load frames for that date.");
      setControlsLoading(false);
      return;
    }

    // Show first frame
    idx = 0;
    elFrame.src = frames[0].src;
    elFrame.alt = `EPIC Earth ${collection} ${dateStr}`;
    status(`Ready. ${frames.length} frames loaded.`);
    elPlay.disabled = false;
    elPause.disabled = false;
    setControlsLoading(false);
  }

  function play() {
    if (!frames.length || timer) return;
    status(`Playing at ${speed}ms/frame (${frames.length} frames)`);
    timer = setInterval(() => {
      idx = (idx + 1) % frames.length;
      elFrame.src = frames[idx].src;
    }, speed);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  // Wire up UI
  elLoad.addEventListener("click", () => {
    const dateStr = elDate.value;
    if (!dateStr) {
      status("Please pick a date.");
      return;
    }
    loadFor(elCollection.value, dateStr).catch((e) => {
      console.error(e);
      status("Error loading data.");
    });
  });

  elPlay.addEventListener("click", play);
  elPause.addEventListener("click", () => {
    stop();
    status("Paused");
  });

  elSpeed.addEventListener("input", () => {
    speed = parseInt(elSpeed.value, 10);
    elSpeedVal.textContent = `${speed}ms`;
    if (timer) {
      stop();
      play();
    }
  });

  // Set default date to yesterday (EPIC often lags)
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  elDate.value = `${yyyy}-${mm}-${dd}`;
})();
