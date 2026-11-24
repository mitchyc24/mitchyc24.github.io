// miApps landing page. This file owns the page chrome (welcome card, directory, details panel) and
// loads the 3D living room (hub/room/scene.js and three.js) on top. If either fails to load, the
// directory still lists everything.
const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js";

const status = document.getElementById("room-status");
const directory = document.getElementById("directory");
const detail = document.getElementById("detail");
const intro = document.getElementById("intro");
const toggle = document.getElementById("directory-toggle");
const list = document.getElementById("directory-list");
const canvas = document.getElementById("room-canvas");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const station = {
  id: "command-station", name: "Command Station", category: "Live public information",
  tagline: "Headlines, local conditions, earthquakes, orbit and more, gathered in one place.",
  icon: "🖥️", color: "#d8aa6a", path: "station.html#station", action: "Open station"
};
let items = [];
let room = null;

// Keep links to sections of the former home page working.
if (["#station", "#tools", "#rack", "#subject"].includes(location.hash)) {
  location.replace("station.html" + location.search + location.hash);
}

const isImage = (value) => /\.(svg|png|jpe?g|webp|gif|avif)$/i.test(value || "");
function icon(container, item) {
  container.replaceChildren();
  if (isImage(item.icon)) {
    const img = document.createElement("img");
    img.src = item.icon;
    img.alt = "";
    container.append(img);
  } else {
    container.textContent = item.icon || "◆";
  }
}

function dismissIntro() {
  intro.hidden = true;
  document.body.classList.add("exploring");
  if (room) room.explore();
}

function closePanel(panel) {
  panel.hidden = true;
  if (panel === directory) toggle.setAttribute("aria-expanded", "false");
  if (panel === detail) { document.body.classList.remove("has-detail"); if (room) room.release(); }
}

function showDetail(item) {
  dismissIntro();
  closePanel(directory);
  document.getElementById("detail-category").textContent = item.category || "THE COLLECTION";
  document.getElementById("detail-title").textContent = item.name;
  document.getElementById("detail-description").textContent = item.tagline || "";
  icon(document.getElementById("detail-icon"), item);
  const links = document.getElementById("detail-links");
  links.replaceChildren();
  const destinations = item.href
    ? [{ label: item.action || "Visit", href: item.href, external: true }]
    : [{ label: item.action || "Open app", href: item.path + (item.entry || "") }, ...(item.links || [])];
  for (const destination of destinations) {
    const a = document.createElement("a");
    a.href = destination.href;
    a.textContent = destination.label + " ↗";
    if (destination.external) { a.target = "_blank"; a.rel = "noopener"; }
    links.append(a);
  }
  const where = document.getElementById("detail-where");
  where.textContent = item.href ? new URL(item.href).hostname + " · opens in a new tab" : "";
  where.hidden = !item.href;
  detail.hidden = false;
  document.body.classList.add("has-detail");
  if (room) room.focus(item.id);
  detail.querySelector(".close").focus({ preventScroll: true });
}

function renderDirectory() {
  list.replaceChildren();
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "directory-item";
    const image = document.createElement("span");
    image.className = "item-icon";
    image.setAttribute("aria-hidden", "true");
    icon(image, item);
    const text = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = item.name;
    const category = document.createElement("small");
    category.textContent = item.category || "App";
    text.append(name, category);
    const arrow = document.createElement("span");
    arrow.className = "arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = item.href ? "↗" : "→";
    button.append(image, text, arrow);
    button.addEventListener("click", () => showDetail(item));
    list.append(button);
  }
}

toggle.addEventListener("click", () => {
  const opening = directory.hidden;
  closePanel(detail);
  directory.hidden = !opening;
  toggle.setAttribute("aria-expanded", String(opening));
  if (opening) dismissIntro();
});
document.getElementById("intro-close").addEventListener("click", dismissIntro);
document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => {
    closePanel(document.getElementById(button.dataset.close));
    toggle.focus({ preventScroll: true });
  });
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!detail.hidden) { closePanel(detail); toggle.focus(); }
    else if (!directory.hidden) { closePanel(directory); toggle.focus(); }
    else dismissIntro();
  }
});

async function load(url, key) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data[key])) throw new Error(`${url} has no ${key} list`);
  return data[key];
}

async function start() {
  // Apps come from the registry; sites that live elsewhere come from hub/links.json.
  const [apps, links] = await Promise.allSettled([load("apps.json", "apps"), load("hub/links.json", "links")]);
  if (apps.status === "rejected") console.error("Could not load the app registry:", apps.reason);
  if (links.status === "rejected") console.error("Could not load the links:", links.reason);
  items = [
    ...(apps.value || []).filter((app) => app && app.id && app.name && app.path && app.status !== "archived"),
    station,
    ...(links.value || []).filter((link) => link && link.id && link.name && /^https:\/\//.test(link.href || "")),
  ];
  renderDirectory();
  if (apps.status === "rejected") status.textContent = "The app collection could not be loaded. Try the classic directory.";

  try {
    const [T, { createRoom }] = await Promise.all([import(THREE_URL), import("./room/scene.js")]);
    room = createRoom(T, {
      canvas, items, reducedMotion,
      tags: document.getElementById("tags"),
      pad: document.getElementById("controls"),
      isBlocked: () => !directory.hidden,
      onSelect: showDetail,
      onExplore: dismissIntro,
    });
    document.body.classList.add("ready");
    if (apps.status !== "rejected") status.textContent = "";
    const wanted = new URLSearchParams(location.search).get("at");
    const first = wanted && items.find((item) => item.id === wanted);
    if (first) showDetail(first);
  } catch (error) {
    console.error("Could not start the 3D room:", error);
    status.textContent = "3D is unavailable here. Browse the collection below.";
    document.getElementById("instructions").hidden = true;
    intro.hidden = true;
    directory.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
  }
}

start();
