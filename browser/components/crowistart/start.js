/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Crowi's start page. It is shown for both about:home and about:newtab.
// Everything here runs with a strict CSP (no inline script, no remote
// resources), so it only uses DOM APIs and local state.

const SEARCH_ENGINES = [
  {
    id: "ddg",
    label: "DuckDuckGo",
    action: "https://duckduckgo.com/",
    param: "q",
  },
  {
    id: "google",
    label: "Google",
    action: "https://www.google.com/search",
    param: "q",
  },
  {
    id: "brave",
    label: "Brave",
    action: "https://search.brave.com/search",
    param: "q",
  },
  {
    id: "wikipedia",
    label: "Wikipedia",
    action: "https://en.wikipedia.org/w/index.php",
    param: "search",
  },
  {
    id: "youtube",
    label: "YouTube",
    action: "https://www.youtube.com/results",
    param: "search_query",
  },
];

const DEFAULT_SHORTCUTS = [
  { name: "YouTube", url: "https://www.youtube.com/" },
  { name: "GitHub", url: "https://github.com/" },
  { name: "Reddit", url: "https://www.reddit.com/" },
  { name: "Discord", url: "https://discord.com/app" },
  { name: "Wikipedia", url: "https://en.wikipedia.org/" },
];

const GREETING_LINES = [
  "Wings out. Where to?",
  "Caw. Let’s find something.",
  "Fresh tab, clean sky.",
  "Fly somewhere new.",
  "Shiny things await.",
];

const tagline =
  GREETING_LINES[Math.floor(Math.random() * GREETING_LINES.length)];

const STORAGE_KEYS = {
  engine: "crowi.start.engine",
  shortcuts: "crowi.start.shortcuts",
};

// localStorage can be unavailable on privileged about pages; fall back to
// in-memory state so the page still works for the current tab.
const memoryStore = new Map();

function readStore(key) {
  try {
    const value = window.localStorage.getItem(key);
    if (value !== null) {
      return value;
    }
  } catch (e) {
    // Fall through to memory.
  }
  return memoryStore.has(key) ? memoryStore.get(key) : null;
}

function writeStore(key, value) {
  memoryStore.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch (e) {
    // Memory copy is already saved.
  }
}

function $(id) {
  return document.getElementById(id);
}

/* ---------- clock + greeting ---------- */

function greetingForHour(hour) {
  if (hour < 5) {
    return "Burning the midnight oil";
  }
  if (hour < 12) {
    return "Good morning";
  }
  if (hour < 18) {
    return "Good afternoon";
  }
  return "Good evening";
}

let lastMinuteKey = "";

function tickClock() {
  const now = new Date();
  const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
  if (key === lastMinuteKey) {
    return;
  }
  lastMinuteKey = key;

  const clock = $("clock");
  clock.replaceChildren();
  const timeFormat = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  for (const part of timeFormat.formatToParts(now)) {
    if (part.type === "dayPeriod") {
      const period = document.createElement("span");
      period.className = "clock-period";
      period.textContent = part.value;
      clock.append(period);
    } else if (part.value.trim()) {
      clock.append(part.value);
    }
  }
  $("date").textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);
  $("greeting").textContent = `${greetingForHour(now.getHours())}. ${tagline}`;
}

/* ---------- search ---------- */

function applyEngine(engine) {
  const form = $("search");
  form.action = engine.action;
  $("query").name = engine.param;
  $("query").placeholder = `Search with ${engine.label}`;
  for (const button of $("engines").children) {
    button.setAttribute("aria-checked", String(button.dataset.engine === engine.id));
  }
}

function setupSearch() {
  const container = $("engines");
  for (const engine of SEARCH_ENGINES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "engine";
    button.dataset.engine = engine.id;
    button.setAttribute("role", "radio");
    button.textContent = engine.label;
    button.addEventListener("click", () => {
      applyEngine(engine);
      writeStore(STORAGE_KEYS.engine, engine.id);
      $("query").focus();
    });
    container.append(button);
  }

  const saved = readStore(STORAGE_KEYS.engine);
  applyEngine(SEARCH_ENGINES.find(e => e.id === saved) || SEARCH_ENGINES[0]);

  $("search").addEventListener("submit", event => {
    if (!$("query").value.trim()) {
      event.preventDefault();
    }
  });

  document.addEventListener("keydown", event => {
    const typing =
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement;
    if (event.key === "/" && !typing && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      $("query").focus();
    } else if (event.key === "Escape" && event.target === $("query")) {
      $("query").blur();
    }
  });
}

/* ---------- shortcuts ---------- */

let shortcuts = [];

function normalizeUrl(raw) {
  let text = raw.trim();
  if (!text) {
    return null;
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    text = `https://${text}`;
  }
  try {
    const url = new URL(text);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || !url.hostname.includes(".")) {
      return null;
    }
    return url.href;
  } catch (e) {
    return null;
  }
}

function loadShortcuts() {
  const raw = readStore(STORAGE_KEYS.shortcuts);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter(s => s && typeof s.name === "string" && normalizeUrl(String(s.url)))
          .map(s => ({ name: s.name, url: normalizeUrl(String(s.url)) }));
      }
    } catch (e) {
      // Corrupt data: use defaults.
    }
  }
  return DEFAULT_SHORTCUTS.slice();
}

function saveShortcuts() {
  writeStore(STORAGE_KEYS.shortcuts, JSON.stringify(shortcuts));
}

function hueFor(text) {
  let hash = 0;
  for (const char of text) {
    hash = (hash * 31 + char.codePointAt(0)) % 360;
  }
  return hash;
}

function renderShortcuts() {
  const list = $("tiles");
  list.replaceChildren();

  shortcuts.forEach((shortcut, index) => {
    const item = document.createElement("li");
    item.className = "tile";

    const link = document.createElement("a");
    link.className = "tile-link";
    link.href = shortcut.url;

    const badge = document.createElement("span");
    badge.className = "tile-badge";
    badge.textContent = Array.from(shortcut.name.trim())[0] || "?";
    badge.style.setProperty("--hue", String(hueFor(shortcut.name)));

    const label = document.createElement("span");
    label.className = "tile-label";
    label.textContent = shortcut.name;

    link.append(badge, label);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "tile-remove";
    remove.textContent = "✕";
    remove.title = `Remove ${shortcut.name}`;
    remove.setAttribute("aria-label", `Remove ${shortcut.name}`);
    remove.addEventListener("click", () => {
      shortcuts.splice(index, 1);
      saveShortcuts();
      renderShortcuts();
    });

    item.append(link, remove);
    list.append(item);
  });

  const addItem = document.createElement("li");
  addItem.className = "tile";
  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "tile-add";
  const addBadge = document.createElement("span");
  addBadge.className = "tile-badge";
  addBadge.textContent = "+";
  const addLabel = document.createElement("span");
  addLabel.className = "tile-label";
  addLabel.textContent = "Add shortcut";
  addButton.append(addBadge, addLabel);
  addButton.addEventListener("click", openAddDialog);
  addItem.append(addButton);
  list.append(addItem);
}

function openAddDialog() {
  $("add-name").value = "";
  $("add-url").value = "";
  $("add-error").hidden = true;
  $("add-dialog").showModal();
  $("add-name").focus();
}

function setupDialog() {
  $("add-cancel").addEventListener("click", () => $("add-dialog").close());

  $("add-form").addEventListener("submit", event => {
    event.preventDefault();
    const url = normalizeUrl($("add-url").value);
    if (!url) {
      $("add-error").hidden = false;
      $("add-url").focus();
      return;
    }
    const name = $("add-name").value.trim() || new URL(url).hostname.replace(/^www\./, "");
    shortcuts.push({ name, url });
    saveShortcuts();
    renderShortcuts();
    $("add-dialog").close();
  });
}

/* ---------- boot ---------- */

function init() {
  tickClock();
  setInterval(tickClock, 1000);

  setupSearch();
  shortcuts = loadShortcuts();
  setupDialog();
  renderShortcuts();
}

init();
