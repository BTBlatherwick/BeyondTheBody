// =====================================================================
// APP VERSION
// Change this number every time you upload new files to GitHub.
// Phones check it, and show an "Update available" banner when it changes.
// =====================================================================
const APP_VERSION = "2.20.0";

// =====================================================================
// SMALL HELPERS
// =====================================================================
function $(id) { return document.getElementById(id); }

// Safe versions of localStorage reading/writing
function load(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v == null ? fallback : v;
  } catch (e) { return fallback; }
}
let saveWarned = false;
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) {
    // Usually means the phone's storage for this app is full. Say so once, clearly.
    if (!saveWarned) {
      saveWarned = true;
      const w = document.getElementById("save-warn");
      if (w && w.classList) w.classList.add("show");
    }
  }
}

// Makes sure text typed by you can't break the page's HTML
function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mmss(seconds) {
  return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
}


// =====================================================================
// SETTINGS AND UNITS
// All weights are STORED in kilograms. They are converted only for display,
// so you can switch between kg and lb without damaging your history.
// =====================================================================
const KG_PER_LB = 0.45359237;

// Runs, rides and walks (the RUN section further down explains these). They are
// set up here, near the top, because other parts of the app read them early on.
let runs = load("runs", []);
let runPlan = load("runPlan", null);
let runPrefs = Object.assign({ type: "run", goal: "free", km: 5, mins: 30, outBack: false, cues: "1", voice: "on", autoPause: "on", ghost: "on" }, load("runPrefs", {}));
let trk = { on: false, armed: false };   // the run in progress, if any

// Is this the installed Android app (rather than the website)? The installed app
// can use the phone's own GPS service and voice, which keep working when the
// phone is locked. "Capacitor" is the shell the installed app is wrapped in.
const NATIVE = typeof window !== "undefined" && !!window.Capacitor &&
               typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform();
let nativeNote = "";   // the last thing the phone's GPS service or voice complained about, shown on the run screen

// Asks one of the phone's own services to do something. Always gives back a promise.
// The installed app draws under the phone's status bar. The page normally learns
// the bar's height by itself; if this phone doesn't report one, assume a typical 36px.
if (NATIVE) {
  setTimeout(function () {
    try {
      const probe = document.createElement("div");
      probe.style.cssText = "position:fixed;top:0;left:0;width:1px;height:var(--sat);visibility:hidden";
      document.body.appendChild(probe);
      const h = probe.getBoundingClientRect().height;
      probe.remove();
      if (h < 1) document.documentElement.style.setProperty("--sat-min", "36px");
    } catch (err) { /* cosmetic only */ }
  }, 300);
}

function nativeCall(plugin, method, options, callback) {
  try {
    const cap = window.Capacitor;
    const p = cap.Plugins && cap.Plugins[plugin];
    if (p && typeof p[method] === "function") return Promise.resolve(callback ? p[method](options, callback) : p[method](options));
    if (callback && typeof cap.nativeCallback === "function") return Promise.resolve(cap.nativeCallback(plugin, method, options, callback));
    if (typeof cap.nativePromise === "function") return Promise.resolve(cap.nativePromise(plugin, method, options));
    return Promise.reject(new Error(plugin + " is not installed in this build"));
  } catch (err) { return Promise.reject(err); }
}
const REST_OPTIONS = [45, 60, 90, 120, 180, 240];

let settings = load("settings", { units: "kg", rest: 90 });
if (!settings.warmup) settings.warmup = "off";
if (settings.awake !== "off") settings.awake = "on";
// One look (Clean), plus an accent colour you choose.
settings.theme = "clean";
settings.themeV = 2;

const ACCENTS = [
  ["", "White"], ["#c0392b", "Blood red"], ["#e8702a", "Ember"], ["#e0a91b", "Gold"], ["#34c26b", "Green"],
  ["#1fb6a6", "Teal"], ["#3b82f6", "Blue"], ["#8b5cf6", "Purple"], ["#ec4899", "Pink"]
];

// "#3b82f6" -> [59, 130, 246]; anything that is not a colour -> null
function hexRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
// How bright a colour looks, from 0 (black) to 1 (white)
function luminance(rgb) {
  const f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}
// Works out the three colours the app needs from the one you pick
function accentColours(hex) {
  let rgb = hexRgb(hex);
  if (!rgb) return null;
  // Too dark to see on a black background? Lift it toward white.
  let guard = 0;
  while (luminance(rgb) < 0.1 && guard++ < 10) rgb = rgb.map(function (v) { return Math.round(v + (255 - v) * 0.25); });
  return {
    accent: "rgb(" + rgb.join(",") + ")",
    on: luminance(rgb) > 0.4 ? "#0b0b0c" : "#ffffff",   // text that sits on top of the accent
    pill: "rgba(" + rgb.join(",") + ",0.32)"
  };
}

function applyTheme() {
  const root = document.documentElement;
  root.setAttribute("data-theme", "clean");
  const col = accentColours(settings.accent);
  ["--accent", "--on-accent", "--pill"].forEach(function (v) { root.style.removeProperty(v); });
  if (col) {
    root.style.setProperty("--accent", col.accent);
    root.style.setProperty("--on-accent", col.on);
    root.style.setProperty("--pill", col.pill);
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", "#000000");
}
applyTheme();
let restMap = load("restMap", {});   // per-exercise rest times, e.g. { "Deadlift": 180 }

function unit() { return settings.units; }
function toDisp(kg) { return settings.units === "lb" ? kg / KG_PER_LB : kg; }
function fromDisp(v) { return settings.units === "lb" ? v * KG_PER_LB : v; }
function fmt(n) { return String(Number(n.toFixed(2))); }
function fmtW(kg) { return fmt(toDisp(parseFloat(kg) || 0)); }   // kg in, display number out
function restFor(name) { return restMap[name] || coachRest(name) || settings.rest; }

function renderSettings() {
  function group(label, key, options) {
    let h = '<div class="goal-group"><div class="card-label">' + label + '</div><div class="chips">';
    options.forEach(function (o) {
      const on = String(settings[key]) === String(o[0]);
      h += '<button class="chip' + (on ? " on" : "") + '" data-skey="' + key + '" data-value="' + o[0] + '">' + o[1] + '</button>';
    });
    return h + "</div></div>";
  }
  $("settings-card").innerHTML =
    '<div class="goal-group"><div class="card-label">Accent colour</div><div class="swatches">' +
    ACCENTS.map(function (c) {
      const on = (settings.accent || "") === c[0];
      return '<button class="swatch' + (on ? " on" : "") + '" data-accent="' + c[0] + '" style="background:' + (c[0] || "#f2f2f4") + '" aria-label="' + c[1] + '" title="' + c[1] + '"></button>';
    }).join("") +
    '<label class="swatch-custom' + (settings.accent && !ACCENTS.some(function (c) { return c[0] === settings.accent; }) ? " on" : "") + '" aria-label="Pick your own colour" title="Pick your own">' +
    '<input type="color" id="accent-custom" value="' + (hexRgb(settings.accent) ? settings.accent : "#c0392b") + '"></label>' +
    '</div></div>' +
    group("Units", "units", [["kg", "kg"], ["lb", "lb"]]) +
    group("Default rest time", "rest", [[60, "1:00"], [90, "1:30"], [120, "2:00"], [180, "3:00"]]) +
    group("Auto warm-up sets", "warmup", [["off", "Off"], ["barbell", "Barbell lifts"]]) +
    group("Keep screen on while training", "awake", [["on", "On"], ["off", "Off"]]) +
    '<div class="feed-meta">Stops the phone locking mid-workout, so the rest timer can always buzz. Uses a little more battery.</div>' +
    (NATIVE
      ? group("Workout reminders", "remind", [["off", "Off"], ["on", "On"]]) +
        (settings.remind === "on" ? group("Remind me at", "remindAt", [["07:00", "7 am"], ["12:00", "Noon"], ["17:00", "5 pm"], ["19:00", "7 pm"]]) : "") +
        '<div class="feed-meta">A notification on days with a gym session or run planned, and a nudge on Sunday if the week is slipping. If you lock the phone mid-rest, it also rings when the rest is over.</div>'
      : '<div class="feed-meta" style="margin-top:.8rem">Workout reminders are available in the installed Android app.</div>');
}

function setAccent(hex) {
  settings.accent = hexRgb(hex) ? hex.toLowerCase() : "";
  save("settings", settings);
  applyTheme();
}
$("settings-card").addEventListener("click", function (e) {
  const sw = e.target.closest("[data-accent]");
  if (sw) { setAccent(sw.dataset.accent); renderSettings(); return; }
});
// The colour wheel: update live while you drag, redraw the row when you let go
$("settings-card").addEventListener("input", function (e) {
  if (e.target.id === "accent-custom") setAccent(e.target.value);
});
$("settings-card").addEventListener("change", function (e) {
  if (e.target.id === "accent-custom") renderSettings();
});

$("settings-card").addEventListener("click", function (e) {
  const btn = e.target.closest("[data-skey]");
  if (!btn) return;
  const key = btn.dataset.skey;
  settings[key] = key === "rest" ? Number(btn.dataset.value) : btn.dataset.value;
  if (key === "remind" && settings.remind === "on" && !settings.remindAt) settings.remindAt = "17:00";
  save("settings", settings);
  if (key === "remind" || key === "remindAt") {
    if (NATIVE && settings.remind === "on") nativeCall("LocalNotifications", "requestPermissions", {}).catch(function () {});
    queueReminders();
  }
  applyTheme();
  renderSettings();
  renderGear();
  renderBodyForm();
  renderWorkout();
  renderFeed();
  renderProgress();
});


// =====================================================================
// TABS
// =====================================================================
const tabs = document.querySelectorAll(".tab");
const screens = document.querySelectorAll(".screen");

// Four tabs along the bottom; some of them hold a few sub-tabs along the top.
// A sub-tab is either a whole screen, or one part (data-sub) of a bigger screen.
const NAV = {
  home:     { subs: [{ screen: "home", label: "Home" }] },
  train:    { subs: [{ screen: "workout", label: "Workout" }, { screen: "run", label: "Run" }, { screen: "library", label: "Library" }] },
  progress: { subs: [{ screen: "progress", sub: "charts", label: "Charts" }, { screen: "progress", sub: "body", label: "Body" },
                     { screen: "progress", sub: "awards", label: "Awards" }, { screen: "feed", label: "History" }] },
  me:       { subs: [{ screen: "gym", sub: "goals", label: "Goals" }, { screen: "gym", sub: "equip", label: "Gym" },
                     { screen: "gym", sub: "settings", label: "Settings" }] }
};

function navFind(screenId, sub) {
  const names = Object.keys(NAV);
  for (let g = 0; g < names.length; g++) {
    const subs = NAV[names[g]].subs;
    for (let i = 0; i < subs.length; i++) {
      if (subs[i].screen === screenId && (!sub || !subs[i].sub || subs[i].sub === sub)) return { group: names[g], index: i };
    }
  }
  return { group: "home", index: 0 };
}

let lastSubs = load("lastSubs", {});   // which sub-tab each screen was on

function showTab(screenId, sub) {
  if (!$(screenId)) screenId = "home";
  const found = navFind(screenId, sub);
  const subs = NAV[found.group].subs;
  // Which part of this screen? the one asked for, else the one you were last on, else the first
  const mine = subs.filter(function (s) { return s.screen === screenId; });
  let part = sub || lastSubs[screenId];
  if (!mine.some(function (s) { return (s.sub || "") === (part || ""); })) part = mine[0].sub;
  if (part) { lastSubs[screenId] = part; save("lastSubs", lastSubs); }

  screens.forEach(function (s) { s.classList.remove("active"); });
  tabs.forEach(function (t) { t.classList.toggle("active", t.dataset.group === found.group); });
  const scr = $(screenId);
  scr.classList.add("active");
  scr.querySelectorAll(".sub-view").forEach(function (v) { v.classList.toggle("on", v.dataset.sub === part); });

  // Sub-tab row
  let bar = scr.querySelector(".subnav");
  if (subs.length < 2) { if (bar) bar.remove(); }
  else {
    if (!bar) { bar = document.createElement("div"); bar.className = "subnav"; scr.insertBefore(bar, scr.firstChild); }
    bar.innerHTML = subs.map(function (s, i) {
      const on = s.screen === screenId && (s.sub || "") === (part || "");
      return '<button class="subtab' + (on ? " on" : "") + '" data-screen="' + s.screen + '" data-sub="' + (s.sub || "") + '">' + s.label + "</button>";
    }).join("");
  }

  groupLast[found.group] = { screen: screenId, sub: part || "" };
  save("groupLast", groupLast);
  save("lastTab", screenId);
  syncWake();
  if (screenId === "progress") renderProgress();
  if (screenId === "library") renderLibrary();
  window.scrollTo(0, 0);
}

let groupLast = load("groupLast", {});   // where you were last inside each bottom tab

tabs.forEach(function (tab) {
  tab.addEventListener("click", function () {
    const g = tab.dataset.group;
    const s = groupLast[g] || NAV[g].subs[0];
    showTab(s.screen, s.sub || undefined);
  });
});

document.addEventListener("click", function (e) {
  const b = e.target.closest(".subtab");
  if (b) showTab(b.dataset.screen, b.dataset.sub || undefined);
});

// Tappable areas on the Home screen that used to be plain divs with onclick
$("home").addEventListener("click", function (e) {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const a = b.dataset.action;
  if (a === "gym") { showTab("gym"); return; }
  if (a === "start-workout") { showTab("workout"); return; }
  if (a === "start-run") { showTab("run"); return; }
  if (a === "coach") { openCoach(); return; }
  if (a === "export-backup") { exportBackup(); return; }
});
$("save-warn").addEventListener("click", function (e) {
  if (e.target.closest('[data-action="close-save-warn"]')) $("save-warn").classList.remove("show");
});


// =====================================================================
// EQUIPMENT
// =====================================================================
const equipment = {
  "Free weights": ["Dumbbells", "Kettlebells", "Weight plates"],
  "Bars": ["Barbell", "EZ curl bar", "Trap bar", "Landmine"],
  "Benches & racks": ["Flat bench", "Adjustable bench", "Decline bench", "Squat rack", "Pull-up bar", "Dip station",
                      "Preacher curl bench", "Back extension bench", "Plyo box"],
  "Cable machines": ["Cable machine", "Lat pulldown", "Low row machine"],
  "Weight machines": ["Leg press", "Smith machine", "Leg extension machine", "Leg curl machine", "Chest press machine",
                      "Pec deck machine", "Shoulder press machine", "Lateral raise machine", "Assisted pull-up machine",
                      "Hip abduction machine", "Hip adduction machine", "Glute kickback machine", "Calf raise machine",
                      "Ab crunch machine", "Rotary torso machine", "Preacher curl machine", "Triceps extension machine"],
  "Plate-loaded machines": ["Hack squat machine", "Pendulum squat machine", "Belt squat machine", "Hip thrust machine",
                            "Plate-loaded chest press", "Plate-loaded incline press", "Plate-loaded shoulder press",
                            "Plate-loaded row", "T-bar row machine"],
  "Balls & accessories": ["Stability ball", "Medicine ball", "Suspension trainer", "Gymnastic rings", "Ab wheel",
                          "Core sliders", "Dip belt", "Weight vest"],
  "Resistance bands": ["Resistance bands", "Mini loop bands"],
  "Cardio & recovery": ["Treadmill", "Exercise bike", "Rowing machine", "Elliptical", "Skipping rope", "Foam roller"]
};

let selected = load("selectedEquipment", []);

// Small outline icons, one per section (we don't have photos of each machine)
const EQUIP_ICONS = {
  "Free weights":          '<path d="M6.5 6.5v11"/><path d="M17.5 6.5v11"/><path d="M3.5 9v6"/><path d="M20.5 9v6"/><path d="M6.5 12h11"/>',
  "Bars":                  '<path d="M2 12h20"/><path d="M5 8v8"/><path d="M19 8v8"/>',
  "Benches & racks":       '<path d="M3 11h18v3H3z"/><path d="M6 14v5"/><path d="M18 14v5"/>',
  "Cable machines":        '<path d="M6 3v18"/><path d="M18 3v18"/><path d="M6 6h12"/><path d="M12 6v8"/><circle cx="12" cy="17" r="2.5"/>',
  "Weight machines":       '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6"/><path d="M9 12h6"/><path d="M9 16h3"/>',
  "Plate-loaded machines": '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3.5v4"/>',
  "Balls & accessories":   '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c3 3 3 14 0 17"/><path d="M12 3.5c-3 3-3 14 0 17"/>',
  "Resistance bands":      '<path d="M4 8c4-5 12-5 16 0"/><path d="M4 16c4 5 12 5 16 0"/><path d="M4 8v8"/><path d="M20 8v8"/>',
  "Cardio & recovery":     '<path d="M3 12h4l2-6 4 12 2-6h6"/>'
};

let equipQuery = "";   // what's typed in the search box
let eqOpen = load("eqOpen", {});   // which sections are expanded, e.g. { "Bars": true }

// How many exercises in the library need this piece of equipment
function exercisesUsing(name) {
  return library.filter(function (l) {
    return l.need.some(function (n) { return n.split("|").indexOf(name) >= 0; });
  }).length;
}

function renderEquipment() {
  const listEl = $("equipment-list");
  const q = equipQuery.trim().toLowerCase();
  let html = "";
  let shown = 0;
  let total = 0;

  for (const category in equipment) {
    const all = equipment[category];
    total += all.length;
    const items = all.filter(function (n) { return !q || n.toLowerCase().indexOf(q) >= 0; });
    if (!items.length) continue;
    shown += items.length;

    const have = all.filter(function (n) { return selected.includes(n); }).length;
    const allOn = have === all.length;

    const open = !!q || !!eqOpen[category];   // searching opens everything that matches
    html += `<div class="eq-head${open ? " open" : ""}" data-cat="${esc(category)}">
      <button type="button" class="eq-title" data-eq="toggle" data-cat="${esc(category)}" aria-expanded="${open}">
        <svg class="eq-chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>${esc(category)} <span class="eq-have">${have}/${all.length}</span>
      </button>
      <button type="button" class="eq-all" data-eq="all" data-cat="${esc(category)}">${allOn ? "Clear" : "Select all"}</button>
    </div>`;

    if (open) items.forEach(function (name) {
      const on = selected.includes(name);
      const n = exercisesUsing(name);
      const sub = n === 0 ? "No exercises yet" : n + (n === 1 ? " exercise" : " exercises");
      html += `<label class="eq-row${on ? " on" : ""}">
        <span class="eq-ic"><svg viewBox="0 0 24 24">${EQUIP_ICONS[category] || EQUIP_ICONS["Other"]}</svg></span>
        <span class="eq-txt"><span class="eq-name">${esc(name)}</span>
          <span class="eq-sub">${sub}</span></span>
        <input type="checkbox" class="eq-check" data-name="${esc(name)}" ${on ? "checked" : ""}>
      </label>`;
    });
  }

  if (!shown) html = `<p class="feed-meta" style="margin:1rem 0">No equipment matches “${esc(equipQuery)}”.</p>`;
  listEl.innerHTML = html;

  $("count").textContent = selected.length + " of " + total + " items selected";
  const equipTile = document.getElementById("home-equip");
  if (equipTile) equipTile.textContent = selected.length + " items";
  $("home-gym-sub").textContent = selected.length + (selected.length === 1 ? " item of equipment" : " items of equipment");
}

$("equipment-list").addEventListener("change", function (e) {
  const box = e.target.closest ? e.target.closest(".eq-check") : null;
  if (box) toggleEquipment(box.dataset.name);
});
$("equipment-list").addEventListener("click", function (e) {
  const b = e.target.closest("[data-eq]");
  if (!b) return;

  if (b.dataset.eq === "toggle") {
    eqOpen[b.dataset.cat] = !eqOpen[b.dataset.cat];
    save("eqOpen", eqOpen);
    renderEquipment();
    return;
  }

  const items = equipment[b.dataset.cat] || [];
  const allOn = items.every(function (n) { return selected.includes(n); });
  selected = selected.filter(function (n) { return items.indexOf(n) < 0; });   // take the whole section out first
  if (!allOn) selected = selected.concat(items);                                // then put it all back in if we're selecting
  save("selectedEquipment", selected);
  renderEquipment();
  if (b.dataset.cat === "Bars") renderGear();
});
$("eq-search").addEventListener("input", function (e) {
  equipQuery = e.target.value;
  renderEquipment();
});

function toggleEquipment(name) {
  if (selected.includes(name)) {
    selected = selected.filter(function (item) { return item !== name; });
  } else {
    selected.push(name);
  }
  save("selectedEquipment", selected);
  renderEquipment();
  if (name === "EZ curl bar" || name === "Trap bar") renderGear();
}


// =====================================================================
// GOALS
// The goal decides the sets, reps, rest times, weekly volume and cardio.
// On top of that: focus muscles, an avoid list (injuries), targets with dates,
// a multi-week programme, and how you feel today.
// =====================================================================
const GOAL_PROFILES = {
  "Build muscle": {
    blurb: "Size first. Moderate weights, 6-15 reps, and enough weekly sets for every muscle.",
    cReps: "6-10", iReps: "10-15", cSets: [3, 4, 4], iSets: [2, 3, 3], restC: 120, restI: 75, vol: 1.0, cardio: false, emphasis: []
  },
  "Get stronger": {
    blurb: "Heavy compound lifts for 3-6 reps with long rests, and fewer extras.",
    cReps: "3-6", iReps: "8-10", cSets: [3, 4, 5], iSets: [2, 3, 3], restC: 180, restI: 90, vol: 0.75, cardio: false, emphasis: []
  },
  "Lose fat": {
    blurb: "Full-body sessions, 10-15 reps, short rests and a cardio finisher. Keeps muscle while you cut.",
    cReps: "10-12", iReps: "12-15", cSets: [3, 3, 4], iSets: [2, 3, 3], restC: 75, restI: 45, vol: 0.8, cardio: true, emphasis: []
  },
  "Look athletic": {
    blurb: "A V-taper look: extra shoulders, upper back, chest and core, with a solid base of legs and arms.",
    cReps: "6-10", iReps: "10-15", cSets: [3, 4, 4], iSets: [2, 3, 3], restC: 105, restI: 60, vol: 1.0, cardio: false,
    emphasis: ["shoulders", "back", "chest", "rear", "core"]
  },
  "Conditioning": {
    blurb: "Work capacity and stamina: higher reps, very short rests and a cardio finisher.",
    cReps: "12-15", iReps: "15-20", cSets: [3, 3, 4], iSets: [2, 2, 3], restC: 45, restI: 30, vol: 0.8, cardio: true, emphasis: []
  },
  "General fitness": {
    blurb: "Balanced strength and health. Steady reps, every muscle covered, some cardio.",
    cReps: "8-12", iReps: "12-15", cSets: [3, 3, 4], iSets: [2, 3, 3], restC: 90, restI: 60, vol: 0.8, cardio: true, emphasis: []
  }
};

const goalOptions = {
  goal:       { label: "Main goal",      options: Object.keys(GOAL_PROFILES) },
  experience: { label: "Experience",     options: ["Beginner", "Intermediate", "Advanced"] },
  days:       { label: "Days per week",  options: ["2", "3", "4", "5", "6"] },
  minutes:    { label: "Session length", options: ["30", "45", "60", "90"], suffix: " min" }
};

// Things you may want to avoid, and the exercises that load them
const AVOID_AREAS = {
  "Shoulders":  /overhead|shoulder press|arnold|push press|pike|upright row|\bdips?\b|handstand|landmine press|kettlebell press|front raise|halo/i,
  "Lower back": /deadlift|good morning|barbell row|pendlay|meadows|t-bar|rack pull|back extension|hyperextension|superman|swing|back squat|front squat|bent-over|sit-up|rollout|slam/i,
  "Knees":      /squat|lunge|step-up|box jump|jump|leg extension|leg press|hack|pendulum|sissy|cossack|wall sit|burpee/i,
  "Wrists":     /push-up|plank|handstand|front squat|rollout|body saw|fallout|pike|\bdips?\b|skull|barbell curl|ez bar curl|kettlebell/i,
  "Elbows":     /skull|jm press|triceps|\bdips?\b|close-grip|diamond|preacher|zottman|drag curl|spider/i
};

function normGoals(g) {
  if (!g || typeof g !== "object") g = {};
  if (!GOAL_PROFILES[g.goal]) g.goal = "Build muscle";
  if (!goalOptions.experience.options.includes(g.experience)) g.experience = "Beginner";
  if (!goalOptions.days.options.includes(String(g.days))) g.days = "3";
  if (!goalOptions.minutes.options.includes(String(g.minutes))) g.minutes = "60";
  ["focus", "avoid", "targets"].forEach(function (k) { if (!Array.isArray(g[k])) g[k] = []; });
  g.focus = g.focus.filter(function (m) { return typeof m === "string"; }).slice(0, 3);
  g.targets = g.targets.filter(function (t) { return t && (t.type === "weight" || t.type === "lift") && isFinite(Number(t.goal)); }).slice(0, 4);
  if (g.autoRest === undefined) g.autoRest = true;
  if (!g.programme || typeof g.programme !== "object" || !g.programme.start) g.programme = null;
  if (!g.readiness || typeof g.readiness !== "object") g.readiness = null;
  if (["auto", "full", "ul", "ppl", "arnold", "part"].indexOf(g.split) < 0) g.split = "auto";
  g.splitOffset = Math.max(0, parseInt(g.splitOffset) || 0);   // sessions you chose to skip past
  // Days you train: 0 = Monday ... 6 = Sunday. Empty = whenever suits you.
  g.trainDays = (Array.isArray(g.trainDays) ? g.trainDays : []).map(Number)
    .filter(function (d, i, arr) { return d >= 0 && d <= 6 && d === Math.floor(d) && arr.indexOf(d) === i; }).sort();
  g.rota = normRota(g.rota);
  if (!g.sore || typeof g.sore !== "object" || !Array.isArray(g.sore.muscles)) g.sore = null;
  g.proteinTarget = Number(g.proteinTarget) > 0 ? Math.round(Number(g.proteinTarget)) : null;
  return g;
}

// A shift pattern: a cycle of so-many days that repeats, instead of a Monday-to-Sunday
// week. len = days in the cycle, work/gym/run = which days of the cycle (0 = day 1),
// start = a date that was day 1. null = not used.
function normRota(r) {
  if (!r || typeof r !== "object") return null;
  const len = Math.max(2, Math.min(28, Math.round(Number(r.len)) || 8));
  const tidy = function (list) {
    return (Array.isArray(list) ? list : []).map(Number)
      .filter(function (d, i, arr) { return d >= 0 && d < len && d === Math.floor(d) && arr.indexOf(d) === i; }).sort(function (a, b) { return a - b; });
  };
  const work = tidy(r.work);
  return { len: len, work: work, gym: tidy(r.gym), run: tidy(r.run),
           nights: tidy(r.nights).filter(function (d) { return work.indexOf(d) >= 0; }),     // which work days are night shifts
           start: /^\d{4}-\d{2}-\d{2}$/.test(r.start) && !isNaN(new Date(r.start + "T00:00:00")) ? r.start : dateKey(new Date()) };
}

let goals = normGoals(load("goals", {
  goal: "Build muscle",
  experience: "Beginner",
  days: "3",
  minutes: "60"
}));

function goalProfile() { return GOAL_PROFILES[goals.goal] || GOAL_PROFILES["Build muscle"]; }

function isAvoided(ex) {
  return goals.avoid.some(function (area) {
    const re = AVOID_AREAS[area];
    return re && re.test(ex.name);
  });
}

// How you said you feel today ("fresh", "normal", "tired"), or null if you haven't said
function readinessToday() {
  const r = goals.readiness;
  if (r && r.date === dateKey(new Date())) return r.level;
  return shiftReadiness();          // you haven't said: go by your shifts (tired on the first day off after nights)
}
// Did the answer come from you, or from your shift pattern?
function readinessFromShifts() {
  const r = goals.readiness;
  return !(r && r.date === dateKey(new Date())) && shiftReadiness() !== null;
}

// Weekly sets to aim for, per muscle: [low, high]
function weeklyTargets() {
  const p = goalProfile();
  const level = { "Beginner": 0, "Intermediate": 1, "Advanced": 2 }[goals.experience] || 0;
  const base = [[6, 10], [10, 14], [12, 18]][level];
  const out = {};
  MUSCLES.forEach(function (m) {
    const key = m[0];
    let mult = p.vol;
    if (p.emphasis.includes(key)) mult *= 1.25;
    if (goals.focus.includes(key)) mult *= 1.4;
    if (key === "calves" || key === "rear" || key === "core") mult *= 0.7;
    out[key] = [Math.max(3, Math.round(base[0] * mult)), Math.max(4, Math.round(base[1] * mult))];
  });
  return out;
}

// ----- The multi-week programme: Build, then Push, then an easier Deload week -----
function programmeInfo() {
  const p = goals.programme;
  if (!p) return null;
  const weeks = Number(p.weeks) || 8;
  const week = Math.floor(daysBetween(p.start, dateKey(new Date())) / 7) + 1;
  if (week > weeks) return { done: true, weeks: weeks, week: weeks, name: "Done", tip: "" };
  const w = Math.max(1, week);
  const buildEnd = Math.ceil((weeks - 1) / 2);
  if (w === weeks) return { done: false, weeks: weeks, week: w, name: "Deload", tip: "Easy week. Lighter weights and fewer sets so your body can recover." };
  if (w <= buildEnd) return { done: false, weeks: weeks, week: w, name: "Build", tip: "Leave 2-3 reps in the tank. Focus on form and adding reps." };
  return { done: false, weeks: weeks, week: w, name: "Push", tip: "Go harder: 1-2 reps in the tank, an extra set on the big lifts, add weight when you hit the top reps." };
}

// ----- Targets: a bodyweight or a lift, with an optional date -----
function bestE1rm(name) {
  let best = 0;
  getHistory().forEach(function (w) {
    w.exercises.forEach(function (ex) {
      if (ex.name !== name) return;
      ex.sets.forEach(function (s) { best = Math.max(best, e1rm(parseFloat(s.weight) || 0, parseInt(s.reps) || 0)); });
    });
  });
  return best;
}

function latestBodyWeight() {
  for (let i = bodyLog.length - 1; i >= 0; i--) if (bodyLog[i].weight > 0) return bodyLog[i].weight;
  return 0;
}

// Where is this target now? { cur, pct (0 to 1), left (days or null), status, text }
function targetProgress(t) {
  const today = dateKey(new Date());
  let cur, goalVal, curText, goalText;
  if (t.type === "weight") {
    cur = latestBodyWeight();
    goalVal = Number(t.goal);
    curText = cur ? fmtW(cur) + " " + unit() : "no weigh-in yet";
    goalText = fmtW(goalVal) + " " + unit();
  } else {
    const reps = Math.max(1, Number(t.reps) || 1);
    cur = bestE1rm(t.exercise);
    goalVal = e1rm(Number(t.goal), reps);
    const est = reps === 1 ? cur : cur / (1 + Math.min(reps, 15) / 30);
    curText = cur ? "≈ " + fmtW(est) + " " + unit() : "not logged yet";
    goalText = fmtW(Number(t.goal)) + " " + unit() + (reps > 1 ? " × " + reps : "");
  }
  const start = Number(t.start) || 0;
  let pct = 0;
  if (cur) {
    if (goalVal === start) pct = 1;
    else pct = (cur - start) / (goalVal - start);
  }
  pct = Math.max(0, Math.min(1, pct));
  let left = null, status = "";
  if (pct >= 1) status = "Reached";
  else if (t.date) {
    left = daysBetween(today, t.date);
    const total = Math.max(1, daysBetween(t.created || today, t.date));
    const expected = Math.max(0, Math.min(1, daysBetween(t.created || today, today) / total));
    status = left < 0 ? "Deadline passed" : (pct >= expected - 0.1 ? "On track" : "Behind");
  }
  return { cur: cur, pct: pct, left: left, status: status, curText: curText, goalText: goalText };
}

function targetTitle(t) { return t.type === "weight" ? "Bodyweight" : t.exercise; }

let tForm = { type: "weight", exercise: "", goal: "", reps: "1", date: "" };

// Which sections of the Goals card are open (remembered while the app is open)
const goalsOpen = { goal: true, schedule: false, session: false, body: false };
function renderGoals() {
  const optGroup = function (key) {
    const g = goalOptions[key];
    return `<div class="goal-group"><div class="card-label">${g.label}</div><div class="chips">` +
      g.options.map(function (opt) { return `<button class="chip${goals[key] === opt ? " on" : ""}" data-key="${key}" data-value="${opt}">${opt}${g.suffix || ""}</button>`; }).join("") +
      `</div>${key === "goal" ? `<div class="feed-meta goal-blurb">${esc(goalProfile().blurb)}</div>` : ""}</div>`;
  };
  const r = goals.rota, td = goals.trainDays;
  const splitName = goals.split === "auto" ? autoSplitLabel() : SPLITS[goals.split].label;

  const splitHtml = `<div class="goal-group"><div class="card-label">Split</div><div class="chips">` +
    Object.keys(SPLITS).map(function (k) { return `<button class="chip${goals.split === k ? " on" : ""}" data-key="split" data-value="${k}">${SPLITS[k].label}</button>`; }).join("") +
    `</div><div class="feed-meta goal-blurb">${esc(splitNote())}</div></div>`;
  const daysHtml = `<div class="goal-group"><div class="card-label">Training days (optional)</div><div class="chips">` +
    DAY_NAMES.map(function (d, i) { return `<button class="chip${td.indexOf(i) >= 0 ? " on" : ""}" data-day="${i}">${d}</button>`; }).join("") +
    `</div><div class="feed-meta goal-blurb">${!td.length ? "Not set: train whenever suits you." :
      (td.length >= 2 && td.length <= 6) ? td.length + " days picked, so days per week is " + td.length + ". Other days show as rest days on Home." :
      "Pick between 2 and 6 days to set your days per week from this."}</div></div>`;
  const focusHtml = `<div class="goal-group"><div class="card-label">Focus muscles (up to 3)</div><div class="chips">` +
    MUSCLES.map(function (m) { return `<button class="chip${goals.focus.includes(m[0]) ? " on" : ""}" data-multi="focus" data-value="${m[0]}">${m[1]}</button>`; }).join("") +
    `</div><div class="feed-meta goal-blurb">${goals.focus.length ? "These get an extra set and an extra exercise when the session allows." : "None picked: your plan is balanced."}</div></div>`;
  const avoidHtml = `<div class="goal-group"><div class="card-label">Avoid (injuries or niggles)</div><div class="chips">` +
    Object.keys(AVOID_AREAS).map(function (a) { return `<button class="chip${goals.avoid.includes(a) ? " on" : ""}" data-multi="avoid" data-value="${a}">${a}</button>`; }).join("") +
    `</div><div class="feed-meta goal-blurb">${goals.avoid.length ? "Exercises that load these are left out of your plans." : "Nothing avoided."}</div></div>`;
  const restHtml = `<div class="goal-group"><div class="card-label">Rest timer</div><div class="chips">
    <button class="chip${goals.autoRest ? " on" : ""}" data-key="autoRest" data-value="1">Set by goal</button>
    <button class="chip${!goals.autoRest ? " on" : ""}" data-key="autoRest" data-value="0">Always my setting</button></div></div>`;
  const t = weeklyTargets();
  const targetsHtml = `<details class="goal-weekly"><summary>Your weekly set targets</summary>` +
    MUSCLES.map(function (m) { return `<div class="obj-line"><span>${m[1]}</span><span>${t[m[0]][0]}-${t[m[0]][1]} sets</span></div>`; }).join("") + `</details>`;

  // Each section folds away, showing what is currently chosen so you rarely need to open it
  const muscleName = function (k) { const m = MUSCLES.find(function (x2) { return x2[0] === k; }); return m ? m[1] : k; };
  const section = function (id, title, now, body) {
    return `<details class="fold" data-sec="${id}"${goalsOpen[id] ? " open" : ""}><summary><span class="fold-t">${title}</span><span class="fold-v">${esc(now)}</span></summary><div class="fold-body">${body}</div></details>`;
  };
  // On a shift pattern the weekday choices don't apply, so they are left out
  const html =
    section("goal", "Goal", goals.goal + " · " + goals.experience, optGroup("goal") + optGroup("experience")) +
    section("schedule", "Schedule", r ? (r.work.length + " on, " + (r.len - r.work.length) + " off · " + r.gym.length + " gym days a cycle · " + splitName) : (goals.days + " days a week · " + splitName + (td.length ? " · " + td.map(function (d) { return DAY_NAMES[d]; }).join(", ") : "")),
      (r ? "" : optGroup("days")) + splitHtml + (r ? "" : daysHtml) + rotaHtml()) +
    section("session", "Session", goals.minutes + " min · rest " + (goals.autoRest ? "set by goal" : "always my setting"), optGroup("minutes") + restHtml) +
    section("body", "Focus and injuries", (goals.focus.length ? "Focus: " + goals.focus.map(muscleName).join(", ") : "Balanced") + (goals.avoid.length ? " · Avoiding: " + goals.avoid.join(", ").toLowerCase() : ""), focusHtml + avoidHtml + targetsHtml);

  $("goals-card").innerHTML = html;
}
// Remember which sections are open, so tapping a choice doesn't fold everything shut
$("goals-card").addEventListener("toggle", function (e) {
  const sec = e.target && e.target.dataset ? e.target.dataset.sec : null;
  if (sec) goalsOpen[sec] = !!e.target.open;
}, true);

$("goals-card").addEventListener("click", function (e) {
  const multi = e.target.closest("[data-multi]");
  if (multi) {
    const k = multi.dataset.multi, v = multi.dataset.value;
    const i = goals[k].indexOf(v);
    if (i >= 0) goals[k].splice(i, 1);
    else if (k === "focus" && goals.focus.length >= 3) return;
    else goals[k].push(v);
    save("goals", goals);
    renderGoals();
    refreshPlanAfterGoalChange();
    return;
  }
  const rotaBtn = e.target.closest("[data-rota]");
  if (rotaBtn) { rotaClick(rotaBtn.dataset.rota, Number(rotaBtn.dataset.v)); return; }
  const dayBtn = e.target.closest("[data-day]");
  if (dayBtn) {
    const d = Number(dayBtn.dataset.day);
    const i = goals.trainDays.indexOf(d);
    if (i >= 0) goals.trainDays.splice(i, 1); else goals.trainDays.push(d);
    goals.trainDays.sort();
    // The number of days you pick becomes your days per week
    if (goals.trainDays.length >= 2 && goals.trainDays.length <= 6) goals.days = String(goals.trainDays.length);
    save("goals", goals);
    renderGoals();
    refreshPlanAfterGoalChange();
    return;
  }
  const btn = e.target.closest("[data-key]");
  if (!btn) return;
  if (btn.dataset.key === "autoRest") goals.autoRest = btn.dataset.value === "1";
  else goals[btn.dataset.key] = btn.dataset.value;
  if (btn.dataset.key === "days" && goals.trainDays.length && goals.trainDays.length !== Number(goals.days)) goals.trainDays = [];
  if (btn.dataset.key === "split") {
    // Start the new split from its first session
    const len = getSplit().length;
    const finished = getHistory().filter(function (w) { return !w.routine; }).length;
    goals.splitOffset = (len - finished % len) % len;
  }
  save("goals", goals);
  renderGoals();
  refreshPlanAfterGoalChange();
});

$("goals-card").addEventListener("change", function (e) {
  if (e.target.id !== "rota-start" || !goals.rota) return;
  if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) goals.rota.start = e.target.value;
  save("goals", goals);
  renderGoals();
  refreshHome();
});

// If today's workout hasn't been started, rebuild it so it matches the new goals
function refreshPlanAfterGoalChange() {
  if (typeof workout === "undefined" || !workout) return;
  const started = workout.exercises.some(function (ex) { return ex.sets.some(function (s) { return s.done; }); });
  if (!started && !workout.fromRoutine && workout.exercises.length) {
    const plan = buildPlan();
    if (plan) { workout = newWorkout(plan); saveWorkout(); renderWorkout(); }
  }
  if (typeof refreshHome === "function") refreshHome();
}

// ----- Targets card (Gym tab) -----
function liftChoices() {
  return library.filter(function (l) { return l.need.length > 0 && !l.timed; })
    .map(function (l) { return l.name; }).sort();
}

function renderTargets() {
  const el = $("targets-card");
  if (!el) return;
  let html = "";

  goals.targets.forEach(function (t, i) {
    const p = targetProgress(t);
    html += `<div class="target-row">
      <div class="target-top"><b>${esc(targetTitle(t))}</b> <span class="feed-meta">${p.goalText}${t.date ? " by " + esc(t.date) : ""}</span>
        <button class="link-btn tdel" data-t="del" data-i="${i}" aria-label="Remove target">✕</button></div>
      <div class="obj-bar"><i style="width:${Math.round(p.pct * 100)}%"></i></div>
      <div class="feed-meta">Now: ${p.curText} · ${Math.round(p.pct * 100)}%${p.status ? " · " + p.status : ""}</div>
    </div>`;
  });
  if (!goals.targets.length) html += `<p class="feed-meta">No targets yet. Add one below, like a bodyweight or a lift you want to reach.</p>`;

  if (goals.targets.length < 4) {
    html += `<div class="goal-group" style="margin-top:.8rem"><div class="card-label">Add a target</div><div class="chips">
      <button class="chip${tForm.type === "weight" ? " on" : ""}" data-t="type" data-v="weight">Bodyweight</button>
      <button class="chip${tForm.type === "lift" ? " on" : ""}" data-t="type" data-v="lift">A lift</button></div></div>`;
    if (tForm.type === "lift") {
      html += `<div class="goal-group"><select class="set-input t-in" id="t-ex" style="text-align:left;padding-left:.8rem"><option value="">Pick an exercise</option>` +
        liftChoices().map(function (n) { return `<option${tForm.exercise === n ? " selected" : ""}>${esc(n)}</option>`; }).join("") + `</select></div>`;
    }
    html += `<div class="goal-group t-grid">
        <div><div class="card-label">${tForm.type === "weight" ? "Goal weight" : "Goal weight"} (${unit()})</div>
          <input class="set-input t-in" id="t-goal" inputmode="decimal" value="${esc(tForm.goal)}" style="text-align:left;padding-left:.8rem"></div>
        ${tForm.type === "lift" ? `<div><div class="card-label">Reps</div><input class="set-input t-in" id="t-reps" inputmode="numeric" value="${esc(tForm.reps)}" style="text-align:left;padding-left:.8rem"></div>` : ""}
        <div><div class="card-label">By (optional)</div><input class="set-input t-in" id="t-date" type="date" value="${esc(tForm.date)}" style="text-align:left;padding-left:.8rem"></div>
      </div>
      <div class="feed-meta" id="t-msg"></div>
      <button class="btn ghost" data-t="add">Add target</button>`;
  }
  el.innerHTML = html;
}

$("targets-card").addEventListener("input", function (e) {
  const t = e.target;
  if (t.id === "t-goal") tForm.goal = t.value;
  if (t.id === "t-reps") tForm.reps = t.value;
  if (t.id === "t-date") tForm.date = t.value;
});
$("targets-card").addEventListener("change", function (e) {
  if (e.target.id === "t-ex") tForm.exercise = e.target.value;
  if (e.target.id === "t-date") tForm.date = e.target.value;
});
$("targets-card").addEventListener("click", function (e) {
  const b = e.target.closest("[data-t]");
  if (!b) return;
  const a = b.dataset.t;
  if (a === "type") { tForm.type = b.dataset.v; renderTargets(); return; }
  if (a === "del") {
    goals.targets.splice(Number(b.dataset.i), 1);
    save("goals", goals); renderTargets(); refreshHome(); return;
  }
  if (a === "add") {
    const msg = $("t-msg");
    const n = parseFloat(String(tForm.goal).replace(",", "."));
    if (!isFinite(n) || n <= 0) { msg.textContent = "Enter a goal weight."; return; }
    const today = dateKey(new Date());
    const t = { id: Date.now(), type: tForm.type, goal: Math.round(fromDisp(n) * 100) / 100, date: tForm.date || "", created: today };
    if (t.date && t.date <= today) { msg.textContent = "Pick a date in the future, or leave it empty."; return; }
    if (tForm.type === "lift") {
      if (!tForm.exercise) { msg.textContent = "Pick an exercise."; return; }
      t.exercise = tForm.exercise;
      t.reps = Math.max(1, Math.min(15, parseInt(tForm.reps) || 1));
      t.start = Math.round(bestE1rm(t.exercise) * 100) / 100;
    } else {
      t.start = latestBodyWeight();
      if (!t.start) { msg.textContent = "Log your body weight first (Progress tab), so I know where you start."; return; }
    }
    goals.targets.push(t);
    save("goals", goals);
    tForm = { type: tForm.type, exercise: "", goal: "", reps: "1", date: "" };
    renderTargets(); refreshHome();
  }
});

// ----- Programme card (Gym tab) -----
let progWeeks = 8;

function renderProgramme() {
  const el = $("programme-card");
  if (!el) return;
  const info = programmeInfo();
  let html = "";

  if (info && !info.done) {
    const cells = [];
    for (let w = 1; w <= info.weeks; w++) {
      const ph = w === info.weeks ? "Deload" : (w <= Math.ceil((info.weeks - 1) / 2) ? "Build" : "Push");
      cells.push(`<i class="ph-${ph.toLowerCase()}${w === info.week ? " now" : ""}${w < info.week ? " past" : ""}"></i>`);
    }
    html += `<div class="card-label">Week ${info.week} of ${info.weeks}</div>
      <div class="big">${info.name} phase</div>
      <div class="ph-bar">${cells.join("")}</div>
      <div class="feed-meta">${info.tip}</div>
      <div class="btn-row"><button class="btn ghost" data-p="stop">Stop programme</button></div>`;
  } else {
    html += info && info.done ? `<div class="big">Programme complete 🎉</div><div class="feed-meta">Nice work. Start another when you're ready.</div>` :
      `<div class="feed-meta">A programme plans your weeks for you: a Build phase, a harder Push phase, then an easy Deload week. Exercises stay the same within it so you can add weight.</div>`;
    html += `<div class="goal-group" style="margin-top:.8rem"><div class="card-label">Length</div><div class="chips">` +
      [4, 6, 8, 12].map(function (n) { return `<button class="chip${progWeeks === n ? " on" : ""}" data-p="weeks" data-v="${n}">${n} weeks</button>`; }).join("") +
      `</div></div><button class="btn" data-p="start">Start programme</button>`;
  }
  el.innerHTML = html;
}

$("programme-card").addEventListener("click", function (e) {
  const b = e.target.closest("[data-p]");
  if (!b) return;
  const a = b.dataset.p;
  if (a === "weeks") { progWeeks = Number(b.dataset.v); renderProgramme(); return; }
  if (a === "start") goals.programme = { start: weekBounds(0).start, weeks: progWeeks };
  if (a === "stop") { if (!confirm("Stop the programme?")) return; goals.programme = null; }
  save("goals", goals);
  renderProgramme(); refreshPlanAfterGoalChange();
});

// ----- Today's objectives (Home) -----
function renderObjectives() {
  const el = $("objectives");
  if (!el) return;
  const info = programmeInfo();
  const b = periodBounds(0);
  const goalDays = periodGoal();
  const doneDays = new Set(getWorkoutDates().filter(function (d) { return d >= b.start && d <= b.end; })).size;
  const mc = muscleCounts(0).counts;
  const tg = weeklyTargets();
  const bar = function (pct) { return `<div class="obj-bar"><i style="width:${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%"></i></div>`; };

  let html = `<div class="card-label">This ${periodWord()}</div>`;
  if (info && !info.done) html += `<div class="obj-prog"><b>Week ${info.week} of ${info.weeks} · ${info.name}</b><span class="feed-meta">${info.tip}</span></div>`;

  html += `<div class="obj-line"><span>Workouts</span><span>${doneDays} / ${goalDays}</span></div>${bar(doneDays / goalDays)}`;
  if (goalProfile().cardio) {
    const cTarget = goals.goal === "General fitness" ? 60 : 90;
    const cDone = cardioMinutes(0);
    html += `<div class="obj-line"><span>Cardio minutes</span><span>${cDone} / ${cTarget}</span></div>${bar(cDone / cTarget)}`;
  }

  const order = MUSCLES.map(function (m) { return m[0]; }).sort(function (a, c) {
    return (goals.focus.includes(c) ? 1 : 0) - (goals.focus.includes(a) ? 1 : 0);
  });
  const shown = goals.focus.length ? goals.focus : [];
  shown.forEach(function (k) {
    const m = MUSCLES.find(function (x2) { return x2[0] === k; });
    html += `<div class="obj-line"><span>${m ? m[1] : k} sets</span><span>${mc[k] || 0} / ${tg[k][0]}-${tg[k][1]}</span></div>${bar((mc[k] || 0) / tg[k][0])}`;
  });
  html += `<details class="goal-weekly"><summary>${goals.rota ? "Sets per muscle (this calendar week)" : "All muscles"}</summary>` + order.map(function (k) {
    const m = MUSCLES.find(function (x2) { return x2[0] === k; });
    return `<div class="obj-line"><span>${m[1]}</span><span>${mc[k] || 0} / ${tg[k][0]}-${tg[k][1]}</span></div>${bar((mc[k] || 0) / tg[k][0])}`;
  }).join("") + `</details>`;

  goals.targets.forEach(function (t) {
    const p = targetProgress(t);
    html += `<div class="obj-line obj-target"><span>🎯 ${esc(targetTitle(t))}: ${p.goalText}</span><span>${Math.round(p.pct * 100)}%</span></div>${bar(p.pct)}
      <div class="feed-meta">Now: ${p.curText}${p.left !== null && p.left >= 0 ? " · " + p.left + (p.left === 1 ? " day" : " days") + " left" : ""}${p.status ? " · " + p.status : ""}</div>`;
  });

  el.innerHTML = html;
}


// =====================================================================
// DATES, STREAKS, HEATMAP, BADGES (the Home tab)
// =====================================================================
function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getWorkoutDates() { return load("workoutDates", []); }

function addWorkoutDate(key) {
  const dates = getWorkoutDates();
  if (!dates.includes(key)) {
    dates.push(key);
    save("workoutDates", dates);
  }
}

// After deleting/moving a workout: forget the date if nothing else happened that day
function dropDateIfUnused(key) {
  if (getHistory().some(function (w) { return w.date === key; })) return;
  save("workoutDates", getWorkoutDates().filter(function (d) { return d !== key; }));
}

function renderWeek() {
  const strip = $("week-strip");
  const names = ["M", "T", "W", "T", "F", "S", "S"];
  const workoutDates = getWorkoutDates();

  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));

  strip.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);

    const isToday = d.toDateString() === today.toDateString();
    const isDone = workoutDates.includes(dateKey(d));

    const div = document.createElement("div");
    div.className = "day" + (isToday ? " today" : "") + (isDone ? " done" : "");
    div.innerHTML = `${names[i]}<div class="day-circle">${d.getDate()}</div>`;
    strip.appendChild(div);
  }
}

// The streak counts weeks, not days: rest days are part of the plan, so a run of
// days in a row is the wrong thing to reward. A week counts when you trained on
// at least your goal number of days. This week counts as soon as you hit it,
// and does not break the streak while it is still in progress.
// ----- weeks, or shift cycles -----
// Most people count training by the week. On a shift pattern the natural unit is
// one cycle (8 days for 4 on, 4 off), so the streak, the Home bar and the review
// count in cycles instead. "Period" below means whichever applies.
function periodLen() { return goals.rota ? goals.rota.len : 7; }
function periodWord() { return goals.rota ? "cycle" : "week"; }
function periodStartKey(key) { return goals.rota ? addDays(key, -cyclePos(key)) : weekStartKey(key); }
// days (optional): only the first so-many days of the period
function periodBounds(offset, days) {
  if (!goals.rota) return weekBounds(offset, days);
  const len = goals.rota.len;
  const start = addDays(periodStartKey(dateKey(new Date())), -len * (offset || 0));
  return { start: start, end: addDays(start, (days >= 1 && days <= len ? days : len) - 1) };
}
// Which day of the period today is (1 = first)
function periodDay() { return goals.rota ? cyclePos(dateKey(new Date())) + 1 : todayIndex() + 1; }
// How many training days make the goal: your gym days per cycle, or your days per week
function periodGoal() {
  if (goals.rota && goals.rota.gym.length) return goals.rota.gym.length;
  return Math.max(1, Math.min(7, Number(goals.days) || 3));
}

function weekStreak() {
  const goalDays = periodGoal();
  const perWeek = {};
  getWorkoutDates().forEach(function (d) {
    const k = periodStartKey(d);
    (perWeek[k] = perWeek[k] || {})[d] = true;
  });
  const hit = function (offset) {
    const days = perWeek[periodBounds(offset).start];
    return !!days && Object.keys(days).length >= goalDays;
  };
  let count = hit(0) ? 1 : 0;
  for (let i = 1; hit(i); i++) count++;
  return count;
}
function streakText(n) { return n + " " + periodWord() + (n === 1 ? "" : "s"); }

function renderStreak() {
  const el = document.getElementById("streak");     // the old Streak tile; the bar at the top of Home shows it now
  if (el) el.textContent = streakText(weekStreak());
}

// The segmented bar: one segment per training day in your goal, filled as you complete them
function renderWeekbar() {
  const goalDays = periodGoal();
  const b = periodBounds(0);
  const doneDays = new Set(getWorkoutDates().filter(function (d) { return d >= b.start && d <= b.end; })).size;
  const n = weekStreak();

  let segs = "";
  for (let i = 0; i < goalDays; i++) segs += `<i class="${i < doneDays ? "on" : ""}"></i>`;
  $("weekbar").innerHTML = `<div class="wb-segs">${segs}</div>
    <div class="wb-text"><span>${doneDays} of ${goalDays} completed this ${periodWord()}</span>
    <span>Streak: ${streakText(n)}</span></div>`;
}

// The big card on Home answers one question: what am I doing today?
// It has four states: a gym day, a run-only day, a rest day, and "done for today".
function todayState() {
  const day = schedule(dateKey(new Date()), 1).days[0];
  const run = day.run && day.run.s && !day.run.done ? day.run.s : null;
  const done = trainedToday();
  const rest = isRestDay();
  return { run: run, done: done, rest: rest, kind: done ? "done" : rest ? (run ? "run" : "rest") : "gym" };
}
function renderHero() {
  const exercises = workout.exercises.length;
  let sets = 0;
  workout.exercises.forEach(function (ex) {
    ex.sets.forEach(function (s) { if (!s.warmup) sets++; });
  });
  const mins = Math.max(5, Math.round(sets * 3.5 / 5) * 5);   // about 3.5 minutes a set, rest included
  const _ph = programmeInfo();
  const gymLine = exercises
    ? exercises + (exercises === 1 ? " exercise" : " exercises") + " • " + sets + (sets === 1 ? " set" : " sets") + " • ~" + mins + " mins"
    : "Add some exercises to get started";
  const st = todayState();
  const next = upcomingSessions(1)[0], when = nextSessionLabel();
  const nextLine = "Next: " + next + (when === "Today" ? "" : " · " + when);
  const btn = $("hero-btn"), extra = $("hero-extra");

  $("hero-label").textContent = (goals.goal || "") + (_ph && !_ph.done ? " · Week " + _ph.week + " of " + _ph.weeks : "");
  $("hero-pill").textContent = st.kind === "done" ? "Done for today" : st.kind === "rest" ? "Rest day" : st.kind === "run" ? "Run day" : hasFixedDays() ? "Today" : "Next workout";
  btn.className = "btn";
  btn.dataset.action = "start-workout";
  extra.innerHTML = "";

  if (st.kind === "gym") {
    $("next-workout").textContent = workout.name;
    $("next-meta").textContent = gymLine;
    btn.textContent = "Start";
    if (st.run) extra.innerHTML = `<div class="hero-also"><span>Also today: <b>${esc(runShort(st.run))}</b></span><button class="tool" data-action="start-run">Run</button></div>`;
  } else if (st.kind === "run") {
    $("next-workout").textContent = runShort(st.run);
    $("next-meta").textContent = sessionLine(st.run);
    btn.textContent = "Start run";
    btn.dataset.action = "start-run";
    extra.innerHTML = `<div class="hero-also"><span>No gym today. ${esc(nextLine)}.</span><button class="tool" data-action="start-workout">Lift anyway</button></div>`;
  } else if (st.kind === "rest") {
    $("next-workout").textContent = "Rest day";
    $("next-meta").textContent = nextLine + ".";
    btn.textContent = "Train anyway";
    btn.className = "btn ghost";
  } else {
    $("next-workout").textContent = "Session done";
    $("next-meta").textContent = nextLine + ".";
    btn.textContent = "Train again";
    btn.className = "btn ghost";
    if (st.run) extra.innerHTML = `<div class="hero-also"><span>Still to do: <b>${esc(runShort(st.run))}</b></span><button class="tool" data-action="start-run">Run</button></div>`;
  }
  $("home-gym-sub").textContent = selected.length + (selected.length === 1 ? " item of equipment" : " items of equipment");
}

// "Skip to next session", or back to the split when something else is loaded
function skipOrBack() {
  const s = upcomingSessions(1);
  if (workout.fromRoutine || workout.name !== s[0]) {
    // A routine or custom workout is loaded: go back to the split's session
    const started = workout.exercises.some(function (ex) { return ex.sets.some(function (x) { return x.done; }); });
    if (started && !confirm("Replace your current workout? Ticked sets will be lost.")) return;
    const plan = buildPlan();
    if (plan) { workout = newWorkout(plan); saveWorkout(); }
    renderAll();
    return;
  }
  skipSession();
}
$("weekplan").addEventListener("click", function (e) { if (e.target.closest("[data-wp]")) skipOrBack(); });

$("upnext").addEventListener("click", function (e) {
  if (e.target.closest("#skip-session")) skipOrBack();
});

$("alt-tiles").addEventListener("click", function (e) {
  const b = e.target.closest("[data-home]");
  if (!b) return;
  const a = b.dataset.home;

  if (a === "shuffle") { showTab("workout"); generateWorkout(); return; }

  if (a === "routines") {
    showTab("workout");
    setupOpen = true; syncSetup();
    const r = $("routines-card");
    if (r && r.scrollIntoView) r.scrollIntoView();
    return;
  }

  if (a === "timer") { openInterval(); return; }

  if (a === "manual") {
    const started = workout.exercises.some(function (ex) { return ex.sets.some(function (s) { return s.done; }); });
    if (started && !confirm("Replace your current workout? Ticked sets will be lost.")) return;
    workout = newWorkout({ name: "Custom Workout", exercises: [] });
    saveWorkout();
    renderWorkout();
    showTab("workout");
    openAddExercise();
  }
});

// "Up next" on Home: today's session and the two after it
function renderUpNext() {
  const el = $("upnext");
  if (!el) return;
  const s = upcomingSessions(3);
  const own = workout.fromRoutine || workout.name !== s[0];   // a routine or custom workout is loaded instead
  const row = function (label, name, now) { return `<div class="up-row${now ? " now" : ""}"><span>${label}</span><b>${esc(name)}</b></div>`; };
  const first = nextSessionLabel();
  const rest = isRestDay();
  const daysLine = goals.rota
    ? `<div class="feed-meta" style="margin-top:.7rem">Shift pattern: today is <b style="color:var(--text)">${cycleLabel(cyclePos(dateKey(new Date())))}</b>.` +
      (goals.rota.gym.length ? " Gym on " + goals.rota.gym.map(cycleLabel).join(", ") + "." : "") + (rest ? " Today is a rest day; you can still train if you want to." : "") + `</div>`
    : goals.trainDays.length ? `<div class="feed-meta" style="margin-top:.7rem">Training days: ` +
    goals.trainDays.map(function (d) { return d === todayIndex() ? "<b style=\"color:var(--text)\">" + DAY_NAMES[d] + "</b>" : DAY_NAMES[d]; }).join(" · ") +
    (rest ? ". Today is a rest day; you can still train if you want to." : ".") + `</div>` : "";
  el.innerHTML = `<div class="card-label">Up next · ${esc(goals.split === "auto" ? autoSplitLabel() : SPLITS[goals.split].label)}</div>` +
    (own ? row("Now", workout.name, true) + row("Then", s[0]) + row("After", s[1])
         : row(first, s[0], true) + row("Next", s[1]) + row("Then", s[2])) + daysLine +
    `<button class="btn ghost" id="skip-session">${own ? "Back to my split" : "Skip to next session"}</button>`;
}

function refreshHome() {
  renderUpNext();
  renderWeekPlan();
  renderHero();
  queueReminders();
  renderProtein();
  renderWeekbar();
  renderObjectives();
  renderWeek();
  renderStreak();
}


// =====================================================================
// REST TIMER
// =====================================================================
let restEnd = 0;
let restTimer = null;

function startRest(seconds, label) {
  const lab = document.querySelector("#rest .rest-label");
  if (lab) lab.textContent = label || "Rest";
  restEnd = Date.now() + seconds * 1000;
  $("rest").classList.add("show");
  if (!restTimer) restTimer = setInterval(tickRest, 250);
  tickRest();
  syncWake();
}

function tickRest() {
  const left = Math.ceil((restEnd - Date.now()) / 1000);
  if (left <= 0) {
    const late = Math.round((Date.now() - restEnd) / 1000);
    stopRest();
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    if (late >= 3) flashRestOver(late);   // it ended while the app was in the background
    return;
  }
  $("rest-time").textContent = mmss(left);
}

function stopRest() {
  clearInterval(restTimer);
  restTimer = null;
  restNotify(false);
  $("rest").classList.remove("show");
  syncWake();
}

$("rest-add").addEventListener("click", function () {
  restEnd += 15000;
  tickRest();
});
$("rest-skip").addEventListener("click", stopRest);


// =====================================================================
// EXERCISE LIBRARY
// x(name, muscle, type, need, timed)
//   type:  "compound" (big multi-joint lift) or "iso" (single-muscle)
//   need:  equipment you must own. "A|B" means either A or B will do.
//          An empty list [] means bodyweight only.
//   timed: true for exercises measured in seconds (like plank)
// Note: "hamstrings" covers glutes and hips too. "rear" is rear shoulders / upper back.
// =====================================================================
function x(name, muscle, type, need, timed) {
  return { name: name, muscle: muscle, type: type, need: need || [], timed: !!timed };
}

const BENCH = "Flat bench|Adjustable bench";

const library = [
  // Chest
  x("Barbell Bench Press",        "chest", "compound", ["Barbell", BENCH]),
  x("Dumbbell Bench Press",       "chest", "compound", ["Dumbbells", BENCH]),
  x("Incline Dumbbell Press",     "chest", "compound", ["Dumbbells", "Adjustable bench"]),
  x("Smith Machine Bench Press",  "chest", "compound", ["Smith machine", BENCH]),
  x("Resistance Band Chest Press","chest", "compound", ["Resistance bands"]),
  x("Push-ups",                   "chest", "compound", []),
  x("Cable Fly",                  "chest", "iso",      ["Cable machine"]),
  x("Dumbbell Fly",               "chest", "iso",      ["Dumbbells", BENCH]),

  // Back
  x("Pull-ups",                   "back", "compound", ["Pull-up bar"]),
  x("Chin-ups",                   "back", "compound", ["Pull-up bar"]),
  x("Lat Pulldown",               "back", "compound", ["Lat pulldown"]),
  x("Barbell Row",                "back", "compound", ["Barbell"]),
  x("One-Arm Dumbbell Row",       "back", "compound", ["Dumbbells"]),
  x("Seated Cable Row",           "back", "compound", ["Cable machine"]),
  x("Kettlebell Row",             "back", "compound", ["Kettlebells"]),
  x("Resistance Band Row",        "back", "compound", ["Resistance bands"]),
  x("Straight-Arm Pulldown",      "back", "iso",      ["Cable machine"]),
  x("Dumbbell Pullover",          "back", "iso",      ["Dumbbells", BENCH]),

  // Rear shoulders / upper back
  x("Face Pull",                  "rear", "iso", ["Cable machine"]),
  x("Rear Delt Fly",              "rear", "iso", ["Dumbbells"]),
  x("Band Pull-Apart",            "rear", "iso", ["Resistance bands"]),

  // Shoulders
  x("Overhead Press",             "shoulders", "compound", ["Barbell"]),
  x("Dumbbell Shoulder Press",    "shoulders", "compound", ["Dumbbells"]),
  x("Kettlebell Press",           "shoulders", "compound", ["Kettlebells"]),
  x("Smith Machine Shoulder Press","shoulders","compound", ["Smith machine"]),
  x("Pike Push-ups",              "shoulders", "compound", []),
  x("Dumbbell Lateral Raise",     "shoulders", "iso",      ["Dumbbells"]),
  x("Cable Lateral Raise",        "shoulders", "iso",      ["Cable machine"]),
  x("Band Lateral Raise",         "shoulders", "iso",      ["Resistance bands"]),
  x("Plate Front Raise",          "shoulders", "iso",      ["Weight plates"]),

  // Biceps
  x("Barbell Curl",               "biceps", "iso", ["Barbell"]),
  x("Dumbbell Curl",              "biceps", "iso", ["Dumbbells"]),
  x("Hammer Curl",                "biceps", "iso", ["Dumbbells"]),
  x("EZ Bar Curl",                "biceps", "iso", ["EZ curl bar"]),
  x("Cable Curl",                 "biceps", "iso", ["Cable machine"]),
  x("Band Curl",                  "biceps", "iso", ["Resistance bands"]),
  x("Incline Dumbbell Curl",      "biceps", "iso", ["Dumbbells", "Adjustable bench"]),

  // Triceps
  x("Triceps Dips",               "triceps", "compound", ["Dip station"]),
  x("Close-Grip Bench Press",     "triceps", "compound", ["Barbell", BENCH]),
  x("Bench Dips",                 "triceps", "compound", [BENCH]),
  x("Diamond Push-ups",           "triceps", "compound", []),
  x("Skull Crushers",             "triceps", "iso",      ["EZ curl bar", BENCH]),
  x("Overhead Triceps Extension", "triceps", "iso",      ["Dumbbells"]),
  x("Cable Triceps Pushdown",     "triceps", "iso",      ["Cable machine"]),
  x("Band Triceps Pushdown",      "triceps", "iso",      ["Resistance bands"]),

  // Quads
  x("Barbell Back Squat",         "quads", "compound", ["Barbell", "Squat rack"]),
  x("Smith Machine Squat",        "quads", "compound", ["Smith machine"]),
  x("Leg Press",                  "quads", "compound", ["Leg press"]),
  x("Goblet Squat",               "quads", "compound", ["Dumbbells|Kettlebells"]),
  x("Bulgarian Split Squat",      "quads", "compound", [BENCH]),
  x("Dumbbell Step-ups",          "quads", "compound", ["Dumbbells", BENCH]),
  x("Walking Lunges",             "quads", "compound", []),
  x("Bodyweight Squats",          "quads", "compound", []),

  // Hamstrings and glutes
  x("Romanian Deadlift",          "hamstrings", "compound", ["Barbell"]),
  x("Deadlift",                   "hamstrings", "compound", ["Barbell"]),
  x("Dumbbell Romanian Deadlift", "hamstrings", "compound", ["Dumbbells"]),
  x("Kettlebell Swing",           "hamstrings", "compound", ["Kettlebells"]),
  x("Hip Thrust",                 "hamstrings", "compound", ["Barbell", BENCH]),
  x("Dumbbell Hip Thrust",        "hamstrings", "compound", ["Dumbbells", BENCH]),
  x("Single-Leg Romanian Deadlift","hamstrings","compound", []),
  x("Cable Pull-Through",         "hamstrings", "iso",      ["Cable machine"]),
  x("Band Pull-Through",          "hamstrings", "iso",      ["Resistance bands"]),
  x("Glute Bridge",               "hamstrings", "iso",      []),

  // Calves
  x("Standing Calf Raise",        "calves", "iso", []),
  x("Dumbbell Calf Raise",        "calves", "iso", ["Dumbbells"]),
  x("Leg Press Calf Raise",       "calves", "iso", ["Leg press"]),

  // Core
  x("Plank",                      "core", "iso", [], true),
  x("Hanging Knee Raise",         "core", "iso", ["Pull-up bar"]),
  x("Ab Wheel Rollout",           "core", "iso", ["Ab wheel"]),
  x("Cable Crunch",               "core", "iso", ["Cable machine"]),
  x("Russian Twist",              "core", "iso", ["Weight plates|Dumbbells|Kettlebells|Medicine ball"]),
  x("Dead Bug",                   "core", "iso", []),
  x("Bicycle Crunch",             "core", "iso", []),

  // ===== Added with the bigger equipment list =====
  // Chest
  x("Incline Barbell Bench Press",   "chest", "compound", ["Barbell", "Adjustable bench"]),
  x("Decline Barbell Bench Press",   "chest", "compound", ["Barbell", "Decline bench"]),
  x("Decline Dumbbell Press",        "chest", "compound", ["Dumbbells", "Decline bench"]),
  x("Dumbbell Floor Press",          "chest", "compound", ["Dumbbells"]),
  x("Smith Machine Incline Press",   "chest", "compound", ["Smith machine", "Adjustable bench"]),
  x("Machine Chest Press",           "chest", "compound", ["Chest press machine"]),
  x("Plate-Loaded Chest Press",      "chest", "compound", ["Plate-loaded chest press"]),
  x("Plate-Loaded Incline Press",    "chest", "compound", ["Plate-loaded incline press"]),
  x("Chest Dips",                    "chest", "compound", ["Dip station"]),
  x("Ring Push-ups",                 "chest", "compound", ["Gymnastic rings"]),
  x("Suspension Push-ups",           "chest", "compound", ["Suspension trainer"]),
  x("Decline Push-ups",              "chest", "compound", ["Flat bench|Adjustable bench|Decline bench|Plyo box"]),
  x("Pec Deck Fly",                  "chest", "iso",      ["Pec deck machine"]),
  x("Incline Dumbbell Fly",          "chest", "iso",      ["Dumbbells", "Adjustable bench"]),
  x("High-to-Low Cable Fly",         "chest", "iso",      ["Cable machine"]),
  x("Low-to-High Cable Fly",         "chest", "iso",      ["Cable machine"]),
  x("Dumbbell Squeeze Press",        "chest", "iso",      ["Dumbbells", BENCH]),
  x("Plate Svend Press",             "chest", "iso",      ["Weight plates"]),
  x("Band Chest Fly",                "chest", "iso",      ["Resistance bands"]),
  x("Suspension Chest Fly",          "chest", "iso",      ["Suspension trainer"]),

  // Back
  x("Wide-Grip Pull-ups",            "back", "compound", ["Pull-up bar"]),
  x("Neutral-Grip Pull-ups",         "back", "compound", ["Pull-up bar"]),
  x("Weighted Pull-ups",             "back", "compound", ["Pull-up bar", "Dip belt"]),
  x("Assisted Pull-ups",             "back", "compound", ["Assisted pull-up machine"]),
  x("Wide-Grip Lat Pulldown",        "back", "compound", ["Lat pulldown"]),
  x("Close-Grip Lat Pulldown",       "back", "compound", ["Lat pulldown"]),
  x("Reverse-Grip Lat Pulldown",     "back", "compound", ["Lat pulldown"]),
  x("Single-Arm Lat Pulldown",       "back", "compound", ["Cable machine"]),
  x("Single-Arm Cable Row",          "back", "compound", ["Cable machine"]),
  x("Seated Machine Row",            "back", "compound", ["Low row machine"]),
  x("Chest-Supported Machine Row",   "back", "compound", ["Plate-loaded row"]),
  x("T-Bar Row Machine",             "back", "compound", ["T-bar row machine"]),
  x("Landmine T-Bar Row",            "back", "compound", ["Barbell", "Landmine"]),
  x("Meadows Row",                   "back", "compound", ["Barbell", "Landmine"]),
  x("Pendlay Row",                   "back", "compound", ["Barbell"]),
  x("Rack Pull",                     "back", "compound", ["Barbell", "Squat rack"]),
  x("Bent-Over Dumbbell Row",        "back", "compound", ["Dumbbells"]),
  x("Chest-Supported Dumbbell Row",  "back", "compound", ["Dumbbells", "Adjustable bench"]),
  x("Inverted Row (Smith Machine)",  "back", "compound", ["Smith machine"]),
  x("Suspension Row",                "back", "compound", ["Suspension trainer"]),
  x("Ring Row",                      "back", "compound", ["Gymnastic rings"]),
  x("Band Lat Pulldown",             "back", "compound", ["Resistance bands"]),
  x("Barbell Shrug",                 "back", "iso",      ["Barbell"]),
  x("Dumbbell Shrug",                "back", "iso",      ["Dumbbells"]),
  x("Trap Bar Shrug",                "back", "iso",      ["Trap bar"]),
  x("Back Extension",                "back", "iso",      ["Back extension bench"]),
  x("Superman",                      "back", "iso",      []),

  // Rear shoulders / upper back
  x("Reverse Pec Deck",              "rear", "iso", ["Pec deck machine"]),
  x("Cable Rear Delt Fly",           "rear", "iso", ["Cable machine"]),
  x("Chest-Supported Reverse Fly",   "rear", "iso", ["Dumbbells", "Adjustable bench"]),
  x("Incline Dumbbell Y Raise",      "rear", "iso", ["Dumbbells", "Adjustable bench"]),
  x("Band Face Pull",                "rear", "iso", ["Resistance bands"]),
  x("Suspension Reverse Fly",        "rear", "iso", ["Suspension trainer"]),

  // Shoulders
  x("Machine Shoulder Press",        "shoulders", "compound", ["Shoulder press machine"]),
  x("Plate-Loaded Shoulder Press",   "shoulders", "compound", ["Plate-loaded shoulder press"]),
  x("Seated Dumbbell Shoulder Press","shoulders", "compound", ["Dumbbells", "Adjustable bench"]),
  x("Arnold Press",                  "shoulders", "compound", ["Dumbbells"]),
  x("Push Press",                    "shoulders", "compound", ["Barbell"]),
  x("Landmine Press",                "shoulders", "compound", ["Barbell", "Landmine"]),
  x("Barbell Upright Row",           "shoulders", "compound", ["Barbell"]),
  x("Machine Lateral Raise",         "shoulders", "iso",      ["Lateral raise machine"]),
  x("Leaning Dumbbell Lateral Raise","shoulders", "iso",      ["Dumbbells"]),
  x("Dumbbell Front Raise",          "shoulders", "iso",      ["Dumbbells"]),
  x("Cable Front Raise",             "shoulders", "iso",      ["Cable machine"]),
  x("Cable Upright Row",             "shoulders", "iso",      ["Cable machine"]),
  x("Kettlebell Halo",               "shoulders", "iso",      ["Kettlebells"]),

  // Biceps
  x("Preacher Curl",                 "biceps", "iso", ["EZ curl bar", "Preacher curl bench"]),
  x("Dumbbell Preacher Curl",        "biceps", "iso", ["Dumbbells", "Preacher curl bench"]),
  x("Machine Preacher Curl",         "biceps", "iso", ["Preacher curl machine"]),
  x("Concentration Curl",            "biceps", "iso", ["Dumbbells"]),
  x("Spider Curl",                   "biceps", "iso", ["Dumbbells", "Adjustable bench"]),
  x("Zottman Curl",                  "biceps", "iso", ["Dumbbells"]),
  x("Cable Rope Hammer Curl",        "biceps", "iso", ["Cable machine"]),
  x("Single-Arm Cable Curl",         "biceps", "iso", ["Cable machine"]),
  x("Reverse Curl",                  "biceps", "iso", ["EZ curl bar"]),
  x("Drag Curl",                     "biceps", "iso", ["Barbell"]),
  x("Suspension Biceps Curl",        "biceps", "iso", ["Suspension trainer"]),

  // Triceps
  x("Machine Triceps Extension",     "triceps", "iso",      ["Triceps extension machine"]),
  x("Weighted Dips",                 "triceps", "compound", ["Dip station", "Dip belt"]),
  x("Ring Dips",                     "triceps", "compound", ["Gymnastic rings"]),
  x("Close-Grip Smith Press",        "triceps", "compound", ["Smith machine", BENCH]),
  x("JM Press",                      "triceps", "compound", ["Barbell", BENCH]),
  x("Dumbbell Skull Crushers",       "triceps", "iso",      ["Dumbbells", BENCH]),
  x("Triceps Kickback",              "triceps", "iso",      ["Dumbbells"]),
  x("Overhead Cable Triceps Extension","triceps","iso",     ["Cable machine"]),
  x("Reverse-Grip Cable Pushdown",   "triceps", "iso",      ["Cable machine"]),
  x("Band Overhead Triceps Extension","triceps","iso",      ["Resistance bands"]),
  x("Suspension Triceps Extension",  "triceps", "iso",      ["Suspension trainer"]),

  // Quads
  x("Leg Extension",                 "quads", "iso",      ["Leg extension machine"]),
  x("Hack Squat",                    "quads", "compound", ["Hack squat machine"]),
  x("Pendulum Squat",                "quads", "compound", ["Pendulum squat machine"]),
  x("Belt Squat",                    "quads", "compound", ["Belt squat machine"]),
  x("Front Squat",                   "quads", "compound", ["Barbell", "Squat rack"]),
  x("Single-Leg Press",              "quads", "compound", ["Leg press"]),
  x("Smith Machine Split Squat",     "quads", "compound", ["Smith machine"]),
  x("Barbell Lunge",                 "quads", "compound", ["Barbell", "Squat rack"]),
  x("Dumbbell Lunge",                "quads", "compound", ["Dumbbells"]),
  x("Dumbbell Reverse Lunge",        "quads", "compound", ["Dumbbells"]),
  x("Dumbbell Squat",                "quads", "compound", ["Dumbbells"]),
  x("Dumbbell Sumo Squat",           "quads", "compound", ["Dumbbells|Kettlebells"]),
  x("Kettlebell Front Squat",        "quads", "compound", ["Kettlebells"]),
  x("Box Step-ups",                  "quads", "compound", ["Plyo box"]),
  x("Box Jumps",                     "quads", "compound", ["Plyo box"]),
  x("Suspension Squat",              "quads", "compound", ["Suspension trainer"]),
  x("Band Squat",                    "quads", "compound", ["Resistance bands"]),
  x("Jump Squats",                   "quads", "compound", []),
  x("Cossack Squat",                 "quads", "compound", []),
  x("Sissy Squat",                   "quads", "iso",      []),
  x("Wall Sit",                      "quads", "iso",      [], true),

  // Hamstrings and glutes
  x("Leg Curl",                      "hamstrings", "iso",      ["Leg curl machine"]),
  x("Glute Kickback Machine",        "hamstrings", "iso",      ["Glute kickback machine"]),
  x("Hip Abduction Machine",         "hamstrings", "iso",      ["Hip abduction machine"]),
  x("Hip Adduction Machine",         "hamstrings", "iso",      ["Hip adduction machine"]),
  x("Machine Hip Thrust",            "hamstrings", "compound", ["Hip thrust machine"]),
  x("Trap Bar Deadlift",             "hamstrings", "compound", ["Trap bar"]),
  x("Sumo Deadlift",                 "hamstrings", "compound", ["Barbell"]),
  x("Stiff-Leg Deadlift",            "hamstrings", "compound", ["Barbell"]),
  x("Good Morning",                  "hamstrings", "compound", ["Barbell"]),
  x("Barbell Glute Bridge",          "hamstrings", "compound", ["Barbell"]),
  x("Kettlebell Deadlift",           "hamstrings", "compound", ["Kettlebells"]),
  x("Single-Leg Hip Thrust",         "hamstrings", "compound", [BENCH]),
  x("Glute Hyperextension",          "hamstrings", "iso",      ["Back extension bench"]),
  x("Cable Glute Kickback",          "hamstrings", "iso",      ["Cable machine"]),
  x("Stability Ball Leg Curl",       "hamstrings", "iso",      ["Stability ball"]),
  x("Slider Leg Curl",               "hamstrings", "iso",      ["Core sliders"]),
  x("Suspension Hamstring Curl",     "hamstrings", "iso",      ["Suspension trainer"]),
  x("Banded Lateral Walk",           "hamstrings", "iso",      ["Mini loop bands"]),
  x("Banded Glute Bridge",           "hamstrings", "iso",      ["Mini loop bands"]),

  // Calves
  x("Machine Calf Raise",            "calves", "iso", ["Calf raise machine"]),
  x("Smith Machine Calf Raise",      "calves", "iso", ["Smith machine"]),
  x("Barbell Calf Raise",            "calves", "iso", ["Barbell", "Squat rack"]),
  x("Single-Leg Dumbbell Calf Raise","calves", "iso", ["Dumbbells"]),
  x("Seated Dumbbell Calf Raise",    "calves", "iso", ["Dumbbells", BENCH]),
  x("Box Calf Raise",                "calves", "iso", ["Plyo box"]),

  // Core
  x("Ab Crunch Machine",             "core", "iso",      ["Ab crunch machine"]),
  x("Rotary Torso Machine",          "core", "iso",      ["Rotary torso machine"]),
  x("Decline Sit-ups",               "core", "iso",      ["Decline bench"]),
  x("Hanging Leg Raise",             "core", "iso",      ["Pull-up bar"]),
  x("Toes-to-Bar",                   "core", "compound", ["Pull-up bar"]),
  x("Dip Station Leg Raise",         "core", "iso",      ["Dip station"]),
  x("Stability Ball Crunch",         "core", "iso",      ["Stability ball"]),
  x("Stability Ball Rollout",        "core", "iso",      ["Stability ball"]),
  x("Medicine Ball Slam",            "core", "compound", ["Medicine ball"]),
  x("Suspension Fallout",            "core", "iso",      ["Suspension trainer"]),
  x("Suspension Pike",               "core", "iso",      ["Suspension trainer"]),
  x("Slider Body Saw",               "core", "iso",      ["Core sliders"]),
  x("Slider Mountain Climbers",      "core", "compound", ["Core sliders"]),
  x("Pallof Press",                  "core", "iso",      ["Cable machine"]),
  x("Cable Woodchop",                "core", "iso",      ["Cable machine"]),
  x("Band Pallof Press",             "core", "iso",      ["Resistance bands"]),
  x("Landmine Rotation",             "core", "iso",      ["Barbell", "Landmine"]),
  x("Kettlebell Windmill",           "core", "iso",      ["Kettlebells"]),
  x("Farmer's Carry",                "core", "compound", ["Dumbbells|Kettlebells"], true),
  x("Weighted Plank",                "core", "iso",      ["Weight vest"], true),
  x("Side Plank",                    "core", "iso",      [], true),
  x("Hollow Hold",                   "core", "iso",      [], true),
  x("Mountain Climbers",             "core", "compound", []),
  x("Bird Dog",                      "core", "iso",      []),
  x("Reverse Crunch",                "core", "iso",      []),
  x("Lying Leg Raise",               "core", "iso",      []),
  x("Sit-ups",                       "core", "iso",      []),

  // Cardio (logged by minutes and distance, not weight and reps)
  x("Treadmill Run",                 "cardio", "cardio", ["Treadmill"], true),
  x("Treadmill Intervals",           "cardio", "cardio", ["Treadmill"], true),
  x("Incline Walk",                  "cardio", "cardio", ["Treadmill"], true),
  x("Stationary Bike",               "cardio", "cardio", ["Exercise bike"], true),
  x("Rowing Machine",                "cardio", "cardio", ["Rowing machine"], true),
  x("Elliptical",                    "cardio", "cardio", ["Elliptical"], true),
  x("Jump Rope",                     "cardio", "cardio", ["Skipping rope"], true),
  x("Outdoor Run",                   "cardio", "cardio", [], true),
  x("Brisk Walk",                    "cardio", "cardio", [], true),
  x("Burpees",                       "cardio", "cardio", [], true),
  x("High Knees",                    "cardio", "cardio", [], true),
  x("Foam Rolling",                  "cardio", "cardio", ["Foam roller"], true)
];

// Cardio is logged by time and distance
function isCardio(name) {
  const l = library.find(function (q) { return q.name === name; });
  return !!l && l.muscle === "cardio";
}
function distUnit() { return settings.units === "lb" ? "mi" : "km"; }
function distToDisp(km) { return settings.units === "lb" ? km * 0.621371 : km; }
function distFromDisp(v) { return settings.units === "lb" ? v / 0.621371 : v; }
function fmtDist(km) { return round1(distToDisp(parseFloat(km) || 0)) + " " + distUnit(); }
function cardioText(s) {
  const m = parseFloat(s.mins) || 0, d = parseFloat(s.dist) || 0;
  return (m ? fmt(m) + " min" : "") + (m && d ? ", " : "") + (d ? fmtDist(d) : "") || "done";
}

// =====================================================================
// YOUR OWN EXERCISES
// Added on the Gym tab. They join the library, so the generator and Swap can use them.
// =====================================================================
const MUSCLES = [
  ["chest", "Chest"], ["back", "Back"], ["rear", "Rear shoulders / upper back"], ["shoulders", "Shoulders"],
  ["biceps", "Biceps"], ["triceps", "Triceps"], ["quads", "Quads"], ["hamstrings", "Hamstrings and glutes"],
  ["calves", "Calves"], ["core", "Core"]
];

let customExercises = load("customExercises", []);

function libraryEntryFor(c) {
  const entry = x(c.name, c.muscle, c.type, c.need, c.timed);
  entry.custom = true;
  return entry;
}
customExercises.forEach(function (c) { library.push(libraryEntryFor(c)); });

function allEquipmentNames() {
  const names = [];
  for (const category in equipment) equipment[category].forEach(function (n) { names.push(n); });
  return names;
}

function muscleLabel(key) {
  if (key === "cardio") return "Cardio";
  const m = MUSCLES.find(function (m) { return m[0] === key; });
  return m ? m[1] : key;
}

function addCustomExercise(def) {
  const name = String(def.name || "").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Give the exercise a name." };
  if (name.length > 40) return { ok: false, error: "Keep the name under 40 characters." };
  if (library.some(function (l) { return l.name.toLowerCase() === name.toLowerCase(); })) {
    return { ok: false, error: "You already have an exercise with that name." };
  }
  if (!MUSCLES.some(function (m) { return m[0] === def.muscle; })) return { ok: false, error: "Pick a muscle group." };
  if (def.type !== "compound" && def.type !== "iso") return { ok: false, error: "Pick compound or isolation." };

  const valid = allEquipmentNames();
  const need = (def.need || []).filter(function (n) { return valid.indexOf(n) !== -1; });

  const entry = { name: name, muscle: def.muscle, type: def.type, need: need, timed: !!def.timed };
  customExercises.push(entry);
  save("customExercises", customExercises);
  library.push(libraryEntryFor(entry));
  return { ok: true, name: name };
}

function removeCustomExercise(name) {
  customExercises = customExercises.filter(function (c) { return c.name !== name; });
  save("customExercises", customExercises);
  const i = library.findIndex(function (l) { return l.custom && l.name === name; });
  if (i !== -1) library.splice(i, 1);
}

function renderCustom() {
  let html = `<div class="card-label">Add an exercise</div>
    <input class="set-input" id="cx-name" maxlength="40" placeholder="Exercise name" style="text-align:left;padding-left:.8rem">
    <div class="goal-group" style="margin-top:.8rem">
      <div class="card-label">Muscle</div>
      <select class="select" id="cx-muscle" style="margin-bottom:0">
        ${MUSCLES.map(function (m) { return `<option value="${m[0]}">${m[1]}</option>`; }).join("")}
      </select>
    </div>
    <div class="goal-group">
      <div class="card-label">Type</div>
      <select class="select" id="cx-type" style="margin-bottom:0">
        <option value="compound">Compound (big lift)</option>
        <option value="iso">Isolation (one muscle)</option>
      </select>
    </div>
    <div class="goal-group">
      <div class="card-label">Equipment it needs (leave empty for bodyweight)</div>
      <div class="chips" id="cx-need">
        ${allEquipmentNames().map(function (n) { return `<button type="button" class="chip" data-eq="${esc(n)}">${esc(n)}</button>`; }).join("")}
      </div>
    </div>
    <label class="item" style="margin-bottom:.4rem"><input type="checkbox" id="cx-timed"> Measured in seconds (like a plank)</label>
    <button class="btn" data-c="add">Add exercise</button>
    <div class="feed-meta" id="cx-msg" style="margin-top:.5rem"></div>`;

  if (customExercises.length) {
    html += `<h2>Added so far</h2>`;
    customExercises.forEach(function (c) {
      const needs = c.need.length ? "needs " + c.need.join(", ") : "bodyweight";
      html += `<div class="pr-row">
        <div><div class="pr-name">${esc(c.name)}</div>
          <div class="pr-sub">${esc(muscleLabel(c.muscle))} · ${c.type === "iso" ? "isolation" : "compound"} · ${esc(needs)}</div></div>
        <button class="tool" data-c="del" data-name="${esc(c.name)}">Delete</button>
      </div>`;
    });
  }
  $("custom-card").innerHTML = html;
}

$("custom-card").addEventListener("click", function (e) {
  const chip = e.target.closest("[data-eq]");
  if (chip) { chip.classList.toggle("on"); return; }

  const b = e.target.closest("[data-c]");
  if (!b) return;

  if (b.dataset.c === "add") {
    const need = Array.prototype.map.call($("cx-need").querySelectorAll(".chip.on"), function (c) { return c.dataset.eq; });
    const result = addCustomExercise({
      name: $("cx-name").value,
      muscle: $("cx-muscle").value,
      type: $("cx-type").value,
      need: need,
      timed: $("cx-timed").checked
    });
    if (!result.ok) { $("cx-msg").textContent = result.error; return; }
    renderCustom();
    $("cx-msg").textContent = "Added “" + result.name + "”. Tick the equipment it needs below and it can appear in your workouts.";
  }

  if (b.dataset.c === "del") {
    if (!confirm("Delete “" + b.dataset.name + "” from your exercises?")) return;
    removeCustomExercise(b.dataset.name);
    renderCustom();
  }
});



// =====================================================================
// WORKOUT PLANS
// Each plan is a list of "slots": [muscle, type]. The generator fills them in order.
// Slots near the top are the most important, so short sessions use only the first few.
// =====================================================================
const plans = {
  "Push Day":    [["chest","compound"],["shoulders","compound"],["chest","any"],["triceps","compound"],
                  ["shoulders","iso"],["triceps","iso"],["chest","iso"],["core","any"]],
  "Pull Day":    [["back","compound"],["back","compound"],["back","any"],["rear","any"],
                  ["biceps","any"],["biceps","any"],["back","any"],["core","any"]],
  "Leg Day":     [["quads","compound"],["hamstrings","compound"],["quads","any"],["hamstrings","any"],
                  ["calves","any"],["core","any"],["quads","iso"],["calves","any"]],
  "Upper Body":  [["chest","compound"],["back","compound"],["shoulders","compound"],["back","any"],
                  ["biceps","any"],["triceps","any"],["shoulders","iso"],["chest","any"]],
  "Full Body A": [["quads","compound"],["chest","compound"],["back","compound"],["hamstrings","any"],
                  ["shoulders","any"],["core","any"],["biceps","any"],["triceps","any"]],
  "Full Body B": [["hamstrings","compound"],["shoulders","compound"],["back","compound"],["quads","any"],
                  ["chest","any"],["core","any"],["triceps","any"],["biceps","any"]],
  "Full Body C": [["quads","compound"],["chest","compound"],["back","compound"],["hamstrings","any"],
                  ["biceps","any"],["triceps","any"],["shoulders","any"],["core","any"]]
};
plans["Lower Body"] = plans["Leg Day"];
// Sessions used by the Arnold and Body part splits
plans["Chest & Back"]     = [["chest","compound"],["back","compound"],["chest","any"],["back","any"],
                             ["chest","iso"],["back","any"],["rear","any"],["core","any"]];
plans["Shoulders & Arms"] = [["shoulders","compound"],["biceps","any"],["triceps","compound"],["shoulders","iso"],
                             ["biceps","any"],["triceps","iso"],["rear","any"],["core","any"]];
plans["Chest Day"]        = [["chest","compound"],["chest","compound"],["chest","any"],["chest","iso"],
                             ["triceps","any"],["chest","any"],["core","any"],["triceps","iso"]];
plans["Back Day"]         = [["back","compound"],["back","compound"],["back","any"],["rear","any"],
                             ["back","any"],["biceps","any"],["rear","any"],["core","any"]];
plans["Shoulder Day"]     = [["shoulders","compound"],["shoulders","compound"],["shoulders","iso"],["rear","any"],
                             ["shoulders","any"],["rear","any"],["core","any"],["calves","any"]];
plans["Arm Day"]          = [["biceps","any"],["triceps","compound"],["biceps","any"],["triceps","iso"],
                             ["biceps","any"],["triceps","any"],["core","any"],["core","any"]];

// The splits you can choose in Me > Goals. "auto" lets the app decide.
const SPLITS = {
  auto:   { label: "Auto",               sessions: null },
  full:   { label: "Full body",          sessions: ["Full Body A", "Full Body B", "Full Body C"] },
  ul:     { label: "Upper / Lower",      sessions: ["Upper Body", "Lower Body"] },
  ppl:    { label: "Push / Pull / Legs", sessions: ["Push Day", "Pull Day", "Leg Day"] },
  arnold: { label: "Arnold",             sessions: ["Chest & Back", "Shoulders & Arms", "Leg Day"] },
  part:   { label: "Body part",          sessions: ["Chest Day", "Back Day", "Shoulder Day", "Arm Day", "Leg Day"] }
};

// Which sessions make up your week, based on days per week, goal and experience
function getSplit() {
  const chosen = SPLITS[goals.split];
  if (chosen && chosen.sessions) return chosen.sessions;
  return autoSplit();
}

// What the app picks when the split is left on Auto
function autoSplit() {
  const d = goals.days;
  const fullBodyGoal = (goals.goal === "Lose fat" || goals.goal === "Conditioning" || goals.goal === "General fitness");
  if (d === "2") return ["Full Body A", "Full Body B"];
  if (d === "3") {
    return (goals.experience === "Beginner" || fullBodyGoal)
      ? ["Full Body A", "Full Body B", "Full Body C"]
      : ["Push Day", "Pull Day", "Leg Day"];
  }
  if (d === "4") {
    return fullBodyGoal ? ["Full Body A", "Full Body B", "Full Body C", "Full Body A"]
                        : ["Upper Body", "Lower Body", "Upper Body", "Lower Body"];
  }
  if (d === "5") return ["Push Day", "Pull Day", "Leg Day", "Upper Body", "Lower Body"];
  return ["Push Day", "Pull Day", "Leg Day", "Push Day", "Pull Day", "Leg Day"];
}


// A plain name for whatever Auto would pick, e.g. "Upper / Lower"
function autoSplitLabel() {
  const s = autoSplit();
  if (s[0].indexOf("Full Body") === 0) return "Full body";
  if (s[0] === "Upper Body") return "Upper / Lower";
  return s.length === 5 ? "Push / Pull / Legs plus Upper / Lower" : "Push / Pull / Legs";
}

// How many times a week a split trains its least-trained main muscle
function splitFrequency(sessions, days) {
  const main = ["chest", "back", "shoulders", "quads", "hamstrings"];
  let least = Infinity;
  main.forEach(function (m) {
    const n = sessions.filter(function (name) { return plans[name].some(function (s) { return s[0] === m; }); }).length;
    least = Math.min(least, n / sessions.length * days);
  });
  return Math.round(least * 10) / 10;
}

// The line under the Split chips: what it means for you, and a nudge if it is a poor fit
function splitNote() {
  const days = Number(goals.days) || 3;
  if (goals.split === "auto") return "The app picks for you: " + autoSplitLabel() + " for " + days + " days a week.";
  const f = splitFrequency(getSplit(), days);
  const times = f === 1 ? "about once" : f === 2 ? "about twice" : "about " + f + " times";
  let text = "On " + days + " days a week this trains each muscle " + times + " a week.";
  if (f < 1.5) text += " Twice a week suits most goals better. Auto would use " + autoSplitLabel() + ".";
  return text;
}

// The next few sessions in your split, starting with today's
function upcomingSessions(n) {
  const split = getSplit();
  const finished = getHistory().filter(function (w) { return !w.routine; }).length;
  const out = [];
  for (let i = 0; i < n; i++) out.push(split[(finished + goals.splitOffset + i) % split.length]);
  return out;
}

// Move on to the next session in the split without doing this one
function skipSession() {
  const started = workout.exercises.some(function (ex) { return ex.sets.some(function (s) { return s.done; }); });
  if (started && !confirm("Skip this session? Ticked sets will be lost.")) return;
  goals.splitOffset = (goals.splitOffset + 1) % getSplit().length;
  save("goals", goals);
  const plan = buildPlan();
  if (plan) { workout = newWorkout(plan); saveWorkout(); }
  renderAll();
}


// ----- Exercises you love, and ones you never want to see -----
let exPrefs = load("exPrefs", null);
if (!exPrefs || !Array.isArray(exPrefs.fav) || !Array.isArray(exPrefs.ban)) exPrefs = { fav: [], ban: [] };
if (!exPrefs.lock || typeof exPrefs.lock !== "object" || Array.isArray(exPrefs.lock)) exPrefs.lock = {};
function isFav(name) { return exPrefs.fav.indexOf(name) >= 0; }
function isBanned(name) { return exPrefs.ban.indexOf(name) >= 0; }
// kind is "fav" or "ban". An exercise can't be both, so setting one clears the other.
function togglePref(kind, name) {
  const other = kind === "fav" ? "ban" : "fav";
  const i = exPrefs[kind].indexOf(name);
  if (i >= 0) exPrefs[kind].splice(i, 1);
  else {
    exPrefs[kind].push(name);
    const j = exPrefs[other].indexOf(name);
    if (j >= 0) exPrefs[other].splice(j, 1);
  }
  save("exPrefs", exPrefs);
}


// =====================================================================
// THE GENERATOR
// =====================================================================
// Do you own everything this exercise needs?
function hasEquipment(ex) {
  return ex.need.every(function (req) {
    return req.split("|").some(function (option) { return selected.includes(option); });
  });
}

// No progress for three sessions in a row on this exercise?
function sessionBests(name, n) {
  const out = [];
  const h = getHistory();
  for (let i = h.length - 1; i >= 0 && out.length < n; i--) {
    const ex = h[i].exercises.find(function (e) { return e.name === name; });
    if (!ex) continue;
    let best = 0;
    ex.sets.forEach(function (s) { best = Math.max(best, e1rm(parseFloat(s.weight) || 0, parseInt(s.reps) || 0)); });
    if (best > 0) out.unshift(best);
  }
  return out;
}
function isStalled(name) {
  const b = sessionBests(name, 3);
  return b.length === 3 && b[2] <= b[1] * 1.005 && b[1] <= b[0] * 1.005;
}

// Choose one exercise for a slot.
// `prefer` is a list of names to stick with (so you can progress on them) if they still fit.
function pickExercise(muscle, kind, used, prefer) {
  // 1. Everything for this muscle that you can do, haven't used yet, and aren't avoiding
  let pool = library.filter(function (ex) {
    return ex.muscle === muscle && !used.includes(ex.name) && hasEquipment(ex) && !isAvoided(ex) && !isBanned(ex.name);
  });

  // 2. Narrow to the wanted type (if none exist, keep the wider pool)
  const typed = pool.filter(function (ex) { return kind === "any" || ex.type === kind; });
  if (typed.length) pool = typed;

  // 3. Prefer exercises that use your equipment over bodyweight ones
  const equipped = pool.filter(function (ex) { return ex.need.length > 0; });
  if (equipped.length) pool = equipped;

  // 4. Move away from exercises you've stopped progressing on
  const moving = pool.filter(function (ex) { return !isStalled(ex.name); });
  if (moving.length) pool = moving;

  // 4b. Your favourites come first
  const favs = pool.filter(function (ex) { return isFav(ex.name); });
  if (favs.length) pool = favs;

  // 5. Stick with last time's exercise if it still fits
  if (prefer && prefer.length) {
    const same = pool.filter(function (ex) { return prefer.includes(ex.name); });
    if (same.length) pool = same;
  }

  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

// How many days since each muscle was last trained (99 = not for ages)
function daysSinceMuscles() {
  const today = dateKey(new Date());
  const out = {};
  MUSCLES.forEach(function (m) { out[m[0]] = 99; });
  getHistory().forEach(function (w) {
    const d = daysBetween(w.date, today);
    w.exercises.forEach(function (ex) {
      const lib = library.find(function (l) { return l.name === ex.name; });
      if (lib && lib.muscle in out && d >= 0 && d < out[lib.muscle]) out[lib.muscle] = d;
    });
  });
  return out;
}

// Work out sets and reps from your goal, experience, programme phase and how you feel.
// opts: { focus, reduce, lead }
function prescription(ex, opts) {
  opts = opts || {};
  if (ex.type === "cardio") return { sets: 1, reps: "20 min" };
  const p = goalProfile();
  const compound = ex.type === "compound";
  const level = { "Beginner": 0, "Intermediate": 1, "Advanced": 2 }[goals.experience] || 0;
  let sets = (compound ? p.cSets : p.iSets)[level];
  let reps = compound ? p.cReps : p.iReps;

  // Bodyweight moves can't be loaded, so use steadier rep ranges
  if (ex.need.length === 0) reps = "10-15";
  if (ex.timed) reps = "30-45 sec";

  const phase = programmeInfo();
  if (phase && !phase.done && phase.name === "Push" && compound) sets += 1;
  if (opts.focus) sets += 1;
  const ready = readinessToday();
  if (opts.lead && ready === "fresh") sets += 1;
  if (opts.reduce) sets -= 1;
  if (ready === "tired") sets -= 1;
  if (isDeload()) sets -= 1;   // easier week: one fewer set

  return { sets: Math.max(2, Math.min(6, sets)), reps: reps };
}

// How long to rest between sets for this exercise, set by your goal
function coachRest(name) {
  if (!goals.autoRest) return 0;
  const lib = library.find(function (l) { return l.name === name; });
  if (!lib) return 0;
  const p = goalProfile();
  return lib.type === "compound" ? p.restC : p.restI;
}

function planTrainsMuscle(planName, muscle) {
  return plans[planName].some(function (s) { return s[0] === muscle; });
}

// Builds the plan for your NEXT session (without changing the screen).
// opts.shuffle: pick fresh exercises instead of sticking with last time's.
// Returns null if nothing could be built.
function buildPlan(opts) {
  opts = opts || {};
  if (!opts.minutes) return buildPlanFor(opts);
  // A one-off shorter session: plan as if your session length were this, then put it back
  const usual = goals.minutes;
  goals.minutes = String(opts.minutes);
  try {
    const plan = buildPlanFor(opts);
    if (plan) plan.why.unshift("Short version: about " + opts.minutes + " minutes");
    return plan;
  } finally { goals.minutes = usual; }
}

function buildPlanFor(opts) {
  const split = getSplit();
  const finished = getHistory().filter(function (w) { return !w.routine; }).length;   // your own routines don't advance the split
  const sessionIndex = (finished + goals.splitOffset) % split.length;
  const planName = split[sessionIndex];
  const why = [];

  const ready = readinessToday();
  let count = { "20": 3, "30": 4, "45": 5, "60": 6, "90": 8 }[goals.minutes] || 6;
  if (ready === "tired") count = Math.max(3, count - 1);

  const info = programmeInfo();
  if (info && !info.done) why.push("Week " + info.week + " of " + info.weeks + ", " + info.name + " phase");
  if (ready === "tired") why.push("You feel tired, so one exercise and one set less");
  if (ready === "fresh") why.push("You feel fresh, so an extra set on the first lift");

  // The slots for this session
  let slotList = plans[planName].slice(0, count).map(function (s) { return { m: s[0], k: s[1] }; });

  // Focus muscles: an extra exercise (at most two extra in a session)
  let extra = 0;
  const focusAdded = [];
  goals.focus.forEach(function (f) {
    if (extra >= 2) return;
    const has = slotList.filter(function (s) { return s.m === f; }).length;
    if (has >= 2) return;
    const trains = planTrainsMuscle(planName, f);
    if (!trains && Number(goals.minutes) < 45) return;
    const slot = { m: f, k: has ? "iso" : "any" };
    if (trains) slotList.splice(Math.min(3, slotList.length), 0, slot);
    else slotList.push(slot);
    extra++;
    focusAdded.push(f);
  });

  // Sore today? Keep one exercise at most for that muscle
  const sore = soreToday();
  if (sore.length) {
    const seenSore = {};
    slotList = slotList.filter(function (s) {
      if (sore.indexOf(s.m) < 0) return true;
      if (seenSore[s.m]) return false;
      seenSore[s.m] = true;
      return true;
    });
  }

  // Exercises you locked into this session (if you still have the kit and haven't banned them)
  const locked = lockedFor(planName).map(function (n) { return library.find(function (l) { return l.name === n; }); })
    .filter(function (l) { return l && hasEquipment(l) && !isBanned(l.name); });
  const lockedNames = locked.map(function (l) { return l.name; });

  const since = daysSinceMuscles();
  const weekDone = muscleCounts(0).counts;
  const tg = weeklyTargets();

  // Same session last time? Stick with those exercises so you can add weight
  const lastSame = getHistory().filter(function (w) { return w.name === planName && !w.routine; }).pop();
  const lastNames = lastSame ? lastSame.exercises.map(function (e) { return e.name; }) : [];

  const used = [];
  const exercises = [];
  const eased = [];
  let leadDone = false;

  slotList.forEach(function (slot) {
    const stick = !opts.shuffle && (slot.k === "compound" || info);
    // A locked exercise for this muscle takes the slot; otherwise pick one (never a locked one, they have their own slots)
    const li = locked.findIndex(function (l) { return l.muscle === slot.m; });
    const ex = li >= 0 ? locked.splice(li, 1)[0] : pickExercise(slot.m, slot.k, used.concat(lockedNames), stick ? lastNames : null);
    if (!ex) return;
    used.push(ex.name);
    const reduce = since[slot.m] < 2 || weekDone[slot.m] >= tg[slot.m][1] || sore.indexOf(slot.m) >= 0;
    if (reduce && eased.indexOf(slot.m) < 0) eased.push(slot.m);
    const lead = !leadDone && ex.type === "compound";
    if (lead) leadDone = true;
    const rx = prescription(ex, { focus: goals.focus.includes(slot.m), reduce: reduce, lead: lead });
    exercises.push({ name: ex.name, sets: rx.sets, reps: rx.reps });
    if (isStalled(ex.name)) why.push(ex.name + ": no progress for 3 sessions, so drop 10% and build back up");
  });

  // Locked exercises whose muscle had no slot today still go in
  locked.forEach(function (l) {
    const rx = prescription(l, { reduce: sore.indexOf(l.muscle) >= 0 });
    exercises.push({ name: l.name, sets: rx.sets, reps: rx.reps });
    used.push(l.name);
  });
  if (lockedNames.length) why.push("Locked in: " + lockedNames.join(", "));
  if (sore.length) why.push("Going easy on what is sore today");

  // Keep the session inside your time: about 3.5 minutes a set, rest included
  const budget = Math.round(Number(goals.minutes) / 3.5) + 1;
  const total = function () { return exercises.reduce(function (n, e) { return n + e.sets; }, 0); };
  const isFocusEx = function (e) { const l = library.find(function (q) { return q.name === e.name; }); return (l && goals.focus.includes(l.muscle)) || lockedNames.indexOf(e.name) >= 0; };
  let trimmed = false;
  while (total() > budget) {
    let i = exercises.length - 1;
    while (i >= 0 && (exercises[i].sets <= 2 || isFocusEx(exercises[i]))) i--;
    if (i >= 0) { exercises[i].sets--; trimmed = true; continue; }
    i = exercises.length - 1;
    while (i >= 0 && isFocusEx(exercises[i])) i--;
    if (i >= 0 && exercises.length > 3) { exercises.splice(i, 1); trimmed = true; continue; }
    break;
  }
  if (trimmed) why.push("Trimmed to fit your " + goals.minutes + " minutes");

  const mName = function (k) { const m = MUSCLES.find(function (x2) { return x2[0] === k; }); return m ? m[1].toLowerCase() : k; };
  if (focusAdded.length) why.push("Extra work for " + focusAdded.map(mName).join(" and ") + " (your focus)");
  else if (goals.focus.length) why.push("Extra sets on " + goals.focus.map(mName).join(" and ") + " (your focus)");
  if (eased.length) why.push("One set less for " + eased.map(mName).join(", ") + " (trained recently or weekly target reached)");
  if (goals.avoid.length) why.push("Leaving out exercises that load your " + goals.avoid.join(", ").toLowerCase());

  // A little cardio finisher for goals that want it, on longer sessions
  const wantsCardio = goalProfile().cardio && ready !== "tired";
  if (wantsCardio && Number(goals.minutes) >= 45) {
    if (selected.includes("Skipping rope")) {
      exercises.push({ name: "Jump Rope", sets: 3, reps: "1 min" });
    } else if (selected.includes("Treadmill")) {
      exercises.push({ name: "Treadmill Intervals", sets: 4, reps: "2 min" });
    } else if (selected.includes("Rowing machine")) {
      exercises.push({ name: "Rowing Machine", sets: 1, reps: "10 min" });
    } else if (selected.includes("Exercise bike")) {
      exercises.push({ name: "Stationary Bike", sets: 1, reps: "10 min" });
    } else if (selected.includes("Elliptical")) {
      exercises.push({ name: "Elliptical", sets: 1, reps: "10 min" });
    }
  }

  if (!exercises.length) return null;
  const groupNote = addGroupsToPlan(exercises);
  if (groupNote) why.push(groupNote);
  return { name: planName, exercises: exercises, sessionIndex: sessionIndex, splitLength: split.length, why: why };
}

// The "Generate" button
function generateWorkout() {
  const statusEl = $("gen-status");

  // Don't throw away a workout you've already started
  const started = workout.exercises.some(function (ex) {
    return ex.sets.some(function (s) { return s.done; });
  });
  if (started && !confirm("Replace your current workout? Ticked sets will be lost.")) return;

  const plan = buildPlan({ shuffle: true });
  if (!plan) {
    statusEl.textContent = "Couldn’t build a workout. Try ticking more equipment on the Gym tab.";
    return;
  }

  workout = newWorkout(plan);
  saveWorkout();
  renderWorkout();

  statusEl.textContent = plan.name + " (session " + (plan.sessionIndex + 1) + " of " + plan.splitLength +
    " in your split). Tap Generate again for different exercises." +
    (plan.why.length ? " Why: " + plan.why.join(". ") + "." : "") +
    (selected.length === 0 ? " No equipment ticked, so this is bodyweight only." : "");
}

// "How do you feel today?" chips on the Workout tab
function renderReadiness() {
  const el = $("ready-row");
  if (!el) return;
  const r = readinessToday();
  el.innerHTML = `<div class="card-label">How do you feel today?</div><div class="chips">` +
    [["fresh", "Fresh"], ["normal", "Normal"], ["tired", "Tired"]].map(function (o) {
      return `<button class="chip${r === o[0] ? " on" : ""}" data-r="${o[0]}">${o[1]}</button>`;
    }).join("") + `</div>` + (readinessFromShifts() ? `<div class="feed-meta" style="margin-top:.4rem">Set to Tired from your shifts: ${esc(recoveryNote(dateKey(new Date())))} Tap another if you feel better than that.</div>` : "");
}

// (the soreness chips sit right under these)
$("ready-row").addEventListener("click", function (e) {
  const b = e.target.closest("[data-r]");
  if (!b) return;
  goals.readiness = { date: dateKey(new Date()), level: b.dataset.r };
  save("goals", goals);
  renderReadiness();
  refreshPlanAfterGoalChange();
  $("gen-status").textContent = "Got it. Your workout is adjusted for how you feel today.";
});

$("generate-btn").addEventListener("click", generateWorkout);


// =====================================================================
// YOUR WEIGHTS
// The dumbbells and plates you own. Suggested weights snap to what you can really load,
// and the plate calculator shows how to build a barbell weight.
// Everything is stored in kg (like workout weights) and shown in your units.
// =====================================================================
function defaultGear() {
  if (settings.units === "lb") {
    const toKg = function (lb) { return Math.round(lb * KG_PER_LB * 1000) / 1000; };
    return { bar: toKg(45), plates: [2.5, 5, 10, 25, 45].map(toKg), dumbbells: [], ezBar: toKg(15), trapBar: toKg(55) };
  }
  return { bar: 20, plates: [1.25, 2.5, 5, 10, 20], dumbbells: [], ezBar: 7.5, trapBar: 25 };
}

// Fills in ezBar/trapBar on gear saved by an older version that didn't have them yet
function normGear(g) {
  const d = defaultGear();
  if (typeof g.ezBar !== "number" || g.ezBar <= 0) g.ezBar = d.ezBar;
  if (typeof g.trapBar !== "number" || g.trapBar <= 0) g.trapBar = d.trapBar;
  return g;
}

let gear = normGear(load("gear", null) || defaultGear());

// "5, 7.5, 10" typed in your units -> sorted list of kg
function parseWeightList(text) {
  const seen = {};
  const out = [];
  String(text).split(/[,;\s]+/).forEach(function (part) {
    const n = parseFloat(part);
    if (!isFinite(n) || n <= 0) return;
    const kg = Math.round(fromDisp(n) * 1000) / 1000;
    if (!seen[kg]) { seen[kg] = true; out.push(kg); }
  });
  return out.sort(function (a, b) { return a - b; });
}

function renderGear() {
  const list = function (arr) { return arr.map(function (kg) { return fmtW(kg); }).join(", "); };
  const hasEz = selected.indexOf("EZ curl bar") !== -1;
  const hasTrap = selected.indexOf("Trap bar") !== -1;
  $("gear-card").innerHTML = `
    <div class="goal-group">
      <div class="card-label">Bar weights (${unit()})</div>
      <div class="gear-bar-row">
        <div><div class="feed-meta">Barbell</div>
          <input class="set-input" id="gear-bar" inputmode="decimal" value="${fmtW(gear.bar)}" style="text-align:left;padding-left:.8rem"></div>
        ${hasEz ? `<div><div class="feed-meta">EZ bar</div>
          <input class="set-input" id="gear-ezbar" inputmode="decimal" value="${fmtW(gear.ezBar)}" style="text-align:left;padding-left:.8rem"></div>` : ""}
        ${hasTrap ? `<div><div class="feed-meta">Trap bar</div>
          <input class="set-input" id="gear-trapbar" inputmode="decimal" value="${fmtW(gear.trapBar)}" style="text-align:left;padding-left:.8rem"></div>` : ""}
      </div>
    </div>
    <div class="goal-group">
      <div class="card-label">Plate sizes you have (${unit()}, one side)</div>
      <input class="set-input" id="gear-plates" placeholder="e.g. 1.25, 2.5, 5, 10, 20" value="${esc(list(gear.plates))}" style="text-align:left;padding-left:.8rem">
    </div>
    <div class="goal-group">
      <div class="card-label">Dumbbell weights you have (${unit()} each)</div>
      <input class="set-input" id="gear-db" placeholder="Leave empty if you can load any weight" value="${esc(list(gear.dumbbells))}" style="text-align:left;padding-left:.8rem">
    </div>
    <div class="feed-meta">Separate sizes with commas. Suggested weights will snap to what you can actually load.</div>
    <button class="btn ghost" data-a="open-plates">Plate calculator</button>`;
}

$("gear-card").addEventListener("change", function (e) {
  const t = e.target;
  if (t.id === "gear-bar") {
    const n = parseFloat(t.value);
    if (n > 0) gear.bar = Math.round(fromDisp(n) * 1000) / 1000;
  } else if (t.id === "gear-ezbar") {
    const n = parseFloat(t.value);
    if (n > 0) gear.ezBar = Math.round(fromDisp(n) * 1000) / 1000;
  } else if (t.id === "gear-trapbar") {
    const n = parseFloat(t.value);
    if (n > 0) gear.trapBar = Math.round(fromDisp(n) * 1000) / 1000;
  } else if (t.id === "gear-plates") {
    const plates = parseWeightList(t.value);
    if (plates.length) gear.plates = plates;       // the plate list can't be empty
  } else if (t.id === "gear-db") {
    gear.dumbbells = parseWeightList(t.value);
  } else {
    return;
  }
  save("gear", gear);
  renderGear();
  renderWorkout();
});

$("gear-card").addEventListener("click", function (e) {
  if (e.target.closest('[data-a="open-plates"]')) openPlates(60);
});

// Every total weight you can put on a bar (up to 8 plates per side)
function loadableWeights(barKg) {
  const bar = barKg != null ? barKg : gear.bar;
  const sides = { 0: true };
  let level = [0];
  for (let count = 0; count < 8; count++) {
    const next = {};
    level.forEach(function (base) {
      gear.plates.forEach(function (p) { next[Math.round((base + p) * 1000) / 1000] = true; });
    });
    level = Object.keys(next).map(Number);
    level.forEach(function (v) { sides[v] = true; });
  }
  return Object.keys(sides)
    .map(function (s) { return Math.round((bar + 2 * Number(s)) * 1000) / 1000; })
    .sort(function (a, b) { return a - b; });
}

function nearest(list, target) {
  return list.reduce(function (best, w) {
    return Math.abs(w - target) < Math.abs(best - target) ? w : best;
  }, list[0]);
}

// Which bar (or dumbbells) this exercise loads
function gearKind(name) {
  const ex = library.find(function (l) { return l.name === name; });
  if (!ex) return null;
  const has = function (eq) { return ex.need.some(function (r) { return r.split("|").indexOf(eq) !== -1; }); };
  if (has("Trap bar") && selected.indexOf("Trap bar") !== -1) return "trapbar";
  if (has("EZ curl bar") && selected.indexOf("EZ curl bar") !== -1) return "ezbar";
  if (has("Barbell")) return "barbell";
  if (has("Dumbbells") && selected.indexOf("Dumbbells") !== -1 && gear.dumbbells.length) return "dumbbell";
  return null;
}

// The right bar weight (kg) for a gearKind() result
function barWeightFor(kind) {
  if (kind === "ezbar") return gear.ezBar;
  if (kind === "trapbar") return gear.trapBar;
  return gear.bar;
}

const BAR_LABELS = { barbell: "Barbell", ezbar: "EZ bar", trapbar: "Trap bar" };

// Moves a suggested weight onto a weight you can really load.
// Returns null if nothing applies, {kg} if it snapped, or {kg: null, reason} if you
// should add weight but nothing heavier is available.
function snapToGear(name, target, top, wantsMore) {
  const kind = gearKind(name);
  if (!kind) return null;

  const list = kind === "dumbbell" ? gear.dumbbells : loadableWeights(barWeightFor(kind));
  if (!list.length) return null;

  const pool = wantsMore ? list.filter(function (w) { return w > top + 0.001; }) : list;
  if (!pool.length) {
    return { kg: null, reason: kind === "dumbbell"
      ? "You’re at your heaviest dumbbells, so add reps instead"
      : "Nothing heavier fits your plates, so add reps instead" };
  }
  return { kg: nearest(pool, target) };
}

// Which plates go on each side for a total weight (in kg), on a given bar
function platesFor(totalKg, barKg) {
  const bar = barKg != null ? barKg : gear.bar;
  const perSide = Math.round(((totalKg - bar) / 2) * 1000) / 1000;
  if (perSide < 0) return { tooLight: true };

  const sizes = gear.plates.slice().sort(function (a, b) { return b - a; });
  let rest = perSide;
  const used = [];
  sizes.forEach(function (p) {
    while (rest + 0.005 >= p && used.length < 16) {
      used.push(p);
      rest = Math.round((rest - p) * 1000) / 1000;
    }
  });

  const sum = used.reduce(function (a, b) { return a + b; }, 0);
  return { plates: used, loaded: Math.round((bar + 2 * sum) * 1000) / 1000, exact: rest < 0.005 };
}

let plateBarKg = gear.bar;   // which bar the open plate calculator sheet is working out

function openPlates(kg, barKg, barLabel) {
  plateBarKg = barKg != null ? barKg : gear.bar;
  openSheet(`<div class="card-label">Plate calculator</div>
    <div class="big">${barLabel || "Barbell"} loading</div>
    <div class="card-label" style="margin-top:.9rem">Target weight (${unit()})</div>
    <input type="text" inputmode="decimal" class="inp-date" data-f="plate-target" value="${fmtW(kg)}">
    <div id="plate-result"></div>
    <button class="btn" data-a="plate-close">Close</button>`);
  renderPlateResult(toDisp(kg));
}

function renderPlateResult(targetDisp) {
  const el = $("plate-result");
  if (!el) return;
  if (!isFinite(targetDisp) || targetDisp <= 0) {
    el.innerHTML = `<p class="feed-meta">Type a target weight.</p>`;
    return;
  }

  let target = fromDisp(targetDisp);
  let r = platesFor(target, plateBarKg);
  let note = "";

  if (r.tooLight) {
    el.innerHTML = `<p class="feed-meta">That’s lighter than the bar (${fmtW(plateBarKg)} ${unit()}).</p>`;
    return;
  }
  if (!r.exact) {
    const alt = nearest(loadableWeights(plateBarKg), target);
    r = platesFor(alt, plateBarKg);
    note = `<p class="feed-meta">You can’t make exactly ${fmt(targetDisp)} ${unit()} with your plates. Closest: ${fmtW(r.loaded)} ${unit()}.</p>`;
  }

  const maxPlate = Math.max.apply(null, gear.plates);
  const vis = r.plates.map(function (p) {
    return `<div class="plate" style="height:${Math.round(34 + 66 * p / maxPlate)}px"><span>${fmtW(p)}</span></div>`;
  }).join("");

  el.innerHTML = `${note}
    <div class="plate-vis"><div class="bar-stub"></div>${vis}<div class="bar-tip"></div></div>
    <div class="pr-line">${r.plates.length ? "Each side: <b>" + r.plates.map(function (p) { return fmtW(p); }).join(" + ") + "</b>" : "Just the bar."}</div>
    <div class="feed-meta">Bar ${fmtW(plateBarKg)} + 2 × ${fmtW((r.loaded - plateBarKg) / 2)} = ${fmtW(r.loaded)} ${unit()}</div>`;
}


// =====================================================================
// HISTORY, PERSONAL BESTS AND SMART PROGRESSION
// =====================================================================
function getHistory() { return load("workoutHistory", []); }

// Epley formula: estimates the heaviest single rep you could do from a set
function e1rm(kg, reps) {
  if (kg <= 0 || reps <= 0) return 0;
  const r = Math.min(reps, 15);          // the estimate gets unreliable above ~15 reps
  return r === 1 ? kg : kg * (1 + r / 30);
}

// The most recent time you logged this exercise
function lastPerformance(name) {
  const history = getHistory();
  for (let i = history.length - 1; i >= 0; i--) {
    for (let j = 0; j < history[i].exercises.length; j++) {
      const ex = history[i].exercises[j];
      if (ex.name === name) return { date: history[i].date, sets: ex.sets, rating: ex.rating, note: ex.note || "" };
    }
  }
  return null;
}

// What weight should you use today? (returns kg)
function suggestion(name, target) {
  const last = lastPerformance(name);
  if (!last) return null;

  const topWeight = Math.max.apply(null, last.sets.map(function (s) { return parseFloat(s.weight) || 0; }));
  if (!topWeight) return null;   // bodyweight exercise: nothing to suggest

  const topReps = parseInt(String(target).split("-").pop()) || 0;   // "6-10" -> 10
  const hitAllReps = topReps > 0 && last.sets.every(function (s) { return (parseInt(s.reps) || 0) >= topReps; });
  const step = settings.units === "lb" ? 5 * KG_PER_LB : 2.5;

  const rpes = last.sets.map(function (s) { return parseFloat(s.rpe); }).filter(function (n) { return n > 0; });
  const maxRpe = rpes.length ? Math.max.apply(null, rpes) : 0;
  const avgRpe = rpes.length ? rpes.reduce(function (a, b) { return a + b; }, 0) / rpes.length : 0;

  let kg = topWeight;
  let why = "Same weight as last time";

  if (last.rating === "easy") {
    kg = topWeight + step;
    why = "You rated it Easy last time, so add a little";
  } else if (last.rating === "hard") {
    why = "You rated it Hard last time, so hold the weight";
  } else if (maxRpe >= 10) {
    why = "You hit RPE 10 last time, so hold the weight";
  } else if (rpes.length && avgRpe <= 7 && hitAllReps) {
    kg = topWeight + step;
    why = "Your effort stayed at RPE 7 or lower, so add a little";
  } else if (hitAllReps) {
    kg = topWeight + step;
    why = "You hit the top of the rep range, so add a little";
  }

  // No progress for three sessions: take a step back, then build up again
  if (isStalled(name) && !isDeload()) {
    kg = topWeight * 0.9;
    why = "No progress for 3 sessions, so take 10% off and build back up";
  }

  // Easier week: about 10% lighter than last time
  if (isDeload()) {
    kg = topWeight * 0.9;
    why = "Easier week: about 10% lighter than last time";
  }

  // Snap to weights you can really load (barbell plates, or your own dumbbells)
  const snap = snapToGear(name, kg, topWeight, kg > topWeight + 0.001);
  if (snap) {
    if (snap.kg === null) { kg = topWeight; why = snap.reason; }
    else kg = snap.kg;
  }

  return { kg: Math.round(kg * 1000) / 1000, why: why };
}

// The little grey text under each exercise name
function hintFor(ex, stat) {
  if (isCardio(ex.name)) {
    const lc = lastPerformance(ex.name);
    return lc ? "Last time: " + lc.sets.map(cardioText).join("; ") : "Log the time, and the distance if you track it.";
  }
  const last = lastPerformance(ex.name);
  if (!last) return "First time logging this one. Start with a weight you can control.";

  const lastText = last.sets.map(function (s) {
    const kg = parseFloat(s.weight) || 0;
    const reps = parseInt(s.reps) || 0;
    return kg > 0 ? fmtW(kg) + "×" + reps : reps + " reps";
  }).join(", ");

  const withUnit = last.sets.some(function (s) { return parseFloat(s.weight) > 0; }) ? " (" + unit() + ")" : "";
  // No "to beat" line when the plan is deliberately easing off (a stall or a deload week)
  const beat = (plateauInfo(stat) || isDeload()) ? "" : beatTarget(ex.name);
  let text = (beat ? "<b class=\"beat-line\">To beat: " + beat + "</b><br>" : "") + "Last time" + withUnit + ": " + lastText;

  const sug = suggestion(ex.name, ex.target);
  if (sug) text += "<br>Suggested: " + fmtW(sug.kg) + " " + unit() + ". " + sug.why + ".";
  if (last.note) text += "<br>Note last time: " + esc(last.note);
  if (plateauInfo(stat)) text += "<br>⚠ Stalled: no new best in your last 3 sessions. Try one more rep per set, a lighter week, or a variation.";
  return text;
}

// ----- Beat last time -----
// The working sets (no warm-ups) from the last session of this exercise
function lastWorkingSets(name) {
  const last = lastPerformance(name);
  if (!last) return null;
  const sets = last.sets.filter(function (s) { return !s.warmup && (parseInt(s.reps) || 0) > 0; });
  return sets.length ? sets : null;
}
// Set number n (1, 2, 3...) from last time. Past the end? Use the final set.
function lastSetAt(name, n) {
  const sets = lastWorkingSets(name);
  return sets ? (sets[n - 1] || sets[sets.length - 1]) : null;
}
// Is this set better than the same set last time?
function beatsLast(s, prev) {
  if (!prev) return false;
  const kg = parseFloat(s.weight) || 0, reps = parseInt(s.reps) || 0;
  const pkg = parseFloat(prev.weight) || 0, preps = parseInt(prev.reps) || 0;
  if (reps <= 0) return false;
  if (kg <= 0 && pkg <= 0) return reps > preps;              // bodyweight: more reps
  return e1rm(kg, reps) > e1rm(pkg, preps) + 0.01;
}
// A short "do this to improve" line, built from your best set last time
function beatTarget(name) {
  const sets = lastWorkingSets(name);
  if (!sets) return "";
  let best = sets[0];
  sets.forEach(function (s) {
    const a = e1rm(parseFloat(s.weight) || 0, parseInt(s.reps) || 0), b = e1rm(parseFloat(best.weight) || 0, parseInt(best.reps) || 0);
    if (a > b || (a === b && (parseInt(s.reps) || 0) > (parseInt(best.reps) || 0))) best = s;
  });
  const kg = parseFloat(best.weight) || 0, reps = parseInt(best.reps) || 0;
  if (kg <= 0) return (reps + 1) + " reps";
  const step = unit() === "lb" ? fromDisp(5) : 2.5;
  return fmtW(kg) + " × " + (reps + 1) + " or " + fmtW(kg + step) + " × " + reps;
}

// Did this workout beat any previous best? (compares estimated one-rep max)
function findPRs(exercises, priorHistory) {
  const prs = [];
  exercises.forEach(function (ex) {
    let thisBest = 0, thisSet = null;
    ex.sets.forEach(function (s) {
      const kg = parseFloat(s.weight) || 0;
      const reps = parseInt(s.reps) || 0;
      const e = e1rm(kg, reps);
      if (e > thisBest) { thisBest = e; thisSet = { kg: kg, reps: reps }; }
    });
    if (!thisBest) return;

    let priorBest = 0;
    priorHistory.forEach(function (w) {
      w.exercises.forEach(function (pe) {
        if (pe.name !== ex.name) return;
        pe.sets.forEach(function (s) {
          priorBest = Math.max(priorBest, e1rm(parseFloat(s.weight) || 0, parseInt(s.reps) || 0));
        });
      });
    });

    if (priorBest > 0 && thisBest > priorBest) {
      prs.push({ name: ex.name, kg: thisSet.kg, reps: thisSet.reps });
    }
  });
  return prs;
}


// =====================================================================
// WORKOUT (the live logger)
// =====================================================================
// Fallback workout, used only if nothing could be generated
const template = {
  name: "Push Day",
  exercises: [
    { name: "Barbell Bench Press",    sets: 3, reps: "6-10" },
    { name: "Overhead Press",         sets: 3, reps: "6-10" },
    { name: "Incline Dumbbell Press", sets: 3, reps: "6-10" },
    { name: "Triceps Dips",           sets: 3, reps: "10-15" }
  ]
};

// One exercise card's data, with weights pre-filled from your history
function makeExercise(name, setCount, target) {
  if (isCardio(name)) {
    const m = /(\d+(?:\.\d+)?)\s*(sec|min)/.exec(String(target));
    const mins = m ? (m[2] === "sec" ? Math.round(Number(m[1]) / 6) / 10 : Number(m[1])) : "";
    const cs = [];
    for (let i = 0; i < setCount; i++) cs.push({ mins: mins, dist: "", done: false });
    return { name: name, target: target, rating: null, note: "", sets: cs };
  }
  const sug = suggestion(name, target);
  const sets = [];
  for (let i = 0; i < setCount; i++) {
    sets.push({ weight: sug ? sug.kg : "", reps: "", done: false });
  }
  const ex = { name: name, target: target, rating: null, note: "", sets: sets };
  if (settings.warmup === "barbell" && (gearKind(name) === "barbell" || gearKind(name) === "trapbar")) addWarmups(ex);
  return ex;
}

// Builds a workout from a plan (generated or fallback)
function newWorkout(plan) {
  plan = plan || template;
  return {
    name: plan.name,
    startedAt: null,
    fromRoutine: false,
    exercises: plan.exercises.map(function (ex) {
      const e = makeExercise(ex.name, ex.sets, ex.reps);
      if (ex.group != null) e.group = ex.group;
      return e;
    })
  };
}

let workout = load("currentWorkout", null);

function saveWorkout() { save("currentWorkout", workout); }

function rpeOptions(selectedValue) {
  let html = `<option value="">RPE</option>`;
  [6, 7, 8, 9, 10].forEach(function (n) {
    html += `<option value="${n}"${String(selectedValue) === String(n) ? " selected" : ""}>${n}</option>`;
  });
  return html;
}

// Once a set is ticked, the set-up options above the exercises fold away
let setupOpen = false;
function workoutStarted() {
  return workout.exercises.some(function (ex) { return ex.sets.some(function (s) { return s.done; }); });
}
function setupFolded() { return workoutStarted() && !setupOpen; }
function syncSetup() {
  const started = workoutStarted();
  if (!started) setupOpen = false;
  $("workout").classList.toggle("folded", setupFolded());
  const t = $("setup-toggle");
  t.hidden = !started;
  t.textContent = setupOpen ? "Hide options" : "Options: warm-up, timer, swap workout";
  t.setAttribute("aria-expanded", String(started && setupOpen));
}
$("setup-toggle").addEventListener("click", function () { setupOpen = !setupOpen; syncSetup(); });

let prsAll = false;      // Progress: show every personal record, or just the top six

// Exercises you have finished and moved on from fold down to one line (tap to reopen).
// An exercise only folds once you tick a set in a different one, so you can still
// add a rating or a note straight after its last set.
let foldedDone = new WeakSet();
function foldFinished(exceptEx) {
  workout.exercises.forEach(function (ex) {
    if (ex !== exceptEx && ex.sets.length && ex.sets.every(function (s) { return s.done; })) foldedDone.add(ex);
  });
}
function doneLine(ex) {
  if (isCardio(ex.name)) return ex.sets.map(cardioText).join(", ");
  let best = null;
  ex.sets.forEach(function (s) { if (s.warmup) return; const kg = parseFloat(s.weight) || 0; if (!best || kg > best.kg) best = { kg: kg, reps: parseInt(s.reps) || 0 }; });
  const n = ex.sets.filter(function (s) { return !s.warmup; }).length;
  return n + (n === 1 ? " set" : " sets") + (best && best.kg ? " · top " + fmtW(best.kg) + " " + unit() + " × " + best.reps : "");
}

function renderWorkout() {
  syncSetup();
  const el = $("workout-list");
  const allStats = exerciseStats();
  let doneCount = 0;
  let totalCount = 0;
  let html = "";

  workout.exercises.forEach(function (ex, ei) {
    const lib = library.find(function (l) { return l.name === ex.name; });
    const canWarm = lib ? (lib.need.length > 0 && !lib.timed) : true;
    const hasWarm = ex.sets.some(function (s) { return s.warmup; });
    const cardio = isCardio(ex.name);

    const gl = groupLabels()[ei];
    if (foldedDone.has(ex) && ex.sets.length && ex.sets.every(function (s) { return s.done; })) {
      ex.sets.forEach(function (s) { if (!s.warmup) { totalCount++; doneCount++; } });   // folded sets still count
      html += `<button type="button" class="card ex-folded" data-action="reopen" data-ex="${ei}" aria-label="${esc(ex.name)}, finished. Tap to reopen">
        <span class="ex-tick">✓</span><span class="ex-ftxt"><b>${esc(ex.name)}</b><span>${esc(doneLine(ex))}</span></span></button>`;
      return;
    }
    html += `<div class="card${gl ? " grouped" : ""}">
      ${gl ? `<div class="grp-tag">${gl.kind} ${gl.tag}</div>` : ""}
      <div class="ex-head">
        <div class="ex-name">${canLock() && isLocked(workout.name, ex.name) ? "🔒 " : ""}${esc(ex.name)}</div>
        <div class="tools">
          <button class="tool" data-action="form" data-ex="${ei}">Form</button>
          ${canLock() && !cardio ? `<button class="tool" data-action="lock" data-ex="${ei}">${isLocked(workout.name, ex.name) ? "Unlock" : "Lock in"}</button>` : ""}
          ${(ex.group != null || workout.exercises[ei + 1]) ? `<button class="tool" data-action="superset" data-ex="${ei}">${ex.group != null ? "Unlink" : "Superset ↓"}</button>` : ""}
          ${["barbell", "ezbar", "trapbar"].indexOf(gearKind(ex.name)) !== -1 ? `<button class="tool" data-action="plates" data-ex="${ei}">Plates</button>` : ""}
          ${canWarm ? `<button class="tool" data-action="warmup" data-ex="${ei}">${hasWarm ? "Clear warm-up" : "Warm-up"}</button>` : ""}
          <button class="tool" data-action="history" data-ex="${ei}">History</button>
          <button class="tool" data-action="swap" data-ex="${ei}">Swap</button>
          <button class="tool" data-action="skip" data-ex="${ei}">Skip</button>
          ${ei > 0 ? `<button class="tool" data-action="up" data-ex="${ei}" aria-label="Move ${esc(ex.name)} up">↑ Up</button>` : ""}
          ${ei < workout.exercises.length - 1 ? `<button class="tool" data-action="down" data-ex="${ei}" aria-label="Move ${esc(ex.name)} down">↓ Down</button>` : ""}
        </div>
        <button class="more" data-action="menu" data-ex="${ei}" aria-label="More options for ${esc(ex.name)}">•••</button>
      </div>
      <div class="hint">${hintFor(ex, allStats[ex.name])}</div>
      <div class="set-row w5 set-head"><div>SET</div><div>${cardio ? "MIN" : unit().toUpperCase()}</div><div>${cardio ? distUnit().toUpperCase() : "REPS"}</div><div>RPE</div><div></div></div>`;

    let n = 0;
    ex.sets.forEach(function (s, si) {
      if (!s.warmup) { totalCount++; if (s.done) doneCount++; }
      const label = s.warmup ? "W" : String(++n);
      if (cardio) {
        const dShown = (s.dist === "" || s.dist == null) ? "" : String(round1(distToDisp(parseFloat(s.dist) || 0)));
        html += `<div class="set-row w5${s.done ? " done" : ""}">
          <div class="set-num">${label}</div>
          <input class="set-input" inputmode="decimal" placeholder="${esc(String(ex.target))}"
                 value="${esc(s.mins)}" data-ex="${ei}" data-set="${si}" data-field="mins">
          <input class="set-input" inputmode="decimal" placeholder="0"
                 value="${esc(dShown)}" data-ex="${ei}" data-set="${si}" data-field="dist">
          <select class="rpe" data-ex="${ei}" data-set="${si}" data-field="rpe">${rpeOptions(s.rpe)}</select>
          <button class="check" data-action="toggle" data-ex="${ei}" data-set="${si}">✓</button>
        </div>`;
        return;
      }
      const shownWeight = (s.weight === "" || s.weight == null) ? "" : fmtW(s.weight);
      // Last time's numbers for this same set show faintly in the empty boxes
      const prev = s.warmup ? null : lastSetAt(ex.name, n);
      const prevKg = prev ? (parseFloat(prev.weight) || 0) : 0;
      const beat = s.done && beatsLast(s, prev);
      html += `<div class="set-row w5${s.done ? " done" : ""}${s.warmup ? " warm" : ""}${beat ? " beat" : ""}">
        <div class="set-num">${beat ? "▲" : label}</div>
        <input class="set-input" inputmode="decimal" placeholder="${prevKg > 0 ? fmtW(prevKg) : "0"}"
               value="${esc(shownWeight)}" data-ex="${ei}" data-set="${si}" data-field="weight">
        <input class="set-input" inputmode="numeric" placeholder="${prev ? esc(String(parseInt(prev.reps) || ex.target)) : esc(ex.target)}"
               value="${esc(s.reps)}" data-ex="${ei}" data-set="${si}" data-field="reps">
        ${s.warmup ? "<div></div>" : `<select class="rpe" data-ex="${ei}" data-set="${si}" data-field="rpe">${rpeOptions(s.rpe)}</select>`}
        <button class="check" data-action="toggle" data-ex="${ei}" data-set="${si}">✓</button>
      </div>`;
    });

    html += `<input class="set-input note" data-field="note" data-ex="${ei}" maxlength="120"
               placeholder="Add a note (e.g. left shoulder twinge)" value="${esc(ex.note || "")}">
      <button class="link-btn" data-action="addset" data-ex="${ei}">+ Add set</button>
      <div class="rate">
        <span>How did it feel?</span>
        <button class="chip${ex.rating === "easy" ? " on" : ""}" data-action="rate" data-ex="${ei}" data-value="easy">Easy</button>
        <button class="chip${ex.rating === "hard" ? " on" : ""}" data-action="rate" data-ex="${ei}" data-value="hard">Hard</button>
        <button class="tool" data-action="rest" data-ex="${ei}">⏱ Rest ${mmss(restFor(ex.name))}</button>
      </div>
    </div>`;
  });

  html += `<div class="btn-row">
      <button class="btn ghost" data-action="addex">+ Add exercise</button>
      <button class="btn ghost" data-action="saveroutine">Save as routine</button>
    </div>
    <button class="btn" data-action="finish">Finish workout</button>`;
  el.innerHTML = html;

  $("workout-title").textContent = workout.name;
  $("workout-progress").textContent = doneCount + " of " + totalCount + " sets done" + (isDeload() ? " · Easier week" : "");
  renderHero();
}

// Typing in a weight, reps, RPE or note box
function onWorkoutInput(e) {
  const t = e.target;
  const field = t.dataset.field;
  if (!field) return;
  const ex = workout.exercises[t.dataset.ex];
  if (!ex) return;

  if (field === "note") {
    ex.note = t.value;
  } else {
    const set = ex.sets[t.dataset.set];
    if (!set) return;
    if (field === "weight") {
      const n = parseFloat(t.value.replace(",", "."));
      set.weight = isNaN(n) ? "" : Math.round(fromDisp(n) * 1000) / 1000;   // stored in kg
    } else if (field === "mins") {
      set.mins = t.value.replace(",", ".");
    } else if (field === "dist") {
      const n = parseFloat(t.value.replace(",", "."));
      set.dist = isNaN(n) ? "" : Math.round(distFromDisp(n) * 1000) / 1000;   // stored in km
    } else if (field === "rpe") {
      set.rpe = t.value;
    } else {
      set.reps = t.value;
    }
  }
  saveWorkout();
}
$("workout-list").addEventListener("input", onWorkoutInput);
$("workout-list").addEventListener("change", onWorkoutInput);

// Tapping any button in the workout
$("workout-list").addEventListener("click", function (e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  if (action === "finish") { finishWorkout(); return; }
  if (action === "addex") { openAddExercise(); return; }
  if (action === "saveroutine") { saveRoutine(); return; }

  if (action === "menu") {
    const card = btn.closest ? btn.closest(".card") : null;
    if (card) card.classList.toggle("menu-open");
    return;
  }

  const ei = Number(btn.dataset.ex);
  const ex = workout.exercises[ei];
  if (!ex) return;

  if (action === "reopen") { foldedDone.delete(ex); renderWorkout(); return; }
  if (action === "toggle") {
    const s = ex.sets[btn.dataset.set];
    s.done = !s.done;
    if (s.done) foldFinished(ex);
    if (s.done) {
      if (!workout.startedAt) workout.startedAt = Date.now();
      // Ticked without typing? Log the same as last time (the faint numbers), else the bottom of the target range
      if (!isCardio(ex.name) && !s.warmup) {
        const nth = ex.sets.slice(0, Number(btn.dataset.set) + 1).filter(function (x) { return !x.warmup; }).length;
        const prev = lastSetAt(ex.name, nth);
        if (prev && (s.weight === "" || s.weight == null) && (parseFloat(prev.weight) || 0) > 0) s.weight = parseFloat(prev.weight);
        if (prev && String(s.reps).trim() === "") s.reps = String(parseInt(prev.reps) || "");
      }
      if (!isCardio(ex.name) && String(s.reps).trim() === "") s.reps = String(parseInt(ex.target) || "");
      if (s.warmup) startRest(45);
      else { const r = restAfterSet(ei); startRest(r.secs, r.label); }
    }
  }

  if (action === "addset") {
    const working = ex.sets.filter(function (s) { return !s.warmup; });
    const last = working[working.length - 1];
    if (isCardio(ex.name)) ex.sets.push({ mins: last ? last.mins : "", dist: "", done: false });
    else ex.sets.push({ weight: last ? last.weight : "", reps: last ? last.reps : "", done: false });
  }

  if (action === "rate") {
    ex.rating = (ex.rating === btn.dataset.value) ? null : btn.dataset.value;
  }

  if (action === "rest") {
    // Cycle this exercise's rest time through the options
    const next = REST_OPTIONS[(REST_OPTIONS.indexOf(restFor(ex.name)) + 1) % REST_OPTIONS.length];
    restMap[ex.name] = next;
    save("restMap", restMap);
  }

  if (action === "plates") {
    const kind = gearKind(ex.name);
    const barKg = barWeightFor(kind);
    const next = ex.sets.find(function (s) { return !s.done && !s.warmup; }) || ex.sets[ex.sets.length - 1];
    openPlates(parseFloat(next && next.weight) || barKg, barKg, BAR_LABELS[kind]);
    return;
  }

  if (action === "warmup") {
    if (ex.sets.some(function (s) { return s.warmup; })) {
      ex.sets = ex.sets.filter(function (s) { return !s.warmup; });
    } else if (!addWarmups(ex)) {
      alert("Enter your working weight in the first set first. A warm-up isn’t needed at or below the bar weight.");
    }
  }

  if (action === "history") { openExerciseHistory(ex.name); return; }
  if (action === "form") { openFormSheet(ex.name); return; }
  if (action === "superset") toggleSuperset(ei);

  if (action === "swap") swapExercise(ei);

  // Lock: this exercise stays in this session every week
  if (action === "lock") toggleLock(workout.name, ex.name);

  // Move an exercise up or down the list
  if (action === "up" || action === "down") {
    const to = ei + (action === "up" ? -1 : 1);
    if (to >= 0 && to < workout.exercises.length) {
      const moved = workout.exercises.splice(ei, 1)[0];
      workout.exercises.splice(to, 0, moved);
    }
  }

  if (action === "skip") {
    if (!confirm("Remove " + ex.name + " from today’s workout?")) return;
    workout.exercises.splice(ei, 1);
    cleanGroups();
  }

  saveWorkout();
  renderWorkout();
});

// Replace an exercise with a similar one (same muscle, same type, fits your equipment)
function swapExercise(ei) {
  const ex = workout.exercises[ei];
  const current = library.find(function (l) { return l.name === ex.name; });
  if (!current) { alert("No swap available for this one."); return; }

  const hasLogged = ex.sets.some(function (s) { return s.done; });
  if (hasLogged && !confirm("This clears the sets you’ve ticked for it. Swap anyway?")) return;

  const used = workout.exercises.map(function (e) { return e.name; });
  const replacement = pickExercise(current.muscle, current.type, used);
  if (!replacement) { alert("No other exercise fits your equipment."); return; }

  const swapped = makeExercise(replacement.name, Math.max(1, ex.sets.filter(function (s) { return !s.warmup; }).length), prescription(replacement).reps);
  if (ex.group != null) swapped.group = ex.group;
  workout.exercises[ei] = swapped;
}

function finishWorkout() {
  // Keep only the sets you ticked off
  const exercises = [];
  workout.exercises.forEach(function (ex) {
    // Warm-up sets are not saved: they would distort your volume and records
    const doneSets = ex.sets.filter(function (s) { return s.done && !s.warmup; });
    if (doneSets.length) {
      exercises.push({
        name: ex.name,
        rating: ex.rating,
        note: (ex.note || "").trim(),
        sets: doneSets.map(function (s) {
          if (isCardio(ex.name)) return { mins: s.mins, dist: s.dist, rpe: s.rpe || "" };
          return { weight: s.weight, reps: s.reps, rpe: s.rpe || "" };
        })
      });
    }
  });

  if (!exercises.length) {
    alert("Tick off at least one set first.");
    return;
  }

  const prior = getHistory();
  const prs = findPRs(exercises, prior);
  const minutes = workout.startedAt ? Math.max(1, Math.round((Date.now() - workout.startedAt) / 60000)) : null;

  const entry = { date: dateKey(new Date()), name: workout.name, minutes: minutes, routine: !!workout.fromRoutine, exercises: exercises };
  save("workoutHistory", prior.concat([entry]));
  addWorkoutDate(entry.date);
  const newBadges = takeNewBadges();

  // Line up your NEXT workout straight away (weights pre-filled from what you just did)
  workout = newWorkout(buildPlan() || template);
  saveWorkout();
  stopRest();

  renderAll();
  openSummary(entry, prs, newBadges);
}


// =====================================================================
// SHEETS: the finish summary and the workout editor
// =====================================================================
let editState = null;

function openSheet(html) {
  $("sheet").innerHTML = html;
  $("overlay").classList.add("show");
}
function closeSheet() {
  $("overlay").classList.remove("show");
  editState = null;
}

function workoutTotals(w) {
  let volume = 0, sets = 0;
  w.exercises.forEach(function (ex) {
    ex.sets.forEach(function (s) {
      volume += (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0);
      sets++;
    });
  });
  return { volume: volume, sets: sets };
}

function openSummary(entry, prs, newBadges) {
  const t = workoutTotals(entry);
  let html = `<div class="card-label">Workout complete</div>
    <div class="big">${esc(entry.name)}</div>
    <div class="stats">
      <div class="stat"><div class="stat-num">${t.sets}</div><div class="stat-lbl">Sets</div></div>
      <div class="stat"><div class="stat-num">${Math.round(toDisp(t.volume)).toLocaleString()}</div><div class="stat-lbl">${unit()} lifted</div></div>
      <div class="stat"><div class="stat-num">${entry.minutes ? entry.minutes : "-"}</div><div class="stat-lbl">Minutes</div></div>
    </div>`;

  if (prs.length) {
    html += `<h2>New personal records</h2>`;
    prs.forEach(function (p) {
      html += `<div class="pr-line">🏆 <b>${esc(p.name)}</b>: ${fmtW(p.kg)} ${unit()} × ${p.reps}</div>`;
    });
  }

  if (newBadges && newBadges.length) {
    html += `<h2>New achievements</h2>`;
    newBadges.forEach(function (b) {
      html += `<div class="pr-line">${b.icon} <b>${esc(b.name)}</b>: ${esc(b.desc)}</div>`;
    });
  }

  html += `<h2>How was that session?</h2>
    <div class="chips rate5">${[1, 2, 3, 4, 5].map(function (n) { return `<button class="chip" data-a="feel" data-v="${n}" aria-label="${n} out of 5">${n}</button>`; }).join("")}</div>
    <div class="feed-meta" style="margin:.3rem 0 .6rem">1 = rough, 5 = great. Optional.</div>
    <input class="set-input note" id="sum-note" maxlength="160" placeholder="A note about today (optional)">`;

  html += `<button class="btn" data-a="summary-done">Done</button>
    <button class="btn ghost" data-run="gym-pic" data-i="${getHistory().length - 1}">Share picture</button>`;
  openSheet(html);
}

function openEditor(index) {
  const w = getHistory()[index];
  if (!w) return;
  editState = { index: index, original: w.date, data: JSON.parse(JSON.stringify(w)) };
  renderEditor();
}

function renderEditor() {
  const d = editState.data;
  let html = `<div class="card-label">Edit workout</div>
    <div class="big">${esc(d.name)}</div>
    <div class="card-label" style="margin-top:.9rem">Date</div>
    <input type="date" class="inp-date" data-f="date" value="${esc(d.date)}">`;

  d.exercises.forEach(function (ex, ei) {
    const cardioEx = isCardio(ex.name);
    html += `<div class="ex-name">${esc(ex.name)}</div>
      <div class="set-row set-head"><div>SET</div><div>${cardioEx ? "MIN" : unit().toUpperCase()}</div><div>${cardioEx ? distUnit().toUpperCase() : "REPS"}</div><div></div></div>`;
    ex.sets.forEach(function (s, si) {
      if (cardioEx) {
        const dShown = (s.dist === "" || s.dist == null) ? "" : String(round1(distToDisp(parseFloat(s.dist) || 0)));
        html += `<div class="set-row">
          <div class="set-num">${si + 1}</div>
          <input class="set-input" inputmode="decimal" placeholder="0" value="${esc(s.mins)}" data-e="${ei}" data-s="${si}" data-f="mins">
          <input class="set-input" inputmode="decimal" placeholder="0" value="${esc(dShown)}" data-e="${ei}" data-s="${si}" data-f="dist">
          <button class="check" data-a="edit-delset" data-e="${ei}" data-s="${si}">✕</button>
        </div>`;
        return;
      }
      const shown = (s.weight === "" || s.weight == null) ? "" : fmtW(s.weight);
      html += `<div class="set-row">
        <div class="set-num">${si + 1}</div>
        <input class="set-input" inputmode="decimal" placeholder="0" value="${esc(shown)}"
               data-e="${ei}" data-s="${si}" data-f="weight">
        <input class="set-input" inputmode="numeric" placeholder="0" value="${esc(s.reps)}"
               data-e="${ei}" data-s="${si}" data-f="reps">
        <button class="check" data-a="edit-delset" data-e="${ei}" data-s="${si}">✕</button>
      </div>`;
    });
  });

  html += `<div class="btn-row">
      <button class="btn ghost" data-a="edit-cancel">Cancel</button>
      <button class="btn" data-a="edit-save">Save</button>
    </div>`;
  openSheet(html);
}

function saveEdit() {
  const d = editState.data;

  // Drop exercises that have no sets left
  d.exercises = d.exercises.filter(function (ex) { return ex.sets.length > 0; });
  if (!d.exercises.length) {
    alert("This would remove every set. Use Delete in the Feed instead.");
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) d.date = editState.original;

  const history = getHistory();
  history[editState.index] = d;
  save("workoutHistory", history);

  if (d.date !== editState.original) {
    addWorkoutDate(d.date);
    dropDateIfUnused(editState.original);
  }

  closeSheet();
  renderAll();
}

// Clicks inside the sheet
$("sheet").addEventListener("click", function (e) {
  const b = e.target.closest("[data-a]");
  if (!b) return;
  const a = b.dataset.a;

  if (a === "feel") {
    updateLastSession({ feel: Number(b.dataset.v) });
    const all = b.parentNode && b.parentNode.querySelectorAll ? b.parentNode.querySelectorAll(".chip") : [];
    for (let i = 0; i < all.length; i++) all[i].classList.toggle("on", all[i] === b);
    return;
  }
  if (a === "calc-plates") {
    const w = parseFloat(String(($("calc-w") || {}).value || "").replace(",", "."));
    openPlates(w > 0 ? fromDisp(w) : gear.bar);
    return;
  }
  if (a === "summary-done") {
    const note = $("sum-note");
    if (note && String(note.value || "").trim()) updateLastSession({ memo: String(note.value).trim().slice(0, 160) });
    closeSheet(); renderFeed(); showTab("feed");
  }
  if (a === "edit-cancel") closeSheet();
  if (a === "plate-close") closeSheet();
  if (a === "hist-close") closeSheet();
  if (a === "add-close") closeSheet();
  if (a === "lib-hist") openExerciseHistory(b.dataset.name);
  if (a === "guided-start") startGuided(b.dataset.kind);
  if (a === "pref") {
    togglePref(b.dataset.kind, b.dataset.name);
    openLibraryDetail(b.dataset.name);
    renderLibraryList();
    refreshPlanAfterGoalChange();   // an unstarted workout is rebuilt so the change shows straight away
  }
  if (a === "add-ex") {
    const lib = library.find(function (l) { return l.name === b.dataset.name; });
    if (!lib) return;
    if (workout.exercises.some(function (e) { return e.name === lib.name; })) {
      alert("That exercise is already in today’s workout.");
      return;
    }
    const rx = prescription(lib);
    workout.exercises.push(makeExercise(lib.name, rx.sets, rx.reps));
    saveWorkout();
    renderWorkout();
    closeSheet();
  }
  if (a === "edit-save") saveEdit();
  if (a === "edit-delset") {
    editState.data.exercises[b.dataset.e].sets.splice(Number(b.dataset.s), 1);
    renderEditor();
  }
});

// Typing inside the editor
$("sheet").addEventListener("input", function (e) {
  const t = e.target;
  if (t.dataset.f === "plate-target") { renderPlateResult(parseFloat(t.value)); return; }
  if (t.id === "calc-w" || t.id === "calc-r") { renderCalc(); return; }
  if (!editState || !t.dataset.f) return;

  if (t.dataset.f === "date") {
    editState.data.date = t.value;
    return;
  }
  const set = editState.data.exercises[t.dataset.e].sets[t.dataset.s];
  if (t.dataset.f === "weight") {
    const n = parseFloat(t.value.replace(",", "."));
    set.weight = isNaN(n) ? "" : Math.round(fromDisp(n) * 1000) / 1000;
  } else if (t.dataset.f === "mins") {
    set.mins = t.value.replace(",", ".");
  } else if (t.dataset.f === "dist") {
    const n = parseFloat(t.value.replace(",", "."));
    set.dist = isNaN(n) ? "" : Math.round(distFromDisp(n) * 1000) / 1000;
  } else {
    set.reps = t.value;
  }
});

// Tapping the dark background closes the sheet
$("overlay").addEventListener("click", function (e) {
  if (e.target === $("overlay")) closeSheet();
});


// =====================================================================
// FEED
// =====================================================================
// 2,697,000 -> "2.7M" so big totals fit on small screens
function bigNum(v) {
  v = Math.round(v);
  return v >= 1000000 ? (Math.round(v / 10000) / 100) + "M" : v.toLocaleString();
}

const FEED_PAGE = 20;
let feedLimit = FEED_PAGE;

function renderFeed() {
  renderCalendar();
  const el = $("feed-list");
  const history = getHistory();

  if (!history.length) {
    el.innerHTML = `<p class="sub">No workouts yet. Finish one and it will show up here.</p>`;
    return;
  }

  // Keep each workout's real position so Edit/Delete hit the right one
  let all = history.map(function (w, i) { return { w: w, i: i }; }).reverse();
  if (feedDay) all = all.filter(function (x) { return x.w.date === feedDay; });   // a day picked on the calendar
  const items = all.slice(0, feedLimit);   // newest first, a page at a time so it stays quick
  const left = all.length - items.length;

  el.innerHTML = items.map(function (item) {
    const w = item.w;
    const t = workoutTotals(w);

    const lines = w.exercises.map(function (ex) {
      if (isCardio(ex.name)) {
        return `<div class="feed-line"><span>${esc(ex.name)}</span><span class="feed-meta">${esc(ex.sets.map(cardioText).join("; "))}</span></div>`;
      }
      let best = null;
      ex.sets.forEach(function (s) {
        const kg = parseFloat(s.weight) || 0;
        const reps = parseInt(s.reps) || 0;
        if (!best || kg > best.kg) best = { kg: kg, reps: reps };
      });
      const bestText = (best && best.kg) ? " · " + fmtW(best.kg) + " × " + best.reps : "";
      return `<div class="feed-line"><span>${esc(ex.name)}</span>
              <span class="feed-meta">${ex.sets.length} sets${bestText}</span></div>` +
        (ex.note ? `<div class="feed-note">${esc(ex.note)}</div>` : "");
    }).join("");

    const names = w.exercises.map(function (ex) { return ex.name; });
    const summary = names.length <= 3 ? names.join(", ") : names.slice(0, 3).join(", ") + " and " + (names.length - 3) + " more";
    const dur = !w.minutes ? "-" : (w.minutes >= 60 ? Math.floor(w.minutes / 60) + " h " + (w.minutes % 60) + " min" : w.minutes + " min");

    const date = new Date(w.date + "T00:00:00").toLocaleDateString("en-GB", {
      weekday: "short", day: "numeric", month: "short"
    });

    return `<div class="card feed-card">
      <div class="feed-top">
        <div class="feed-who"><img class="logo-av" src="logo-mark.svg" alt=""><div class="card-label">${date}</div></div>
      </div>
      <div class="big">${esc(w.name)}</div>
      <div class="feed-meta feed-summary">${esc(summary)}</div>
      ${w.feel ? `<div class="feed-stars" aria-label="Rated ${w.feel} out of 5">${stars(w.feel)}</div>` : ""}
      ${w.memo ? `<div class="feed-note">${esc(w.memo)}</div>` : ""}
      <div class="feed-stats">
        <div><span>Duration</span><b>${dur}</b></div>
        <div><span>Volume</span><b>${Math.round(toDisp(t.volume)).toLocaleString()} ${unit()}</b></div>
        <div><span>Sets</span><b>${t.sets}</b></div>
        <div><span>Exercises</span><b>${w.exercises.length}</b></div>
      </div>
      <details class="feed-detail"><summary>Sets and notes</summary><div class="feed-lines">${lines}</div></details>
      <div class="feed-actions">
        <button class="tool" data-a="feed-again" data-i="${item.i}">Do again</button>
        <button class="tool" data-a="feed-share" data-i="${item.i}">Share</button>
        <button class="tool" data-a="feed-pic" data-i="${item.i}">Picture</button>
        <button class="tool" data-a="feed-edit" data-i="${item.i}">Edit</button>
        <button class="tool" data-a="feed-del" data-i="${item.i}">Delete</button>
      </div>
    </div>`;
  }).join("") + (left > 0 ? `<button class="btn ghost" data-a="feed-more">Show ${Math.min(FEED_PAGE, left)} more (${left} older)</button>` : "");
}

$("feed-list").addEventListener("click", function (e) {
  const b = e.target.closest("[data-a]");
  if (!b) return;
  if (b.dataset.a === "feed-more") { feedLimit += FEED_PAGE; renderFeed(); return; }
  const index = Number(b.dataset.i);

  if (b.dataset.a === "feed-again") { repeatWorkout(index); return; }
  if (b.dataset.a === "feed-edit") openEditor(index);
  if (b.dataset.a === "feed-pic") { shareWorkoutPic(index); return; }
  if (b.dataset.a === "feed-share") {
    const w = getHistory()[index];
    if (w) shareOut("BTB workout", workoutShareText(w), appUrl());
  }

  if (b.dataset.a === "feed-del") {
    if (!confirm("Delete this workout from your history?")) return;
    const history = getHistory();
    const removed = history.splice(index, 1)[0];
    save("workoutHistory", history);
    dropDateIfUnused(removed.date);
    renderAll();
  }
});


// =====================================================================
// PROGRESS TAB
// =====================================================================
let chartExercise = null;

// Gathers every exercise's history: one entry per session with your best set
function exerciseStats() {
  const stats = {};

  getHistory().forEach(function (w) {
    w.exercises.forEach(function (ex) {
      if (isCardio(ex.name)) return;
      let bestE = 0, bestSet = null, bestReps = 0;
      ex.sets.forEach(function (s) {
        const kg = parseFloat(s.weight) || 0;
        const reps = parseInt(s.reps) || 0;
        const e = e1rm(kg, reps);
        if (e > bestE) { bestE = e; bestSet = { kg: kg, reps: reps }; }
        if (reps > bestReps) bestReps = reps;
      });
      if (!stats[ex.name]) stats[ex.name] = { name: ex.name, sessions: [] };
      stats[ex.name].sessions.push({ date: w.date, e1rm: bestE, set: bestSet, reps: bestReps });
    });
  });

  for (const name in stats) {
    const s = stats[name];
    s.weighted = s.sessions.some(function (x) { return x.e1rm > 0; });   // false = bodyweight, tracked in reps
    s.sessions.forEach(function (x) { x.v = s.weighted ? x.e1rm : x.reps; });
    s.sessions = s.sessions.filter(function (x) { return x.v > 0; });
    s.best = s.sessions.reduce(function (a, b) { return (!a || b.v > a.v) ? b : a; }, null);
  }
  return stats;
}

function renderProgress() {
  const history = getHistory();
  const stats = exerciseStats();
  const names = Object.keys(stats).filter(function (n) { return stats[n].sessions.length > 0; });

  renderMuscles();
  renderReview();
  renderLevels();
  renderWeekly();
  renderAchievements();
  renderBodyChart();

  // Lifts that have stopped improving
  const stalled = names.filter(function (n) { return plateauInfo(stats[n]); });
  $("attention").innerHTML = stalled.length
    ? `<h2>Needs attention</h2><div class="card">` +
      stalled.slice(0, 6).map(function (n) {
        return `<div class="pr-row"><div class="pr-name">${esc(n)}</div><div class="pr-sub">No new best in 3 sessions</div></div>`;
      }).join("") +
      `<div class="feed-meta" style="margin-top:.6rem">Try one more rep per set, a lighter week, or a variation of the lift.</div></div>`
    : "";

  // Top stat cards
  let score = 0;
  names.forEach(function (n) { if (stats[n].weighted) score += stats[n].best.v; });
  let totalVolume = 0;
  history.forEach(function (w) { totalVolume += workoutTotals(w).volume; });

  $("stats").innerHTML =
    `<div class="stat"><div class="stat-num">${Math.round(score)}</div><div class="stat-lbl">Strength score</div></div>
     <div class="stat"><div class="stat-num">${history.length}</div><div class="stat-lbl">Workouts</div></div>
     <div class="stat"><div class="stat-num">${bigNum(toDisp(totalVolume))}</div><div class="stat-lbl">${unit()} lifted</div></div>`;

  // Empty state
  if (!names.length) {
    $("chart-select").style.display = "none";
    $("hist-btn").style.display = "none";
    $("chart").innerHTML = `<p class="feed-meta">Finish a workout with weights logged and your trends will appear here.</p>`;
    $("prs").innerHTML = `<p class="feed-meta">Your personal records will appear here.</p>`;
    return;
  }
  $("chart-select").style.display = "";
  $("hist-btn").style.display = "";

  // Exercise picker (most-logged first)
  names.sort(function (a, b) {
    return stats[b].sessions.length - stats[a].sessions.length || a.localeCompare(b);
  });
  if (!chartExercise || !stats[chartExercise]) chartExercise = names[0];

  $("chart-select").innerHTML = names.map(function (n) {
    return `<option value="${esc(n)}"${n === chartExercise ? " selected" : ""}>${esc(n)}</option>`;
  }).join("");

  renderChart(stats[chartExercise]);

  // Personal records list: weighted lifts first (by estimated 1RM), then bodyweight (by reps)
  const weighted = names.filter(function (n) { return stats[n].weighted; })
    .sort(function (a, b) { return stats[b].best.v - stats[a].best.v; });
  const bodyweight = names.filter(function (n) { return !stats[n].weighted; })
    .sort(function (a, b) { return stats[b].best.v - stats[a].best.v; });

  const prNames = weighted.concat(bodyweight).slice(0, 20);
  $("prs").innerHTML = prNames.slice(0, prsAll ? 20 : 6).map(function (n) {
    const s = stats[n];
    if (s.weighted) {
      return `<div class="pr-row">
        <div class="pr-name">${esc(n)}</div>
        <div class="pr-val">${fmtW(s.best.set.kg)} ${unit()} × ${s.best.set.reps}
          <div class="pr-sub">Est. 1RM ${fmtW(s.best.v)} ${unit()}</div></div>
      </div>`;
    }
    return `<div class="pr-row">
      <div class="pr-name">${esc(n)}</div>
      <div class="pr-val">${s.best.v} reps</div>
    </div>`;
  }).join("") + (prNames.length > 6 ? `<button class="btn ghost" id="prs-more" style="margin-top:.8rem">${prsAll ? "Show fewer" : "Show all " + prNames.length}</button>` : "");
}
$("prs").addEventListener("click", function (e) {
  if (!e.target.closest("#prs-more")) return;
  prsAll = !prsAll;
  renderProgress();
});

$("chart-select").addEventListener("change", function () {
  chartExercise = $("chart-select").value;
  renderProgress();
});

// Draws a simple line chart as an SVG (no libraries needed)
function renderChart(s) {
  const points = s.sessions.map(function (x) {
    return { date: x.date, v: s.weighted ? toDisp(x.v) : x.v };
  });
  const label = s.weighted ? "Estimated 1RM (" + unit() + ")" : "Best reps in a set";

  const W = 320, H = 170, padL = 38, padR = 12, padT = 12, padB = 26;
  let min = Math.min.apply(null, points.map(function (p) { return p.v; }));
  let max = Math.max.apply(null, points.map(function (p) { return p.v; }));
  if (min === max) { min -= 1; max += 1; }
  const range = max - min;
  min -= range * 0.1;
  max += range * 0.1;

  function px(i) {
    const w = W - padL - padR;
    return padL + (points.length === 1 ? w / 2 : (i * w) / (points.length - 1));
  }
  function py(v) { return padT + (H - padT - padB) * (1 - (v - min) / (max - min)); }

  const dateLabel = function (key) {
    return new Date(key + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}">`;

  // Grid lines with value labels
  [0, 0.5, 1].forEach(function (f) {
    const v = min + (max - min) * f;
    const y = py(v);
    svg += `<line class="ch-grid" x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}"/>
            <text class="ch-txt" x="${padL - 6}" y="${y + 3}" text-anchor="end">${Math.round(v)}</text>`;
  });

  // The line and dots
  if (points.length > 1) {
    svg += `<polyline class="ch-line" points="${points.map(function (p, i) { return px(i) + "," + py(p.v); }).join(" ")}"/>`;
  }
  points.forEach(function (p, i) {
    svg += `<circle class="ch-dot" cx="${px(i)}" cy="${py(p.v)}" r="3.5"/>`;
  });

  // Date labels at both ends
  svg += `<text class="ch-txt" x="${px(0)}" y="${H - 8}" text-anchor="${points.length > 1 ? "start" : "middle"}">${dateLabel(points[0].date)}</text>`;
  if (points.length > 1) {
    svg += `<text class="ch-txt" x="${px(points.length - 1)}" y="${H - 8}" text-anchor="end">${dateLabel(points[points.length - 1].date)}</text>`;
  }
  svg += `</svg>`;

  $("chart").innerHTML = svg +
    `<div class="feed-meta" style="margin-top:.4rem">${label}` +
    (points.length < 2 ? ". Log this exercise again to see a trend." : "") + `</div>`;
}


// =====================================================================
// WARM-UP SETS
// A ramp of lighter sets before your working weight (about 40%, 60%, 80%).
// Warm-ups are shown in the workout but never saved to your history.
// =====================================================================
function warmupPlan(name, workingKg) {
  if (!(workingKg > 0)) return [];
  const kind = gearKind(name);
  const unitStep = settings.units === "lb" ? 5 * KG_PER_LB : 2.5;
  const ramp = [[0.4, 8], [0.6, 5], [0.8, 3]];
  const out = [];

  ramp.forEach(function (r) {
    const target = workingKg * r[0];
    let kg = null;

    if (kind) {
      // Only weights you can really load, and lighter than your working weight
      const list = (kind === "dumbbell" ? gear.dumbbells : loadableWeights(barWeightFor(kind)))
        .filter(function (w) { return w < workingKg - 0.001; });
      if (list.length) kg = nearest(list, target);
    } else {
      const stepped = Math.round(target / unitStep) * unitStep;
      if (stepped >= unitStep && stepped < workingKg - 0.001) kg = stepped;
    }

    if (kg === null) return;
    kg = Math.round(kg * 1000) / 1000;
    if (out.length && Math.abs(out[out.length - 1].weight - kg) < 0.001) return;   // no repeats
    out.push({ weight: kg, reps: r[1] });
  });
  return out;
}

// Puts warm-up rows above the working sets. Returns false if none are needed.
function addWarmups(ex) {
  if (ex.sets.some(function (s) { return s.warmup; })) return false;
  const first = ex.sets.find(function (s) { return !s.warmup; });
  const plan = warmupPlan(ex.name, first ? parseFloat(first.weight) || 0 : 0);
  if (!plan.length) return false;

  const rows = plan.map(function (p) { return { weight: p.weight, reps: String(p.reps), done: false, warmup: true }; });
  ex.sets = rows.concat(ex.sets);
  return true;
}


// =====================================================================
// PLATEAU AND EASIER-WEEK (DELOAD) ALERTS
// =====================================================================
// A lift has stalled if none of its last 3 sessions beat your earlier best
function plateauInfo(stat) {
  if (!stat || stat.sessions.length < 4) return null;
  const values = stat.sessions.map(function (s) { return s.v; });
  const earlierBest = Math.max.apply(null, values.slice(0, -3));
  const recentBest = Math.max.apply(null, values.slice(-3));
  return recentBest <= earlierBest * 1.005 ? { sessions: 3 } : null;
}

let deload = load("deload", { until: null, dismissedOn: null, lastEnded: null });
function saveDeload() { save("deload", deload); }
function isManualDeload() { return !!deload.until && dateKey(new Date()) <= deload.until; }
function isDeload() {
  if (isManualDeload()) return true;
  const ph = programmeInfo();
  return !!(ph && !ph.done && ph.name === "Deload");   // the last week of a programme is an easy week
}

function daysBetween(a, b) {
  return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
}

// Is there a reason to suggest an easier week? Returns a sentence, or null.
function deloadReason() {
  if (isDeload()) return null;
  const today = dateKey(new Date());
  if (deload.dismissedOn && daysBetween(deload.dismissedOn, today) < 7) return null;
  if (deload.lastEnded && daysBetween(deload.lastEnded, today) < 28) return null;

  const history = getHistory();
  if (history.length < 6) return null;

  // Reason 1: six full weeks in a row with at least two workouts each
  const dates = getWorkoutDates();
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  let steady = true;
  for (let w = 1; w <= 6 && steady; w++) {
    const start = new Date(monday);
    start.setDate(monday.getDate() - 7 * w);
    let count = 0;
    for (let d = 0; d < 7; d++) {
      const day = new Date(start);
      day.setDate(start.getDate() + d);
      if (dates.includes(dateKey(day))) count++;
    }
    if (count < 2) steady = false;
  }
  if (steady) return "You’ve trained at least twice a week for six weeks straight.";

  // Reason 2: most exercises felt Hard in your last three workouts
  const rated = [];
  history.slice(-3).forEach(function (w) {
    w.exercises.forEach(function (ex) { if (ex.rating) rated.push(ex.rating); });
  });
  const hard = rated.filter(function (r) { return r === "hard"; }).length;
  if (rated.length >= 4 && hard / rated.length >= 0.6) return "Most exercises felt Hard in your last three workouts.";

  return null;
}

function renderDeload() {
  const el = $("deload-card");
  const today = dateKey(new Date());

  // An easier week that has run its course ends by itself
  if (deload.until && today > deload.until) {
    deload.lastEnded = deload.until;
    deload.until = null;
    saveDeload();
  }

  if (isManualDeload()) {
    const until = new Date(deload.until + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    el.style.display = "";
    el.innerHTML = `<div class="card-label">Easier week</div>
      <div class="big">On until ${until}</div>
      <div class="feed-meta">One fewer set per exercise and weights about 10% lighter.</div>
      <button class="btn ghost" data-d="end">End early</button>`;
    return;
  }

  const reason = deloadReason();
  if (!reason) { el.style.display = "none"; return; }

  el.style.display = "";
  el.innerHTML = `<div class="card-label">Time for an easier week?</div>
    <div class="feed-meta">${reason} A lighter week now helps you come back stronger.</div>
    <div class="btn-row">
      <button class="btn ghost" data-d="later">Not now</button>
      <button class="btn" data-d="start">Start easier week</button>
    </div>`;
}

// Re-reads weights (and set counts) for a workout you haven't started yet
function refreshUnstartedWorkout(setDelta) {
  if (workout.exercises.some(function (ex) { return ex.sets.some(function (s) { return s.done; }); })) return;
  const plan = {
    name: workout.name,
    exercises: workout.exercises.map(function (ex) {
      const sets = ex.sets.filter(function (s) { return !s.warmup; }).length;
      return { name: ex.name, sets: Math.max(2, sets + setDelta), reps: ex.target };
    })
  };
  const fromRoutine = workout.fromRoutine;
  workout = newWorkout(plan);
  workout.fromRoutine = fromRoutine;
  saveWorkout();
}

$("deload-card").addEventListener("click", function (e) {
  const b = e.target.closest("[data-d]");
  if (!b) return;
  const today = dateKey(new Date());

  if (b.dataset.d === "start") {
    const end = new Date();
    end.setDate(end.getDate() + 6);
    deload.until = dateKey(end);
    saveDeload();
    refreshUnstartedWorkout(-1);
  }
  if (b.dataset.d === "later") {
    deload.dismissedOn = today;
    saveDeload();
  }
  if (b.dataset.d === "end") {
    deload.until = null;
    deload.lastEnded = today;
    saveDeload();
    refreshUnstartedWorkout(0);
  }
  renderDeload();
  renderWorkout();
});


// =====================================================================
// MY ROUTINES AND ADDING EXERCISES
// =====================================================================
let routines = load("routines", []);

function renderRoutines() {
  const el = $("routines-card");
  if (!routines.length) { el.innerHTML = ""; return; }

  el.innerHTML = `<h2>My routines</h2><div class="card">` + routines.map(function (r, i) {
    return `<div class="pr-row">
      <div><div class="pr-name">${esc(r.name)}</div><div class="pr-sub">${r.exercises.length} exercises</div></div>
      <div class="tools">
        <button class="tool" data-r="start" data-i="${i}">Start</button>
        <button class="tool" data-r="del" data-i="${i}">Delete</button>
      </div>
    </div>`;
  }).join("") + `</div>`;
}

function saveRoutine() {
  const name = (prompt("Name this routine:", workout.name) || "").trim().slice(0, 30);
  if (!name) return;

  const exercises = workout.exercises.map(function (ex) {
    return { name: ex.name, sets: Math.max(1, ex.sets.filter(function (s) { return !s.warmup; }).length), reps: ex.target };
  });

  // Saving with the same name replaces the old routine
  routines = routines.filter(function (r) { return r.name.toLowerCase() !== name.toLowerCase(); });
  routines.push({ name: name, exercises: exercises });
  save("routines", routines);
  renderRoutines();
  $("gen-status").textContent = "Saved “" + name + "” to My routines.";
}

function startRoutine(i) {
  const r = routines[i];
  if (!r) return;

  const started = workout.exercises.some(function (ex) { return ex.sets.some(function (s) { return s.done && !s.warmup; }); });
  if (started && !confirm("Replace your current workout? Ticked sets will be lost.")) return;

  workout = newWorkout({ name: r.name, exercises: r.exercises });
  workout.fromRoutine = true;
  saveWorkout();
  renderWorkout();
  $("gen-status").textContent = "Started “" + r.name + "”. Routines don’t move your weekly split along.";
  window.scrollTo(0, 0);
}

$("routines-card").addEventListener("click", function (e) {
  const b = e.target.closest("[data-r]");
  if (!b) return;
  const i = Number(b.dataset.i);

  if (b.dataset.r === "start") startRoutine(i);
  if (b.dataset.r === "del") {
    if (!confirm("Delete the routine “" + routines[i].name + "”?")) return;
    routines.splice(i, 1);
    save("routines", routines);
    renderRoutines();
  }
});

function openAddExercise() {
  openSheet(`<div class="card-label">Add exercise</div>
    <div class="big">Pick an exercise</div>
    <select class="select" data-f="add-muscle" style="margin-top:.8rem">
      <option value="all">All muscles</option>
      ${MUSCLES.map(function (m) { return `<option value="${m[0]}">${m[1]}</option>`; }).join("")}
    </select>
    <div id="add-list"></div>
    <button class="btn ghost" data-a="add-close">Close</button>`);
  renderAddList("all");
}

function renderAddList(muscle) {
  const items = library
    .filter(function (l) { return muscle === "all" || l.muscle === muscle; })
    .sort(function (a, b) {
      return (hasEquipment(b) - hasEquipment(a)) || a.name.localeCompare(b.name);   // ones you can do first
    });

  $("add-list").innerHTML = items.map(function (l) {
    return `<div class="pr-row">
      <div><div class="pr-name">${esc(l.name)}</div>
        <div class="pr-sub">${esc(muscleLabel(l.muscle))}${hasEquipment(l) ? "" : " · needs equipment you haven’t ticked"}</div></div>
      <button class="tool" data-a="add-ex" data-name="${esc(l.name)}">Add</button>
    </div>`;
  }).join("");
}

$("sheet").addEventListener("change", function (e) {
  if (e.target.dataset.f === "add-muscle") renderAddList(e.target.value);
});


// =====================================================================
// BODY WEIGHT AND MEASUREMENTS
// Stored in kg and cm. Shown in your units (kg and cm, or lb and inches).
// =====================================================================
const BODY_FIELDS = [
  ["weight", "Body weight"], ["waist", "Waist"], ["chest", "Chest"], ["arm", "Arms"], ["thigh", "Thighs"]
];

let bodyLog = load("bodyLog", []);   // one entry per date: { date, weight, waist, chest, arm, thigh }
let bodyMetric = "weight";

function lenUnit() { return settings.units === "lb" ? "in" : "cm"; }
function lenToDisp(cm) { return settings.units === "lb" ? cm / 2.54 : cm; }
function lenFromDisp(v) { return settings.units === "lb" ? v * 2.54 : v; }
function round1(n) { return Math.round(n * 10) / 10; }
function bodyToDisp(field, stored) { return field === "weight" ? toDisp(stored) : lenToDisp(stored); }
function bodyUnit(field) { return field === "weight" ? unit() : lenUnit(); }

// values: { date, weight, waist, chest, arm, thigh } as typed (in your units)
function saveBodyEntry(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v.date || ""))) return { ok: false, error: "Pick a date." };
  if (v.date > dateKey(new Date())) return { ok: false, error: "That date is in the future." };

  const entry = { date: v.date };
  let any = false;

  for (let i = 0; i < BODY_FIELDS.length; i++) {
    const field = BODY_FIELDS[i][0];
    const label = BODY_FIELDS[i][1];
    const raw = String(v[field] == null ? "" : v[field]).trim().replace(",", ".");
    if (raw === "") continue;

    const n = parseFloat(raw);
    const stored = field === "weight" ? fromDisp(n) : lenFromDisp(n);
    const lo = field === "weight" ? 20 : 10;
    const hi = field === "weight" ? 400 : 300;
    if (!isFinite(n) || n <= 0 || stored < lo || stored > hi) {
      return { ok: false, error: label + " doesn’t look right. Check the number." };
    }
    entry[field] = Math.round(stored * 100) / 100;
    any = true;
  }
  if (!any) return { ok: false, error: "Enter at least one number." };

  // Same date? Merge into that entry instead of adding a second one
  const existing = bodyLog.find(function (e) { return e.date === entry.date; });
  if (existing) Object.assign(existing, entry);
  else bodyLog.push(entry);

  bodyLog.sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  save("bodyLog", bodyLog);
  return { ok: true };
}

function deleteBodyEntry(date) {
  bodyLog = bodyLog.filter(function (e) { return e.date !== date; });
  save("bodyLog", bodyLog);
}

// A simple line chart as an SVG. points = [{ date, v }] in the units you see.
function lineChartSvg(points) {
  const W = 320, H = 170, padL = 38, padR = 12, padT = 12, padB = 26;
  let min = Math.min.apply(null, points.map(function (p) { return p.v; }));
  let max = Math.max.apply(null, points.map(function (p) { return p.v; }));
  if (min === max) { min -= 1; max += 1; }
  const range = max - min;
  min -= range * 0.1;
  max += range * 0.1;
  const fine = (max - min) < 10;   // small ranges need a decimal on the axis

  function px(i) {
    const w = W - padL - padR;
    return padL + (points.length === 1 ? w / 2 : (i * w) / (points.length - 1));
  }
  function py(v) { return padT + (H - padT - padB) * (1 - (v - min) / (max - min)); }
  function dateLabel(key) {
    return new Date(key + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}">`;

  [0, 0.5, 1].forEach(function (f) {
    const v = min + (max - min) * f;
    const y = py(v);
    svg += `<line class="ch-grid" x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}"/>
            <text class="ch-txt" x="${padL - 6}" y="${y + 3}" text-anchor="end">${fine ? round1(v) : Math.round(v)}</text>`;
  });

  if (points.length > 1) {
    svg += `<polyline class="ch-line" points="${points.map(function (p, i) { return px(i) + "," + py(p.v); }).join(" ")}"/>`;
  }
  points.forEach(function (p, i) {
    svg += `<circle class="ch-dot" cx="${px(i)}" cy="${py(p.v)}" r="3.5"/>`;
  });

  svg += `<text class="ch-txt" x="${px(0)}" y="${H - 8}" text-anchor="${points.length > 1 ? "start" : "middle"}">${dateLabel(points[0].date)}</text>`;
  if (points.length > 1) {
    svg += `<text class="ch-txt" x="${px(points.length - 1)}" y="${H - 8}" text-anchor="end">${dateLabel(points[points.length - 1].date)}</text>`;
  }
  return svg + `</svg>`;
}

// The entry form (drawn once, so what you type isn't wiped by other updates)
function renderBodyForm() {
  const today = dateKey(new Date());
  let html = `<div class="card-label">Log your body</div>
    <input type="date" class="select" id="bd-date" value="${today}" max="${today}">
    <div class="body-grid">` +
    BODY_FIELDS.map(function (f) {
      return `<div><label for="bd-${f[0]}">${f[1]}</label>
        <input class="set-input" id="bd-${f[0]}" inputmode="decimal" placeholder="${bodyUnit(f[0])}"></div>`;
    }).join("") +
    `</div>
    <div class="feed-meta">Fill in whatever you measured and leave the rest empty. Logging the same date again updates that day.</div>
    <button class="btn" data-b="save">Save entry</button>
    <div class="feed-meta" id="bd-msg" style="margin-top:.5rem"></div>`;
  $("body-form").innerHTML = html;
}

function renderBodyChart() {
  const el = $("body-chart");
  const available = BODY_FIELDS.filter(function (f) {
    return bodyLog.some(function (e) { return e[f[0]] > 0; });
  });
  if (!available.length) {
    el.innerHTML = `<p class="feed-meta">Log your weight or a measurement and your trend will appear here.</p>`;
    return;
  }
  if (!available.some(function (f) { return f[0] === bodyMetric; })) bodyMetric = available[0][0];

  const pts = bodyLog.filter(function (e) { return e[bodyMetric] > 0; })
    .map(function (e) { return { date: e.date, v: bodyToDisp(bodyMetric, e[bodyMetric]) }; });
  const latest = pts[pts.length - 1];

  // Change over the 30 days up to your latest entry
  const ref = pts.find(function (p) { return daysBetween(p.date, latest.date) <= 30; });
  const change = (ref && ref !== latest) ? latest.v - ref.v : null;
  const changeText = change === null ? "-" : (change > 0 ? "+" : "") + round1(change);
  const u = bodyUnit(bodyMetric);

  const chips = available.map(function (f) {
    return `<button class="chip${f[0] === bodyMetric ? " on" : ""}" data-bm="${f[0]}">${f[1]}</button>`;
  }).join("");

  const recent = bodyLog.slice(-8).reverse().map(function (e) {
    const parts = BODY_FIELDS.filter(function (f) { return e[f[0]] > 0; }).map(function (f) {
      return (f[0] === "weight" ? "" : f[1].toLowerCase() + " ") + round1(bodyToDisp(f[0], e[f[0]])) + " " + bodyUnit(f[0]);
    });
    const date = new Date(e.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    return `<div class="pr-row">
      <div><div class="pr-name">${date}</div><div class="pr-sub">${esc(parts.join(" · "))}</div></div>
      <button class="tool" data-b="del" data-date="${esc(e.date)}">Delete</button>
    </div>`;
  }).join("");

  el.innerHTML = `<div class="chips" style="margin-bottom:.9rem">${chips}</div>
    <div class="stats">
      <div class="stat"><div class="stat-num">${round1(latest.v)}</div><div class="stat-lbl">Latest (${u})</div></div>
      <div class="stat"><div class="stat-num">${changeText}</div><div class="stat-lbl">30-day change</div></div>
      <div class="stat"><div class="stat-num">${pts.length}</div><div class="stat-lbl">Entries</div></div>
    </div>
    <div style="margin-top:.9rem">${lineChartSvg(pts)}</div>
    <div class="feed-meta" style="margin:.4rem 0 .8rem">${esc(BODY_FIELDS.find(function (f) { return f[0] === bodyMetric; })[1])} (${u})${pts.length < 2 ? ". Log another entry to see a trend." : ""}</div>
    ${bodyMetric === "weight" && weightTrendText() ? `<div class="trend-line">${esc(weightTrendText())}</div>` : ""}
    <h2>Recent entries</h2>${recent}`;
}

$("body-form").addEventListener("click", function (e) {
  const b = e.target.closest("[data-b]");
  if (!b || b.dataset.b !== "save") return;

  const values = { date: $("bd-date").value };
  BODY_FIELDS.forEach(function (f) { values[f[0]] = $("bd-" + f[0]).value; });

  const result = saveBodyEntry(values);
  if (!result.ok) { $("bd-msg").textContent = result.error; return; }

  renderBodyForm();
  renderBodyChart();
  $("bd-msg").textContent = "Saved.";
});

$("body-chart").addEventListener("click", function (e) {
  const chip = e.target.closest("[data-bm]");
  if (chip) { bodyMetric = chip.dataset.bm; renderBodyChart(); return; }

  const del = e.target.closest("[data-b]");
  if (del && del.dataset.b === "del") {
    if (!confirm("Delete this entry?")) return;
    deleteBodyEntry(del.dataset.date);
    renderBodyChart();
  }
});


// =====================================================================
// WEEKLY MUSCLE SUMMARY
// Counts the sets you logged per main muscle, Monday to Sunday.
// =====================================================================
let muscleWeek = 0;   // 0 = this week, 1 = last week

// days (optional): only the first so-many days of that week, e.g. 3 = Monday to Wednesday
function weekBounds(offset, days) {
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7) - 7 * offset);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + (days >= 1 && days <= 7 ? days - 1 : 6));
  return { start: dateKey(mon), end: dateKey(sun) };
}

function muscleCounts(offset) {
  const b = weekBounds(offset);
  const counts = {};
  MUSCLES.forEach(function (m) { counts[m[0]] = 0; });
  let other = 0;
  let workouts = 0;

  getHistory().forEach(function (w) {
    if (w.date < b.start || w.date > b.end) return;
    workouts++;
    w.exercises.forEach(function (ex) {
      const lib = library.find(function (l) { return l.name === ex.name; });
      if (lib && (lib.muscle in counts)) counts[lib.muscle] += ex.sets.length;
      else other += ex.sets.length;   // cardio and exercises that aren't in the library
    });
  });
  return { counts: counts, other: other, workouts: workouts };
}

function renderMuscles() {
  const el = $("muscle-card");
  const r = muscleCounts(muscleWeek);

  let html = `<div class="chips" style="margin-bottom:.9rem">` +
    [[0, "This week"], [1, "Last week"]].map(function (c) {
      return `<button class="chip${muscleWeek === c[0] ? " on" : ""}" data-w="${c[0]}">${c[1]}</button>`;
    }).join("") + `</div>`;

  if (!r.workouts) {
    el.innerHTML = html + `<p class="feed-meta">No workouts logged ${muscleWeek === 0 ? "this week yet" : "that week"}.</p>`;
    return;
  }

  MUSCLES.forEach(function (m) {
    const n = r.counts[m[0]];
    html += `<div class="mrow">
      <div>${esc(m[1])}</div>
      <div class="mbar"><div class="mfill" style="width:${Math.min(100, Math.round(n / 10 * 100))}%"></div></div>
      <div class="mnum">${n} ${n === 1 ? "set" : "sets"}</div>
    </div>`;
  });

  const none = MUSCLES.filter(function (m) { return r.counts[m[0]] === 0; })
    .map(function (m) { return m[1].toLowerCase(); });

  html += `<div class="feed-meta" style="margin-top:.7rem">Sets are counted by main muscle, and around 10 a week is a common target.` +
    (r.other ? " " + r.other + " other sets (cardio and similar) aren’t counted." : "") + `</div>`;
  if (none.length) {
    html += `<div class="feed-meta" style="margin-top:.4rem">${muscleWeek === 0 ? "Not trained yet" : "Not trained"}: ${esc(none.join(", "))}.</div>`;
  }
  el.innerHTML = html;
}

$("muscle-card").addEventListener("click", function (e) {
  const b = e.target.closest("[data-w]");
  if (!b) return;
  muscleWeek = Number(b.dataset.w);
  renderMuscles();
});


// =====================================================================
// PER-EXERCISE HISTORY
// Every time you've logged one exercise, newest first.
// =====================================================================
function openExerciseHistory(name) {
  const sessions = [];
  getHistory().forEach(function (w) {
    w.exercises.forEach(function (ex) {
      if (ex.name === name) sessions.push({ date: w.date, ex: ex });
    });
  });
  sessions.reverse();

  let bestE = 0;
  let bestDate = null;
  sessions.forEach(function (s) {
    s.ex.sets.forEach(function (set) {
      const e = e1rm(parseFloat(set.weight) || 0, parseInt(set.reps) || 0);
      if (e > bestE) { bestE = e; bestDate = s.date; }
    });
  });

  let html = `<div class="card-label">Exercise history</div>
    <div class="big">${esc(name)}</div>
    <div class="feed-meta">${sessions.length} session${sessions.length === 1 ? "" : "s"}` +
    (bestE ? " · best est. 1RM " + fmtW(bestE) + " " + unit() : "") + `</div>`;

  if (!sessions.length) {
    html += `<p class="feed-meta" style="margin-top:.8rem">You haven’t logged this one yet.</p>`;
  } else {
    html += `<div class="feed-meta" style="margin-top:.4rem">Weights in ${unit()}.</div>`;
  }

  sessions.slice(0, 40).forEach(function (s) {
    const date = new Date(s.date + "T00:00:00").toLocaleDateString("en-GB", {
      weekday: "short", day: "numeric", month: "short", year: "numeric"
    });
    const sets = s.ex.sets.map(function (set) {
      if (isCardio(name)) return cardioText(set);
      const kg = parseFloat(set.weight) || 0;
      const reps = parseInt(set.reps) || 0;
      const rpe = set.rpe ? " @" + set.rpe : "";
      return kg > 0 ? fmtW(kg) + "×" + reps + rpe : reps + " reps" + rpe;
    }).join(", ");

    const tags = [];
    if (bestE && s.date === bestDate) tags.push("🏆 best");
    if (s.ex.rating) tags.push(s.ex.rating === "easy" ? "Easy" : "Hard");

    html += `<div class="hist-row">
      <div class="hist-top"><span>${date}</span><span class="feed-meta">${tags.join(" · ")}</span></div>
      <div class="hist-sets">${esc(sets)}</div>` +
      (s.ex.note ? `<div class="feed-note">${esc(s.ex.note)}</div>` : "") + `</div>`;
  });

  html += `<button class="btn" data-a="hist-close">Close</button>`;
  openSheet(html);
}

$("hist-btn").addEventListener("click", function () {
  if (chartExercise) openExerciseHistory(chartExercise);
});


// =====================================================================
// PROGRESS PHOTOS
// Photos are too big for localStorage, so they live in IndexedDB (a bigger
// store inside the browser). Each photo is shrunk first, so a photo takes
// about 150 to 300 KB instead of several MB.
// =====================================================================
const PHOTO_TAGS = [["front", "Front"], ["side", "Side"], ["back", "Back"], ["other", "Other"]];

// Everything that touches IndexedDB is in here, so the rest of the code never has to.
const photoStore = {
  db: null,
  open: function () {
    const self = this;
    return new Promise(function (resolve, reject) {
      if (self.db) { resolve(self.db); return; }
      if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB not available")); return; }
      const req = indexedDB.open("gymapp-photos", 1);
      req.onupgradeneeded = function () { req.result.createObjectStore("photos", { keyPath: "id" }); };
      req.onsuccess = function () { self.db = req.result; resolve(self.db); };
      req.onerror = function () { reject(req.error); };
    });
  },
  run: function (mode, action) {
    return this.open().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction("photos", mode);
        const req = action(tx.objectStore("photos"));
        tx.oncomplete = function () { resolve(req ? req.result : undefined); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
    });
  },
  all: function () { return this.run("readonly", function (s) { return s.getAll(); }); },
  put: function (rec) { return this.run("readwrite", function (s) { return s.put(rec); }); },
  remove: function (id) { return this.run("readwrite", function (s) { return s["delete"](id); }); }
};

let photos = [];            // every photo record: { id, date, tag, note, added, w, h, blob, thumb }
let photosReady = false;
let photosFailed = false;
const photoUrls = {};       // id + ":thumb" or ":full" -> a temporary link the <img> can show

function cleanPhotoView(v) {
  const d = { cols: 3, shape: "portrait", sort: "new", group: "none", tag: "all", labels: true, gap: "normal" };
  const ok = {
    cols: [1, 2, 3, 4, 5], shape: ["square", "portrait", "original"], sort: ["new", "old"],
    group: ["none", "month", "tag"], gap: ["tight", "normal", "roomy"],
    tag: ["all"].concat(PHOTO_TAGS.map(function (t) { return t[0]; }))
  };
  const out = {};
  v = (v && typeof v === "object") ? v : {};
  Object.keys(d).forEach(function (k) {
    if (k === "labels") out[k] = typeof v[k] === "boolean" ? v[k] : d[k];
    else out[k] = ok[k].indexOf(v[k]) >= 0 ? v[k] : d[k];
  });
  return out;
}

let photoView = cleanPhotoView(load("photoView", null));
let photoPanel = false;       // is the layout panel open?
let compareMode = false;
let compareSel = [];          // ids picked for comparing (max 2)
let newPhotoTag = "front";
let viewerTag = "front";

function urlFor(p, kind) {
  const k = p.id + ":" + kind;
  if (!photoUrls[k]) photoUrls[k] = URL.createObjectURL(kind === "thumb" ? p.thumb : p.blob);
  return photoUrls[k];
}
function forgetUrls(id) {
  [":thumb", ":full"].forEach(function (s) {
    if (photoUrls[id + s]) { URL.revokeObjectURL(photoUrls[id + s]); delete photoUrls[id + s]; }
  });
}
function revokeFullUrls() {
  Object.keys(photoUrls).forEach(function (k) {
    if (/:full$/.test(k)) { URL.revokeObjectURL(photoUrls[k]); delete photoUrls[k]; }
  });
}

function shortDate(key, withYear) {
  return new Date(key + "T00:00:00").toLocaleDateString("en-GB",
    withYear ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" });
}
function tagLabel(key) {
  const t = PHOTO_TAGS.find(function (t) { return t[0] === key; });
  return t ? t[1] : "Other";
}

// Your logged body weight closest to a date (within a week), or null
function weightNear(date) {
  let best = null, bestGap = 8;
  bodyLog.forEach(function (e) {
    if (!(e.weight > 0)) return;
    const gap = Math.abs(daysBetween(e.date, date));
    if (gap < bestGap) { best = e; bestGap = gap; }
  });
  return best;
}

// Filter, sort and group the photos the way the layout options say.
// Returns [{ title, items }]. Kept separate from drawing so it's easy to test.
function photoGroups(list, view) {
  const dir = view.sort === "new" ? -1 : 1;
  const items = list.filter(function (p) { return view.tag === "all" || p.tag === view.tag; });
  items.sort(function (a, b) {
    const c = a.date < b.date ? -1 : (a.date > b.date ? 1 : (a.added || 0) - (b.added || 0));
    return c * dir;
  });

  if (view.group === "month") {
    const groups = [];
    items.forEach(function (p) {
      const key = p.date.slice(0, 7);
      let g = groups.length ? groups[groups.length - 1] : null;
      if (!g || g.key !== key) {
        g = { key: key, title: new Date(key + "-01T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" }), items: [] };
        groups.push(g);
      }
      g.items.push(p);
    });
    return groups;
  }
  if (view.group === "tag") {
    return PHOTO_TAGS.map(function (t) {
      return { key: t[0], title: t[1], items: items.filter(function (p) { return p.tag === t[0]; }) };
    }).filter(function (g) { return g.items.length; });
  }
  return [{ key: "all", title: "", items: items }];
}

// ----- turning a picked file into a small stored photo -----
function loadViaImg(file) {
  return new Promise(function (resolve, reject) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Couldn’t read that image.")); };
    img.src = url;
  });
}
function loadBitmap(file) {
  if (typeof createImageBitmap === "function") {
    // "from-image" makes sure phone photos aren't turned sideways
    return createImageBitmap(file, { imageOrientation: "from-image" }).catch(function () { return loadViaImg(file); });
  }
  return loadViaImg(file);
}
function shrink(src, maxSide, quality) {
  const w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight;
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w0 * scale));
  c.height = Math.max(1, Math.round(h0 * scale));
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  return new Promise(function (resolve) {
    c.toBlob(function (blob) { resolve({ blob: blob, w: c.width, h: c.height }); }, "image/jpeg", quality);
  });
}
function makePhotoRecord(file, date, tag) {
  return loadBitmap(file).then(function (bmp) {
    return shrink(bmp, 1280, 0.82).then(function (full) {
      return shrink(bmp, 480, 0.75).then(function (thumb) {
        if (bmp.close) bmp.close();
        if (!full.blob || !thumb.blob) throw new Error("Couldn’t process that image.");
        return {
          id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7),
          date: date, tag: tag, note: "", added: Date.now(),
          w: full.w, h: full.h, blob: full.blob, thumb: thumb.blob
        };
      });
    });
  });
}

function addPhotos(files, date, tag) {
  const msg = $("ph-msg");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) { msg.textContent = "Pick a date first."; return Promise.resolve(); }
  if (date > dateKey(new Date())) { msg.textContent = "That date is in the future."; return Promise.resolve(); }

  // Ask the browser not to throw the photos away when space is tight
  if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) {} }

  let added = 0, failed = 0, i = 0;
  function next() {
    if (i >= files.length) {
      msg.textContent = added ? "Added " + added + (added === 1 ? " photo." : " photos.") + (failed ? " " + failed + " couldn’t be added." : "")
                              : "Couldn’t add those photos.";
      renderPhotos();
      return Promise.resolve();
    }
    msg.textContent = "Adding " + (i + 1) + " of " + files.length + "…";
    const file = files[i++];
    return makePhotoRecord(file, date, tag)
      .then(function (rec) { return photoStore.put(rec).then(function () { photos.push(rec); added++; }); })
      .catch(function () { failed++; })
      .then(next);
  }
  return next();
}

function loadPhotos() {
  return photoStore.all().then(function (list) {
    photos = list || [];
    photosReady = true;
    renderPhotos();
  }).catch(function () {
    photosFailed = true;
    renderPhotos();
  });
}

// ----- the add form (drawn separately so your typing isn't wiped) -----
function renderPhotoForm() {
  const old = $("ph-new-date");
  const date = old && old.value ? old.value : dateKey(new Date());
  $("photo-add").innerHTML = `<div class="card-label">Add progress photos</div>
    <input type="date" class="select" id="ph-new-date" value="${esc(date)}" max="${dateKey(new Date())}">
    <div class="chips" style="margin:.7rem 0">` +
    PHOTO_TAGS.map(function (t) {
      return `<button class="chip${newPhotoTag === t[0] ? " on" : ""}" data-pt="${t[0]}">${t[1]}</button>`;
    }).join("") + `</div>
    <input type="file" id="ph-file" accept="image/*" multiple hidden>
    <button class="btn" data-ph="add">Choose photos</button>
    <div class="feed-meta" id="ph-msg" style="margin-top:.5rem"></div>
    <div class="feed-meta" style="margin-top:.4rem">Photos stay on this phone only. They aren’t part of the backup file.</div>`;
}

$("photo-add").addEventListener("click", function (e) {
  const t = e.target.closest("[data-pt]");
  if (t) { newPhotoTag = t.dataset.pt; renderPhotoForm(); return; }
  const b = e.target.closest("[data-ph]");
  if (b && b.dataset.ph === "add") $("ph-file").click();
});
$("photo-add").addEventListener("change", function (e) {
  if (!e.target || e.target.id !== "ph-file") return;
  const files = Array.prototype.slice.call(e.target.files || []);
  const date = $("ph-new-date").value;
  e.target.value = "";
  if (files.length) addPhotos(files, date, newPhotoTag);
});

// ----- the grid -----
function chipRow(label, key, options) {
  return `<div class="prow"><div class="prow-label">${label}</div>` +
    options.map(function (o) {
      const on = String(photoView[key]) === o[0];
      return `<button class="chip${on ? " on" : ""}" data-pv="${key}" data-v="${o[0]}">${o[1]}</button>`;
    }).join("") + `</div>`;
}

function renderPhotos() {
  const el = $("photo-grid");
  if (photosFailed) {
    el.innerHTML = `<p class="feed-meta">Photos can’t be stored in this browser right now (private browsing can cause this).</p>`;
    return;
  }
  if (!photosReady) { el.innerHTML = `<p class="feed-meta">Loading photos…</p>`; return; }
  if (!photos.length) {
    el.innerHTML = `<p class="feed-meta">No photos yet. Add your first ones above, and use the layout controls here to arrange them however you like.</p>`;
    return;
  }

  compareSel = compareSel.filter(function (id) { return photos.some(function (p) { return p.id === id; }); });
  const v = photoView;

  let html = `<div class="prow"><div class="prow-label">Columns</div>` +
    [1, 2, 3, 4, 5].map(function (n) {
      return `<button class="chip${v.cols === n ? " on" : ""}" data-pv="cols" data-v="${n}">${n}</button>`;
    }).join("") + `</div>
    <div class="btn-row" style="margin:.2rem 0 .6rem">
      <button class="btn ghost" data-ph="layout">${photoPanel ? "Hide layout options" : "Layout options"}</button>
      <button class="btn ${compareMode ? "" : "ghost"}" data-ph="compare">${compareMode ? "Cancel compare" : "Compare"}</button>
    </div>`;

  if (photoPanel) {
    html += `<div class="ppanel">` +
      chipRow("Shape", "shape", [["square", "Square"], ["portrait", "Portrait"], ["original", "Original"]]) +
      chipRow("Order", "sort", [["new", "Newest first"], ["old", "Oldest first"]]) +
      chipRow("Group", "group", [["none", "None"], ["month", "Month"], ["tag", "Angle"]]) +
      chipRow("Show", "tag", [["all", "All"]].concat(PHOTO_TAGS)) +
      chipRow("Spacing", "gap", [["tight", "Tight"], ["normal", "Normal"], ["roomy", "Roomy"]]) +
      chipRow("Labels", "labels", [["true", "On"], ["false", "Off"]]) +
      `</div>`;
  }

  if (compareMode) {
    html += `<div class="feed-meta" style="margin-bottom:.6rem">${compareSel.length < 2
      ? "Tap two photos to compare (" + compareSel.length + " of 2 picked)."
      : `<button class="btn" data-ph="cmp-go">Compare these two</button>`}</div>`;
  }

  const gapPx = { tight: 3, normal: 8, roomy: 14 }[v.gap];
  const groups = photoGroups(photos, v);
  const count = groups.reduce(function (n, g) { return n + g.items.length; }, 0);

  if (!count) {
    html += `<p class="feed-meta">No photos match this filter.</p>`;
  }

  groups.forEach(function (g) {
    if (g.title) html += `<div class="pgroup-title">${esc(g.title)} · ${g.items.length}</div>`;
    html += `<div class="pgrid" style="--cols:${v.cols};--gap:${gapPx}px">`;
    g.items.forEach(function (p) {
      const ratio = v.shape === "square" ? "1 / 1" : (v.shape === "portrait" ? "3 / 4" : (p.w || 3) + " / " + (p.h || 4));
      const selected = compareSel.indexOf(p.id) >= 0;
      const label = shortDate(p.date, false) + (v.cols <= 3 ? " · " + tagLabel(p.tag) : "");
      html += `<button class="pitem${selected ? " sel" : ""}" data-ph="open" data-id="${esc(p.id)}" style="aspect-ratio:${ratio}">
        <img src="${urlFor(p, "thumb")}" alt="Progress photo, ${esc(shortDate(p.date, true))}" loading="lazy">` +
        (v.labels ? `<span class="plabel">${esc(label)}</span>` : "") +
        (selected ? `<span class="pcheck">${compareSel.indexOf(p.id) + 1}</span>` : "") +
        `</button>`;
    });
    html += `</div>`;
  });

  el.innerHTML = html;
}

$("photo-grid").addEventListener("click", function (e) {
  const pv = e.target.closest("[data-pv]");
  if (pv) {
    const key = pv.dataset.pv;
    const raw = pv.dataset.v;
    const next = {};
    Object.keys(photoView).forEach(function (k) { next[k] = photoView[k]; });
    next[key] = key === "cols" ? Number(raw) : (key === "labels" ? raw === "true" : raw);
    photoView = cleanPhotoView(next);
    save("photoView", photoView);
    renderPhotos();
    return;
  }

  const b = e.target.closest("[data-ph]");
  if (!b) return;
  const act = b.dataset.ph;

  if (act === "layout") { photoPanel = !photoPanel; renderPhotos(); return; }
  if (act === "compare") { compareMode = !compareMode; compareSel = []; renderPhotos(); return; }
  if (act === "cmp-go") { openCompare(); return; }
  if (act === "open") {
    const id = b.dataset.id;
    if (compareMode) {
      const at = compareSel.indexOf(id);
      if (at >= 0) compareSel.splice(at, 1);
      else if (compareSel.length < 2) compareSel.push(id);
      else compareSel = [compareSel[1], id];
      renderPhotos();
    } else {
      openPhotoViewer(id);
    }
  }
});

// ----- one photo, big -----
function openPhotoViewer(id) {
  const p = photos.find(function (x) { return x.id === id; });
  if (!p) return;
  revokeFullUrls();
  viewerTag = p.tag;
  const w = weightNear(p.date);

  openSheet(`<div class="pview">
    <div class="card-label">Progress photo</div>
    <img src="${urlFor(p, "full")}" alt="Progress photo, ${esc(shortDate(p.date, true))}">
    <div class="feed-meta" style="margin:.5rem 0">${w ? "Body weight around then: " + round1(toDisp(w.weight)) + " " + unit() + " (" + esc(shortDate(w.date, false)) + ")" : "No body weight logged within a week of this photo."}</div>
    <input type="date" class="select" id="ph-date" value="${esc(p.date)}" max="${dateKey(new Date())}">
    <div class="chips" style="margin:.7rem 0">` +
    PHOTO_TAGS.map(function (t) {
      return `<button class="chip${viewerTag === t[0] ? " on" : ""}" data-ph="vtag" data-t="${t[0]}">${t[1]}</button>`;
    }).join("") + `</div>
    <input class="set-input note" id="ph-note" placeholder="Note (optional)" value="${esc(p.note || "")}">
    <div class="btn-row" style="margin-top:.8rem">
      <button class="btn" data-ph="vsave" data-id="${esc(p.id)}">Save</button>
      <button class="btn ghost" data-ph="vclose">Close</button>
    </div>
    <div class="btn-row" style="margin-top:.5rem">
      <a class="btn ghost" href="${urlFor(p, "full")}" download="progress-${esc(p.date)}.jpg">Save to device</a>
      <button class="btn ghost" data-ph="vdel" data-id="${esc(p.id)}">Delete</button>
    </div>
    <div class="feed-meta" id="ph-vmsg" style="margin-top:.5rem"></div>
  </div>`);
}

function openCompare() {
  const two = compareSel.map(function (id) { return photos.find(function (p) { return p.id === id; }); })
    .filter(Boolean)
    .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : (a.added || 0) - (b.added || 0)); });
  if (two.length < 2) return;
  revokeFullUrls();

  function side(p, title) {
    const w = weightNear(p.date);
    return `<div><img src="${urlFor(p, "full")}" alt="${title} photo">
      <div class="big" style="font-size:.95rem;margin-top:.4rem">${title}</div>
      <div class="feed-meta">${esc(shortDate(p.date, true))} · ${esc(tagLabel(p.tag))}</div>
      <div class="feed-meta">${w ? round1(toDisp(w.weight)) + " " + unit() : "no weight logged"}</div></div>`;
  }

  const days = daysBetween(two[0].date, two[1].date);
  const w0 = weightNear(two[0].date), w1 = weightNear(two[1].date);
  let summary = days + (days === 1 ? " day" : " days") + " apart";
  if (w0 && w1) {
    const d = toDisp(w1.weight) - toDisp(w0.weight);
    summary += " · " + (d > 0 ? "+" : "") + round1(d) + " " + unit();
  }

  openSheet(`<div class="pview">
    <div class="card-label">Compare</div>
    <div class="cmp">${side(two[0], "Before")}${side(two[1], "After")}</div>
    <div class="feed-meta" style="margin:.7rem 0">${esc(summary)}</div>
    <button class="btn" data-ph="vclose">Close</button>
  </div>`);
}

$("sheet").addEventListener("click", function (e) {
  const b = e.target.closest("[data-ph]");
  if (!b) return;
  const act = b.dataset.ph;

  if (act === "vclose") { closeSheet(); revokeFullUrls(); return; }

  if (act === "vtag") {
    viewerTag = b.dataset.t;
    document.querySelectorAll("#sheet [data-ph='vtag']").forEach(function (c) {
      c.classList.toggle("on", c.dataset.t === viewerTag);
    });
    return;
  }

  const p = photos.find(function (x) { return x.id === b.dataset.id; });
  if (!p) return;

  if (act === "vsave") {
    const date = $("ph-date").value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > dateKey(new Date())) {
      $("ph-vmsg").textContent = "Pick a valid date (not in the future).";
      return;
    }
    p.date = date;
    p.tag = viewerTag;
    p.note = $("ph-note").value.trim().slice(0, 200);
    photoStore.put(p).then(function () {
      closeSheet(); revokeFullUrls(); renderPhotos();
    }).catch(function () { $("ph-vmsg").textContent = "Couldn’t save the change."; });
    return;
  }

  if (act === "vdel") {
    if (!confirm("Delete this photo? This can’t be undone.")) return;
    photoStore.remove(p.id).then(function () {
      forgetUrls(p.id);
      photos = photos.filter(function (x) { return x.id !== p.id; });
      closeSheet(); revokeFullUrls(); renderPhotos();
    }).catch(function () { $("ph-vmsg").textContent = "Couldn’t delete it."; });
  }
});

loadPhotos();


// =====================================================================
// PIN LOCK
// A 4-digit PIN that covers the app when you open it, and again if you leave it
// for a while. Only a scrambled version of the PIN (a "hash") is stored, never
// the PIN itself.
// Be realistic about it: this keeps people who pick up your phone out. It does
// not encrypt your data, and someone with technical skill and time could get around it.
// =====================================================================
const PIN_KEY = "pin";
const PIN_STATE_KEY = "pinState";
if (settings.autolock === undefined) settings.autolock = 5;   // minutes away before it locks again

let pinRecord = load(PIN_KEY, null);   // { salt, algo, hash }
if (!(pinRecord && typeof pinRecord.salt === "string" && typeof pinRecord.hash === "string")) {
  pinRecord = null;
  document.documentElement.removeAttribute("data-locked");   // a damaged PIN must never lock you out for good
}
function pinIsSet() { return pinRecord !== null; }

function hasSubtle() {
  return typeof crypto !== "undefined" && crypto.subtle && typeof crypto.subtle.digest === "function";
}
// Backup scrambler for the rare case the browser has no crypto (plain http on a network address)
function cyrb53(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
function randomSalt() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}
function hashPin(pin, salt, algo) {
  const text = salt + ":" + pin;
  if (algo === "sha256" && hasSubtle()) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
    });
  }
  return Promise.resolve(cyrb53(text));
}
function checkPin(pin) {
  return hashPin(pin, pinRecord.salt, pinRecord.algo).then(function (h) { return h === pinRecord.hash; });
}

// Too many wrong tries? You have to wait, and the wait doubles each time.
function pinState() {
  const s = load(PIN_STATE_KEY, { fails: 0, until: 0 });
  return { fails: Number(s.fails) || 0, until: Number(s.until) || 0 };
}
function lockWaitMs() { return Math.max(0, pinState().until - Date.now()); }
function registerFail() {
  const s = pinState();
  s.fails++;
  if (s.fails >= 5) s.until = Date.now() + Math.min(3600, 30 * Math.pow(2, s.fails - 5)) * 1000;
  save(PIN_STATE_KEY, s);
  return s;
}
function clearFails() { save(PIN_STATE_KEY, { fails: 0, until: 0 }); }

// ----- the number pad -----
let pinResolve = null;     // waiting for 4 digits; called with the PIN (or null if cancelled)
let pinEntered = "";
let pinDisabledUntil = 0;
let pinTimer = null;

function renderPinDots() {
  const dots = $("lock-dots").children;
  for (let i = 0; i < dots.length; i++) dots[i].classList.toggle("on", i < pinEntered.length);
}

// Shows the pad and waits for 4 digits.
// o: { title, sub, error, cancellable, unlock, lockedFor }
function askPin(o) {
  return new Promise(function (resolve) {
    pinResolve = resolve;
    pinEntered = "";
    clearInterval(pinTimer);

    const lock = $("lock");
    lock.classList.add("show");
    lock.classList.toggle("cancellable", !!o.cancellable);
    lock.classList.toggle("unlock", !!o.unlock);
    $("lock-title").textContent = o.title;
    $("lock-sub").textContent = o.sub || "";
    $("lock-sub").classList.toggle("err", !!o.error);
    renderPinDots();

    if (o.error) {
      $("lock-dots").classList.remove("shake");
      void $("lock-dots").offsetWidth;   // lets the shake play again
      $("lock-dots").classList.add("shake");
    }

    if (o.lockedFor > 0) {
      pinDisabledUntil = Date.now() + o.lockedFor;
      const tick = function () {
        const left = Math.ceil((pinDisabledUntil - Date.now()) / 1000);
        if (left > 0) {
          $("lock-sub").classList.add("err");
          $("lock-sub").textContent = "Too many tries. Wait " + (left >= 60 ? Math.ceil(left / 60) + " min" : left + "s") + ".";
        } else {
          clearInterval(pinTimer);
          $("lock-sub").classList.remove("err");
          $("lock-sub").textContent = "Try again";
        }
      };
      tick();
      pinTimer = setInterval(tick, 250);
    } else {
      pinDisabledUntil = 0;
    }
  });
}

function hidePin() {
  clearInterval(pinTimer);
  pinResolve = null;
  pinEntered = "";
  $("lock").classList.remove("show", "cancellable", "unlock");
  document.documentElement.removeAttribute("data-locked");
}

function pinPress(k) {
  if (!pinResolve || Date.now() < pinDisabledUntil) return;
  if (k === "back") pinEntered = pinEntered.slice(0, -1);
  else if (/^\d$/.test(k) && pinEntered.length < 4) pinEntered += k;
  renderPinDots();
  if (typeof navigator.vibrate === "function") { try { navigator.vibrate(8); } catch (e) {} }

  if (pinEntered.length === 4) {
    const done = pinResolve, value = pinEntered;
    pinResolve = null;
    setTimeout(function () { done(value); }, 120);   // a moment so you see the 4th dot fill
  }
}

$("lock-keys").addEventListener("click", function (e) {
  const b = e.target.closest("[data-k]");
  if (b) pinPress(b.dataset.k);
});
$("lock-cancel").addEventListener("click", function () {
  if (!$("lock").classList.contains("cancellable")) return;   // the unlock screen can never be cancelled
  if (pinResolve) { const done = pinResolve; pinResolve = null; done(null); }
});
document.addEventListener("keydown", function (e) {
  if (!$("lock").classList.contains("show")) return;
  if (/^\d$/.test(e.key)) pinPress(e.key);
  else if (e.key === "Backspace") pinPress("back");
  else if (e.key === "Escape") $("lock-cancel").click();
});

// ----- flows -----
// Ask until the right PIN is typed. Resolves true, or false if cancelled.
async function verifyPin(o) {
  let error = "";
  for (;;) {
    const pin = await askPin({
      title: o.title, sub: error || "Enter your 4-digit PIN", error: !!error,
      cancellable: !!o.cancellable, unlock: !!o.unlock, lockedFor: lockWaitMs()
    });
    if (pin === null) return false;
    if (lockWaitMs() > 0) continue;
    if (await checkPin(pin)) { clearFails(); return true; }

    const s = registerFail();
    error = s.fails >= 5 ? "Wrong PIN." : "Wrong PIN. " + (5 - s.fails) + (5 - s.fails === 1 ? " try" : " tries") + " left before a wait.";
  }
}

async function setNewPin() {
  let error = "";
  for (;;) {
    const a = await askPin({ title: "Choose a PIN", sub: error || "Pick 4 digits", error: !!error, cancellable: true });
    if (a === null) { hidePin(); return false; }
    const b = await askPin({ title: "Confirm PIN", sub: "Enter it once more", cancellable: true });
    if (b === null) { hidePin(); return false; }
    if (a !== b) { error = "Those didn’t match. Try again."; continue; }

    const salt = randomSalt();
    const algo = hasSubtle() ? "sha256" : "fallback";
    const hash = await hashPin(a, salt, algo);
    pinRecord = { salt: salt, algo: algo, hash: hash };
    save(PIN_KEY, pinRecord);
    clearFails();
    hidePin();
    return true;
  }
}

let appLocked = false;
async function lockApp() {
  if (!pinIsSet() || appLocked) return;
  appLocked = true;
  document.documentElement.setAttribute("data-locked", "1");
  // Only a correct PIN gets out of this loop
  while (!(await verifyPin({ title: "Enter PIN", unlock: true }))) { /* try again */ }
  hidePin();
  appLocked = false;
}

// Forgot it? The only way back in is to wipe the app on this phone, then restore a backup.
$("lock-forgot").addEventListener("click", function () {
  if (!confirm("Forgot your PIN?\n\nThe only way back in is to erase everything the app has saved on this phone (workouts, body log, photos). You can then restore a backup file.\n\nErase everything?")) return;
  if (!confirm("Last check: this can’t be undone. Erase all app data on this phone?")) return;
  let finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    try { localStorage.clear(); } catch (e) {}
    location.reload();
  }
  try {
    if (photoStore.db) photoStore.db.close();
    const req = indexedDB.deleteDatabase("gymapp-photos");
    req.onsuccess = req.onerror = req.onblocked = finish;
    setTimeout(finish, 1500);
  } catch (e) { finish(); }
});

// Lock again after you've been away for a while
let hiddenAt = 0;
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
  if (!hiddenAt || !pinIsSet()) { hiddenAt = 0; return; }
  const away = Date.now() - hiddenAt;
  hiddenAt = 0;
  if (away >= (Number(settings.autolock) || 0) * 60000) lockApp();
});

// ----- the Security card on the Gym tab -----
function renderPin() {
  const on = pinIsSet();
  let html = `<div class="card-label">PIN lock</div>
    <div class="big">${on ? "On" : "Off"}</div>
    <div class="feed-meta" style="margin-top:.3rem">${on
      ? "The app asks for your PIN when you open it."
      : "Add a 4-digit PIN so nobody can open your training and photos."}</div>`;

  if (on) {
    html += `<div class="card-label" style="margin-top:.9rem">Lock again after</div><div class="chips">` +
      [[0, "Straight away"], [1, "1 min"], [5, "5 min"], [15, "15 min"]].map(function (o) {
        return `<button class="chip${Number(settings.autolock) === o[0] ? " on" : ""}" data-al="${o[0]}">${o[1]}</button>`;
      }).join("") + `</div>
      <div class="btn-row">
        <button class="btn ghost" data-pin="change">Change PIN</button>
        <button class="btn ghost" data-pin="off">Turn off</button>
      </div>`;
  } else {
    html += `<button class="btn" data-pin="set">Set a PIN</button>`;
  }

  html += `<div class="feed-meta" style="margin-top:.8rem">This keeps people who pick up your phone out. It isn’t encryption. Your PIN isn’t saved in backup files, so a restored backup on another phone has no PIN.</div>`;
  $("pin-card").innerHTML = html;
}

$("pin-card").addEventListener("click", async function (e) {
  const al = e.target.closest("[data-al]");
  if (al) {
    settings.autolock = Number(al.dataset.al);
    save("settings", settings);
    renderPin();
    return;
  }
  const b = e.target.closest("[data-pin]");
  if (!b) return;
  const act = b.dataset.pin;

  if (act === "set") {
    await setNewPin();
  } else if (act === "change") {
    if (await verifyPin({ title: "Enter current PIN", cancellable: true })) await setNewPin();
    else hidePin();
  } else if (act === "off") {
    if (await verifyPin({ title: "Enter PIN to turn off", cancellable: true })) {
      pinRecord = null;
      try { localStorage.removeItem(PIN_KEY); } catch (err) {}
      clearFails();
    }
    hidePin();
  }
  renderPin();
});

if (pinIsSet()) lockApp();   // locked from the very first moment


// =====================================================================
// BACKUP AND RESTORE
// Your data lives in this browser only. A backup is a .json file you can keep safe.
// =====================================================================
const BACKUP_KEYS = ["settings", "restMap", "selectedEquipment", "goals", "workoutDates", "workoutHistory", "currentWorkout", "gear", "customExercises", "routines", "deload", "bodyLog", "exPrefs", "protein", "runs", "runPlan", "runPrefs"];

function buildBackup() {
  const data = {};
  BACKUP_KEYS.forEach(function (key) {
    const value = load(key, null);
    if (value !== null) data[key] = value;
  });
  return { app: "gymapp", version: 2, exportedAt: new Date().toISOString(), data: data };
}

// Checks a backup and, if it looks right, writes it into storage (replacing what's there)
function applyBackup(backup) {
  if (!backup || backup.app !== "gymapp" || !backup.data || typeof backup.data !== "object") {
    return { ok: false, error: "That doesn’t look like a BTB backup file." };
  }
  const d = backup.data;

  const arrayKeys = ["selectedEquipment", "workoutDates", "workoutHistory", "customExercises", "routines", "bodyLog", "runs"];
  const objectKeys = ["settings", "restMap", "goals", "currentWorkout", "gear", "deload"];
  for (let i = 0; i < arrayKeys.length; i++) {
    if (arrayKeys[i] in d && !Array.isArray(d[arrayKeys[i]])) {
      return { ok: false, error: "The backup is damaged (" + arrayKeys[i] + ")." };
    }
  }
  for (let i = 0; i < objectKeys.length; i++) {
    const v = d[objectKeys[i]];
    if (objectKeys[i] in d && (typeof v !== "object" || v === null || Array.isArray(v))) {
      return { ok: false, error: "The backup is damaged (" + objectKeys[i] + ")." };
    }
  }
  if (d.workoutHistory && !d.workoutHistory.every(function (w) {
    return w && typeof w.date === "string" && Array.isArray(w.exercises);
  })) {
    return { ok: false, error: "The backup is damaged (workout history)." };
  }

  if (d.gear && !(Array.isArray(d.gear.plates) && Array.isArray(d.gear.dumbbells) && typeof d.gear.bar === "number")) {
    return { ok: false, error: "The backup is damaged (weights)." };
  }
  if (d.runs && !d.runs.every(function (r) {
    return r && typeof r.id === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && typeof r.km === "number" && typeof r.secs === "number" && Array.isArray(r.route) && !!RUN_TYPES[r.type];
  })) {
    return { ok: false, error: "The backup is damaged (runs)." };
  }
  if (d.routines && !d.routines.every(function (r) {
    return r && typeof r.name === "string" && Array.isArray(r.exercises);
  })) {
    return { ok: false, error: "The backup is damaged (routines)." };
  }
  if (d.bodyLog && !d.bodyLog.every(function (e) {
    return e && typeof e.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date);
  })) {
    return { ok: false, error: "The backup is damaged (body log)." };
  }
  if (d.customExercises && !d.customExercises.every(function (c) {
    return c && typeof c.name === "string" && typeof c.muscle === "string" && Array.isArray(c.need);
  })) {
    return { ok: false, error: "The backup is damaged (your exercises)." };
  }

  BACKUP_KEYS.forEach(function (key) {
    if (key in d) save(key, d[key]);
    else { try { localStorage.removeItem(key); } catch (e) {} }
  });
  return { ok: true };
}

// ----- photos in the backup -----
// A photo is stored as a "blob" (raw image data). A backup file is text, so each one is turned into text and back.
function blobToText(blob) {
  return new Promise(function (resolve, reject) {
    const r = new FileReader();
    r.onload = function () { resolve(r.result); };
    r.onerror = function () { reject(r.error); };
    r.readAsDataURL(blob);
  });
}
function textToBlob(text) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(String(text || ""));
  if (!m || !m[2]) return null;
  const bin = atob(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] || "image/jpeg" });
}
function photosForBackup() {
  return photoStore.all().then(function (list) {
    return Promise.all((list || []).map(function (p) {
      return Promise.all([blobToText(p.blob), blobToText(p.thumb)]).then(function (t) {
        return { id: p.id, date: p.date, tag: p.tag, note: p.note || "", added: p.added, w: p.w, h: p.h, full: t[0], thumb: t[1] };
      });
    }));
  });
}
// Puts the photos from a backup into storage, replacing the ones on this phone
function restorePhotos(list) {
  const good = (list || []).filter(function (p) {
    return p && typeof p.id === "string" && /^\d{4}-\d{2}-\d{2}$/.test(String(p.date)) && typeof p.full === "string" && typeof p.thumb === "string";
  });
  return photoStore.all().then(function (old) {
    return Promise.all((old || []).map(function (p) { return photoStore.remove(p.id); }));
  }).then(function () {
    let chain = Promise.resolve(), n = 0;
    good.forEach(function (p) {
      const full = textToBlob(p.full), thumb = textToBlob(p.thumb);
      if (!full || !thumb) return;
      chain = chain.then(function () {
        return photoStore.put({ id: p.id, date: p.date, tag: p.tag || "other", note: p.note || "", added: p.added || Date.now(), w: p.w, h: p.h, blob: full, thumb: thumb })
          .then(function () { n++; });
      });
    });
    return chain.then(function () { return n; });
  });
}

// Hands a file to you. On the website that is a normal download (or the share
// menu, for pictures). In the installed app there is no "download", so the file
// is written to the app's own folder and the phone's share menu opens: from
// there you can save it to Files or Drive, or send it to another app.
function fileOut(name, blob, opts) {
  opts = opts || {};
  if (NATIVE) {
    return blobToText(blob).then(function (dataUrl) {
      return nativeCall("Filesystem", "writeFile", { path: name, data: String(dataUrl).split(",")[1], directory: "CACHE" });
    }).then(function (res) {
      return nativeCall("Share", "share", { title: opts.title || name, text: opts.text || "", files: [res.uri], dialogTitle: opts.title || name });
    }).then(function () { return "shared"; }, function (err) {
      if (err && /cancel/i.test(String(err.message || err))) return "cancelled";
      alert("Couldn’t share the file: " + (err && err.message ? err.message : "unknown problem"));
      return "failed";
    });
  }
  // Pictures on a phone browser: the share menu, if the browser has one
  try {
    if (opts.share && typeof File !== "undefined" && navigator.canShare) {
      const file = new File([blob], name, { type: blob.type });
      if (navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], title: opts.title || name, text: opts.text || "" })
          .then(function () { return "shared"; }, function () { return "cancelled"; });
      }
    }
  } catch (err) { /* fall through to a download */ }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  return Promise.resolve("downloaded");
}

function exportBackup() {
  const backup = buildBackup();
  const status = $("backup-status");
  status.textContent = "Preparing your backup…";
  // Photos are added if they can be read; if not, the rest is still saved
  return photosForBackup().catch(function () { return null; }).then(function (list) {
    if (list) backup.photos = list;
    const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
    return fileOut("btb-backup-" + dateKey(new Date()) + ".json", blob, { title: "BTB backup" }).then(function (how) {
      if (how === "failed" || how === "cancelled") { renderBackupStatus(); return; }
      save("lastBackup", Date.now());
      save("lastBackupPhotos", list ? list.length : -1);
      renderBackupStatus();
    });
  });
}

function backupPhotoNote() {
  const n = load("lastBackupPhotos", null);
  if (n === null) return "";
  if (n < 0) return " (photos could not be included)";
  return n === 0 ? "" : " with " + n + (n === 1 ? " photo" : " photos");
}

function BACKUP_DAYS() { return NATIVE ? 7 : 14; }
// When to nudge you to back up (installed app): 10 am on the first day a backup is due
function backupReminder(now) {
  now = now || new Date();
  if (getHistory().length + runs.length < 3) return null;
  const last = load("lastBackup", null);
  const due = new Date(Math.max(now.getTime(), last ? last + BACKUP_DAYS() * 86400000 : 0));
  const at = new Date(due);
  at.setHours(10, 0, 0, 0);
  if (at.getTime() <= now.getTime() + 60000) at.setDate(at.getDate() + 1);
  return { id: 2100, at: at, title: "Back up your BTB data",
           body: "Your training history lives only on this phone. Open BTB and tap Download backup on Home." };
}

function renderBackupStatus() {
  const last = load("lastBackup", null);
  const workouts = getHistory().length;

  $("backup-status").textContent = last
    ? "Last backup: " + new Date(last).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) + backupPhotoNote() + "."
    : "You haven’t backed up yet.";

  // A gentle nudge on Home once you have some history worth protecting
  // The installed app holds the only copy of your data, so it asks weekly; the website fortnightly
  const stale = !last || (Date.now() - last) > BACKUP_DAYS() * 86400000;
  $("backup-nudge").style.display = (workouts >= 3 && stale) ? "" : "none";
  $("backup-nudge-text").textContent = last
    ? "It’s been over " + (NATIVE ? "a week" : "two weeks") + " since your last backup."
    : "You have " + workouts + " workouts saved only " + (NATIVE ? "on this phone." : "in this browser.");
  queueReminders();
}

$("export-btn").addEventListener("click", exportBackup);
$("import-btn").addEventListener("click", function () { $("import-file").click(); });

$("import-file").addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function () {
    let backup;
    try { backup = JSON.parse(reader.result); }
    catch (err) { alert("That file couldn’t be read."); return; }

    const n = backup && backup.data && Array.isArray(backup.data.workoutHistory) ? backup.data.workoutHistory.length : 0;
    const hasPhotos = backup && Array.isArray(backup.photos);
    const pn = hasPhotos ? backup.photos.length : 0;
    if (!confirm("Restore this backup? It replaces everything currently in the app (the backup has " + n + " workouts" +
                 (hasPhotos ? " and " + pn + (pn === 1 ? " photo" : " photos") : "; it has no photos, so the photos on this phone are left alone") + ").")) return;

    const result = applyBackup(backup);
    if (!result.ok) { alert(result.error); return; }
    if (!hasPhotos) { location.reload(); return; }
    $("backup-status").textContent = "Restoring photos…";
    restorePhotos(backup.photos)
      .catch(function () { alert("Your workouts were restored, but the photos couldn’t be."); })
      .then(function () { location.reload(); });
  };
  reader.readAsText(file);
  e.target.value = "";   // lets you pick the same file again later
});


// =====================================================================
// WEEKLY TREND (Progress tab): the last 8 weeks as bars
// =====================================================================
let weeklyMetric = "sets";

function cardioMinutes(offset, days) {
  const b = periodBounds(offset, days);
  let m = 0;
  getHistory().forEach(function (w) {
    if (w.date < b.start || w.date > b.end) return;
    w.exercises.forEach(function (ex) {
      if (isCardio(ex.name)) ex.sets.forEach(function (s) { m += parseFloat(s.mins) || 0; });
    });
  });
  return Math.round((m + runMinutes(offset, days)) * 10) / 10;
}

function weeklySeries(metric, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const b = weekBounds(i);
    let v = 0;
    if (metric === "cardio") v = cardioMinutes(i);
    else getHistory().forEach(function (w) {
      if (w.date < b.start || w.date > b.end) return;
      if (metric === "workouts") { v += 1; return; }
      w.exercises.forEach(function (ex) {
        if (isCardio(ex.name)) return;
        ex.sets.forEach(function (s) {
          if (metric === "sets") v += 1;
          else v += (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0);
        });
      });
    });
    if (metric === "volume") v = Math.round(toDisp(v));
    out.push({ label: new Date(b.start + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }), v: v });
  }
  return out;
}

function barChartSvg(series) {
  const W = 320, H = 170, padL = 8, padR = 8, padT = 18, padB = 26;
  const max = Math.max(1, Math.max.apply(null, series.map(function (p) { return p.v; })));
  const slot = (W - padL - padR) / series.length;
  const bw = Math.min(26, slot * 0.62);
  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}"><line class="ch-grid" x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}"/>`;
  series.forEach(function (p, i) {
    const h = (H - padT - padB) * (p.v / max);
    const cx = padL + slot * i + slot / 2;
    const y = H - padB - h;
    svg += `<rect class="ch-bar" x="${cx - bw / 2}" y="${y}" width="${bw}" height="${Math.max(h, p.v ? 2 : 0)}" rx="3"/>`;
    if (p.v) svg += `<text class="ch-txt" x="${cx}" y="${y - 5}" text-anchor="middle">${p.v >= 10000 ? Math.round(p.v / 1000) + "k" : p.v}</text>`;
    if (i % 2 === series.length % 2 || i === series.length - 1) svg += `<text class="ch-txt" x="${cx}" y="${H - 8}" text-anchor="middle">${p.label}</text>`;
  });
  return svg + `</svg>`;
}

function renderWeekly() {
  const el = $("weekly-card");
  if (!el) return;
  const metrics = [["sets", "Sets"], ["volume", "Volume"], ["workouts", "Workouts"], ["cardio", "Cardio min"]];
  const series = weeklySeries(weeklyMetric, 8);
  const any = series.some(function (p) { return p.v > 0; });
  el.innerHTML = `<div class="chips" style="margin-bottom:.8rem">` + metrics.map(function (m) {
    return `<button class="chip${weeklyMetric === m[0] ? " on" : ""}" data-wm="${m[0]}">${m[1]}</button>`;
  }).join("") + `</div>` + (any ? barChartSvg(series) : `<p class="feed-meta">Nothing logged in the last 8 weeks yet.</p>`) +
    `<div class="feed-meta">Per week, last 8 weeks${weeklyMetric === "volume" ? " (" + unit() + " lifted)" : ""}.</div>`;
}

$("weekly-card").addEventListener("click", function (e) {
  const b = e.target.closest("[data-wm]");
  if (!b) return;
  weeklyMetric = b.dataset.wm;
  renderWeekly();
});


// =====================================================================
// LIBRARY TAB: browse every exercise, see your history, add one to today
// =====================================================================
let libQuery = "";
let libMuscle = "all";
let libMine = true;

function sessionsOf(name) {
  const out = [];
  getHistory().forEach(function (w) {
    w.exercises.forEach(function (ex) { if (ex.name === name) out.push({ date: w.date, ex: ex }); });
  });
  return out;
}

function renderLibrary() {
  const chips = [["all", "All"]].concat(MUSCLES.map(function (m) { return [m[0], m[1].split(" ")[0]]; })).concat([["cardio", "Cardio"]]);
  $("lib-chips").innerHTML = chips.map(function (c) {
    return `<button class="chip${libMuscle === c[0] ? " on" : ""}" data-lib="muscle" data-v="${c[0]}">${c[1]}</button>`;
  }).join("") +
    `<button class="chip${libMine ? " on" : ""}" data-lib="mine">My equipment only</button>`;
  renderLibraryList();
}

function renderLibraryList() {
  const q = libQuery.trim().toLowerCase();
  const items = library.filter(function (l) {
    return (libMuscle === "all" || l.muscle === libMuscle) && (!libMine || hasEquipment(l)) &&
           (!q || l.name.toLowerCase().indexOf(q) >= 0);
  }).sort(function (a, b) { return a.name.localeCompare(b.name); });

  $("lib-count").textContent = items.length + (items.length === 1 ? " exercise" : " exercises");
  const shown = items.slice(0, 120);
  $("lib-list").innerHTML = shown.map(function (l) {
    const n = sessionsOf(l.name).length;
    let tag = n ? n + (n === 1 ? " session" : " sessions") : "";
    if (isFav(l.name)) tag = "★ " + (tag || "Favourite");
    if (isBanned(l.name)) tag = "Never show";
    else if (isAvoided(l)) tag = "Avoided";
    else if (!hasEquipment(l)) tag = "Needs gear";
    return `<button class="lib-row" data-lib="open" data-name="${esc(l.name)}">
      <span><b>${esc(l.name)}</b><span class="feed-meta">${esc(muscleLabel(l.muscle))}${l.type === "compound" ? " · compound" : ""}</span></span>
      <span class="lib-tag">${esc(tag)}</span></button>`;
  }).join("") + (items.length > shown.length ? `<p class="feed-meta">Showing the first ${shown.length}. Search or filter to narrow it down.</p>` : "") +
    (!items.length ? `<p class="feed-meta">Nothing matches. Try “My equipment only” off, or another search.</p>` : "");
}

$("lib-q").addEventListener("input", function (e) { libQuery = e.target.value; renderLibraryList(); });

$("library").addEventListener("click", function (e) {
  const b = e.target.closest("[data-lib]");
  if (!b) return;
  const a = b.dataset.lib;
  if (a === "muscle") { libMuscle = b.dataset.v; renderLibrary(); }
  if (a === "mine") { libMine = !libMine; renderLibrary(); }
  if (a === "open") openLibraryDetail(b.dataset.name);
});

function openLibraryDetail(name) {
  const l = library.find(function (q) { return q.name === name; });
  if (!l) return;
  const sessions = sessionsOf(name);
  const cardio = l.muscle === "cardio";

  const needs = l.need.length ? l.need.map(function (req) {
    const opts = req.split("|");
    const have = opts.some(function (o) { return selected.includes(o); });
    return `<span class="need ${have ? "have" : "miss"}">${have ? "✓" : "✗"} ${esc(opts.join(" or "))}</span>`;
  }).join("") : `<span class="need have">✓ No equipment</span>`;

  let html = `<div class="card-label">${esc(muscleLabel(l.muscle))}${l.type === "compound" ? " · compound" : l.type === "iso" ? " · isolation" : ""}</div>
    <div class="big">${esc(name)}</div>
    <div class="needs">${needs}</div>`;
  if (isAvoided(l)) html += `<p class="feed-meta" style="margin-top:.6rem">This is on your avoid list, so the planner won’t pick it.</p>`;

  if (!sessions.length) {
    html += `<p class="feed-meta" style="margin-top:.8rem">You haven’t logged this one yet.</p>`;
  } else {
    const pts = sessions.map(function (s) {
      let v = 0;
      s.ex.sets.forEach(function (set) {
        v = cardio ? v + (parseFloat(set.mins) || 0) : Math.max(v, toDisp(e1rm(parseFloat(set.weight) || 0, parseInt(set.reps) || 0)));
      });
      return { date: s.date, v: Math.round(v * 10) / 10 };
    }).filter(function (p) { return p.v > 0; }).slice(-12);

    const last = sessions[sessions.length - 1];
    html += `<div class="feed-meta" style="margin-top:.6rem">${sessions.length} session${sessions.length === 1 ? "" : "s"} · last ${new Date(last.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}: ` +
      esc(last.ex.sets.map(function (s) {
        if (cardio) return cardioText(s);
        const kg = parseFloat(s.weight) || 0;
        return kg > 0 ? fmtW(kg) + "×" + (parseInt(s.reps) || 0) : (parseInt(s.reps) || 0) + " reps";
      }).join(", ")) + `</div>`;
    if (pts.length > 1) html += `<div class="feed-meta" style="margin-top:.8rem">${cardio ? "Minutes per session" : "Estimated 1RM (" + unit() + ")"}</div>` + lineChartSvg(pts);
  }

  html += `<div class="chips" style="margin-top:.9rem">
      <button class="chip${isFav(name) ? " on" : ""}" data-a="pref" data-kind="fav" data-name="${esc(name)}">${isFav(name) ? "★ Favourite" : "☆ Favourite"}</button>
      <button class="chip${isBanned(name) ? " on" : ""}" data-a="pref" data-kind="ban" data-name="${esc(name)}">${isBanned(name) ? "Never show: on" : "Never show"}</button>
    </div>
    <div class="feed-meta" style="margin-top:.4rem">${isFav(name) ? "The planner picks this first when it fits the session." : isBanned(name) ? "The planner and Swap will never pick this. You can still add it yourself." : "Favourites get picked first. “Never show” keeps it out of your plans."}</div>`;
  html += cueHtml(name);
  html += `<div class="btn-row" style="margin-top:.8rem">
      <button class="btn ghost" data-a="lib-hist" data-name="${esc(name)}">All sessions</button>
      <button class="btn" data-a="add-ex" data-name="${esc(name)}">Add to workout</button>
    </div><button class="btn ghost" data-a="hist-close">Close</button>`;
  openSheet(html);
}


// =====================================================================
// SHARING
// =====================================================================
function appUrl() { return location.href.split("#")[0].split("?")[0].replace(/index\.html$/, ""); }

function shareOut(title, text, url) {
  if (NATIVE) { nativeCall("Share", "share", { title: title, text: text, dialogTitle: title }).catch(function () {}); return; }
  if (navigator.share) { navigator.share({ title: title, text: text, url: url }).catch(function () {}); return; }
  const full = text + (url ? "\n" + url : "");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(full).then(function () { alert("Copied. Paste it into a message."); },
      function () { window.prompt("Copy this:", full); });
  } else {
    window.prompt("Copy this:", full);
  }
}

function workoutShareText(w) {
  const t = workoutTotals(w);
  const date = new Date(w.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const lines = w.exercises.map(function (ex) {
    if (isCardio(ex.name)) return ex.name + ": " + ex.sets.map(cardioText).join("; ");
    let best = null;
    ex.sets.forEach(function (s) {
      const kg = parseFloat(s.weight) || 0;
      if (!best || kg > best.kg) best = { kg: kg, reps: parseInt(s.reps) || 0 };
    });
    return ex.name + ": " + ex.sets.length + " sets" + (best && best.kg ? ", top " + fmtW(best.kg) + " " + unit() + " × " + best.reps : "");
  });
  return "BTB - " + w.name + " (" + date + ")\n" + lines.join("\n") + "\n" +
    t.sets + " sets" + (t.volume ? ", " + Math.round(toDisp(t.volume)).toLocaleString() + " " + unit() + " lifted" : "") +
    (w.minutes ? ", " + w.minutes + " min" : "");
}

$("share-app").addEventListener("click", function () {
  shareOut("BTB - Beyond The Body", "I'm training with BTB - Beyond The Body, a free home gym tracker that plans workouts around your equipment and goals. Open it on your phone and add it to your home screen:", appUrl());
});


// =====================================================================
// FIRST-TIME WELCOME
// =====================================================================
const OB_PRESETS = [
  { id: "none",  title: "Just me", sub: "No equipment, bodyweight only", gear: [] },
  { id: "bands", title: "Resistance bands", sub: "Bands and bodyweight", gear: ["Resistance bands"] },
  { id: "db",    title: "Dumbbells and a bench", sub: "A simple home setup", gear: ["Dumbbells", "Adjustable bench"] },
  { id: "basic", title: "Home gym basics", sub: "Barbell, plates, rack, bench, dumbbells, pull-up bar",
    gear: ["Dumbbells", "Barbell", "Weight plates", "Adjustable bench", "Squat rack", "Pull-up bar"] },
  { id: "full",  title: "Full home gym", sub: "Basics plus cables, leg press, Smith machine, dip station",
    gear: ["Dumbbells", "Barbell", "Weight plates", "Adjustable bench", "Squat rack", "Pull-up bar", "EZ curl bar",
           "Dip station", "Cable machine", "Lat pulldown", "Leg press", "Smith machine"] },
  { id: "own",   title: "I'll tick my own", sub: "Choose item by item on the Gym tab", gear: null }
];

let ob = null;

function openWelcome() {
  ob = { step: 0, goal: goals.goal, experience: goals.experience, days: String(goals.days), minutes: String(goals.minutes),
         units: settings.units, preset: null };
  renderWelcome();
  $("welcome").classList.add("show");
}

function obChips(key, options, suffix) {
  return `<div class="chips">` + options.map(function (o) {
    return `<button class="chip${String(ob[key]) === String(o) ? " on" : ""}" data-ob="set" data-k="${key}" data-v="${esc(String(o))}">${esc(String(o))}${suffix || ""}</button>`;
  }).join("") + `</div>`;
}

function renderWelcome() {
  const el = $("welcome");
  const last = 5;
  let body = "";
  let title = "";

  if (ob.step === 0) {
    body = `<img class="welcome-logo" src="logo-full.svg" alt="BTB - Beyond The Body">
      <p class="welcome-lead">A few taps and your first workout is ready, planned around your goal and the gear you actually have.</p>`;
  } else if (ob.step === 1) {
    title = "What's your main goal?";
    body = Object.keys(GOAL_PROFILES).map(function (g) {
      return `<button class="ob-opt${ob.goal === g ? " on" : ""}" data-ob="set" data-k="goal" data-v="${esc(g)}"><b>${esc(g)}</b><span>${esc(GOAL_PROFILES[g].blurb)}</span></button>`;
    }).join("");
  } else if (ob.step === 2) {
    title = "About your training";
    body = `<div class="card-label">Experience</div>` + obChips("experience", ["Beginner", "Intermediate", "Advanced"]) +
      `<p class="feed-meta">Beginner: under a year of regular lifting. Advanced: several years of structured training.</p>
       <div class="card-label" style="margin-top:1rem">Days per week</div>` + obChips("days", [2, 3, 4, 5, 6]) +
      `<div class="card-label" style="margin-top:1rem">Session length</div>` + obChips("minutes", [30, 45, 60, 90], " min");
  } else if (ob.step === 3) {
    title = "Which units?";
    body = obChips("units", ["kg", "lb"]) + `<p class="feed-meta">Weights, distances and measurements follow this. You can change it any time on the Gym tab.</p>`;
  } else if (ob.step === 4) {
    title = "What equipment do you have?";
    const list = OB_PRESETS.concat(selected.length ? [{ id: "keep", title: "Keep what I have ticked", sub: selected.length + " items already selected", gear: null }] : []);
    body = list.map(function (p) {
      return `<button class="ob-opt${ob.preset === p.id ? " on" : ""}" data-ob="set" data-k="preset" data-v="${p.id}"><b>${esc(p.title)}</b><span>${esc(p.sub)}</span></button>`;
    }).join("") + `<p class="feed-meta">You can fine-tune this any time on the Gym tab.</p>`;
  } else {
    title = "You're set";
    const p = OB_PRESETS.find(function (q) { return q.id === ob.preset; });
    body = `<div class="card"><div class="obj-line"><span>Goal</span><span>${esc(ob.goal)}</span></div>
      <div class="obj-line"><span>Level</span><span>${esc(ob.experience)}</span></div>
      <div class="obj-line"><span>Training</span><span>${ob.days} days · ${ob.minutes} min</span></div>
      <div class="obj-line"><span>Units</span><span>${esc(ob.units)}</span></div>
      <div class="obj-line"><span>Equipment</span><span>${esc(p ? p.title : "Keep current")}</span></div></div>
      <p class="feed-meta">Next: your first workout. Log your body weight in the Progress tab to track a bodyweight target.</p>`;
  }

  const canNext = ob.step !== 4 || ob.preset;
  el.innerHTML = `<div class="welcome-in">
      <div class="welcome-top"><div class="welcome-dots">${[0, 1, 2, 3, 4, 5].map(function (i) { return `<i class="${i <= ob.step ? "on" : ""}"></i>`; }).join("")}</div>
        <button class="link-btn" data-ob="skip">Skip</button></div>
      ${title ? `<h1 class="welcome-h">${title}</h1>` : ""}
      <div class="welcome-body">${body}</div>
      <div class="welcome-foot">
        ${ob.step > 0 ? `<button class="btn ghost" data-ob="back">Back</button>` : ""}
        <button class="btn" data-ob="next"${canNext ? "" : " disabled"}>${ob.step === 0 ? "Let’s start" : ob.step === last ? "Build my first workout" : "Next"}</button>
      </div></div>`;
  el.scrollTop = 0;
}

function finishWelcome(apply) {
  if (apply) {
    goals.goal = ob.goal; goals.experience = ob.experience; goals.days = ob.days; goals.minutes = ob.minutes;
    normGoals(goals);
    save("goals", goals);

    if (settings.units !== ob.units) {
      settings.units = ob.units;
      save("settings", settings);
      gear = defaultGear();
      save("gear", gear);
    }

    const p = OB_PRESETS.find(function (q) { return q.id === ob.preset; });
    if (p && p.gear) { selected = p.gear.slice(); save("selectedEquipment", selected); }

    const plan = buildPlan({ shuffle: true });
    workout = newWorkout(plan || template);
    saveWorkout();
  }
  save("onboarded", true);
  $("welcome").classList.remove("show");
  renderAll();
  showTab(apply && ob.preset === "own" ? "gym" : "home", apply && ob.preset === "own" ? "equip" : undefined);
}

$("welcome").addEventListener("click", function (e) {
  const b = e.target.closest("[data-ob]");
  if (!b || !ob) return;
  const a = b.dataset.ob;
  if (a === "set") { ob[b.dataset.k] = b.dataset.v; renderWelcome(); return; }
  if (a === "back") { ob.step = Math.max(0, ob.step - 1); renderWelcome(); return; }
  if (a === "skip") { finishWelcome(false); return; }
  if (a === "next") {
    if (ob.step >= 5) { finishWelcome(true); return; }
    ob.step++;
    renderWelcome();
  }
});

$("setup-again").addEventListener("click", function () {
  if (confirm("Run the welcome setup again? It updates your goal, days, units and equipment. Your workout history stays.")) openWelcome();
});

// =====================================================================
// FORM CUES: how to do it, and the common mistakes
// Rules are checked in order and the first match wins, so specific moves come first.
// =====================================================================
function cue(how, avoid) { return { how: how, avoid: avoid }; }

const CUE_RULES = [
  [/foam rolling/i, cue(
    ["Roll slowly, about an inch a second, over one muscle at a time.", "Pause 20-30 seconds on tender spots and breathe out.", "Keep the roller off joints and your lower back."],
    ["Rolling fast", "Pressing so hard you tense up"])],

  // ----- Hinges -----
  [/romanian|stiff-leg|good morning/i, cue(
    ["Soft knees, then push your hips straight back as if closing a door with them.", "Bar or weights stay close to your legs, back flat, chest proud.", "Stop when your hamstrings stretch, then squeeze your glutes to stand."],
    ["Rounding your lower back", "Squatting it down instead of hinging", "Letting the weight drift away from you"])],
  [/deadlift|rack pull/i, cue(
    ["Set your feet hip-width, grip just outside your legs, and pull the slack out of the bar.", "Brace your stomach, keep your back flat, and push the floor away.", "Stand tall with hips and knees locking together, then lower under control."],
    ["Jerking the bar off the floor", "Rounding your back", "Leaning back at the top"])],
  [/swing/i, cue(
    ["Hinge your hips back and hike the bell behind your legs.", "Snap your hips forward hard so the bell floats to chest height.", "Arms stay loose: your hips do the work."],
    ["Squatting it", "Lifting with your arms", "Leaning back at the top"])],
  [/hip thrust|glute bridge/i, cue(
    ["Upper back on the bench (or shoulders on the floor), feet flat, shins about vertical at the top.", "Tuck your chin and ribs down, then drive through your heels.", "Squeeze your glutes hard at the top for a second."],
    ["Over-arching your lower back at the top", "Pushing through your toes"])],
  [/pull-through/i, cue(
    ["Face away from the cable, hinge your hips back with a flat back.", "Drive your hips forward and squeeze your glutes at the top.", "Arms stay straight: it is a hip movement."],
    ["Squatting it", "Pulling with your arms"])],
  [/hyperextension|back extension|superman/i, cue(
    ["Lift by squeezing your glutes and lower back until your body is in one straight line.", "Move slowly and pause for a second at the top.", "Look at the floor to keep your neck neutral."],
    ["Swinging up with momentum", "Leaning back past straight"])],
  [/leg curl|hamstring curl/i, cue(
    ["Keep your hips down and pull your heels toward your glutes.", "Squeeze at the top, then lower for about 3 seconds.", "Move only your lower legs."],
    ["Lifting your hips to cheat", "Dropping the weight fast"])],
  [/abduction|adduction|lateral walk|glute kickback/i, cue(
    ["Stay upright and move from your hips, not your back.", "Use a smooth, controlled push and squeeze at the end.", "Keep your toes pointing forward."],
    ["Leaning or twisting to swing the weight", "Rushing the return"])],

  // ----- Legs -----
  [/calf raise/i, cue(
    ["Rise up as high as you can on the balls of your feet.", "Pause for a second at the top, then lower for a full stretch.", "Keep your knees almost straight, unless it is a seated version."],
    ["Bouncing at the bottom", "Cutting the stretch short"])],
  [/leg extension/i, cue(
    ["Sit with your knees lined up with the machine's pivot.", "Kick up until your legs are nearly straight and squeeze your quads.", "Lower slowly, taking about 3 seconds."],
    ["Swinging the weight up", "Locking out hard"])],
  [/leg press/i, cue(
    ["Feet shoulder-width on the plate, lower back and hips flat on the pad.", "Lower until your knees are about 90 degrees, then press through your whole foot.", "Stop just short of locking your knees."],
    ["Letting your hips curl off the pad", "Locking your knees hard", "Letting your knees cave in"])],
  [/hack squat|pendulum|belt squat/i, cue(
    ["Back and hips stay against the pad, feet about shoulder-width.", "Lower until your thighs are around parallel or a little deeper.", "Drive through your whole foot and keep your knees in line with your toes."],
    ["Heels lifting", "Knees caving in", "Bouncing at the bottom"])],
  [/sissy|wall sit/i, cue(
    ["Keep your core braced and your body in a controlled, straight line.", "Move slowly and stop where it stays pain-free.", "Breathe steadily instead of holding your breath."],
    ["Dropping into it too fast", "Pushing through knee pain"])],
  [/box jump|jump squat/i, cue(
    ["Load your hips back, then swing your arms and jump up explosively.", "Land softly with bent knees, like you are landing on eggs.", "Reset fully between reps."],
    ["Landing stiff-legged", "Rushing reps when tired"])],
  [/lunge|split squat|step-up|cossack/i, cue(
    ["Take a long enough stance that your front knee stays above your ankle.", "Torso tall, lower under control, and drive through your front heel.", "Keep your front knee tracking over your toes."],
    ["Knee caving in", "Pushing off your back foot", "Too short a step"])],
  [/squat/i, cue(
    ["Feet about shoulder-width, toes slightly out, brace your stomach before you go down.", "Sit down between your hips until your thighs reach at least parallel, knees tracking over your toes.", "Drive up through your whole foot, chest up."],
    ["Knees caving in", "Heels lifting off the floor", "Rounding your lower back at the bottom"])],

  // ----- Pulls -----
  [/pull-up|chin-up/i, cue(
    ["Start from a full hang with your shoulders pulled down away from your ears.", "Pull your elbows down and back until your chin clears the bar.", "Lower under control to a full hang."],
    ["Kicking or swinging", "Half reps", "Shrugging up to your ears"])],
  [/straight-arm|pullover/i, cue(
    ["Keep your arms nearly straight with a soft elbow bend.", "Sweep the weight in an arc, feeling the stretch in your lats.", "Brace your core so your ribs do not flare."],
    ["Bending your elbows into a press", "Arching your back"])],
  [/pulldown/i, cue(
    ["Sit tall, brace, and pull the bar to your upper chest.", "Lead with your elbows, driving them down and back.", "Let the bar rise slowly until your arms are straight."],
    ["Leaning far back and rowing it", "Pulling the bar behind your neck", "Using momentum"])],
  [/shrug/i, cue(
    ["Hold the weight at your sides and lift your shoulders straight up toward your ears.", "Squeeze at the top for a second, then lower fully.", "Keep your arms straight and your head still."],
    ["Rolling your shoulders", "Bending your elbows"])],
  [/face pull|rear delt|reverse fly|reverse pec|y raise|pull-apart/i, cue(
    ["Keep your arms mostly straight (or elbows high for face pulls) and spread your hands apart.", "Squeeze your shoulder blades together at the end.", "Use a light weight and slow, clean reps."],
    ["Using too much weight and swinging", "Shrugging your shoulders"])],
  [/upright row/i, cue(
    ["Pull the weight up close to your body to about chest height.", "Lead with your elbows, keeping them no higher than your shoulders.", "Lower slowly."],
    ["Pulling elbows far above your shoulders", "Swinging with your hips"])],
  [/row/i, cue(
    ["Brace your core and keep your back flat or your chest supported.", "Pull your elbows back toward your hips and squeeze your shoulder blades together.", "Lower slowly until your arms are straight."],
    ["Jerking with your hips", "Shrugging your shoulders up", "Rounding your back"])],

  // ----- Shoulders and arms -----
  [/overhead press|shoulder press|push press|arnold|kettlebell press|landmine press|pike push/i, cue(
    ["Brace your stomach and squeeze your glutes so you do not lean back.", "Press straight up, moving your head slightly out of the way, until your arms are locked.", "Lower under control to about chin or shoulder height."],
    ["Leaning back and turning it into an incline press", "Flaring your ribs", "Pressing the weight forward"])],
  [/lateral raise/i, cue(
    ["Slight elbow bend, lift your arms out to the sides to about shoulder height.", "Lead with your elbows, as if pouring a jug of water.", "Lower slowly."],
    ["Swinging your body", "Raising your shoulders to your ears", "Lifting above shoulder height"])],
  [/front raise/i, cue(
    ["Stand tall and lift the weight in front of you to about eye level, arms nearly straight.", "Keep your body still and your shoulders down.", "Lower slowly."],
    ["Swinging the weight up", "Leaning back"])],
  [/halo/i, cue(
    ["Hold the bell close to your chest and circle it around your head.", "Keep your ribs down and hips still.", "Alternate directions each set."],
    ["Arching your back", "Letting the bell drift away from you"])],
  [/curl/i, cue(
    ["Keep your elbows pinned near your sides.", "Curl up until your biceps are fully squeezed, then lower for about 3 seconds.", "Keep your wrists straight."],
    ["Swinging your body", "Letting your elbows drift forward", "Dropping the weight fast"])],
  [/triceps kickback/i, cue(
    ["Hinge forward and pin your upper arm to your side.", "Straighten your elbow fully and squeeze your triceps.", "Only your forearm moves."],
    ["Swinging your arm", "Dropping your elbow"])],
  [/skull|jm press/i, cue(
    ["Keep your upper arms still and bend only at the elbows.", "Lower the weight toward your forehead or just behind your head, then extend.", "Keep your elbows from flaring wide."],
    ["Flaring your elbows", "Letting your upper arms drift", "Using too much weight"])],
  [/pushdown/i, cue(
    ["Elbows tight to your sides, chest up.", "Push down until your arms are fully straight and squeeze.", "Let your hands rise slowly to about chest height."],
    ["Leaning over the weight", "Letting your elbows swing out"])],
  [/triceps extension/i, cue(
    ["Keep your upper arms close to your head and still.", "Lower behind your head with control, then extend until your arms are straight.", "Brace your core so your back does not arch."],
    ["Flaring your elbows", "Arching your lower back"])],
  [/leg raise|knee raise|toes-to-bar/i, cue(
    ["Hang or brace your body and keep your torso still.", "Curl your pelvis up and raise your legs or knees under control.", "Lower slowly without swinging."],
    ["Swinging for momentum", "Only moving your thighs without curling your hips"])],
  [/dips?\b/i, cue(
    ["Support yourself with your shoulders down and chest slightly forward.", "Lower until your upper arms are about parallel to the floor.", "Press back up until your elbows are straight."],
    ["Going so deep that your shoulders hurt", "Shrugging up to your ears", "Flaring your elbows wide"])],

  // ----- Chest -----
  [/push-up/i, cue(
    ["Hands slightly wider than your shoulders, body in one straight line from head to heels.", "Lower your chest to just above the floor with your elbows at about 45 degrees.", "Press the floor away until your arms are straight."],
    ["Sagging hips", "Flaring your elbows wide", "Cutting the range short"])],
  [/fly|pec deck/i, cue(
    ["Keep a slight bend in your elbows and hold it constant.", "Open until you feel a stretch across your chest, then squeeze your hands together.", "Use a lighter weight than you would for a press."],
    ["Turning it into a press by bending your elbows", "Stretching so far that your shoulders hurt"])],
  [/bench press|floor press|chest press|incline|decline|dumbbell press|squeeze press|svend|close-grip/i, cue(
    ["Shoulder blades pinched back and down, feet planted, a small arch in your upper back.", "Lower the weight to your mid-chest with your elbows about 45-60 degrees from your body.", "Press up and slightly back until your arms are straight."],
    ["Bouncing the bar off your chest", "Flaring your elbows wide", "Lifting your hips off the bench"])],

  // ----- Core -----
  [/plank|hollow/i, cue(
    ["Make a straight line from your head to your heels (or a banana shape for a hollow hold).", "Squeeze your glutes and brace your stomach.", "Breathe steadily."],
    ["Sagging hips", "Piking your hips up", "Holding your breath"])],
  [/crunch|sit-up/i, cue(
    ["Curl your ribs toward your hips instead of pulling on your neck.", "Pause and squeeze at the top.", "Lower under control."],
    ["Yanking on your head", "Using momentum"])],
  [/rollout|fallout|body saw|suspension pike/i, cue(
    ["Brace your stomach and tuck your pelvis so your lower back stays flat.", "Move out only as far as you can keep your back from sagging.", "Pull back using your abs."],
    ["Letting your lower back sag", "Going too far too soon"])],
  [/twist|woodchop|pallof|rotation|windmill|rotary|torso/i, cue(
    ["Keep your hips steady and rotate through your ribs and upper back.", "Move with control, with your core braced the whole time.", "Pause briefly at each end."],
    ["Swinging with momentum", "Twisting from your lower back or arms"])],
  [/dead bug|bird dog/i, cue(
    ["Keep your lower back steady and your core braced.", "Move opposite arm and leg slowly and smoothly.", "Breathe out as you extend."],
    ["Letting your back arch or rotate", "Rushing"])],
  [/carry/i, cue(
    ["Stand tall with your shoulders down and back, gripping hard.", "Take short, steady steps and brace your core.", "Keep your body still: no leaning or swaying."],
    ["Leaning to one side", "Shrugging up"])],
  [/slam/i, cue(
    ["Reach the ball overhead, then slam it down hard using your whole body.", "Hinge at your hips as you go down.", "Catch or pick it up with a flat back."],
    ["Using only your arms", "Rounding your back picking it up"])],
  [/mountain climber/i, cue(
    ["Hands under your shoulders, body in a straight line.", "Drive your knees toward your chest in a steady rhythm.", "Keep your hips level."],
    ["Bouncing your hips up", "Letting your shoulders drift back"])]
];

const CUE_CARDIO = [
  [/foam rolling/i, cue(
    ["Roll slowly, about an inch a second, over one muscle at a time.", "Pause 20-30 seconds on tender spots and breathe out.", "Keep the roller off joints and your lower back."],
    ["Rolling fast", "Pressing so hard you tense up"])],
  [/rowing machine/i, cue(
    ["Push with your legs first, then lean back slightly, then pull the handle to your lower chest.", "Reverse the order on the way back: arms, body, then knees.", "Keep a steady rhythm of one power stroke to two easy seconds."],
    ["Pulling with your arms first", "Hunching your back"])],
  [/treadmill|run|walk/i, cue(
    ["Warm up with 3-5 easy minutes first.", "Stand tall, keep your steps light, and let your arms swing naturally.", "Pick a pace you could talk at, unless you are doing intervals."],
    ["Starting too fast", "Gripping the rails", "Over-striding"])],
  [/bike|elliptical/i, cue(
    ["Set the seat so your knee has a slight bend at the bottom.", "Keep your upper body relaxed and your breathing steady.", "Add resistance instead of just spinning faster if it feels too easy."],
    ["Setting the seat too low", "Gripping the handles hard"])],
  [/jump rope/i, cue(
    ["Keep your elbows near your sides and turn the rope with your wrists.", "Hop low, just high enough for the rope to pass, landing softly on the balls of your feet.", "Look ahead and keep a steady rhythm."],
    ["Jumping too high", "Swinging the rope with your whole arms"])],
  [/burpee/i, cue(
    ["Drop to a plank, lower your chest, then press up and jump your feet in.", "Finish with a jump and clap overhead.", "Pace yourself so form holds as you tire."],
    ["Sagging hips in the plank", "Rushing until your form breaks"])],
  [/high knees/i, cue(
    ["Run on the spot, driving your knees up to about hip height.", "Stay tall and pump your arms.", "Land softly on the balls of your feet."],
    ["Leaning back", "Landing heavy on your heels"])]
];

// Fallback for anything that does not match, such as a custom exercise
const CUE_GENERIC = {
  compound: cue(["Set your position and brace your core before you move.", "Control the weight down, then drive up smoothly.", "Keep your joints stacked and your back flat or neutral."],
                ["Rushing the lowering", "Using so much weight that your form breaks"]),
  iso: cue(["Move only the muscle you are training and keep the rest of your body still.", "Lift under control and squeeze at the top.", "Lower slowly, taking about 3 seconds."],
           ["Swinging the weight", "Rushing the reps"]),
  cardio: cue(["Warm up gently for a few minutes.", "Keep a steady pace you can hold.", "Breathe steadily and keep your posture tall."],
              ["Starting too hard"])
};

// Returns { how: [...], avoid: [...], generic: true/false }
function cueFor(name) {
  const lib = library.find(function (l) { return l.name === name; });
  const rules = (lib && lib.muscle === "cardio") ? CUE_CARDIO : CUE_RULES;
  for (let i = 0; i < rules.length; i++) {
    if (rules[i][0].test(name)) return { how: rules[i][1].how, avoid: rules[i][1].avoid, generic: false };
  }
  const g = CUE_GENERIC[lib ? (lib.muscle === "cardio" ? "cardio" : lib.type) : "iso"] || CUE_GENERIC.iso;
  return { how: g.how, avoid: g.avoid, generic: true };
}

function cueHtml(name) {
  const c = cueFor(name);
  return `<div class="cue">
    <div class="card-label">How to do it</div>
    <ol class="cue-list">${c.how.map(function (s) { return `<li>${esc(s)}</li>`; }).join("")}</ol>
    <div class="card-label">Common mistakes</div>
    <ul class="cue-list avoid">${c.avoid.map(function (s) { return `<li>${esc(s)}</li>`; }).join("")}</ul>
    <div class="feed-meta">General guidance. If something hurts, stop and check with a coach or doctor.</div></div>`;
}

function openFormSheet(name) {
  openSheet(`<div class="card-label">Form guide</div><div class="big">${esc(name)}</div>${cueHtml(name)}
    <button class="btn" data-a="hist-close">Close</button>`);
}

// =====================================================================
// SUPERSETS AND CIRCUITS
// Exercises that share a "group" number are done back to back: one set of each, then a rest.
// =====================================================================
function workingDone(ex) { return ex.sets.filter(function (s) { return s.done && !s.warmup; }).length; }

function groupIndexes(g) {
  const out = [];
  if (g == null) return out;
  workout.exercises.forEach(function (e, i) { if (e.group === g) out.push(i); });
  return out;
}

// After you tick a set: how long to rest, and what comes next?
function restAfterSet(ei) {
  const ex = workout.exercises[ei];
  const full = restFor(ex.name);
  const members = groupIndexes(ex.group);
  if (members.length < 2) return { secs: full, label: "Rest" };
  const k = workingDone(ex);
  const total = ex.sets.filter(function (s) { return !s.warmup; }).length;
  // The next member (looking forward, then wrapping round) that is behind this one
  const order = members.filter(function (i) { return i > ei; }).concat(members.filter(function (i) { return i < ei; }));
  for (let n = 0; n < order.length; n++) {
    const m = workout.exercises[order[n]];
    const mTotal = m.sets.filter(function (s) { return !s.warmup; }).length;
    if (workingDone(m) < k && workingDone(m) < mTotal) return { secs: 10, label: "Next: " + m.name };
  }
  const longest = Math.max.apply(null, members.map(function (i) { return restFor(workout.exercises[i].name); }));
  return { secs: Math.max(full, longest), label: k >= total ? "Rest" : "Rest, then round " + (k + 1) };
}

// Link this exercise with the next one, or take it out of its group
function toggleSuperset(ei) {
  const ex = workout.exercises[ei];
  if (ex.group != null) {
    delete ex.group;
    cleanGroups();
    return;
  }
  const next = workout.exercises[ei + 1];
  if (!next) return;
  if (next.group != null) ex.group = next.group;
  else {
    let id = 1;
    workout.exercises.forEach(function (e) { if (e.group != null && e.group >= id) id = e.group + 1; });
    ex.group = id;
    next.group = id;
  }
}

// A group with only one member is not a group
function cleanGroups() {
  const counts = {};
  workout.exercises.forEach(function (e) { if (e.group != null) counts[e.group] = (counts[e.group] || 0) + 1; });
  workout.exercises.forEach(function (e) { if (e.group != null && counts[e.group] < 2) delete e.group; });
}

// "A1", "A2", "B1" ... plus whether it is a superset (2) or a circuit (3+)
function groupLabels() {
  const letters = {};
  const sizes = {};
  const seen = {};
  let next = 0;
  workout.exercises.forEach(function (e) {
    if (e.group == null) return;
    if (!(e.group in letters)) letters[e.group] = String.fromCharCode(65 + next++);
    sizes[e.group] = (sizes[e.group] || 0) + 1;
  });
  const out = {};
  workout.exercises.forEach(function (e, i) {
    if (e.group == null) return;
    seen[e.group] = (seen[e.group] || 0) + 1;
    out[i] = { tag: letters[e.group] + seen[e.group], kind: sizes[e.group] > 2 ? "Circuit" : "Superset" };
  });
  return out;
}

// The planner pairs smaller exercises when you are short on time, and builds a circuit for Conditioning
function addGroupsToPlan(exercises) {
  const small = [];
  exercises.forEach(function (e, i) {
    const l = library.find(function (q) { return q.name === e.name; });
    // Never the first (lead) lift: that one deserves full rest
    if (l && l.muscle !== "cardio" && i > 0) small.push(i);
  });
  if (goals.goal === "Conditioning") {
    const pool = exercises.map(function (e, i) { return i; }).filter(function (i) {
      const l = library.find(function (q) { return q.name === exercises[i].name; });
      return l && l.muscle !== "cardio";
    }).slice(-3);
    if (pool.length >= 3) { pool.forEach(function (i) { exercises[i].group = 1; }); return "Last three exercises set up as a circuit"; }
  }
  if (Number(goals.minutes) <= 30 && small.length >= 2) {
    const a = small[small.length - 2], b = small[small.length - 1];
    // Bring the second one up next to the first, then link them
    const moved = exercises.splice(b, 1)[0];
    exercises.splice(a + 1, 0, moved);
    exercises[a].group = 1;
    exercises[a + 1].group = 1;
    return "Last two exercises paired as a superset to save time";
  }
  return null;
}


// =====================================================================
// INTERVAL TIMER (Tabata, EMOM, or your own work and rest)
// =====================================================================
const IV_PRESETS = {
  tabata: { work: 20, rest: 10, rounds: 8 },
  emom:   { work: 60, rest: 0,  rounds: 10 },
  custom: { work: 40, rest: 20, rounds: 6 }
};
let ivCfg = load("intervalCfg", { mode: "tabata", work: 20, rest: 10, rounds: 8 });
if (!IV_PRESETS[ivCfg.mode]) ivCfg = { mode: "tabata", work: 20, rest: 10, rounds: 8 };
let ivRun = null;      // set while the timer is running
let ivWake = null;
let ivAudio = null;

// A list of phases: get ready, then work / rest for each round
function intervalPlan(cfg) {
  const work = Math.max(1, Number(cfg.work) || 1);
  const rest = Math.max(0, Number(cfg.rest) || 0);
  const rounds = Math.max(1, Math.min(99, Number(cfg.rounds) || 1));
  const phases = [{ type: "ready", secs: 5, round: 0 }];
  for (let r = 1; r <= rounds; r++) {
    phases.push({ type: "work", secs: work, round: r });
    if (rest > 0 && r < rounds) phases.push({ type: "rest", secs: rest, round: r });
  }
  return phases;
}

function intervalTotal(cfg) {
  return intervalPlan(cfg).filter(function (p) { return p.type !== "ready"; })
    .reduce(function (n, p) { return n + p.secs; }, 0);
}

function ivBeep(freq, ms) {
  try {
    if (!ivAudio) ivAudio = new (window.AudioContext || window.webkitAudioContext)();
    if (ivAudio.state === "suspended") ivAudio.resume();
    const o = ivAudio.createOscillator();
    const g = ivAudio.createGain();
    o.frequency.value = freq;
    g.gain.value = 0.25;
    o.connect(g); g.connect(ivAudio.destination);
    o.start();
    o.stop(ivAudio.currentTime + ms / 1000);
  } catch (err) { /* sound is optional */ }
}
function ivBuzz(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (err) {} }

function ivSetup() {
  const mode = ivCfg.mode;
  const total = intervalTotal(ivCfg);
  const row = function (key, label, step, min, max, fmt) {
    return `<div class="iv-row"><div>${label}</div>
      <div class="iv-step"><button data-iv="dec" data-k="${key}" data-step="${step}" data-min="${min}" aria-label="Less ${label}">−</button>
      <b>${fmt(ivCfg[key])}</b>
      <button data-iv="inc" data-k="${key}" data-step="${step}" data-max="${max}" aria-label="More ${label}">+</button></div></div>`;
  };
  const secs = function (v) { return v >= 60 && v % 60 === 0 ? (v / 60) + " min" : v + " s"; };
  let rows = "";
  if (mode === "custom") {
    rows = row("work", "Work", 5, 5, 600, secs) + row("rest", "Rest", 5, 0, 300, secs) + row("rounds", "Rounds", 1, 1, 50, String);
  } else if (mode === "emom") {
    rows = row("rounds", "Minutes", 1, 1, 60, String);
  } else {
    rows = `<p class="feed-meta">8 rounds of 20 seconds all-out, 10 seconds rest.</p>`;
  }
  const blurb = mode === "emom" ? "Every Minute On the Minute: start a task as each minute begins and rest for what is left of it."
    : mode === "tabata" ? "The classic 4-minute burst." : "Set your own work and rest.";
  return `<div class="card-label">Interval timer</div><div class="big">Ready when you are</div>
    <div class="chips" style="margin:.8rem 0">
      ${["tabata", "emom", "custom"].map(function (m) {
        return `<button class="chip${mode === m ? " on" : ""}" data-iv="mode" data-v="${m}">${m === "emom" ? "EMOM" : m[0].toUpperCase() + m.slice(1)}</button>`;
      }).join("")}
    </div>
    <p class="feed-meta">${blurb}</p>${rows}
    <div class="feed-meta" style="margin:.8rem 0">Total ${mmss(total)} (plus a 5 second countdown). Sound and a buzz mark each change.</div>
    <button class="btn" data-iv="start">Start</button>
    <button class="btn ghost" data-iv="close">Close</button>`;
}

function ivRender() {
  const el = $("iv-sheet");
  if (!ivRun) { el.innerHTML = ivSetup(); return; }
  el.innerHTML = `<div class="iv-run" id="iv-phase">
      <div class="iv-label" id="iv-label"></div>
      <div class="iv-time" id="iv-time"></div>
      <div class="iv-round" id="iv-round"></div>
      <div class="iv-bar"><div class="iv-fill" id="iv-fill"></div></div>
      <div class="btn-row">
        <button class="btn ghost" data-iv="pause" id="iv-pause">Pause</button>
        <button class="btn" data-iv="stop">Stop</button>
      </div></div>`;
  ivTick(true);
}

// custom (optional): { phases, done, title } for a guided warm-up or cooldown
function ivStart(custom) {
  if (!custom) save("intervalCfg", ivCfg);
  const plan = custom ? custom.phases : intervalPlan(ivCfg);
  ivRun = { custom: custom || null, plan: plan, idx: 0, end: Date.now() + plan[0].secs * 1000, paused: false, left: 0, lastBeep: -1, totalSecs: plan.reduce(function (n, p) { return n + p.secs; }, 0), elapsedBefore: 0 };
  ivBeep(660, 120);
  try { if (navigator.wakeLock) navigator.wakeLock.request("screen").then(function (l) { ivWake = l; }).catch(function () {}); } catch (err) {}
  if (!ivRun.timer) ivRun.timer = setInterval(function () { ivTick(false); }, 200);
  ivRender();
}

function ivStop() {
  if (ivRun) clearInterval(ivRun.timer);
  ivRun = null;
  try { if (ivWake) { ivWake.release(); ivWake = null; } } catch (err) {}
  ivRender();
}

function ivTick(force) {
  if (!ivRun) return;
  const r = ivRun;
  if (!r.paused) {
    let left = Math.ceil((r.end - Date.now()) / 1000);
    while (left <= 0) {
      r.idx++;
      if (r.idx >= r.plan.length) {
        ivBeep(880, 500); ivBuzz([400, 150, 400]);
        clearInterval(r.timer);
        ivRun = null;
        try { if (ivWake) { ivWake.release(); ivWake = null; } } catch (err) {}
        if (r.custom) {
          $("iv-sheet").innerHTML = `<div class="card-label">${esc(r.custom.title)}</div><div class="big">Done!</div>
            <p class="feed-meta" style="margin:.6rem 0 1rem">${esc(r.custom.done)}</p>
            <button class="btn" data-iv="close">Close</button>`;
          return;
        }
        $("iv-sheet").innerHTML = `<div class="card-label">Interval timer</div><div class="big">Done!</div>
          <p class="feed-meta" style="margin:.6rem 0 1rem">${intervalTotal(ivCfg) ? mmss(intervalTotal(ivCfg)) + " of work finished. Nice." : ""}</p>
          <button class="btn" data-iv="again">Go again</button>
          <button class="btn ghost" data-iv="close">Close</button>`;
        return;
      }
      r.end += r.plan[r.idx].secs * 1000;
      r.lastBeep = -1;
      const ph = r.plan[r.idx];
      ivBeep(ph.type === "work" ? 880 : 520, 350);
      ivBuzz(ph.type === "work" ? [300] : [120, 80, 120]);
      left = Math.ceil((r.end - Date.now()) / 1000);
    }
    r.left = left;
    // Three short beeps before each change
    if (left <= 3 && left >= 1 && r.lastBeep !== left) { r.lastBeep = left; ivBeep(600, 90); }
  }
  const ph = r.plan[r.idx];
  const lab = $("iv-label");
  if (!lab) return;
  const names = { ready: "Get ready", work: "Work", rest: "Rest" };
  lab.textContent = r.paused ? "Paused" : (ph.name || names[ph.type]);
  $("iv-phase").className = "iv-run iv-" + ph.type + (r.custom ? " iv-guided" : "");
  $("iv-time").textContent = mmss(r.left || ph.secs);
  const rounds = r.plan.filter(function (p) { return p.type === "work"; }).length;
  const nextPh = r.plan[r.idx + 1];
  $("iv-round").textContent = ph.type === "ready" ? "Starting soon"
    : r.custom ? "Move " + ph.round + " of " + rounds + (nextPh ? " · Next: " + nextPh.name : " · Last one")
    : "Round " + ph.round + " of " + rounds;
  const doneSecs = r.plan.slice(0, r.idx).reduce(function (n, p) { return n + p.secs; }, 0) + (ph.secs - (r.left || ph.secs));
  $("iv-fill").style.width = Math.min(100, Math.round(doneSecs / r.totalSecs * 100)) + "%";
  $("iv-pause").textContent = r.paused ? "Resume" : "Pause";
}

function ivPauseToggle() {
  const r = ivRun;
  if (!r) return;
  if (r.paused) { r.end = Date.now() + r.left * 1000; r.paused = false; }
  else { r.left = Math.ceil((r.end - Date.now()) / 1000); r.paused = true; }
  ivTick(true);
}

function openInterval() {
  $("interval").classList.add("show");
  ivRender();
}
function closeInterval() {
  if (ivRun) clearInterval(ivRun.timer);
  ivRun = null;
  try { if (ivWake) { ivWake.release(); ivWake = null; } } catch (err) {}
  $("interval").classList.remove("show");
}

$("open-timer").addEventListener("click", openInterval);

$("interval").addEventListener("click", function (e) {
  const b = e.target.closest("[data-iv]");
  if (!b) return;
  const a = b.dataset.iv;
  if (a === "close") { closeInterval(); return; }
  if (a === "mode") {
    const m = b.dataset.v;
    ivCfg = m === "custom" && ivCfg.mode !== "custom" ? Object.assign({ mode: "custom" }, load("intervalCustom", IV_PRESETS.custom)) : Object.assign({ mode: m }, IV_PRESETS[m]);
    ivRender(); return;
  }
  if (a === "inc" || a === "dec") {
    const k = b.dataset.k, step = Number(b.dataset.step);
    const v = Number(ivCfg[k]) + (a === "inc" ? step : -step);
    const lo = a === "dec" ? Number(b.dataset.min) : -Infinity;
    const hi = a === "inc" ? Number(b.dataset.max) : Infinity;
    ivCfg[k] = Math.max(lo, Math.min(hi, v));
    if (ivCfg.mode === "custom") save("intervalCustom", { work: ivCfg.work, rest: ivCfg.rest, rounds: ivCfg.rounds });
    ivRender(); return;
  }
  if (a === "start" || a === "again") { ivStart(); return; }
  if (a === "pause") { ivPauseToggle(); return; }
  if (a === "stop") { const guided = ivRun && ivRun.custom; ivStop(); if (guided) closeInterval(); return; }
});


// =====================================================================
// ACHIEVEMENTS
// Worked out from your history every time, so they can never get out of step.
// =====================================================================
function weekStartKey(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dateKey(d);
}

// Longest run of weeks where you trained on at least your goal number of days
function bestWeekStreak(history) {
  const goalDays = Math.max(1, Math.min(7, Number(goals.days) || 3));
  const perWeek = {};
  history.forEach(function (w) {
    const k = weekStartKey(w.date);
    (perWeek[k] = perWeek[k] || {})[w.date] = true;
  });
  const weeks = Object.keys(perWeek).filter(function (k) { return Object.keys(perWeek[k]).length >= goalDays; }).sort();
  let best = 0, run = 0, prev = null;
  weeks.forEach(function (k) {
    const t = new Date(k + "T00:00:00").getTime();
    run = (prev !== null && Math.round((t - prev) / 86400000) === 7) ? run + 1 : 1;
    prev = t;
    best = Math.max(best, run);
  });
  return best;
}

function badgeStats() {
  const history = getHistory();
  let volume = 0, cardio = 0, prs = 0, wide = 0;
  history.forEach(function (w, i) {
    volume += workoutTotals(w).volume;
    w.exercises.forEach(function (ex) {
      if (isCardio(ex.name)) ex.sets.forEach(function (s) { cardio += parseFloat(s.mins) || 0; });
    });
    prs += findPRs(w.exercises, history.slice(0, i)).length;
  });

  // Most muscle groups trained in a single week
  const weekMuscles = {};
  history.forEach(function (w) {
    const k = weekStartKey(w.date);
    const set = (weekMuscles[k] = weekMuscles[k] || {});
    w.exercises.forEach(function (ex) {
      const l = library.find(function (q) { return q.name === ex.name; });
      if (l && l.muscle !== "cardio") set[l.muscle] = true;
    });
  });
  Object.keys(weekMuscles).forEach(function (k) { wide = Math.max(wide, Object.keys(weekMuscles[k]).length); });

  const bw = latestBodyWeight();
  const ratio = function (name) { return bw > 0 ? bestE1rm(name) / bw : 0; };
  cardio += runs.reduce(function (n, r) { return n + r.secs / 60; }, 0);
  const reached = (goals.targets || []).filter(function (t) { try { return targetProgress(t).pct >= 1; } catch (err) { return false; } }).length;

  return {
    workouts: history.length, weekStreak: bestWeekStreak(history), volume: volume, prs: prs, cardio: cardio,
    wide: wide, reached: reached, hasBw: bw > 0,
    bench: ratio("Barbell Bench Press"), squat: ratio("Barbell Back Squat"), dead: ratio("Deadlift")
  };
}

function achievementList() {
  const s = badgeStats();
  const n = function (v) { return Math.round(v).toLocaleString(); };
  const kgText = function (kg) { return n(toDisp(kg)) + " " + unit(); };
  const A = [];
  const add = function (id, icon, name, desc, cur, goal, text) { A.push({ id: id, icon: icon, name: name, desc: desc, cur: cur, goal: goal, text: text, earned: cur >= goal }); };

  [[1, "🔥", "First rep"], [10, "💪", "Ten down"], [25, "🏅", "Quarter century"], [50, "🥈", "Fifty strong"], [100, "👑", "Centurion"]].forEach(function (t) {
    add("w" + t[0], t[1], t[2], t[0] === 1 ? "Log your first workout" : "Log " + t[0] + " workouts", s.workouts, t[0], s.workouts + " / " + t[0]);
  });
  [[4, "📅", "Month of habit"], [12, "🗓️", "Season of habit"]].forEach(function (t) {
    add("ws" + t[0], t[1], t[2], t[0] + " weeks in a row hitting your weekly goal", s.weekStreak, t[0], s.weekStreak + " / " + t[0] + " weeks");
  });
  [[10000, "🏋️", "Ten tonnes"], [100000, "🚛", "Hundred tonnes"], [1000000, "🌍", "Million club"]].forEach(function (t) {
    add("v" + t[0], t[1], t[2], "Lift " + kgText(t[0]) + " in total", s.volume, t[0], kgText(s.volume) + " / " + kgText(t[0]));
  });
  add("pr1", "🏆", "Record breaker", "Set your first personal record", s.prs, 1, s.prs + " / 1");
  add("pr10", "🎖️", "Ten records", "Set 10 personal records", s.prs, 10, s.prs + " / 10");
  [["bench", "Barbell Bench Press", 1, "Bodyweight bench", "🧱"], ["squat", "Barbell Back Squat", 1.5, "1.5× bodyweight squat", "🦵"], ["dead", "Deadlift", 2, "Double bodyweight deadlift", "⛓️"]].forEach(function (t) {
    add("r" + t[0], t[4], t[3], t[1] + " estimated max of " + t[2] + "× your bodyweight" + (s.hasBw ? "" : " (log your weight in Body first)"), s[t[0]], t[2], s.hasBw ? (Math.round(s[t[0]] * 100) / 100) + "× / " + t[2] + "×" : "Needs a weigh-in");
  });
  add("c60", "🏃", "Getting the miles in", "60 minutes of cardio in total", s.cardio, 60, n(s.cardio) + " / 60 min");
  add("c600", "🫀", "Engine built", "600 minutes of cardio in total", s.cardio, 600, n(s.cardio) + " / 600 min");
  add("wide", "🧩", "Well rounded", "Train 8 muscle groups in one week", s.wide, 8, s.wide + " / 8 groups");
  add("tgt", "🎯", "On target", "Reach one of your targets", s.reached, 1, s.reached + " / 1");
  return A;
}

function earnedBadgeIds() { return achievementList().filter(function (a) { return a.earned; }).map(function (a) { return a.id; }); }

// Badges earned since you last looked. Marks them as seen.
function takeNewBadges() {
  const seen = load("badgesSeen", null);
  const now = achievementList().filter(function (a) { return a.earned; });
  if (seen === null) { save("badgesSeen", now.map(function (a) { return a.id; })); return []; }
  const fresh = now.filter(function (a) { return seen.indexOf(a.id) < 0; });
  if (fresh.length) save("badgesSeen", seen.concat(fresh.map(function (a) { return a.id; })));
  return fresh;
}

function renderAchievements() {
  const el = $("ach-card");
  if (!el) return;
  const list = achievementList();
  const got = list.filter(function (a) { return a.earned; }).length;
  el.innerHTML = `<div class="feed-meta" style="margin-bottom:.8rem">${got} of ${list.length} earned</div><div class="ach-grid">` +
    list.map(function (a) {
      const pct = Math.max(0, Math.min(100, Math.round(a.cur / a.goal * 100)));
      return `<div class="ach${a.earned ? "" : " locked"}">
        <div class="ach-ic">${a.icon}</div>
        <div class="ach-name">${esc(a.name)}</div>
        <div class="ach-desc">${esc(a.desc)}</div>
        ${a.earned ? `<div class="ach-got">Earned</div>` : `<div class="ach-bar"><div style="width:${pct}%"></div></div><div class="ach-text">${esc(a.text)}</div>`}
      </div>`;
    }).join("") + `</div>`;
}


// =====================================================================
// TRAINING DAYS, REST DAYS
// =====================================================================
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
function todayIndex() { return (new Date().getDay() + 6) % 7; }   // Monday = 0
function trainedToday() { return getWorkoutDates().indexOf(dateKey(new Date())) >= 0; }

// ----- shift patterns -----
function weekdayOf(key) { return (new Date(key + "T00:00:00").getDay() + 6) % 7; }
// Which day of your shift cycle a date is (0 = day 1), or -1 with no pattern set
function cyclePos(key) {
  const r = goals.rota;
  if (!r) return -1;
  const days = Math.round((new Date(key + "T00:00:00") - new Date(r.start + "T00:00:00")) / 86400000);
  return ((days % r.len) + r.len) % r.len;
}
function isWorkDate(key) { return !!goals.rota && goals.rota.work.indexOf(cyclePos(key)) >= 0; }
// "Work 2" or "Off 3": where a cycle day sits in its run of shifts or days off
function cycleLabel(i) {
  const r = goals.rota, isWork = r.work.indexOf(i) >= 0;
  let n = 0;
  for (let d = 0; d <= i; d++) if ((r.work.indexOf(d) >= 0) === isWork) n++;
  return (isWork ? "Work " : "Off ") + n;
}
// Have you fixed which days you lift (by weekday, or by shift pattern)?
function hasFixedDays() { return goals.rota ? goals.rota.gym.length > 0 : goals.trainDays.length > 0; }
function isGymDate(key) {
  if (goals.rota) return goals.rota.gym.indexOf(cyclePos(key)) >= 0;
  return goals.trainDays.indexOf(weekdayOf(key)) >= 0;
}
// Roughly how many gym days a week a pattern works out as
function rotaPerWeek() { return goals.rota ? goals.rota.gym.length * 7 / goals.rota.len : 0; }

function rotaHtml() {
  const r = goals.rota;
  let html = `<div class="goal-group"><div class="card-label">Shift pattern (optional)</div>
    <div class="chips"><button class="chip${r ? "" : " on"}" data-rota="off">Off</button><button class="chip${r ? " on" : ""}" data-rota="on">On</button></div>`;
  if (!r) return html + `<div class="feed-meta goal-blurb">For shift work that doesn’t follow the week, such as 4 on, 4 off. Your gym and run days then follow your shifts.</div></div>`;
  const chips = function (kind, list, label) {
    let h = "";
    for (let i = 0; i < r.len; i++) h += `<button class="chip${list.indexOf(i) >= 0 ? " on" : ""}" data-rota="${kind}" data-v="${i}">${label(i)}</button>`;
    return h;
  };
  const today = dateKey(new Date());
  html += `<div class="feed-meta goal-blurb">Your gym and run days follow this pattern, so the weekday choices are hidden while it is on.</div>
    <div class="card-label" style="margin-top:.9rem">Days in one full cycle</div>
    <div class="rota-len"><button class="chip" data-rota="len" data-v="-1" aria-label="One day fewer">−</button><b>${r.len}</b><button class="chip" data-rota="len" data-v="1" aria-label="One day more">+</button></div>
    <div class="card-label" style="margin-top:.9rem">Tap the days you work</div>
    <div class="chips">${chips("work", r.work, function (i) { return "Day " + (i + 1); })}</div>
    ${r.work.length ? `<div class="card-label" style="margin-top:.9rem">Tap any that are night shifts</div>
    <div class="chips">${r.work.map(function (i) { return `<button class="chip${r.nights.indexOf(i) >= 0 ? " on" : ""}" data-rota="nights" data-v="${i}">${cycleLabel(i)}</button>`; }).join("")}</div>
    <div class="feed-meta goal-blurb">${r.nights.length ? "Sessions are set lighter on your first day off after nights, and your long run goes on a day you’re rested." : "All day shifts. Mark nights and the app plans around the lost sleep."}</div>` : ""}
    <div class="card-label" style="margin-top:.9rem">Day 1 falls on</div>
    <input type="date" class="inp-date" id="rota-start" value="${r.start}">
    <div class="feed-meta goal-blurb">Any date that is the first day of the cycle. Today is <b style="color:var(--text)">${cycleLabel(cyclePos(today))}</b>.</div>
    <div class="card-label" style="margin-top:.9rem">Gym on</div>
    <div class="chips">${chips("gym", r.gym, cycleLabel)}</div>
    <div class="feed-meta goal-blurb">${r.gym.length ? "About " + fmt(round1(rotaPerWeek())) + " gym sessions a week." : "None picked: train whenever suits you."}${freshestDays().length ? " You’re likely to be freshest on " + freshestDays().map(cycleLabel).join(", ") + "." : ""}</div>
    <div class="card-label" style="margin-top:.9rem">Run on</div>
    <div class="chips">${chips("run", r.run, cycleLabel)}</div>
    <div class="feed-meta goal-blurb">${r.run.length ? "The running coach fits its runs onto these days." : "None picked: the running coach uses your days off, away from the gym where it can."}</div>`;
  return html + `</div>`;
}
function rotaClick(action, v) {
  if (action === "on" && !goals.rota) goals.rota = normRota({ len: 8, work: [0, 1, 2, 3], gym: [4, 5, 7], run: [], start: dateKey(new Date()) });
  else if (action === "off") goals.rota = null;
  else if (goals.rota && action === "len") goals.rota = normRota(Object.assign({}, goals.rota, { len: goals.rota.len + v }));
  else if (goals.rota && (action === "work" || action === "gym" || action === "run" || action === "nights")) {
    const list = goals.rota[action], at = list.indexOf(v);
    if (at >= 0) list.splice(at, 1); else list.push(v);
    goals.rota = normRota(goals.rota);
  }
  // Your weekly goal (used for the streak) follows the pattern
  if (goals.rota && goals.rota.gym.length) goals.days = String(Math.max(2, Math.min(6, Math.round(rotaPerWeek()))));
  save("goals", goals);
  renderGoals();
  refreshPlanAfterGoalChange();
  refreshHome();
}

// Is today a day off? Only if you have fixed your training days and today is not one of them.
function isRestDay() {
  return hasFixedDays() && !isGymDate(dateKey(new Date()));
}
// "Today", or the name of your next training day
function nextSessionLabel() {
  if (!hasFixedDays()) return "Today";
  const today = dateKey(new Date());
  if (isGymDate(today) && !trainedToday()) return "Today";
  for (let i = 1; i <= 28; i++) {
    const key = addDays(today, i);
    if (isGymDate(key)) return i === 1 ? "Tomorrow" : DAY_NAMES[weekdayOf(key)] + (i >= 7 ? " " + Number(key.slice(8)) : "");
  }
  return "Today";
}

// =====================================================================
// SORENESS CHECK-IN
// =====================================================================
// The muscles you said are sore today (it resets each day)
function soreToday() {
  const s = goals.sore;
  return (s && s.date === dateKey(new Date()) && Array.isArray(s.muscles)) ? s.muscles : [];
}

function renderSore() {
  const el = $("sore-row");
  if (!el) return;
  const sore = soreToday();
  const short = { rear: "Rear shoulders", hamstrings: "Hamstrings / glutes" };
  el.innerHTML = `<details${sore.length ? " open" : ""}><summary class="card-label">Anything sore today?${sore.length ? " (" + sore.length + ")" : ""}</summary><div class="chips" style="margin-top:.5rem">` +
    MUSCLES.map(function (m) {
      return `<button class="chip${sore.indexOf(m[0]) >= 0 ? " on" : ""}" data-sore="${m[0]}">${short[m[0]] || m[1]}</button>`;
    }).join("") + `</div><div class="feed-meta" style="margin-top:.4rem">${sore.length ? "Sore muscles get one exercise at most, with a set less." : "Tap a muscle and today’s plan goes easy on it."}</div></details>`;
}

$("sore-row").addEventListener("click", function (e) {
  const b = e.target.closest("[data-sore]");
  if (!b) return;
  const list = soreToday().slice();
  const i = list.indexOf(b.dataset.sore);
  if (i >= 0) list.splice(i, 1); else list.push(b.dataset.sore);
  goals.sore = { date: dateKey(new Date()), muscles: list };
  save("goals", goals);
  renderSore();
  refreshPlanAfterGoalChange();
  $("gen-status").textContent = list.length ? "Got it. Today’s workout goes easy on what’s sore." : "";
});


// =====================================================================
// LOCKED EXERCISES: stay in a session every week
// =====================================================================
function lockedFor(session) { return exPrefs.lock[session] || []; }
function isLocked(session, name) { return lockedFor(session).indexOf(name) >= 0; }
function toggleLock(session, name) {
  const list = lockedFor(session).slice();
  const i = list.indexOf(name);
  if (i >= 0) list.splice(i, 1); else list.push(name);
  if (list.length) exPrefs.lock[session] = list; else delete exPrefs.lock[session];
  save("exPrefs", exPrefs);
}
// Only the split's own sessions can have locks (not routines or custom workouts)
function canLock() { return !workout.fromRoutine && !!plans[workout.name]; }


// =====================================================================
// WARM-UP AND COOLDOWN ROUTINES (guided by the interval timer)
// =====================================================================
const WARM_GENERAL = ["March or jog on the spot", "Arm circles, forward then back", "Hip circles"];
const WARM_UPPER = ["Shoulder blade squeezes", "Wall slides", "Push-up into downward dog", "Thoracic twists on all fours"];
const WARM_LOWER = ["Leg swings, front to back", "Glute bridges", "Bodyweight squats", "Walking lunges with a reach"];
const STRETCHES = {
  chest: "Doorway chest stretch", back: "Child’s pose", rear: "Thread the needle (both sides)", shoulders: "Cross-body shoulder stretch (both sides)",
  biceps: "Wall biceps stretch (both sides)", triceps: "Overhead triceps stretch (both sides)", quads: "Standing quad stretch (both sides)",
  hamstrings: "Seated hamstring stretch", calves: "Wall calf stretch (both sides)", core: "Cobra stretch"
};

// The muscles in today's workout, in order, no repeats
function workoutMuscles() {
  const out = [];
  workout.exercises.forEach(function (ex) {
    const l = library.find(function (q) { return q.name === ex.name; });
    if (l && l.muscle !== "cardio" && out.indexOf(l.muscle) < 0) out.push(l.muscle);
  });
  return out;
}

// kind is "warm" or "cool". Returns { title, secs, moves: [names] }
function guidedRoutine(kind) {
  const m = workoutMuscles();
  const lower = m.some(function (x) { return x === "quads" || x === "hamstrings" || x === "calves"; });
  const upper = m.some(function (x) { return ["chest", "back", "rear", "shoulders", "biceps", "triceps"].indexOf(x) >= 0; });
  if (kind === "warm") {
    let moves = WARM_GENERAL.slice();
    if (upper && lower) moves = moves.concat(WARM_UPPER.slice(0, 2), WARM_LOWER.slice(0, 2));
    else if (lower) moves = moves.concat(WARM_LOWER);
    else moves = moves.concat(WARM_UPPER);
    return { title: "Warm-up", secs: 40, moves: moves, done: "Warm-up done. Start light on your first lift." };
  }
  let moves = m.map(function (x) { return STRETCHES[x]; }).filter(Boolean).slice(0, 6);
  if (!moves.length) moves = [STRETCHES.back, STRETCHES.hamstrings, STRETCHES.chest];
  moves.push("Slow breathing: in for 4, out for 6");
  return { title: "Cooldown", secs: 40, moves: moves, done: "Cooldown done. Good work today." };
}

function guidedPhases(r) {
  const phases = [{ type: "ready", secs: 5, round: 0, name: "Get ready: " + r.moves[0] }];
  r.moves.forEach(function (name, i) { phases.push({ type: "work", secs: r.secs, round: i + 1, name: name }); });
  return phases;
}

function openGuided(kind) {
  const r = guidedRoutine(kind);
  const total = r.moves.length * r.secs;
  openSheet(`<div class="card-label">${r.title} · about ${Math.round(total / 60)} min</div><div class="big">${kind === "warm" ? "Get your body ready" : "Wind down"}</div>
    <p class="feed-meta" style="margin:.5rem 0 .2rem">${kind === "warm" ? "Built for today’s session. Keep it easy: you should feel warm, not tired." : "Stretches for what you trained today. Ease in, never bounce, breathe out as you sink."}</p>
    <ol class="cue-list">${r.moves.map(function (m) { return `<li>${esc(m)} <span class="feed-meta">· ${r.secs} s</span></li>`; }).join("")}</ol>
    <button class="btn" data-a="guided-start" data-kind="${kind}">Start guided ${r.title.toLowerCase()}</button>
    <button class="btn ghost" data-a="hist-close">Close</button>`);
}

function startGuided(kind) {
  const r = guidedRoutine(kind);
  closeSheet();
  $("interval").classList.add("show");
  ivStart({ phases: guidedPhases(r), done: r.done, title: r.title });
}

$("open-warm").addEventListener("click", function () { openGuided("warm"); });
$("open-cool").addEventListener("click", function () { openGuided("cool"); });


// =====================================================================
// PROTEIN TRACKER (Home)
// =====================================================================
let proteinLog = load("protein", {});   // { "2026-11-11": [30, 20, 45] } in grams
if (!proteinLog || typeof proteinLog !== "object" || Array.isArray(proteinLog)) proteinLog = {};

function proteinOn(date) {
  const list = Array.isArray(proteinLog[date]) ? proteinLog[date] : [];
  return list.reduce(function (n, g) { return n + (Number(g) || 0); }, 0);
}
// Your target: the one you set, else about 1.8 g per kg of bodyweight, else 120 g
function proteinTarget() {
  if (goals.proteinTarget > 0) return goals.proteinTarget;
  const bw = latestBodyWeight();
  return bw > 0 ? Math.round(bw * 1.8 / 5) * 5 : 120;
}
function addProtein(grams) {
  grams = Math.round(Number(grams));
  if (!(grams > 0 && grams <= 300)) return false;
  const today = dateKey(new Date());
  if (!Array.isArray(proteinLog[today])) proteinLog[today] = [];
  proteinLog[today].push(grams);
  // Keep the last 120 days so this never grows for ever
  const keys = Object.keys(proteinLog).sort();
  while (keys.length > 120) delete proteinLog[keys.shift()];
  save("protein", proteinLog);
  return true;
}
function undoProtein() {
  const today = dateKey(new Date());
  if (Array.isArray(proteinLog[today]) && proteinLog[today].length) { proteinLog[today].pop(); save("protein", proteinLog); }
}
// How many of the 7 days in a week (0 = this week, 1 = last week) reached the target
function proteinDaysHit(offset, days) {
  const b = periodBounds(offset, days);
  const t = proteinTarget();
  return Object.keys(proteinLog).filter(function (d) { return d >= b.start && d <= b.end && proteinOn(d) >= t; }).length;
}
function proteinLogged() { return Object.keys(proteinLog).some(function (d) { return proteinOn(d) > 0; }); }

function renderProtein() {
  const el = $("protein-card");
  if (!el) return;
  const got = proteinOn(dateKey(new Date()));
  const target = proteinTarget();
  const pct = Math.min(100, Math.round(got / target * 100));
  // The last 7 days, today included
  let hit = 0;
  for (let i = 0; i < 7; i++) { const d = new Date(); d.setDate(d.getDate() - i); if (proteinOn(dateKey(d)) >= target) hit++; }
  const openSet = el.querySelector && el.querySelector("details") && el.querySelector("details").open;
  el.innerHTML = `<div class="up-row now" style="border:0;padding-top:0"><span class="card-label">Protein today</span><b>${got} / ${target} g</b></div>
    <div class="obj-bar"><i style="width:${pct}%"></i></div>
    <div class="chips" style="margin-top:.8rem">
      <button class="chip" data-p="add" data-g="10">+10</button><button class="chip" data-p="add" data-g="20">+20</button>
      <button class="chip" data-p="add" data-g="30">+30</button><button class="chip" data-p="add" data-g="40">+40</button>
      ${got > 0 ? `<button class="chip" data-p="undo">Undo</button>` : ""}
    </div>
    <div class="feed-meta" style="margin-top:.6rem">${got >= target ? "Target reached today. " : ""}${hit} of the last 7 days on target.</div>
    <details${openSet ? " open" : ""} style="margin-top:.5rem"><summary class="feed-meta">Other amount, or change target</summary>
      <div class="btn-row" style="margin-top:.6rem;align-items:center">
        <input class="set-input" id="p-custom" inputmode="numeric" placeholder="grams" style="flex:1">
        <button class="btn ghost" data-p="custom" style="flex:1">Add</button>
      </div>
      <div class="btn-row" style="margin-top:.5rem;align-items:center">
        <input class="set-input" id="p-target" inputmode="numeric" placeholder="target (g)" value="${goals.proteinTarget > 0 ? goals.proteinTarget : ""}" style="flex:1">
        <button class="btn ghost" data-p="target" style="flex:1">Set target</button>
      </div>
      <div class="feed-meta" style="margin-top:.5rem">${goals.proteinTarget > 0 ? "Clear the box and tap Set target to go back to the suggested amount." : "Suggested from " + (latestBodyWeight() > 0 ? "your logged bodyweight (about 1.8 g per kg)" : "a typical figure; log your weight in Progress for a personal one") + ". A common guide for building muscle is 1.6 to 2.2 g per kg."}</div>
    </details>`;
}

$("protein-card").addEventListener("click", function (e) {
  const b = e.target.closest("[data-p]");
  if (!b) return;
  const a = b.dataset.p;
  if (a === "add") addProtein(b.dataset.g);
  if (a === "undo") undoProtein();
  if (a === "custom") { if (!addProtein($("p-custom").value)) { $("p-custom").focus(); return; } }
  if (a === "target") {
    const v = Math.round(Number($("p-target").value));
    goals.proteinTarget = (v >= 20 && v <= 500) ? v : null;
    save("goals", goals);
  }
  renderProtein();
});


// =====================================================================
// WEEKLY REVIEW (Progress > Charts)
// =====================================================================
let reviewWeek = 0;   // 0 = this week so far, 1 = last week

function weekStats(offset, upTo) {
  const b = periodBounds(offset, upTo);
  const history = getHistory();
  const out = { workouts: 0, sets: 0, volume: 0, cardio: cardioMinutes(offset, upTo), prs: 0 };
  const days = {};
  history.forEach(function (w, i) {
    if (w.date < b.start || w.date > b.end) return;
    out.workouts++;
    days[w.date] = true;
    const t = workoutTotals(w);
    out.sets += t.sets;
    out.volume += t.volume;
    out.prs += findPRs(w.exercises, history.slice(0, i)).length;
  });
  out.days = Object.keys(days).length;
  return out;
}

// The muscle furthest below its weekly set target
function behindMuscle(offset) {
  const counts = muscleCounts(offset).counts;
  const tg = weeklyTargets();
  let worst = null;
  MUSCLES.forEach(function (m) {
    const low = tg[m[0]][0];
    const gap = low > 0 ? (low - counts[m[0]]) / low : 0;
    if (gap > 0 && (!worst || gap > worst.gap)) worst = { key: m[0], label: m[1], sets: counts[m[0]], low: low, gap: gap };
  });
  return worst;
}

function renderReview() {
  const el = $("review-card");
  if (!el) return;
  // A week still in progress is compared with last week up to the same day,
  // so Wednesday is not judged against a full seven days.
  const part = reviewWeek === 0 && periodDay() < periodLen() ? periodDay() : undefined;
  const now = weekStats(reviewWeek), prev = weekStats(reviewWeek + 1, part);
  const goalDays = periodGoal(), word = periodWord();
  const diff = function (a, b, fmtFn) {
    if (a === b) return `<span class="rv-d">same</span>`;
    const up = a > b;
    return `<span class="rv-d ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${fmtFn(Math.abs(a - b))}</span>`;
  };
  const n = function (v) { return Math.round(v).toLocaleString(); };
  const vol = function (kg) { return n(toDisp(kg)) + " " + unit(); };
  const row = function (label, value, d) { return `<div class="rv-row"><span>${label}</span><b>${value}</b>${d}</div>`; };

  let html = `<div class="chips" style="margin-bottom:.6rem">
      <button class="chip${reviewWeek === 0 ? " on" : ""}" data-rv="0">This ${word}</button>
      <button class="chip${reviewWeek === 1 ? " on" : ""}" data-rv="1">Last ${word}</button></div>`;
  html += row("Workouts", now.workouts + " <small>/ goal " + goalDays + "</small>", diff(now.workouts, prev.workouts, n));
  html += row("Sets", n(now.sets), diff(now.sets, prev.sets, n));
  html += row("Volume", vol(now.volume), diff(now.volume, prev.volume, vol));
  if (now.cardio || prev.cardio) html += row("Cardio", n(now.cardio) + " min", diff(now.cardio, prev.cardio, function (v) { return n(v) + " min"; }));
  html += row("Records", String(now.prs), diff(now.prs, prev.prs, n));
  const feelNow = avgFeel(reviewWeek), feelPrev = avgFeel(reviewWeek + 1, part);
  if (feelNow !== null) html += row("Session rating", feelNow + " <small>/ 5</small>", feelPrev === null ? `<span class="rv-d"></span>` : diff(feelNow, feelPrev, function (v) { return String(Math.round(v * 10) / 10); }));
  if (proteinLogged()) html += row("Protein target", proteinDaysHit(reviewWeek) + " <small>/ " + periodLen() + " days</small>", diff(proteinDaysHit(reviewWeek), proteinDaysHit(reviewWeek + 1, part), n));

  // One plain sentence on how the week went, and what to do next
  const notes = [];
  if (!now.workouts) notes.push(reviewWeek === 0 ? "No workouts yet this " + word + "." : "No workouts logged that " + word + ".");
  else if (now.days >= goalDays) notes.push(goals.rota ? "Goal hit for the cycle." : "Weekly goal hit.");
  else if (reviewWeek === 0) notes.push((goalDays - now.days) + " more " + (goalDays - now.days === 1 ? "session" : "sessions") + " to hit your goal.");
  else notes.push("You trained " + now.days + " of " + goalDays + " planned days.");
  const b = now.workouts ? behindMuscle(reviewWeek) : null;
  if (b) notes.push("Furthest behind: " + b.label.toLowerCase() + " (" + b.sets + " of " + b.low + " sets)." + (reviewWeek === 0 ? "" : " Give it some extra this " + word + "."));
  html += `<div class="feed-meta" style="margin-top:.7rem">${esc(notes.join(" "))} ${part ? (goals.rota ? "Changes are against last cycle up to day " + part + " of " + periodLen() + "." : "Changes are against last week up to " + DAY_FULL[todayIndex()] + ".") : "Changes are against the " + word + " before."}</div>`;
  el.innerHTML = html;
}

$("review-card").addEventListener("click", function (e) {
  const b = e.target.closest("[data-rv]");
  if (!b) return;
  reviewWeek = Number(b.dataset.rv);
  renderReview();
});


// =====================================================================
// KEEP THE SCREEN ON WHILE TRAINING
// A web app cannot buzz once the phone is locked, so the fix is to stop it locking mid-workout.
// =====================================================================
let screenLock = null;
function wantAwake() {
  if (settings.awake === "off") return false;
  const scr = document.querySelector(".screen.active");
  return focusOn || (!NATIVE && (trk.on || trk.armed)) || restTimer !== null || !!(scr && scr.id === "workout");
}
function syncWake() {
  try {
    if (!navigator.wakeLock) return;
    if (wantAwake() && !screenLock && document.visibilityState === "visible") {
      navigator.wakeLock.request("screen").then(function (l) {
        screenLock = l;
        l.addEventListener("release", function () { screenLock = null; });
      }).catch(function () {});
    } else if (!wantAwake() && screenLock) {
      screenLock.release().catch(function () {});
      screenLock = null;
    }
  } catch (err) { /* older phones: nothing to do */ }
}
// The lock is dropped whenever you leave the app, so ask again when you come back
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible") { syncWake(); if (restTimer) tickRest(); }
});

// Rest ended while the app was in the background? Say so when you come back.
function flashRestOver(lateSecs) {
  const bar = $("rest");
  const lab = document.querySelector("#rest .rest-label");
  if (lab) lab.textContent = "Rest finished";
  $("rest-time").textContent = mmss(lateSecs) + " ago";
  bar.classList.add("show");
  setTimeout(function () { if (!restTimer) bar.classList.remove("show"); }, 4000);
}


// =====================================================================
// FOCUS MODE: one set at a time, big buttons
// =====================================================================
let focusOn = false;
let focusPick = null;     // an exercise you chose to jump to
let focusTimer = null;

// The set to do now: { ei, si }, or null when everything is ticked
function focusTarget() {
  const exs = workout.exercises;
  const undone = function (ex) { return ex.sets.findIndex(function (s) { return !s.done; }); };
  let ei;
  if (focusPick != null && exs[focusPick] && undone(exs[focusPick]) >= 0) ei = focusPick;
  else {
    focusPick = null;
    ei = exs.findIndex(function (ex) { return undone(ex) >= 0; });
    if (ei < 0) return null;
    // In a superset or circuit, go to whichever member is furthest behind
    if (exs[ei].group != null) {
      let best = ei;
      groupIndexes(exs[ei].group).forEach(function (i) {
        if (undone(exs[i]) >= 0 && workingDone(exs[i]) < workingDone(exs[best])) best = i;
      });
      ei = best;
    }
  }
  return { ei: ei, si: undone(exs[ei]) };
}

function focusStep() { return unit() === "lb" ? fromDisp(5) : 2.5; }   // how much + and − change the weight (in kg)

function renderFocus() {
  const el = $("focus-body");
  const t = focusTarget();
  let total = 0, done = 0;
  workout.exercises.forEach(function (ex) { ex.sets.forEach(function (s) { if (!s.warmup) { total++; if (s.done) done++; } }); });
  const head = `<div class="fo-top"><button class="tool" data-fo="exit">✕ Exit</button><span class="feed-meta">${esc(workout.name)} · ${done} of ${total} sets</span></div>`;

  if (!t) {
    el.innerHTML = head + `<div class="fo-mid"><div class="fo-name">Every set ticked</div>
      <p class="feed-meta">${done ? "Nice work. Finish to save it." : "Add some exercises first."}</p></div>
      ${done ? `<button class="btn fo-done" data-fo="finish">Finish workout</button>` : ""}`;
    return;
  }
  const ex = workout.exercises[t.ei], s = ex.sets[t.si];
  const cardio = isCardio(ex.name);
  const working = ex.sets.filter(function (x) { return !x.warmup; }).length;
  const nth = ex.sets.slice(0, t.si + 1).filter(function (x) { return !x.warmup; }).length;
  const prev = (cardio || s.warmup) ? null : lastSetAt(ex.name, nth);

  // Empty boxes start from last time's numbers so one tap is enough
  if (!cardio) {
    if ((s.weight === "" || s.weight == null) && prev && (parseFloat(prev.weight) || 0) > 0) s.weight = parseFloat(prev.weight);
    if (String(s.reps).trim() === "") s.reps = String(prev ? (parseInt(prev.reps) || "") : (parseInt(ex.target) || ""));
  } else if (String(s.mins || "").trim() === "") s.mins = String(parseInt(ex.target) || "");

  const gl = groupLabels()[t.ei];
  const lastText = prev ? "Last time: " + ((parseFloat(prev.weight) || 0) > 0 ? fmtW(prev.weight) + " " + unit() + " × " : "") + (parseInt(prev.reps) || 0) + ((parseFloat(prev.weight) || 0) > 0 ? "" : " reps") : (cardio ? "" : "First time: start light.");
  const more = workout.exercises.filter(function (x) { return x.sets.some(function (q) { return !q.done; }); }).length > 1;
  const row = function (id, label, value, mode) {
    return `<div class="fo-row"><button class="fo-pm" data-fo="dec" data-k="${id}" aria-label="Less ${label}">−</button>
      <div class="fo-val"><input id="fo-${id}" inputmode="${mode}" value="${esc(String(value))}" aria-label="${label}"><span>${label}</span></div>
      <button class="fo-pm" data-fo="inc" data-k="${id}" aria-label="More ${label}">+</button></div>`;
  };

  el.innerHTML = head + `<div class="fo-mid">
      ${gl ? `<div class="grp-tag">${gl.kind} ${gl.tag}</div>` : ""}
      <div class="fo-name">${esc(ex.name)}</div>
      <div class="fo-set">${s.warmup ? "Warm-up set" : "Set " + nth + " of " + working}${cardio ? "" : " · target " + esc(String(ex.target)) + " reps"}</div>
      <div class="feed-meta">${esc(lastText)}</div>
    </div>
    ${cardio ? row("a", "minutes", s.mins, "decimal")
             : row("a", unit(), (s.weight === "" || s.weight == null) ? 0 : fmtW(s.weight), "decimal") + row("b", "reps", s.reps, "numeric")}
    <button class="btn fo-done" data-fo="done">✓ Done</button>
    ${cardio ? "" : `<div class="fo-smart">
      ${voiceAvailable() ? `<button class="tool" data-fo="mic">🎤 Say it</button>` : ""}
      ${repAvailable() ? `<button class="tool${repOn ? " on" : ""}" data-fo="reps">${repOn ? "Stop counting" : "Count my reps (beta)"}</button>` : ""}
    </div>
    <div class="feed-meta fo-voice" id="fo-voice"></div>
    ${repOn ? `<div class="feed-meta fo-voice" id="fo-reps">Counting: start your set. Phone on the bar, or in a pocket that moves with the lift.</div>` : ""}`}
    <div class="fo-rest" id="fo-rest"></div>
    ${more ? `<button class="link-btn" data-fo="later">Do another exercise first ›</button>` : ""}`;
  focusTick();
}

function focusRead() {
  const t = focusTarget();
  if (!t) return null;
  const ex = workout.exercises[t.ei], s = ex.sets[t.si];
  const num = function (id) { const el = $(id); return el ? parseFloat(String(el.value).replace(",", ".")) : NaN; };
  if (isCardio(ex.name)) { const m = num("fo-a"); s.mins = isNaN(m) ? "" : String(m); }
  else {
    const w = num("fo-a"), r = parseInt(($("fo-b") || {}).value);
    s.weight = isNaN(w) || w <= 0 ? "" : Math.round(fromDisp(w) * 1000) / 1000;
    s.reps = isNaN(r) || r <= 0 ? "" : String(r);
  }
  return { ex: ex, s: s, t: t };
}

function focusDone() {
  const r = focusRead();
  if (!r) return;
  completeSet(r);
}
// Ticks a set and starts the rest (used by the Done button and by voice logging)
function completeSet(r) {
  const ex = r.ex, s = r.s;
  if (!isCardio(ex.name) && String(s.reps).trim() === "") s.reps = String(parseInt(ex.target) || "");
  s.done = true;
  if (!workout.startedAt) workout.startedAt = Date.now();
  if (s.warmup) startRest(45);
  else { const rest = restAfterSet(r.t.ei); startRest(rest.secs, rest.label); }
  if (ex.group != null) focusPick = null;   // supersets alternate by themselves
  foldFinished(ex);
  saveWorkout();
  renderWorkout();
  if (focusOn) renderFocus();
}

// The rest countdown inside focus mode (it reads the same timer as the normal rest bar)
function focusTick() {
  const el = $("fo-rest");
  if (!el) return;
  if (restTimer === null) { if (el.innerHTML) el.innerHTML = ""; return; }
  const left = Math.max(0, Math.ceil((restEnd - Date.now()) / 1000));
  const lab = document.querySelector("#rest .rest-label");
  el.innerHTML = `<div><span class="feed-meta">${esc(lab ? lab.textContent : "Rest")}</span><b>${mmss(left)}</b></div>
    <div><button class="tool" data-fo="rest-add">+15s</button><button class="tool" data-fo="rest-skip">Skip rest</button></div>`;
}

function openFocus() {
  focusOn = true;
  focusPick = null;
  $("focus").classList.add("show");
  renderFocus();
  if (!focusTimer) focusTimer = setInterval(focusTick, 300);
  syncWake();
}
function closeFocus() {
  repStop();
  focusOn = false;
  clearInterval(focusTimer);
  focusTimer = null;
  $("focus").classList.remove("show");
  syncWake();
}

$("focus").addEventListener("click", function (e) {
  const b = e.target.closest("[data-fo]");
  if (!b) return;
  const a = b.dataset.fo;
  if (a === "exit") { focusRead(); saveWorkout(); renderWorkout(); closeFocus(); return; }
  if (a === "finish") { closeFocus(); finishWorkout(); return; }
  if (a === "done") { focusDone(); return; }
  if (a === "mic") { focusRead(); voiceLog(); return; }
  if (a === "reps") { focusRead(); repToggle(); return; }
  if (a === "rest-skip") { stopRest(); focusTick(); return; }
  if (a === "rest-add") { restEnd += 15000; focusTick(); return; }
  if (a === "later") {
    const cur = focusRead();
    const n = workout.exercises.length;
    for (let i = 1; i <= n; i++) {
      const j = (cur.t.ei + i) % n;
      if (workout.exercises[j].sets.some(function (s) { return !s.done; })) { focusPick = j; break; }
    }
    saveWorkout();
    renderFocus();
    return;
  }
  if (a === "inc" || a === "dec") {
    const r = focusRead();
    if (!r) return;
    const up = a === "inc" ? 1 : -1;
    if (isCardio(r.ex.name)) r.s.mins = String(Math.max(1, (parseFloat(r.s.mins) || 0) + up));
    else if (b.dataset.k === "a") {
      const kg = Math.max(0, (parseFloat(r.s.weight) || 0) + up * focusStep());
      r.s.weight = kg > 0 ? Math.round(kg * 1000) / 1000 : "";
    } else r.s.reps = String(Math.max(1, (parseInt(r.s.reps) || 0) + up));
    saveWorkout();
    renderFocus();
  }
});
$("open-focus").addEventListener("click", openFocus);


// =====================================================================
// SHORT ON TIME, AND "DO THIS AGAIN"
// =====================================================================
function quickSession() {
  const started = workout.exercises.some(function (ex) { return ex.sets.some(function (s) { return s.done; }); });
  if (started && !confirm("Replace your current workout? Ticked sets will be lost.")) return;
  const plan = buildPlan({ minutes: 20 });
  if (!plan) { $("gen-status").textContent = "Couldn’t build a short workout. Try ticking more equipment."; return; }
  workout = newWorkout(plan);
  saveWorkout();
  renderWorkout();
  if (typeof refreshHome === "function") refreshHome();
  $("gen-status").textContent = "20-minute version of " + plan.name + ". Your usual session length is unchanged.";
}
$("open-quick").addEventListener("click", quickSession);

// Load a workout from History as today's session
function repeatWorkout(index) {
  const w = getHistory()[index];
  if (!w) return;
  const started = workout.exercises.some(function (ex) { return ex.sets.some(function (s) { return s.done; }); });
  if (started && !confirm("Replace your current workout? Ticked sets will be lost.")) return;
  workout = newWorkout({ name: w.name, exercises: w.exercises.map(function (ex) {
    const l = library.find(function (q) { return q.name === ex.name; });
    const reps = l ? prescription(l).reps : "8-12";
    return { name: ex.name, sets: Math.max(1, ex.sets.length), reps: isCardio(ex.name) ? ((ex.sets[0] && ex.sets[0].mins) || 20) + " min" : reps };
  }) });
  workout.fromRoutine = true;   // like a routine, it does not move your split along
  saveWorkout();
  renderAll();
  showTab("workout");
  $("gen-status").textContent = "Loaded “" + w.name + "” from " + w.date + ". It doesn’t move your split along.";
}


// =====================================================================
// HISTORY CALENDAR
// =====================================================================
let calMonth = null;     // first day of the month on show
let feedDay = null;      // a day you tapped: History shows just that day

function renderCalendar() {
  const el = $("cal-card");
  if (!el) return;
  if (!calMonth) { calMonth = new Date(); calMonth.setDate(1); }
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const counts = {};
  getHistory().forEach(function (w) { counts[w.date] = (counts[w.date] || 0) + 1; });
  const first = (new Date(y, m, 1).getDay() + 6) % 7;      // Monday = 0
  const days = new Date(y, m + 1, 0).getDate();
  const today = dateKey(new Date());
  let cells = "", inMonth = 0;
  for (let i = 0; i < first; i++) cells += `<span></span>`;
  for (let d = 1; d <= days; d++) {
    const key = dateKey(new Date(y, m, d));
    const n = counts[key] || 0;
    if (n) inMonth += n;
    cells += n ? `<button class="cal-d on${key === feedDay ? " sel" : ""}${key === today ? " today" : ""}" data-cal="day" data-date="${key}" aria-label="${d}: ${n} workout${n === 1 ? "" : "s"}">${d}</button>`
               : `<span class="cal-d${key === today ? " today" : ""}">${d}</span>`;
  }
  const now = new Date();
  const atNow = y === now.getFullYear() && m === now.getMonth();
  el.innerHTML = `<div class="cal-head"><button class="tool" data-cal="prev" aria-label="Previous month">‹</button>
      <b>${calMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</b>
      <button class="tool" data-cal="next" aria-label="Next month"${atNow ? " disabled" : ""}>›</button></div>
    <div class="cal-grid cal-names">${["M", "T", "W", "T", "F", "S", "S"].map(function (n) { return `<span>${n}</span>`; }).join("")}</div>
    <div class="cal-grid">${cells}</div>
    <div class="feed-meta" style="margin-top:.6rem">${inMonth} workout${inMonth === 1 ? "" : "s"} this month.${inMonth ? " Tap a marked day to see it." : ""}</div>
    ${feedDay ? `<button class="chip on" data-cal="all" style="margin-top:.6rem">Showing ${new Date(feedDay + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · show all</button>` : ""}`;
}

$("cal-card").addEventListener("click", function (e) {
  const b = e.target.closest("[data-cal]");
  if (!b) return;
  const a = b.dataset.cal;
  if (a === "prev") calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1);
  if (a === "next") calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1);
  if (a === "day") feedDay = feedDay === b.dataset.date ? null : b.dataset.date;
  if (a === "all") feedDay = null;
  renderFeed();
});


// =====================================================================
// STRENGTH LEVELS: estimated one-rep max as a multiple of your bodyweight
// Rough guide figures, widely used for adult lifters. Not a medical or competitive standard.
// =====================================================================
const LEVEL_NAMES = ["Beginner", "Novice", "Intermediate", "Advanced", "Elite"];
const STANDARDS = {
  men: {
    "Barbell Bench Press": [0.5, 0.75, 1.25, 1.75, 2.0], "Barbell Back Squat": [0.75, 1.25, 1.5, 2.25, 2.75],
    "Deadlift": [1.0, 1.5, 2.0, 2.5, 3.0], "Overhead Press": [0.35, 0.55, 0.8, 1.1, 1.4], "Barbell Row": [0.5, 0.75, 1.0, 1.5, 1.75]
  },
  women: {
    "Barbell Bench Press": [0.25, 0.5, 0.75, 1.0, 1.5], "Barbell Back Squat": [0.5, 0.75, 1.25, 1.5, 2.0],
    "Deadlift": [0.5, 1.0, 1.25, 1.75, 2.25], "Overhead Press": [0.2, 0.35, 0.5, 0.75, 1.0], "Barbell Row": [0.25, 0.4, 0.65, 0.9, 1.2]
  }
};

// { level: name or null, ratio, next: { name, kg } or null, pct: progress to the next level (0 to 1) }
function strengthLevel(name, bestKg, bw, table) {
  const marks = (STANDARDS[table] || STANDARDS.men)[name];
  if (!marks || !(bw > 0) || !(bestKg > 0)) return null;
  const ratio = bestKg / bw;
  let idx = -1;
  marks.forEach(function (v, i) { if (ratio >= v) idx = i; });
  const lo = idx >= 0 ? marks[idx] : 0;
  const hi = idx < marks.length - 1 ? marks[idx + 1] : null;
  return {
    level: idx >= 0 ? LEVEL_NAMES[idx] : null, ratio: Math.round(ratio * 100) / 100,
    next: hi === null ? null : { name: LEVEL_NAMES[idx + 1], kg: Math.max(0, hi * bw - bestKg) },
    pct: hi === null ? 1 : Math.max(0, Math.min(1, (ratio - lo) / (hi - lo)))
  };
}

function renderLevels() {
  const el = $("levels-card");
  if (!el) return;
  const table = settings.standards === "women" ? "women" : "men";
  const bw = latestBodyWeight();
  let html = `<div class="chips" style="margin-bottom:.7rem">
      <button class="chip${table === "men" ? " on" : ""}" data-std="men">Men’s table</button>
      <button class="chip${table === "women" ? " on" : ""}" data-std="women">Women’s table</button></div>`;
  if (!(bw > 0)) {
    el.innerHTML = html + `<p class="feed-meta">Log your bodyweight in Progress → Body and your levels will show here.</p>`;
    return;
  }
  let any = false;
  Object.keys(STANDARDS.men).forEach(function (name) {
    const best = bestE1rm(name);
    const r = strengthLevel(name, best, bw, table);
    if (!r) return;
    any = true;
    html += `<div class="lv-row"><div class="lv-top"><span>${esc(name)}</span><b>${r.level || "Getting started"}</b></div>
      <div class="obj-bar"><i style="width:${Math.round(r.pct * 100)}%"></i></div>
      <div class="feed-meta">Est. max ${fmtW(best)} ${unit()} (${r.ratio}× bodyweight). ${r.next ? fmtW(r.next.kg) + " " + unit() + " to " + r.next.name + "." : "Top level."}</div></div>`;
  });
  if (!any) html += `<p class="feed-meta">Log a barbell bench press, squat, deadlift, overhead press or row to see your level.</p>`;
  el.innerHTML = html + `<div class="feed-meta" style="margin-top:.6rem">A rough guide from your estimated one-rep max and bodyweight of ${fmtW(bw)} ${unit()}.</div>`;
}

$("levels-card").addEventListener("click", function (e) {
  const b = e.target.closest("[data-std]");
  if (!b) return;
  settings.standards = b.dataset.std;
  save("settings", settings);
  renderLevels();
});


// =====================================================================
// BODYWEIGHT TREND AND ESTIMATE
// =====================================================================
// A straight line through your weigh-ins from the last 4 weeks.
// Returns { perWeek (kg), now (kg, smoothed), days } or null if there is too little to go on.
function weightTrend() {
  const pts = bodyLog.filter(function (e) { return e.weight > 0; });
  if (pts.length < 3) return null;
  const last = pts[pts.length - 1].date;
  const recent = pts.filter(function (e) { return daysBetween(e.date, last) <= 28; });
  if (recent.length < 3) return null;
  const xs = recent.map(function (e) { return -daysBetween(e.date, last); });   // days before the latest entry (0 = latest)
  const span = -xs[0];
  if (span < 7) return null;
  const n = xs.length;
  const mx = xs.reduce(function (a, b) { return a + b; }, 0) / n;
  const my = recent.reduce(function (a, e) { return a + e.weight; }, 0) / n;
  let num = 0, den = 0;
  recent.forEach(function (e, i) { num += (xs[i] - mx) * (e.weight - my); den += (xs[i] - mx) * (xs[i] - mx); });
  if (!den) return null;
  const slope = num / den;                       // kg per day
  return { perWeek: slope * 7, now: my + slope * (0 - mx), days: span };
}

function weightTrendText() {
  const t = weightTrend();
  if (!t) return "";
  const rate = Math.abs(toDisp(t.perWeek));
  let text = rate < 0.05 ? "Trend: holding steady over the last " + Math.round(t.days / 7) + " weeks."
    : "Trend: " + (t.perWeek > 0 ? "up " : "down ") + round1(rate) + " " + unit() + " a week over the last " + Math.max(1, Math.round(t.days / 7)) + " weeks.";
  const target = (goals.targets || []).find(function (x) { return x.type === "weight"; });
  if (target) {
    const gap = Number(target.goal) - t.now;
    if (Math.abs(gap) < 0.3) text += " You are at your target of " + fmtW(target.goal) + " " + unit() + ".";
    else if (rate >= 0.05 && (gap > 0) === (t.perWeek > 0)) {
      const days = Math.round(gap / (t.perWeek / 7));
      if (days <= 730) {
        const d = new Date(); d.setDate(d.getDate() + days);
        text += " At this rate you reach " + fmtW(target.goal) + " " + unit() + " around " + d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: days > 300 ? "numeric" : undefined }) + ".";
      } else text += " At this rate your target of " + fmtW(target.goal) + " " + unit() + " is more than two years away.";
    } else text += " That is moving away from your target of " + fmtW(target.goal) + " " + unit() + ".";
  }
  return text;
}


// =====================================================================
// SESSION RATING AND NOTE (asked on the finish screen, saved with the workout)
// =====================================================================
function updateLastSession(changes) {
  const h = getHistory();
  if (!h.length) return;
  const w = h[h.length - 1];
  Object.keys(changes).forEach(function (k) { w[k] = changes[k]; });
  save("workoutHistory", h);
}
function stars(n) { n = Math.max(0, Math.min(5, Number(n) || 0)); return "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n); }
// Average rating for a week (0 = this week), or null if nothing was rated
function avgFeel(offset, days) {
  const b = periodBounds(offset, days);
  const list = getHistory().filter(function (w) { return w.date >= b.start && w.date <= b.end && w.feel > 0; });
  if (!list.length) return null;
  return Math.round(list.reduce(function (n, w) { return n + w.feel; }, 0) / list.length * 10) / 10;
}


// =====================================================================
// CSV EXPORT: one row per set, opens in any spreadsheet
// =====================================================================
function csvCell(v) {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@]/.test(s) && isNaN(Number(s))) s = "'" + s;          // stops a spreadsheet treating your text as a formula
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function buildCsv() {
  const u = unit(), du = distUnit();
  const rows = [["date", "workout", "exercise", "set", "weight_" + u, "reps", "rpe", "minutes", "distance_" + du, "exercise_note", "session_rating", "session_note"]];
  getHistory().forEach(function (w) {
    w.exercises.forEach(function (ex) {
      ex.sets.forEach(function (s, i) {
        const cardio = isCardio(ex.name);
        rows.push([w.date, w.name, ex.name, i + 1,
          cardio ? "" : ((parseFloat(s.weight) || 0) > 0 ? fmtW(s.weight) : ""), cardio ? "" : (parseInt(s.reps) || ""), s.rpe || "",
          cardio ? (s.mins || "") : "", cardio && (parseFloat(s.dist) || 0) > 0 ? round1(distToDisp(parseFloat(s.dist))) : "",
          ex.note || "", w.feel || "", w.memo || ""]);
      });
    });
  });
  return rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n");
}
function exportCsv() {
  if (!getHistory().length) { alert("No workouts to export yet."); return; }
  const blob = new Blob(["﻿" + buildCsv()], { type: "text/csv;charset=utf-8" });
  fileOut("btb-history-" + dateKey(new Date()) + ".csv", blob, { title: "BTB history" });
}
$("csv-btn").addEventListener("click", exportCsv);


// =====================================================================
// CALCULATOR: one-rep max and what to lift for other rep counts
// =====================================================================
function calcTable(kg, reps) {
  const max = e1rm(kg, reps);
  if (!(max > 0)) return null;
  return { max: max, rows: [1, 3, 5, 8, 10, 12].map(function (r) { return { reps: r, kg: r === 1 ? max : max / (1 + r / 30) }; }) };
}
function renderCalc() {
  const el = $("calc-out");
  if (!el) return;
  const w = parseFloat(String($("calc-w").value).replace(",", ".")), r = parseInt($("calc-r").value);
  const t = (w > 0 && r > 0) ? calcTable(fromDisp(w), r) : null;
  if (!t) { el.innerHTML = `<p class="feed-meta">Type a weight and how many reps you did with it.</p>`; return; }
  el.innerHTML = `<div class="stats" style="margin:.8rem 0"><div class="stat" style="grid-column:1/-1"><div class="stat-num">${fmtW(t.max)} ${unit()}</div><div class="stat-lbl">Estimated one-rep max</div></div></div>` +
    t.rows.map(function (x) { return `<div class="obj-line"><span>${x.reps} rep${x.reps === 1 ? "" : "s"}</span><span>${fmtW(Math.round(x.kg * 2) / 2)} ${unit()}</span></div>`; }).join("") +
    `<div class="feed-meta" style="margin-top:.6rem">An estimate (Epley formula). It is most reliable from sets of 10 reps or fewer.</div>`;
}
function openCalc() {
  openSheet(`<div class="card-label">Calculator</div><div class="big">One-rep max</div>
    <div class="btn-row" style="margin-top:.8rem">
      <div style="flex:1"><div class="card-label">Weight (${unit()})</div><input class="set-input" id="calc-w" inputmode="decimal" placeholder="0"></div>
      <div style="flex:1"><div class="card-label">Reps</div><input class="set-input" id="calc-r" inputmode="numeric" placeholder="0"></div>
    </div>
    <div id="calc-out"></div>
    <button class="btn ghost" data-a="calc-plates">Plate calculator</button>
    <button class="btn" data-a="hist-close">Close</button>`);
  renderCalc();
}
$("open-calc").addEventListener("click", openCalc);


// =====================================================================
// START
// =====================================================================
// First run of v2.4: mark badges you already have as seen, so you are not flooded with notices
if (load("badgesSeen", null) === null) save("badgesSeen", earnedBadgeIds());

function maybeWelcome() {
  if (load("onboarded", false)) return;
  const existing = getHistory().length || localStorage.getItem("selectedEquipment") !== null || localStorage.getItem("goals") !== null;
  if (existing) save("onboarded", true);   // you were here before the welcome existed
  else openWelcome();
}

// =====================================================================
// RUN: GPS tracking for runs, rides and walks, plus a running coach.
//
// How it fits together:
//   - "runs" is the list of finished runs (distance in km, time in seconds,
//     and a slimmed-down copy of the route).
//   - "trk" is the run happening right now. GPS points come in through
//     trackPoint(), a once-a-second clock calls trackTick(), and both ask
//     trackEvents() whether anything should be said out loud.
//   - "runPlan" is the coach. Only your choices are saved (goal, runs per
//     week, 5K time); the weeks are worked out fresh each time by
//     planWeeks(), so changing your 5K time updates every pace at once.
//
// A web app only receives GPS while the screen is on, so the screen is
// kept awake during a run and there is a lock to stop accidental taps.
// =====================================================================

const RUN_TYPES = { run: { label: "Run", verb: "run", max: 30 }, ride: { label: "Ride", verb: "ride", max: 90 }, walk: { label: "Walk", verb: "walk", max: 15 } };

function saveRuns() { save("runs", runs); }
function saveRunPrefs() { save("runPrefs", runPrefs); }
function saveRunPlan() { if (runPlan) save("runPlan", runPlan); else { try { localStorage.removeItem("runPlan"); } catch (err) {} } }

// ---------- numbers and words ----------
// Distance between two GPS points in km (the "haversine" formula)
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// 3725 -> "1:02:05", 345 -> "5:45"
function runClock(secs) {
  const s = Math.max(0, Math.round(secs));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(r).padStart(2, "0");
}
// "28:30" or "1:02:05" -> seconds (0 if it can't be read)
function parseClock(text) {
  const parts = String(text || "").trim().split(":").map(function (p) { return parseFloat(p.replace(",", ".")); });
  if (!parts.length || parts.length > 3 || parts.some(function (n) { return !isFinite(n) || n < 0; })) return 0;
  return Math.round(parts.reduce(function (total, n) { return total * 60 + n; }, 0) * (parts.length === 1 ? 60 : 1));
}
// Pace is stored as seconds per km and shown per km or per mile to match your units
function paceStr(secPerKm) {
  if (!(secPerKm > 0) || !isFinite(secPerKm)) return "–:––";
  return runClock(secPerKm / distToDisp(1));
}
function paceUnit() { return "/" + distUnit(); }
function speedStr(km, secs) { return secs > 0 ? round1(distToDisp(km) / (secs / 3600)) + (distUnit() === "mi" ? " mph" : " km/h") : "–"; }
function dist2(km) { return (Math.round(distToDisp(km) * 100) / 100).toFixed(2); }

// Spoken versions
function sayDur(secs) {
  const s = Math.round(secs), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const bits = [];
  if (h) bits.push(h + (h === 1 ? " hour" : " hours"));
  if (m) bits.push(m + (m === 1 ? " minute" : " minutes"));
  if (r || !bits.length) bits.push(r + (r === 1 ? " second" : " seconds"));
  return bits.join(" ");
}
function sayUnit(n) { const one = distUnit() === "mi" ? "mile" : "kilometre"; return fmt(n) + " " + one + (n === 1 ? "" : "s"); }
function sayPace(secPerKm) {
  const s = Math.round(secPerKm / distToDisp(1));
  return Math.floor(s / 60) + " " + String(s % 60).padStart(2, "0") + " per " + (distUnit() === "mi" ? "mile" : "kilometre");
}
function sayKm(km) { return km < 1 ? Math.round(km * 1000) + " metres" : sayUnit(Math.round(distToDisp(km) * 10) / 10); }

// Riegel's formula: predicts a time over a new distance from a known one
function riegel(secs, fromKm, toKm) { return secs * Math.pow(toKm / fromKm, 1.06); }

// ---------- the route, kept small ----------
// At most 250 points, each stored as a whole number of 1/100000ths of a degree
// (about a metre) and as the change from the point before, so a run takes ~2 KB.
function encodeRoute(pts) {
  if (!pts.length) return [];
  const step = Math.max(1, Math.ceil(pts.length / 250));
  const keep = pts.filter(function (p, i) { return i % step === 0 || i === pts.length - 1; });
  const out = [];
  let pLat = 0, pLng = 0;
  keep.forEach(function (p) {
    const lat = Math.round(p[0] * 1e5), lng = Math.round(p[1] * 1e5);
    out.push(lat - pLat, lng - pLng);
    pLat = lat; pLng = lng;
  });
  return out;
}
// The clock time (seconds from the start) of each stored route point, thinned the same way
function encodeTimes(times) {
  if (!times.length) return [];
  const step = Math.max(1, Math.ceil(times.length / 250));
  const out = [];
  let prev = 0;
  times.forEach(function (t, i) { if (i % step === 0 || i === times.length - 1) { out.push(t - prev); prev = t; } });
  return out;
}
function decodeTimes(enc) {
  let t = 0;
  return (enc || []).map(function (d) { t += d; return t; });
}

// ----- best efforts: your fastest 1 km, 5 km, 10 km and half marathon inside a run -----
const BEST_DISTS = [["1", 1, "1 km"], ["5", 5, "5 km"], ["10", 10, "10 km"], ["21", 21.0975, "Half marathon"]];
// marks = [[km so far, seconds so far], ...]. For each distance, slides a window along
// the run and keeps the quickest. Gives back e.g. { "1": 287, "5": 1502 }.
function bestEfforts(marks) {
  const out = {};
  if (!marks || marks.length < 2) return out;
  const total = marks[marks.length - 1][0];
  BEST_DISTS.forEach(function (bd) {
    const D = bd[1];
    if (total < D) return;
    let best = Infinity, i = 0;
    for (let j = 1; j < marks.length; j++) {
      const from = marks[j][0] - D;
      if (from < 0) continue;
      while (i + 1 < marks.length && marks[i + 1][0] <= from) i++;
      const a = marks[i], b = marks[Math.min(i + 1, marks.length - 1)];
      const t0 = b[0] > a[0] ? a[1] + (b[1] - a[1]) * (from - a[0]) / (b[0] - a[0]) : a[1];   // the time you passed "from"
      best = Math.min(best, marks[j][1] - t0);
    }
    if (isFinite(best) && best > 0) out[bd[0]] = Math.round(best);
  });
  return out;
}
// Your quickest for each distance over every run (not rides or walks)
function runBests(exceptId) {
  const out = {};
  runs.forEach(function (r) {
    if (r.type !== "run" || !r.best || r.id === exceptId) return;
    Object.keys(r.best).forEach(function (k) { if (!out[k] || r.best[k] < out[k].secs) out[k] = { secs: r.best[k], date: r.date, id: r.id }; });
  });
  return out;
}

function decodeRoute(enc) {
  const out = [];
  let lat = 0, lng = 0;
  for (let i = 0; i + 1 < (enc || []).length; i += 2) {
    lat += enc[i]; lng += enc[i + 1];
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

// ---------- the map ----------
// Street map squares ("tiles") come from OpenStreetMap when you're online.
// The route line is drawn by the app itself, so it shows even with no signal.
const MAP_W = 480, MAP_H = 230;
function mapProj(lat, lng, z) {
  const size = 256 * Math.pow(2, z), r = lat * Math.PI / 180;
  return [(lng + 180) / 360 * size, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * size];
}
// Picks the closest zoom that still fits the whole route in the middle of the box
function mapView(pts) {
  let z = 17, a, b;
  const lats = pts.map(function (p) { return p[0]; }), lngs = pts.map(function (p) { return p[1]; });
  const n = Math.max.apply(null, lats), s = Math.min.apply(null, lats), w = Math.min.apply(null, lngs), e = Math.max.apply(null, lngs);
  for (; z > 2; z--) {
    a = mapProj(n, w, z); b = mapProj(s, e, z);
    if (b[0] - a[0] <= 250 && b[1] - a[1] <= MAP_H - 60) break;
  }
  a = mapProj(n, w, z); b = mapProj(s, e, z);
  return { z: z, x0: (a[0] + b[0]) / 2 - MAP_W / 2, y0: (a[1] + b[1]) / 2 - MAP_H / 2 };
}
function mapInView(p, v) {
  const q = mapProj(p[0], p[1], v.z), x = q[0] - v.x0, y = q[1] - v.y0;
  return x > MAP_W / 2 - 130 && x < MAP_W / 2 + 130 && y > 25 && y < MAP_H - 25;
}
function mapTiles(v) {
  let html = "";
  const max = Math.pow(2, v.z);
  for (let tx = Math.floor(v.x0 / 256); tx * 256 < v.x0 + MAP_W; tx++) {
    for (let ty = Math.floor(v.y0 / 256); ty * 256 < v.y0 + MAP_H; ty++) {
      if (ty < 0 || ty >= max) continue;
      const wx = ((tx % max) + max) % max;
      html += `<img class="map-tile" alt="" draggable="false" src="https://tile.openstreetmap.org/${v.z}/${wx}/${ty}.png" style="left:${Math.round(tx * 256 - v.x0)}px;top:${Math.round(ty * 256 - v.y0)}px">`;
    }
  }
  return html;
}
function mapLine(pts, v) {
  if (!pts.length) return "";
  const xy = pts.map(function (p) { const q = mapProj(p[0], p[1], v.z); return [Math.round((q[0] - v.x0) * 10) / 10, Math.round((q[1] - v.y0) * 10) / 10]; });
  const first = xy[0], last = xy[xy.length - 1];
  return `<svg class="map-line" viewBox="0 0 ${MAP_W} ${MAP_H}" width="${MAP_W}" height="${MAP_H}">
    <polyline points="${xy.map(function (q) { return q.join(","); }).join(" ")}"/>
    <circle class="m-start" cx="${first[0]}" cy="${first[1]}" r="5"/><circle class="m-end" cx="${last[0]}" cy="${last[1]}" r="6"/></svg>`;
}
function mapHtml(pts) {
  if (!pts.length) return `<div class="map empty"><span>The route appears here once GPS has a fix.</span></div>`;
  const v = mapView(pts);
  return `<div class="map"><div class="map-in"><div class="map-tiles">${mapTiles(v)}</div>${mapLine(pts, v)}</div><span class="map-credit">© OpenStreetMap</span></div>`;
}
// A tiny outline of the route for the list of runs (no street map)
function routeThumb(pts) {
  if (pts.length < 2) return `<svg class="thumb" viewBox="0 0 40 40"></svg>`;
  const v = mapView(pts);
  const xy = pts.map(function (p) { return mapProj(p[0], p[1], v.z); });
  const xs = xy.map(function (q) { return q[0]; }), ys = xy.map(function (q) { return q[1]; });
  const x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
  const span = Math.max(Math.max.apply(null, xs) - x0, Math.max.apply(null, ys) - y0, 1), k = 32 / span;
  const ox = (40 - (Math.max.apply(null, xs) - x0) * k) / 2, oy = (40 - (Math.max.apply(null, ys) - y0) * k) / 2;
  return `<svg class="thumb" viewBox="0 0 40 40"><polyline points="${xy.map(function (q) { return round1(ox + (q[0] - x0) * k) + "," + round1(oy + (q[1] - y0) * k); }).join(" ")}"/></svg>`;
}

// ---------- the voice ----------
function runSay(text) {
  if (!text) return;
  trk.said.push(text);
  trk.lastSaid = text;
  if (runPrefs.voice !== "on") return;
  if (NATIVE) {                      // the phone's own voice: works with the screen off
    nativeCall("TextToSpeech", "speak", { text: text, lang: "en-GB", rate: 1.0, pitch: 1.0, volume: 1.0, queueStrategy: 1 })
      .catch(function (err) { nativeNote = "Voice: " + (err && err.message ? err.message : "not available"); });
    return;
  }
  try {
    if (typeof speechSynthesis === "undefined" || typeof SpeechSynthesisUtterance === "undefined") return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1; u.lang = "en-GB";
    speechSynthesis.speak(u);
  } catch (err) { /* the voice is optional */ }
}
function runAlert() { ivBeep(880, 250); ivBuzz([250, 120, 250, 120, 400]); }

// ---------- the run in progress ----------
function newTrack() {
  return { armed: false, on: false, paused: false, locked: false, type: "run", title: "", goal: "free", goalKm: 0, goalSecs: 0, outBack: false,
           startMs: 0, pausedMs: 0, pauseAt: 0, dist: 0, pts: [], last: null, acc: null, gps: "wait", gaps: 0,
           nextCue: 0, splits: [], splitAt: 0, turned: false, goalDone: false,
           steps: null, stepIdx: 0, stepKm0: 0, stepSecs0: 0, session: null,
           auto: false, lastMove: 0, ptT: [], marks: [], ghost: null, ghostOff: 0,
           said: [], lastSaid: "", watchId: null, timer: null, view: null, lastSave: 0 };
}
trk = newTrack();

function trackElapsed(now) {
  if (!trk.on) return 0;
  return Math.max(0, (now - trk.startMs - trk.pausedMs - (trk.paused ? now - trk.pauseAt : 0)) / 1000);
}
function cueEvery() { return runPrefs.cues === "off" ? 0 : (parseFloat(runPrefs.cues) || 1); }

// What is the whole outing meant to add up to? Used for the halfway turn-around.
function trackTarget() {
  if (trk.steps) {
    const timed = trk.steps.some(function (s) { return !s.km; });
    return timed ? { secs: sessionSecs(trk.steps) } : { km: trk.steps.reduce(function (n, s) { return n + s.km; }, 0) };
  }
  if (trk.goal === "dist" && trk.goalKm > 0) return { km: trk.goalKm };
  if (trk.goal === "time" && trk.goalSecs > 0) return { secs: trk.goalSecs };
  return null;
}

function stepLabel(s) {
  const what = { warm: "Warm up", cool: "Cool down", fast: "Fast", recover: "Recover", tempo: "Tempo", easy: "Easy", long: "Long run", race: "Race pace" }[s.kind] || "Run";
  return what + (s.of ? " " + s.n + " of " + s.of : "");
}
function stepSay(s) {
  const size = s.km ? sayKm(s.km) : sayDur(s.secs);
  const how = { warm: "Warm up, easy jog for " + size, cool: "Cool down, easy jog for " + size, recover: "Recover. Walk or jog for " + size,
                fast: "Fast" + (s.of ? " " + s.n + " of " + s.of : "") + ", " + size, tempo: "Tempo, comfortably hard, for " + size,
                easy: "Easy run, " + size, long: "Long run, " + size, race: "Race pace, " + size }[s.kind] || size;
  return how + (s.pace && s.kind !== "warm" && s.kind !== "cool" && s.kind !== "recover" ? ". Target pace " + sayPace((s.pace[0] + s.pace[1]) / 2) : "") + ".";
}
function stepLeft(now) {
  const s = trk.steps && trk.steps[trk.stepIdx];
  if (!s) return null;
  return s.km ? { km: Math.max(0, s.km - (trk.dist - trk.stepKm0)) } : { secs: Math.max(0, s.secs - (trackElapsed(now) - trk.stepSecs0)) };
}

// Looks at where the run has got to and says whatever is due. Called on every
// GPS point and every second. Each thing is said once: the flags remember.
function trackEvents(now) {
  if (!trk.on || trk.paused) return;

  // 0. Auto-pause: no real movement for 10 seconds stops the clock, until you move again.
  //    Not during a timed part of a coach session (a standing recovery is still a recovery).
  const stepNow = trk.steps && trk.steps[trk.stepIdx];
  if (runPrefs.autoPause !== "off" && trk.dist > 0.03 && trk.lastMove && now - trk.lastMove > 10000 && !(stepNow && !stepNow.km)) {
    trk.paused = true; trk.auto = true;
    trk.pauseAt = Math.min(now, trk.lastMove + 3000);     // the clock stops from just after you last moved
    runSay("Auto paused.");
    trackShell();
    return;
  }
  const secs = trackElapsed(now);

  // 1. Coach session: move on to the next part
  while (trk.steps && trk.stepIdx < trk.steps.length) {
    const left = stepLeft(now);
    if ((left.km !== undefined ? left.km : left.secs) > 0.0005) break;
    trk.stepIdx++;
    trk.stepKm0 = trk.dist; trk.stepSecs0 = secs;
    if (trk.stepIdx < trk.steps.length) { ivBeep(660, 200); ivBuzz([200, 100, 200]); runSay(stepSay(trk.steps[trk.stepIdx])); }
    else if (!trk.goalDone) { trk.goalDone = true; runAlert(); runSay("Session complete. " + sayKm(trk.dist) + " in " + sayDur(secs) + ". Well done."); }
  }

  // 2. Halfway on an out-and-back
  const target = trackTarget();
  if (trk.outBack && !trk.turned && target) {
    const atHalf = target.km ? trk.dist >= target.km / 2 : secs >= target.secs / 2;
    if (atHalf) { trk.turned = true; runAlert(); runSay("Halfway. Turn around now and head back."); }
  }

  // 3. Every kilometre or mile (or half)
  const every = cueEvery(), unitDist = distToDisp(trk.dist);
  while (unitDist >= trk.splits.length + 1) {            // a full unit: remember how long it took
    trk.splits.push(Math.round(secs - trk.splitAt));
    trk.splitAt = secs;
  }
  if (every && unitDist >= trk.nextCue) {
    const mark = trk.nextCue;
    trk.nextCue = Math.round((Math.floor(unitDist / every) * every + every) * 100) / 100;
    let line = sayUnit(mark) + ". Time " + sayDur(secs) + ". ";
    if (trk.type === "ride") line += "Average speed " + speedStr(trk.dist, secs).replace("km/h", "kilometres an hour").replace("mph", "miles an hour") + ".";
    else {
      line += "Average pace " + sayPace(secs / trk.dist) + ".";
      const gap = ghostGap(now);
      if (gap !== null) line += " " + ghostWords(gap);
      const lastSplit = trk.splits.length && mark === trk.splits.length ? trk.splits[trk.splits.length - 1] * distToDisp(1) : 0;   // seconds per km
      const step = trk.steps && trk.steps[trk.stepIdx];
      if (lastSplit && step && step.pace) {
        if ((step.kind === "easy" || step.kind === "long") && lastSplit < step.pace[0] * 0.97) line += " That is faster than easy pace. Ease back to around " + sayPace(step.pace[0]) + ".";
        else if ((step.kind === "tempo" || step.kind === "race") && lastSplit > step.pace[1] * 1.04) line += " A little behind target. Aim for " + sayPace(step.pace[1]) + ".";
        else if ((step.kind === "tempo" || step.kind === "race") && lastSplit < step.pace[0] * 0.96) line += " Faster than target. Hold back a little.";
        else if (step.kind !== "fast" && step.kind !== "recover" && step.kind !== "warm" && step.kind !== "cool") line += " On target.";
      }
    }
    runSay(line);
  }

  // 4. Your own distance or time goal
  if (!trk.steps && !trk.goalDone && target) {
    if (target.km ? trk.dist >= target.km : secs >= target.secs) {
      trk.goalDone = true; runAlert();
      runSay("Goal reached. " + sayKm(trk.dist) + " in " + sayDur(secs) + ".");
    }
  }
}

// One GPS reading. acc = how sure the phone is, in metres (smaller is better).
function trackPoint(lat, lng, acc, now) {
  if (!trk.armed && !trk.on) return;
  trk.acc = acc;
  if (!(acc <= 35)) { trk.gps = "weak"; return; }       // too vague to trust
  trk.gps = "ok";
  if (!trk.on) { trk.last = { lat: lat, lng: lng, t: now }; if (!trk.pts.length) trk.pts = [[lat, lng]]; else trk.pts[0] = [lat, lng]; return; }
  if (trk.paused && trk.auto) {
    // Auto-paused: a clear move of 8 m or more (not GPS wobble) starts the clock again
    if (!(trk.last && acc <= 20 && haversine(trk.last.lat, trk.last.lng, lat, lng) >= 0.008)) return;
    trackResume(now);
  }
  if (trk.paused || !trk.last) { trk.last = { lat: lat, lng: lng, t: now }; return; }

  const d = haversine(trk.last.lat, trk.last.lng, lat, lng);
  const dt = (now - trk.last.t) / 1000;
  if (d < 0.004) return;                                   // under 4 m: standing still, or GPS wobble
  if (dt > 0 && d / dt * 3600 > RUN_TYPES[trk.type].max) { // faster than you could be going: a GPS jump
    if (dt > 15) trk.last = { lat: lat, lng: lng, t: now };  // it has stayed "jumped" for a while, so carry on from here
    return;
  }
  trk.dist += d;
  trk.pts.push([lat, lng]);
  trk.ptT.push(Math.round((now - trk.startMs) / 1000));                    // clock time of each point, for exporting
  trk.lastMove = now;
  ghostCheck(lat, lng);
  const lastMark = trk.marks[trk.marks.length - 1];
  if (!lastMark || trk.dist - lastMark[0] >= 0.02) trk.marks.push([Math.round(trk.dist * 1000) / 1000, Math.round(trackElapsed(now) * 10) / 10]);
  trk.last = { lat: lat, lng: lng, t: now };
  trackEvents(now);
}

// One reading from either kind of GPS. Also runs the clock-based checks, because
// with the phone locked the once-a-second timer can be slowed down by Android.
function gpsReading(lat, lng, acc) {
  const now = Date.now();
  trackPoint(lat, lng, acc, now);
  if (trk.on) { trackEvents(now); trackAutosave(now); }
  if (document.visibilityState !== "hidden") trackPaint(now);
}
function trackAutosave(now) {
  if (trk.on && now - trk.lastSave > 15000) { trk.lastSave = now; save("runLive", trackRecord(now)); }   // in case the app is closed mid-run
}

function gpsStart() {
  if (NATIVE) {
    // Android 13+ needs permission to show the "BTB is tracking" notification
    nativeCall("LocalNotifications", "requestPermissions", {}).catch(function () {});
    trk.watchId = nativeCall("BackgroundGeolocation", "addWatcher",
      { backgroundTitle: "BTB is tracking", backgroundMessage: "Recording your " + RUN_TYPES[trk.type].verb + ". Open BTB to pause or finish.",
        requestPermissions: true, stale: false, distanceFilter: 0 },
      function (loc, err) {
        if (err) { trk.gps = err.code === "NOT_AUTHORIZED" ? "denied" : "weak"; nativeNote = "GPS: " + (err.message || err.code || "error"); trackPaint(); return; }
        if (loc) gpsReading(loc.latitude, loc.longitude, loc.accuracy);
      });
    trk.watchId.catch(function (err) { trk.gps = "none"; nativeNote = "GPS: " + (err && err.message ? err.message : "could not start"); trackPaint(); });
    return;
  }
  if (typeof navigator === "undefined" || !navigator.geolocation) { trk.gps = "none"; return; }
  try {
    trk.watchId = navigator.geolocation.watchPosition(
      function (pos) { gpsReading(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy); },
      function (err) { trk.gps = err && err.code === 1 ? "denied" : "weak"; trackPaint(); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  } catch (err) { trk.gps = "none"; }
}
function gpsStop() {
  if (NATIVE) {
    const w = trk.watchId;
    if (w && w.then) w.then(function (id) { return nativeCall("BackgroundGeolocation", "removeWatcher", { id: id }); }).catch(function () {});
    nativeCall("TextToSpeech", "stop", {}).catch(function () {});
    trk.watchId = null;
    return;
  }
  try { if (trk.watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(trk.watchId); } catch (err) {}
  trk.watchId = null;
}
function gpsText() {
  return { wait: "Finding GPS…", ok: "GPS ready" + (trk.acc ? " (±" + Math.round(trk.acc) + " m)" : ""), weak: "Weak GPS signal. Move into the open.",
           denied: NATIVE ? "Location is blocked. Open your phone’s Settings, Apps, BTB, Permissions and allow Location." : "Location is blocked. Allow location for this site in your browser settings.",
           none: NATIVE ? "The phone’s GPS service did not start." : "This browser has no GPS. You can still log a run by hand." }[trk.gps]
         + (NATIVE && nativeNote ? " (" + nativeNote + ")" : "");
}

// Step 1: open the run screen and start listening for GPS. The clock has not started.
function trackArm(opts) {
  opts = opts || {};
  trk = newTrack();
  trk.armed = true;
  trk.type = opts.steps ? "run" : runPrefs.type;
  trk.steps = opts.steps || null;
  trk.session = opts.session || null;
  trk.title = opts.title || RUN_TYPES[trk.type].label;
  trk.goal = opts.steps ? "plan" : runPrefs.goal;
  trk.goalKm = runPrefs.km;
  trk.goalSecs = runPrefs.mins * 60;
  trk.outBack = !!runPrefs.outBack;
  $("track").classList.add("show");
  trackShell();
  gpsStart();
  syncWake();
}
// Step 2: the clock starts
function trackGo(now) {
  if (!trk.armed || trk.on) return;
  trk.on = true; trk.armed = false;
  trk.startMs = now;
  trk.nextCue = cueEvery();
  trk.lastMove = now;
  trk.ptT = trk.pts.map(function () { return 0; });
  trk.marks = [[0, 0]];
  if (trk.last) trk.last.t = now;
  trk.timer = setInterval(function () { trackTick(Date.now()); }, 1000);
  ivBeep(880, 200);
  // Started somewhere you have run from before? Race your best run from here.
  if (!trk.steps && runPrefs.ghost !== "off" && trk.last) trk.ghost = ghostFor(trk.last.lat, trk.last.lng, trk.type);
  runSay(trk.steps ? trk.title + ". " + stepSay(trk.steps[0])
    : "Starting " + RUN_TYPES[trk.type].verb + "." + (trk.ghost ? " Racing your best from here: " + sayKm(trk.ghost.total) + " in " + sayDur(Math.round(trk.ghost.secs)) + "." : ""));
  trackShell();
}
function trackPause(now) { if (trk.on && !trk.paused) { trk.paused = true; trk.auto = false; trk.pauseAt = now; runSay("Paused."); trackShell(); } }
function trackResume(now) {
  if (!trk.on || !trk.paused) return;
  trk.pausedMs += now - trk.pauseAt; trk.paused = false; trk.auto = false; trk.last = null; trk.lastMove = now;
  runSay("Resumed."); trackShell();
}
function trackTick(now) {
  trackEvents(now);
  trackPaint(now);
  trackAutosave(now);
}

// The finished run, as it is stored
function trackRecord(now) {
  const secs = Math.round(trackElapsed(now));
  return { id: "r" + trk.startMs, date: dateKey(new Date(trk.startMs)), type: trk.type, title: trk.title,
           km: Math.round(trk.dist * 1000) / 1000, secs: secs, splits: trk.splits.slice(), unit: distUnit(),
           route: encodeRoute(trk.pts), rt: encodeTimes(trk.ptT), best: bestEfforts(trk.marks), vs: ghostResult(trk.marks), session: trk.session, gaps: trk.gaps };
}
function trackClose() {
  gpsStop();
  if (trk.timer !== null) clearInterval(trk.timer);
  try { if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); } catch (err) {}
  trk = newTrack();
  $("track").classList.remove("show");
  try { localStorage.removeItem("runLive"); } catch (err) {}
  syncWake();
}
function trackFinish(now) {
  if (!trk.on) { trackClose(); return null; }
  if (trk.dist < 0.05 && !confirm("Hardly any distance was recorded. Save this " + RUN_TYPES[trk.type].verb + " anyway?")) { trackClose(); renderRun(); return null; }
  const rec = trackRecord(now);
  trackClose();
  storeRun(rec);
  openRunDetail(rec.id, true);
  return rec;
}

// Adds a run to your records and tells the rest of the app
function storeRun(rec) {
  if (rec.type === "run" && rec.best) {                       // which of this run's efforts beat your records?
    const old = runBests(rec.id);
    rec.pb = Object.keys(rec.best).filter(function (k) { return !old[k] || rec.best[k] < old[k].secs; });
  }
  runs.push(rec);
  runs.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  saveRuns();
  addWorkoutDate(rec.date);
  if (runPlan && rec.session) { runPlan.done[rec.session] = rec.id; }
  if (runPlan && rec.type === "run" && rec.km >= 3) {         // a quicker run than the plan expects? offer faster paces
    const est = Math.round(riegel(rec.secs, rec.km, 5));
    if (est < runPlan.t5 * 0.98) runPlan.suggest = est;
  }
  saveRunPlan();
  refreshHome();
  renderRun();
}

// ---------- the live screen ----------
function trackShell() {
  const el = $("track-body");
  const ride = trk.type === "ride";
  if (trk.armed) {
    el.innerHTML = `<div class="fo-top"><div><div class="card-label">${esc(RUN_TYPES[trk.type].label)}</div><div class="big">${esc(trk.title)}</div></div>
        <button class="link-btn" data-tk="cancel">Cancel</button></div>
      <div class="tk-gps" id="tk-gps"></div>
      <div id="tk-map">${mapHtml(trk.pts)}</div>
      ${trk.steps ? `<div class="tk-plan">${trk.steps.map(function (s) { return `<div class="pr-row"><span>${stepLabel(s)}</span><span class="feed-meta">${s.km ? fmtKm(s.km) : runClock(s.secs)}${s.pace ? " · " + paceStr(s.pace[0]) + "–" + paceStr(s.pace[1]) + paceUnit() : ""}</span></div>`; }).join("")}</div>` : ""}
      <div class="feed-meta">${NATIVE
        ? "You can lock your phone and put it away: BTB keeps tracking and talking. A notification shows while it records."
        : "Keep the screen on while you " + RUN_TYPES[trk.type].verb + ": GPS stops if the phone is locked. BTB keeps it awake for you, and Lock stops accidental taps."}${trk.outBack ? " You’ll be told when to turn around." : ""}</div>
      <button class="btn fo-done" data-tk="go">Start</button>`;
    trackPaint(Date.now());
    return;
  }
  el.innerHTML = `<div class="fo-top"><div><div class="card-label" id="tk-gps"></div><div class="big">${esc(trk.title)}</div></div>
      <button class="tool" data-tk="lock">Lock</button></div>
    <div class="tk-main"><b id="tk-dist">0.00</b><span>${distUnit()}</span></div>
    <div class="tk-stats">
      <div><b id="tk-time">0:00</b><span>Time</span></div>
      <div><b id="tk-pace">–</b><span>${ride ? "Avg speed" : "Avg pace " + paceUnit()}</span></div>
      <div><b id="tk-split">–</b><span>${ride ? "This " + distUnit() : "This " + distUnit() + " " + paceUnit()}</span></div>
    </div>
    <div class="tk-step" id="tk-step"></div>
    <div class="tk-ghost" id="tk-ghost"></div>
    <div id="tk-map">${mapHtml(trk.pts)}</div>
    <div class="feed-meta tk-said" id="tk-said"></div>
    <div class="btn-row" id="tk-btns">${trk.paused
      ? `<button class="btn" data-tk="resume">Resume</button><button class="btn ghost" data-tk="finish">Finish</button>`
      : `<button class="btn ghost" data-tk="pause">Pause</button>`}</div>
    ${trk.paused && trk.auto ? `<div class="feed-meta" style="text-align:center">Auto-paused. Start moving and the clock carries on.</div>` : ""}
    ${trk.paused ? `<button class="link-btn" data-tk="discard">Discard this ${RUN_TYPES[trk.type].verb}</button>` : ""}
    <div class="tk-lock${trk.locked ? " show" : ""}" id="tk-lock"><div><b>Locked</b><span>Press and hold to unlock</span><button class="btn" id="tk-unlock">Hold to unlock</button></div></div>`;
  trk.view = null;
  trackPaint(Date.now());
}
function fmtKm(km) { return km < 1 ? Math.round(km * 1000) + " m" : fmt(Math.round(distToDisp(km) * 100) / 100) + " " + distUnit(); }

// Updates the numbers without rebuilding the screen (so the map doesn't flicker)
function trackPaint(now) {
  if (!trk.armed && !trk.on) return;
  now = now || Date.now();
  $("tk-gps").textContent = gpsText();
  if (trk.armed) {
    $("tk-map").innerHTML = mapHtml(trk.pts);
    return;
  }
  const secs = trackElapsed(now);
  $("tk-dist").textContent = dist2(trk.dist);
  $("tk-time").textContent = runClock(secs);
  const splitKm = trk.dist - trk.splits.length / distToDisp(1), splitSecs = secs - trk.splitAt;
  if (trk.type === "ride") {
    $("tk-pace").textContent = trk.dist > 0.02 ? speedStr(trk.dist, secs) : "–";
    $("tk-split").textContent = splitKm > 0.02 ? speedStr(splitKm, splitSecs) : "–";
  } else {
    $("tk-pace").textContent = trk.dist > 0.02 ? paceStr(secs / trk.dist) : "–";
    $("tk-split").textContent = splitKm > 0.02 ? paceStr(splitSecs / splitKm) : "–";
  }

  // What you're doing now and how far is left
  let stepHtml = "";
  const target = trackTarget();
  if (trk.steps) {
    const s = trk.steps[trk.stepIdx], left = stepLeft(now);
    stepHtml = s ? `<b>${stepLabel(s)}</b><span>${left.km !== undefined ? fmtKm(left.km) : runClock(left.secs)} left${s.pace ? " · target " + paceStr(s.pace[0]) + "–" + paceStr(s.pace[1]) + paceUnit() : ""}</span>`
                 : `<b>Session complete</b><span>Tap Pause, then Finish, when you’re done.</span>`;
  } else if (target) {
    const pct = Math.min(100, Math.round((target.km ? trk.dist / target.km : secs / target.secs) * 100));
    stepHtml = `<b>${trk.goalDone ? "Goal reached" : target.km ? fmtKm(Math.max(0, target.km - trk.dist)) + " to go" : runClock(Math.max(0, target.secs - secs)) + " to go"}</b>
      <div class="obj-bar"><i style="width:${pct}%"></i></div>`;
  }
  if (trk.outBack && target) stepHtml += `<span class="tk-turn${trk.turned ? " on" : ""}">${trk.turned ? "Turned: heading back" : "Turn around at " + (target.km ? fmtKm(target.km / 2) : runClock(target.secs / 2))}</span>`;
  $("tk-step").innerHTML = stepHtml;
  const gapNow = ghostGap(now);
  $("tk-ghost").textContent = gapNow === null ? "" : "👻 " + ghostShort(gapNow, now);
  $("tk-ghost").className = "tk-ghost" + (gapNow !== null && gapNow < -3 ? " behind" : "");
  $("tk-said").textContent = trk.lastSaid ? "🔊 " + trk.lastSaid : "";

  // Map: only reload the street map when the route runs off the edge
  if (trk.pts.length) {
    const lastPt = trk.pts[trk.pts.length - 1];
    if (!trk.view || !mapInView(lastPt, trk.view)) {
      trk.view = mapView(trk.pts);
      $("tk-map").innerHTML = `<div class="map"><div class="map-in"><div class="map-tiles">${mapTiles(trk.view)}</div><div id="tk-line">${mapLine(trk.pts, trk.view)}</div></div><span class="map-credit">© OpenStreetMap</span></div>`;
    } else {
      $("tk-line").innerHTML = mapLine(trk.pts, trk.view);
    }
  }
}

$("track").addEventListener("click", function (e) {
  const b = e.target.closest("[data-tk]");
  if (!b || trk.locked) return;
  const a = b.dataset.tk, now = Date.now();
  if (a === "cancel") { trackClose(); renderRun(); }
  if (a === "go") trackGo(now);
  if (a === "pause") trackPause(now);
  if (a === "resume") trackResume(now);
  if (a === "finish") trackFinish(now);
  if (a === "discard" && confirm("Discard this " + RUN_TYPES[trk.type].verb + "? It won’t be saved.")) { trackClose(); renderRun(); }
  if (a === "lock") { trk.locked = true; trackShell(); }
});
// Unlock needs a press and hold, so a pocket or a sleeve can't do it
let unlockTimer = null;
function trackUnlock() { trk.locked = false; if (trk.on || trk.armed) trackShell(); }
$("track").addEventListener("pointerdown", function (e) {
  if (!trk.locked || !e.target.closest("#tk-unlock")) return;
  clearTimeout(unlockTimer);
  unlockTimer = setTimeout(trackUnlock, 800);
});
["pointerup", "pointerleave", "pointercancel"].forEach(function (type) {
  $("track").addEventListener(type, function () { clearTimeout(unlockTimer); });
});
// Coming back to the app after the screen was off: GPS was not listening meanwhile
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState !== "visible" || !trk.on) return;
  if (!NATIVE && !trk.paused) trk.gaps++;          // the website lost GPS while hidden; the installed app did not
  trackPaint(Date.now());
});
// A street-map square that fails to load (no signal) is simply hidden
document.addEventListener("error", function (e) {
  if (e.target && e.target.classList && e.target.classList.contains("map-tile")) e.target.style.visibility = "hidden";
}, true);


// =====================================================================
// RUNNING COACH
// A week-by-week plan towards a race. Every pace comes from one number:
// your current 5K time.
// =====================================================================
const RUN_GOALS = {
  "5k":       { label: "5K",            km: 5,      weeks: 8,  taper: 1, long: [4, 8],   easy: [3, 5],  tempo: [15, 25], reps: [[6, 0.4, 90], [5, 0.8, 120], [5, 1, 120]] },
  "10k":      { label: "10K",           km: 10,     weeks: 10, taper: 1, long: [6, 14],  easy: [4, 7],  tempo: [15, 30], reps: [[6, 0.4, 90], [5, 0.8, 120], [5, 1, 120]] },
  "half":     { label: "Half marathon", km: 21.0975, weeks: 12, taper: 2, long: [9, 19],  easy: [5, 9],  tempo: [20, 40], reps: [[6, 0.8, 120], [5, 1, 120], [4, 1.6, 150]] },
  "marathon": { label: "Marathon",      km: 42.195, weeks: 16, taper: 2, long: [13, 32], easy: [6, 11], tempo: [20, 40], reps: [[6, 0.8, 120], [5, 1, 120], [4, 1.6, 150]] }
};
const halfKm = function (km) { return Math.round(km * 2) / 2; };       // to the nearest 0.5 km

// Seconds-per-km ranges for each kind of running, from a 5K time in seconds
function runPaces(t5) {
  const p = t5 / 5;
  return { easy: [p * 1.22, p * 1.35], long: [p * 1.25, p * 1.38], tempo: [p * 1.05, p * 1.10], fast: [p * 0.95, p * 1.0] };
}
function racePace(t5, km) { const p = riegel(t5, 5, km) / km; return [p * 0.99, p * 1.01]; }

// How long a session should take, with timed parts as they are and distances at their target pace
function sessionSecs(steps) {
  return Math.round(steps.reduce(function (n, s) { return n + (s.km ? s.km * (s.pace ? (s.pace[0] + s.pace[1]) / 2 : 390) : s.secs); }, 0));
}
function sessionKm(steps) {
  return steps.reduce(function (n, s) { return n + (s.km ? s.km : s.secs / (s.pace ? (s.pace[0] + s.pace[1]) / 2 : 390)); }, 0);
}

// The whole plan. plan = { goal, perWeek, t5 }
function planWeeks(plan) {
  const g = RUN_GOALS[plan.goal] || RUN_GOALS["5k"];
  const pc = runPaces(plan.t5);
  const build = g.weeks - g.taper;
  const lerp = function (r, p) { return r[0] + (r[1] - r[0]) * p; };
  const weeks = [];

  for (let w = 1; w <= g.weeks; w++) {
    const p = Math.min(1, (w - 1) / (build - 1));
    const cut = w < build && w % 4 === 0;                      // every 4th week is lighter, to recover
    const raceWeek = w === g.weeks, taper = w > build && !raceWeek;
    const scale = raceWeek ? 0.5 : taper ? 0.7 : cut ? 0.8 : 1;
    const easyKm = Math.max(3, halfKm(lerp(g.easy, p) * scale));
    const easy = function () { return { type: "easy", title: "Easy run", steps: [{ kind: "easy", km: easyKm, pace: pc.easy }] }; };

    let quality;
    if (raceWeek) {
      quality = { type: "easy", title: "Easy run with pick-ups", steps: [{ kind: "easy", km: Math.max(3, halfKm(easyKm)), pace: pc.easy }] };
    } else if (w % 2 === 1) {
      const r = g.reps[Math.min(2, Math.floor(p * 3))];
      const n = Math.max(3, Math.round(r[0] * (scale < 1 ? 0.7 : 1)));
      const steps = [{ kind: "warm", secs: 600, pace: pc.easy }];
      for (let i = 1; i <= n; i++) {
        steps.push({ kind: "fast", km: r[1], pace: pc.fast, n: i, of: n });
        if (i < n) steps.push({ kind: "recover", secs: r[2], pace: [pc.easy[1], pc.easy[1] * 1.3] });
      }
      steps.push({ kind: "cool", secs: 300, pace: pc.easy });
      quality = { type: "intervals", title: "Intervals: " + n + " × " + (r[1] < 1 ? r[1] * 1000 + " m" : r[1] + " km"), steps: steps };
    } else {
      const mins = Math.max(10, Math.round(lerp(g.tempo, p) * scale / 5) * 5);
      quality = { type: "tempo", title: "Tempo: " + mins + " min", steps: [{ kind: "warm", secs: 600, pace: pc.easy }, { kind: "tempo", secs: mins * 60, pace: pc.tempo }, { kind: "cool", secs: 300, pace: pc.easy }] };
    }

    const longKm = halfKm(lerp(g.long, p) * (taper ? 0.7 : cut ? 0.8 : 1));
    const long = raceWeek
      ? { type: "race", title: "Race day: " + g.label, steps: [{ kind: "race", km: g.km, pace: racePace(plan.t5, g.km) }] }
      : { type: "long", title: "Long run", steps: [{ kind: "long", km: longKm, pace: pc.long }] };

    const sessions = plan.perWeek <= 2 ? [quality, long] : plan.perWeek === 3 ? [easy(), quality, long] : [easy(), quality, easy(), long];
    sessions.forEach(function (s, i) { s.id = "w" + w + "-" + (i + 1); s.km = Math.round(sessionKm(s.steps) * 10) / 10; s.secs = sessionSecs(s.steps); });
    weeks.push({ n: w, note: raceWeek ? "Race week" : taper ? "Taper: less running, same sharpness" : cut ? "Lighter week to recover" : "", sessions: sessions,
                 km: Math.round(sessions.reduce(function (t, s) { return t + s.km; }, 0) * 10) / 10 });
  }
  return weeks;
}

function newRunPlan(o) {
  return { goal: RUN_GOALS[o.goal] ? o.goal : "5k", perWeek: Math.max(2, Math.min(4, Number(o.perWeek) || 3)),
           t5: Math.max(720, Math.min(3600, Math.round(o.t5) || 1680)), start: weekBounds(0).start, done: {}, suggest: 0,
           days: (Array.isArray(o.days) ? o.days : []).map(Number).filter(function (d, i, a) { return d >= 0 && d <= 6 && a.indexOf(d) === i; }).sort() };
}
// Which week of the plan today falls in (1 = first). Past the end = finished.
function planWeekNow() {
  if (!runPlan) return 0;
  const days = Math.round((new Date(dateKey(new Date()) + "T00:00:00") - new Date(runPlan.start + "T00:00:00")) / 86400000);
  return Math.floor(days / 7) + 1;
}
function findSession(id) {
  if (!runPlan) return null;
  let found = null;
  planWeeks(runPlan).forEach(function (w) { w.sessions.forEach(function (s) { if (s.id === id) found = s; }); });
  return found;
}
function sessionLine(s) {
  const main = s.steps.filter(function (x) { return x.kind !== "warm" && x.kind !== "cool" && x.kind !== "recover"; })[0];
  return fmtKm(s.km) + " · about " + Math.round(s.secs / 60) + " min" + (main && main.pace ? " · " + paceStr(main.pace[0]) + "–" + paceStr(main.pace[1]) + paceUnit() : "");
}

function renderCoach() {
  const el = $("coach-card");
  if (!el) return;
  if (!runPlan) {
    el.innerHTML = `<div class="card-label">Running coach</div>
      <div class="big">Train for a race</div>
      <div class="feed-meta">A week-by-week plan for a 5K, 10K, half or full marathon. Each run has its own target pace, and the app talks you through it as you go.</div>
      <button class="btn" data-co="setup">Build my plan</button>`;
    return;
  }
  const g = RUN_GOALS[runPlan.goal], weeks = planWeeks(runPlan), now = planWeekNow();
  if (now > weeks.length) {
    const doneCount = Object.keys(runPlan.done).length;
    el.innerHTML = `<div class="card-label">Running coach</div><div class="big">${g.label} plan finished</div>
      <div class="feed-meta">You completed ${doneCount} of ${weeks.length * runPlan.perWeek} runs. Ready for the next one?</div>
      <div class="btn-row"><button class="btn" data-co="setup">New plan</button><button class="btn ghost" data-co="end">Clear</button></div>`;
    return;
  }
  const wk = weeks[Math.max(1, now) - 1];
  const doneThis = wk.sessions.filter(function (s) { return runPlan.done[s.id]; }).length;
  const next = wk.sessions.filter(function (s) { return !runPlan.done[s.id]; })[0];
  let html = `<div class="card-label">Running coach · ${g.label}</div>
    <div class="up-row now" style="border:0;padding:0"><span class="big">Week ${wk.n} of ${weeks.length}</span><b>${doneThis} / ${wk.sessions.length} runs</b></div>
    <div class="obj-bar"><i style="width:${Math.round((wk.n - 1 + doneThis / wk.sessions.length) / weeks.length * 100)}%"></i></div>
    ${wk.note ? `<div class="feed-meta" style="margin-top:.5rem">${wk.note}</div>` : ""}`;
  const onDay = {}, placedRuns = runPlacement(addDays(runPlan.start, 7 * (wk.n - 1)), wk.sessions).place;
  Object.keys(placedRuns).forEach(function (k) { onDay[placedRuns[k].id] = DAY_NAMES[k]; });
  wk.sessions.forEach(function (s) {
    const done = !!runPlan.done[s.id];
    html += `<div class="co-row${done ? " done" : ""}">
      <div><div class="pr-name">${done ? "✓ " : ""}${onDay[s.id] ? onDay[s.id] + " · " : ""}${esc(s.title)}</div><div class="pr-sub">${sessionLine(s)}</div></div>
      ${done ? `<button class="tool" data-co="undo" data-id="${s.id}">Undo</button>`
             : `<div class="co-btns"><button class="tool" data-co="tick" data-id="${s.id}">Done</button><button class="tool${s === next ? " on" : ""}" data-co="start" data-id="${s.id}">Start</button></div>`}
    </div>`;
  });
  if (runPlan.suggest) {
    html += `<div class="trend-line" style="margin-top:.8rem">Your last run points to a 5K of about <b>${runClock(runPlan.suggest)}</b> (the plan uses ${runClock(runPlan.t5)}). Make the target paces faster to match?
      <div class="btn-row" style="margin-top:.5rem"><button class="btn" data-co="faster">Update paces</button><button class="btn ghost" data-co="keep">Keep as is</button></div></div>`;
  }
  html += `<div class="feed-meta" style="margin-top:.7rem">On current form: ${g.label} in about <b>${runClock(riegel(runPlan.t5, 5, g.km))}</b>.</div>
    <div class="btn-row" style="margin-top:.6rem"><button class="btn ghost" data-co="full">Full plan</button><button class="btn ghost" data-co="setup">Change</button></div>`;
  el.innerHTML = html;
}

// ----- building or changing the plan -----
let planDraft = null;
function openPlanSetup() {
  if (!planDraft) planDraft = runPlan ? { goal: runPlan.goal, perWeek: runPlan.perWeek, t5: runClock(runPlan.t5), days: (runPlan.days || []).slice() } : { goal: "5k", perWeek: 3, t5: "", days: [] };
  const d = planDraft, secs = parseClock(d.t5), g = RUN_GOALS[d.goal];
  const chip = function (key, value, label) { return `<button class="chip${String(d[key]) === String(value) ? " on" : ""}" data-run="draft" data-k="${key}" data-v="${value}">${label}</button>`; };
  openSheet(`<div class="card-label">Running coach</div><div class="big">${runPlan ? "Change your plan" : "Build your plan"}</div>
    <div class="goal-group" style="margin-top:.9rem"><div class="card-label">What are you training for?</div>
      <div class="chips">${Object.keys(RUN_GOALS).map(function (k) { return chip("goal", k, RUN_GOALS[k].label); }).join("")}</div>
      <div class="feed-meta" style="margin-top:.4rem">${g.weeks} weeks, building to a ${fmtKm(g.long[1])} long run.</div></div>
    <div class="goal-group"><div class="card-label">Runs per week</div>
      <div class="chips">${chip("perWeek", 2, "2")}${chip("perWeek", 3, "3")}${chip("perWeek", 4, "4")}</div></div>
    ${goals.rota ? `<div class="goal-group"><div class="card-label">Run days</div><div class="feed-meta">Your run days follow your shift pattern. Change them under “Run on” in Me → Goals.</div></div>` : `<div class="goal-group"><div class="card-label">Run days</div>
      <div class="chips">${DAY_NAMES.map(function (n, i) { return `<button class="chip${d.days.indexOf(i) >= 0 ? " on" : ""}" data-run="day" data-v="${i}">${n}</button>`; }).join("")}</div>
      <div class="feed-meta" style="margin-top:.4rem">${d.days.length === d.perWeek ? "The long run goes on " + DAY_FULL[d.days.indexOf(6) >= 0 ? 6 : d.days.indexOf(5) >= 0 ? 5 : d.days[d.days.length - 1]] + "."
        : d.days.length ? "Pick " + d.perWeek + " days (you have " + d.days.length + "), or clear them and BTB chooses."
        : "Leave these empty and BTB picks days around your gym sessions: " + autoRunDays(d.perWeek, goals.trainDays).map(function (i) { return DAY_NAMES[i]; }).join(", ") + "."}</div></div>`}
    <div class="goal-group"><div class="card-label">Your 5K time right now (minutes:seconds)</div>
      <input type="text" inputmode="numeric" class="inp-date" id="pl-t5" placeholder="e.g. 28:00" value="${esc(d.t5)}">
      <div class="chips" style="margin-top:.5rem"><span class="feed-meta" style="align-self:center">Not sure?</span>
        <button class="chip" data-run="guess" data-v="36:00">New to running</button><button class="chip" data-run="guess" data-v="29:00">Run sometimes</button><button class="chip" data-run="guess" data-v="24:00">Run a lot</button></div>
      <div class="feed-meta" style="margin-top:.4rem">Every target pace comes from this. A rough figure is fine: the app offers to update it when your runs get quicker.</div></div>
    <div class="feed-meta" id="pl-msg">${secs ? "Easy runs at about " + paceStr(runPaces(secs).easy[0]) + "–" + paceStr(runPaces(secs).easy[1]) + paceUnit() + ". Predicted " + g.label + ": " + runClock(riegel(secs, 5, g.km)) + "." : "The plan assumes you can already jog for about 20 minutes without stopping."}</div>
    <button class="btn" data-run="plan-save">${runPlan ? "Save changes" : "Start plan this week"}</button>
    ${runPlan ? `<button class="btn ghost" data-run="plan-end">End this plan</button>` : ""}
    <button class="btn ghost" data-a="add-close">Cancel</button>`);
}
function savePlanDraft() {
  const secs = parseClock(($("pl-t5") || {}).value || planDraft.t5);
  if (secs < 720 || secs > 3600) { $("pl-msg").textContent = "Enter your 5K time as minutes:seconds, between 12:00 and 60:00."; return false; }
  const fresh = newRunPlan({ goal: planDraft.goal, perWeek: planDraft.perWeek, t5: secs, days: planDraft.days.length === Number(planDraft.perWeek) ? planDraft.days : [] });
  if (runPlan && runPlan.goal === fresh.goal) { fresh.start = runPlan.start; fresh.done = runPlan.done; }   // same race: keep your place
  runPlan = fresh; planDraft = null;
  saveRunPlan(); closeSheet(); renderRun(); refreshHome();
  return true;
}
function openFullPlan() {
  const g = RUN_GOALS[runPlan.goal], now = planWeekNow();
  openSheet(`<div class="card-label">${g.label} plan</div><div class="big">${g.weeks} weeks</div>
    ${planWeeks(runPlan).map(function (w) {
      return `<div class="co-week${w.n === now ? " now" : ""}"><div class="card-label">Week ${w.n}${w.n === now ? " · this week" : ""} · ${fmtKm(w.km)}${w.note ? " · " + w.note : ""}</div>
        ${w.sessions.map(function (s) { return `<div class="pr-row"><span>${runPlan.done[s.id] ? "✓ " : ""}${esc(s.title)}</span><span class="feed-meta">${fmtKm(s.km)}</span></div>`; }).join("")}</div>`;
    }).join("")}
    <button class="btn" data-a="add-close">Close</button>`);
}

$("coach-card").addEventListener("click", function (e) {
  const b = e.target.closest("[data-co]");
  if (!b) return;
  const a = b.dataset.co, id = b.dataset.id;
  if (a === "setup") { planDraft = null; openPlanSetup(); return; }
  if (a === "full") { openFullPlan(); return; }
  if (a === "end") { runPlan = null; saveRunPlan(); }
  if (a === "start") { const s = findSession(id); if (s) trackArm({ steps: s.steps, session: s.id, title: s.title }); return; }
  if (a === "tick") runPlan.done[id] = "manual";
  if (a === "undo") delete runPlan.done[id];
  if (a === "faster") { runPlan.t5 = runPlan.suggest; runPlan.suggest = 0; }
  if (a === "keep") runPlan.suggest = 0;
  saveRunPlan();
  renderCoach();
});


// =====================================================================
// RUN SCREEN: start a run, and the runs you've done
// =====================================================================
let runsShown = 8;

function renderRunSetup() {
  const el = $("run-setup");
  if (!el) return;
  const p = runPrefs;
  const chip = function (key, value, label) { return `<button class="chip${String(p[key]) === String(value) ? " on" : ""}" data-rs="set" data-k="${key}" data-v="${value}">${label}</button>`; };
  const halfText = p.goal === "dist" ? fmtKm(p.km / 2) : runClock(p.mins * 30);
  el.innerHTML = `<div class="chips">${chip("type", "run", "Run")}${chip("type", "ride", "Ride")}${chip("type", "walk", "Walk")}</div>
    <div class="goal-group" style="margin-top:.9rem"><div class="card-label">Goal</div>
      <div class="chips">${chip("goal", "free", "Just go")}${chip("goal", "dist", "Distance")}${chip("goal", "time", "Time")}</div>
      ${p.goal === "dist" ? `<div class="rs-val"><input class="set-input" id="rs-km" inputmode="decimal" value="${fmt(Math.round(distToDisp(p.km) * 100) / 100)}"><span>${distUnit()}</span></div>` : ""}
      ${p.goal === "time" ? `<div class="rs-val"><input class="set-input" id="rs-mins" inputmode="numeric" value="${p.mins}"><span>minutes</span></div>` : ""}
    </div>
    ${p.goal !== "free" ? `<div class="goal-group"><div class="card-label">Route</div>
      <div class="chips">${chip("outBack", false, "Any route")}${chip("outBack", true, "Out and back")}</div>
      ${p.outBack ? `<div class="feed-meta" style="margin-top:.4rem">You’ll be told to turn around at ${halfText}, so you finish where you started.</div>` : ""}</div>` : ""}
    <div class="goal-group"><div class="card-label">Voice updates</div>
      <div class="chips">${chip("cues", "off", "Off")}${chip("cues", "0.5", "Every 0.5 " + distUnit())}${chip("cues", "1", "Every " + distUnit())}</div>
      <div class="feed-meta" style="margin-top:.4rem">Distance, time and pace, spoken through your headphones or the phone speaker.</div></div>
    <div class="goal-group"><div class="card-label">Race your best</div>
      <div class="chips">${chip("ghost", "on", "On")}${chip("ghost", "off", "Off")}</div>
      <div class="feed-meta" style="margin-top:.4rem">Start where you’ve started before and you’re told how far ahead or behind your best run from there you are.</div></div>
    <div class="goal-group"><div class="card-label">Auto-pause</div>
      <div class="chips">${chip("autoPause", "on", "On")}${chip("autoPause", "off", "Off")}</div>
      <div class="feed-meta" style="margin-top:.4rem">Stops the clock when you stand still for 10 seconds (traffic lights, a gate) and starts it again when you move.</div></div>
    <button class="btn" data-rs="start">Start ${RUN_TYPES[p.type].verb}</button>
    <button class="link-btn" data-rs="manual">Log one by hand (no GPS)</button>`;
}
$("run-setup").addEventListener("click", function (e) {
  const b = e.target.closest("[data-rs]");
  if (!b) return;
  if (b.dataset.rs === "start") { trackArm(); return; }
  if (b.dataset.rs === "manual") { openManualRun(); return; }
  const k = b.dataset.k, v = b.dataset.v;
  runPrefs[k] = k === "outBack" ? v === "true" : v;
  saveRunPrefs();
  renderRunSetup();
});
$("run-setup").addEventListener("change", function (e) {
  const n = parseFloat(String(e.target.value).replace(",", "."));
  if (e.target.id === "rs-km" && n > 0) runPrefs.km = Math.min(300, Math.round(distFromDisp(n) * 1000) / 1000);
  else if (e.target.id === "rs-mins" && n > 0) runPrefs.mins = Math.min(600, Math.round(n));
  else return;
  saveRunPrefs();
  renderRunSetup();
});

function runTotals(offset) {
  const b = weekBounds(offset), out = { count: 0, km: 0, secs: 0 };
  runs.forEach(function (r) { if (r.date >= b.start && r.date <= b.end) { out.count++; out.km += r.km; out.secs += r.secs; } });
  return out;
}
function runStat(r) { return r.type === "ride" ? speedStr(r.km, r.secs) : paceStr(r.secs / r.km) + " " + paceUnit(); }
function niceDate(key) { return new Date(key + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); }

function renderRunList() {
  const el = $("run-list");
  if (!el) return;
  if (!runs.length) { el.innerHTML = `<p class="feed-meta">Your runs, rides and walks will show here.</p>`; return; }
  const t = runTotals(0);
  let html = `<div class="card"><div class="card-label">This week</div>
    <div class="tk-stats"><div><b>${t.count}</b><span>${t.count === 1 ? "Activity" : "Activities"}</span></div><div><b>${fmt(round1(distToDisp(t.km)))}</b><span>${distUnit()}</span></div><div><b>${runClock(t.secs)}</b><span>Time</span></div></div></div>`;
  const pb = runBests();
  if (Object.keys(pb).length) {
    html += `<div class="card"><div class="card-label">Your fastest</div>` +
      BEST_DISTS.filter(function (bd) { return pb[bd[0]]; }).map(function (bd) {
        return `<div class="pr-row"><span>${bd[2]}</span><span><b>${runClock(pb[bd[0]].secs)}</b> <span class="feed-meta">· ${niceDate(pb[bd[0]].date)}</span></span></div>`;
      }).join("") + `</div>`;
  }
  const list = runs.slice().reverse();
  list.slice(0, runsShown).forEach(function (r) {
    html += `<button type="button" class="card run-row" data-rl="open" data-id="${esc(r.id)}">
      ${routeThumb(decodeRoute(r.route))}
      <span class="run-txt"><span class="pr-name">${esc(r.title || RUN_TYPES[r.type].label)}</span>
        <span class="pr-sub">${niceDate(r.date)} · ${fmtKm(r.km)} · ${runClock(r.secs)}${r.km > 0 ? " · " + runStat(r) : ""}</span></span></button>`;
  });
  if (list.length > runsShown) html += `<button class="btn ghost" data-rl="more">Show more (${list.length - runsShown} older)</button>`;
  el.innerHTML = html;
}
$("run-list").addEventListener("click", function (e) {
  const b = e.target.closest("[data-rl]");
  if (!b) return;
  if (b.dataset.rl === "more") { runsShown += 10; renderRunList(); }
  if (b.dataset.rl === "open") openRunDetail(b.dataset.id, false);
});

function openRunDetail(id, justDone) {
  const r = runs.filter(function (x) { return x.id === id; })[0];
  if (!r) return;
  const pts = decodeRoute(r.route);
  const perUnit = (r.unit || "km") === "mi" ? "mi" : "km";
  const fastest = r.splits && r.splits.length ? Math.min.apply(null, r.splits) : 0;
  const s = r.session ? findSession(r.session) : null;
  openSheet(`<div class="card-label">${justDone ? "Saved" : niceDate(r.date)}</div>
    <div class="big">${esc(r.title || RUN_TYPES[r.type].label)}</div>
    <div class="tk-stats" style="margin:.9rem 0"><div><b>${dist2(r.km)}</b><span>${distUnit()}</span></div><div><b>${runClock(r.secs)}</b><span>Time</span></div>
      <div><b>${r.km > 0 ? (r.type === "ride" ? speedStr(r.km, r.secs).split(" ")[0] : paceStr(r.secs / r.km)) : "–"}</b><span>${r.type === "ride" ? (distUnit() === "mi" ? "mph" : "km/h") : "Pace " + paceUnit()}</span></div></div>
    ${pts.length ? mapHtml(pts) : ""}
    ${(r.pb || []).map(function (k) { const bd = BEST_DISTS.filter(function (x) { return x[0] === k; })[0]; return bd ? `<div class="pr-line">🏆 Your fastest <b>${bd[2]}</b>: ${runClock(r.best[k])}</div>` : ""; }).join("")}
    ${r.vs ? `<div class="pr-line">👻 ${r.vs.secs >= 3 ? "<b>" + runClock(r.vs.secs) + " faster</b> than your best on this route" : r.vs.secs <= -3 ? runClock(-r.vs.secs) + " slower than your best on this route" : "Level with your best on this route"} (${niceDate(r.vs.date)})</div>` : ""}
    ${s ? `<div class="trend-line" style="margin-top:.8rem">Coach session: ${esc(s.title)}. Planned ${fmtKm(s.km)} in about ${Math.round(s.secs / 60)} min.</div>` : ""}
    ${r.gaps ? `<div class="feed-meta" style="margin-top:.6rem">The screen went off ${r.gaps === 1 ? "once" : r.gaps + " times"} during this one, so some distance may be missing.</div>` : ""}
    ${r.splits && r.splits.length ? `<div class="card-label" style="margin-top:.9rem">Splits</div>
      ${r.splits.map(function (sec, i) { return `<div class="pr-row"><span>${i + 1} ${perUnit}</span><span${sec === fastest && r.splits.length > 1 ? ' style="color:var(--accent);font-weight:700"' : ""}>${runClock(sec)}</span></div>`; }).join("")}` : ""}
    <button class="btn" data-run="share" data-id="${esc(r.id)}" style="margin-top:1rem">Share picture</button>
    ${pts.length > 1 ? `<button class="btn ghost" data-run="gpx" data-id="${esc(r.id)}">Export for Strava (GPX file)</button>` : ""}
    <button class="btn ghost" data-a="add-close">${justDone ? "Done" : "Close"}</button>
    <button class="link-btn" data-run="delete" data-id="${esc(r.id)}">Delete this ${RUN_TYPES[r.type].verb}</button>`);
}

// ----- a picture of the run, for social media -----
// The words on the picture, worked out separately so they can be checked
function shareCardText(r) {
  const ride = r.type === "ride";
  return { title: r.title || RUN_TYPES[r.type].label, date: niceDate(r.date),
           stats: [[dist2(r.km), distUnit()], [runClock(r.secs), "time"],
                   [r.km > 0 ? (ride ? speedStr(r.km, r.secs).split(" ")[0] : paceStr(r.secs / r.km)) : "–", ride ? (distUnit() === "mi" ? "mph" : "km/h") : "pace " + paceUnit()]] };
}
function loadImg(src, cors) {
  return new Promise(function (resolve) {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    const timer = setTimeout(function () { resolve(null); }, 3000);
    img.onload = function () { clearTimeout(timer); resolve(img); };
    img.onerror = function () { clearTimeout(timer); resolve(null); };
    img.src = src;
  });
}
// Draws a 1080 x 1350 picture (the tall shape Instagram likes) and gives back the canvas
function drawShareCard(r) {
  const W = 1080, H = 1350, MAPH = 800;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d");
  const css = getComputedStyle(document.documentElement);
  const accent = (css.getPropertyValue("--accent") || "#ffffff").trim() || "#ffffff";
  const pts = decodeRoute(r.route);
  const t = shareCardText(r);
  c.fillStyle = "#0b0b0d"; c.fillRect(0, 0, W, H);

  // Route area: the street map if it can be fetched, and always the route line
  let view = null, tiles = Promise.resolve([]);
  if (pts.length > 1) {
    // same maths as the on-screen map, at 2.25x the size
    const K = W / MAP_W;
    let z = 17, a, b;
    const lats = pts.map(function (p) { return p[0]; }), lngs = pts.map(function (p) { return p[1]; });
    const n = Math.max.apply(null, lats), s2 = Math.min.apply(null, lats), w = Math.min.apply(null, lngs), e = Math.max.apply(null, lngs);
    for (; z > 2; z--) { a = mapProj(n, w, z); b = mapProj(s2, e, z); if ((b[0] - a[0]) * K <= W - 260 && (b[1] - a[1]) * K <= MAPH - 240) break; }
    a = mapProj(n, w, z); b = mapProj(s2, e, z);
    view = { z: z, K: K, x0: (a[0] + b[0]) / 2 - W / K / 2, y0: (a[1] + b[1]) / 2 - MAPH / K / 2 };
    const jobs = [], max = Math.pow(2, z);
    for (let tx = Math.floor(view.x0 / 256); tx * 256 < view.x0 + W / K; tx++) {
      for (let ty = Math.floor(view.y0 / 256); ty * 256 < view.y0 + MAPH / K; ty++) {
        if (ty < 0 || ty >= max) continue;
        (function (tx, ty) {
          jobs.push(loadImg("https://tile.openstreetmap.org/" + z + "/" + (((tx % max) + max) % max) + "/" + ty + ".png", true)
            .then(function (img) { return { img: img, x: (tx * 256 - view.x0) * K, y: (ty * 256 - view.y0) * K }; }));
        })(tx, ty);
      }
    }
    tiles = Promise.all(jobs);
  }

  return Promise.all([tiles, loadImg("logo-mark.svg", false)]).then(function (got) {
    const tileList = got[0], logo = got[1];
    let mapped = false;
    if (view && tileList.length && tileList.every(function (q) { return q.img; })) {
      try {
        c.save();
        c.beginPath(); c.rect(0, 0, W, MAPH); c.clip();
        c.filter = "invert(1) hue-rotate(180deg) brightness(.8) contrast(.9) saturate(.4)";
        tileList.forEach(function (q) { c.drawImage(q.img, q.x, q.y, 256 * view.K + 1, 256 * view.K + 1); });
        c.restore();
        mapped = true;
      } catch (err) { c.restore(); }
    }
    // fade the bottom of the map into the card
    const fade = c.createLinearGradient(0, MAPH - 260, 0, MAPH);
    fade.addColorStop(0, "rgba(11,11,13,0)"); fade.addColorStop(1, "rgba(11,11,13,1)");
    c.fillStyle = fade; c.fillRect(0, MAPH - 260, W, 262);

    if (view) {
      const xy = pts.map(function (p) { const q = mapProj(p[0], p[1], view.z); return [(q[0] - view.x0) * view.K, (q[1] - view.y0) * view.K]; });
      c.lineJoin = "round"; c.lineCap = "round";
      c.beginPath(); xy.forEach(function (q, i) { if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); });
      c.strokeStyle = "rgba(0,0,0,.55)"; c.lineWidth = 20; c.stroke();
      c.strokeStyle = accent; c.lineWidth = 11; c.stroke();
      c.fillStyle = "#fff"; c.beginPath(); c.arc(xy[0][0], xy[0][1], 13, 0, 7); c.fill();
      const last = xy[xy.length - 1];
      c.fillStyle = accent; c.strokeStyle = "#fff"; c.lineWidth = 6; c.beginPath(); c.arc(last[0], last[1], 15, 0, 7); c.fill(); c.stroke();
    }
    if (mapped) { c.fillStyle = "rgba(255,255,255,.55)"; c.font = "22px system-ui, sans-serif"; c.textAlign = "right"; c.fillText("© OpenStreetMap", W - 28, 40); }

    // Words
    const font = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    const top = view ? MAPH + 50 : 420;
    c.textAlign = "left"; c.fillStyle = "#fff"; c.font = "800 76px " + font; c.fillText(t.title, 70, top, W - 140);
    c.fillStyle = "rgba(255,255,255,.6)"; c.font = "36px " + font; c.fillText(t.date, 70, top + 58);
    t.stats.forEach(function (st, i) {
      const x = 70 + i * ((W - 140) / 3);
      c.fillStyle = "#fff"; c.font = "800 92px " + font; c.fillText(st[0], x, top + 200, (W - 140) / 3 - 20);
      c.fillStyle = "rgba(255,255,255,.6)"; c.font = "32px " + font; c.fillText(st[1], x, top + 250);
    });
    // Badge
    const by = H - 150;
    if (logo) { try { c.drawImage(logo, 70, by, 84, 102); } catch (err) {} }
    c.fillStyle = "#fff"; c.font = "800 44px " + font; c.fillText("BTB", logo ? 180 : 70, by + 48);
    c.fillStyle = "rgba(255,255,255,.6)"; c.font = "600 26px " + font; c.fillText("B E Y O N D   T H E   B O D Y", logo ? 180 : 70, by + 90);
    return cv;
  });
}
function shareRun(id) {
  const r = runs.filter(function (x) { return x.id === id; })[0];
  if (!r) return Promise.resolve("failed");
  return drawShareCard(r).then(function (cv) {
    return new Promise(function (resolve) { cv.toBlob(resolve, "image/png"); });
  }).then(function (blob) {
    if (!blob) { alert("Couldn’t make the picture."); return "failed"; }
    const t = shareCardText(r);
    return fileOut("btb-" + r.type + "-" + r.date + ".png", blob, { share: true, title: t.title, text: t.stats[0].join(" ") + " in " + t.stats[1][0] + " with BTB" });
  });
}

// ----- export a run as a GPX file (the standard route file Strava and others accept) -----
function runStartMs(r) {
  const n = Number(String(r.id).slice(1));
  return n > 1e12 && n < 4e12 ? n : new Date(r.date + "T12:00:00").getTime();
}
function buildGpx(r) {
  const pts = decodeRoute(r.route);
  let times = decodeTimes(r.rt);
  if (times.length !== pts.length) {
    // An older run with no clock times stored: spread the time along the route by distance
    let total = 0;
    const cum = pts.map(function (p, i) { if (i) total += haversine(pts[i - 1][0], pts[i - 1][1], p[0], p[1]); return total; });
    times = cum.map(function (d) { return total > 0 ? Math.round(r.secs * d / total) : 0; });
  }
  const start = runStartMs(r);
  const iso = function (secs) { return new Date(start + secs * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"); };
  const kind = { run: "running", ride: "cycling", walk: "walking" }[r.type] || "running";
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<gpx version="1.1" creator="BTB - Beyond The Body" xmlns="http://www.topografix.com/GPX/1/1">\n' +
    ' <metadata><time>' + iso(0) + '</time></metadata>\n' +
    ' <trk>\n  <name>' + esc(r.title || RUN_TYPES[r.type].label) + '</name>\n  <type>' + kind + '</type>\n  <trkseg>\n' +
    pts.map(function (p, i) { return '   <trkpt lat="' + p[0].toFixed(5) + '" lon="' + p[1].toFixed(5) + '"><time>' + iso(times[i]) + '</time></trkpt>'; }).join("\n") +
    '\n  </trkseg>\n </trk>\n</gpx>\n';
}
function exportGpx(id) {
  const r = runs.filter(function (x) { return x.id === id; })[0];
  if (!r) return Promise.resolve("failed");
  return fileOut("btb-" + r.type + "-" + r.date + ".gpx", new Blob([buildGpx(r)], { type: "application/gpx+xml" }), { title: "BTB " + RUN_TYPES[r.type].verb });
}

// ----- a picture of a gym session, for social media -----
function workoutCardText(w) {
  const t = workoutTotals(w);
  const lines = w.exercises.map(function (ex) {
    if (isCardio(ex.name)) return [ex.name, ex.sets.map(cardioText).join(", ")];
    let best = null;
    ex.sets.forEach(function (s) { const kg = parseFloat(s.weight) || 0; if (!best || kg > best.kg) best = { kg: kg, reps: parseInt(s.reps) || 0 }; });
    return [ex.name, best && best.kg ? fmtW(best.kg) + " " + unit() + " × " + best.reps : ex.sets.length + (ex.sets.length === 1 ? " set" : " sets")];
  });
  const stats = [[String(t.sets), "sets"]];
  if (t.volume) stats.push([Math.round(toDisp(t.volume)).toLocaleString(), unit() + " lifted"]);
  if (w.minutes) stats.push([String(w.minutes), "minutes"]);
  return { title: w.name, date: niceDate(w.date), stats: stats, lines: lines.slice(0, 8), more: Math.max(0, lines.length - 8), stars: w.feel ? stars(w.feel) : "" };
}
function drawWorkoutCard(w) {
  const W = 1080, H = 1350, t = workoutCardText(w);
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d");
  const css = getComputedStyle(document.documentElement);
  const accent = (css.getPropertyValue("--accent") || "#ffffff").trim() || "#ffffff";
  const font = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  const glow = c.createLinearGradient(0, 0, 0, H);
  glow.addColorStop(0, "#1a1a1e"); glow.addColorStop(0.45, "#0b0b0d");
  c.fillStyle = glow; c.fillRect(0, 0, W, H);
  c.fillStyle = accent; c.fillRect(70, 96, 96, 10);
  c.textAlign = "left"; c.fillStyle = "#fff"; c.font = "800 84px " + font; c.fillText(t.title, 70, 210, W - 140);
  c.fillStyle = "rgba(255,255,255,.6)"; c.font = "36px " + font; c.fillText(t.date + (t.stars ? "   " + t.stars : ""), 70, 268);
  t.stats.forEach(function (st, i) {
    const x = 70 + i * ((W - 140) / 3);
    c.fillStyle = "#fff"; c.font = "800 88px " + font; c.fillText(st[0], x, 420, (W - 140) / 3 - 24);
    c.fillStyle = "rgba(255,255,255,.6)"; c.font = "30px " + font; c.fillText(st[1], x, 466);
  });
  let y = 580;
  t.lines.forEach(function (ln) {
    c.fillStyle = "rgba(255,255,255,.12)"; c.fillRect(70, y - 52, W - 140, 2);
    c.textAlign = "left"; c.fillStyle = "#fff"; c.font = "600 38px " + font; c.fillText(ln[0], 70, y, W - 140 - 340);
    c.textAlign = "right"; c.fillStyle = "rgba(255,255,255,.75)"; c.font = "36px " + font; c.fillText(ln[1], W - 70, y, 320);
    y += 76;
  });
  if (t.more) { c.textAlign = "left"; c.fillStyle = "rgba(255,255,255,.5)"; c.font = "32px " + font; c.fillText("+ " + t.more + " more", 70, y); }
  return loadImg("logo-mark.svg", false).then(function (logo) {
    const by = H - 150;
    c.textAlign = "left";
    if (logo) { try { c.drawImage(logo, 70, by, 84, 102); } catch (err) {} }
    c.fillStyle = "#fff"; c.font = "800 44px " + font; c.fillText("BTB", logo ? 180 : 70, by + 48);
    c.fillStyle = "rgba(255,255,255,.6)"; c.font = "600 26px " + font; c.fillText("B E Y O N D   T H E   B O D Y", logo ? 180 : 70, by + 90);
    return cv;
  });
}
function shareWorkoutPic(index) {
  const w = getHistory()[index];
  if (!w) return Promise.resolve("failed");
  return drawWorkoutCard(w).then(function (cv) {
    return new Promise(function (resolve) { cv.toBlob(resolve, "image/png"); });
  }).then(function (blob) {
    if (!blob) { alert("Couldn’t make the picture."); return "failed"; }
    return fileOut("btb-" + w.date + ".png", blob, { share: true, title: w.name, text: w.name + " done with BTB" });
  });
}

function openManualRun() {
  openSheet(`<div class="card-label">Log by hand</div><div class="big">Add a ${RUN_TYPES[runPrefs.type].verb}</div>
    <div class="card-label" style="margin-top:.9rem">Date</div><input type="date" class="inp-date" id="mr-date" value="${dateKey(new Date())}" max="${dateKey(new Date())}">
    <div class="card-label" style="margin-top:.7rem">Distance (${distUnit()})</div><input type="text" inputmode="decimal" class="inp-date" id="mr-km" placeholder="e.g. 5">
    <div class="card-label" style="margin-top:.7rem">Time (minutes:seconds)</div><input type="text" inputmode="numeric" class="inp-date" id="mr-time" placeholder="e.g. 28:30">
    <div class="feed-meta" id="mr-msg" style="margin-top:.5rem">For treadmill runs, or when you tracked it somewhere else.</div>
    <button class="btn" data-run="manual-save">Save</button><button class="btn ghost" data-a="add-close">Cancel</button>`);
}
function saveManualRun() {
  const km = distFromDisp(parseFloat(String($("mr-km").value).replace(",", ".")));
  const secs = parseClock($("mr-time").value), date = $("mr-date").value;
  if (!(km > 0 && km < 500) || !(secs > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > dateKey(new Date())) {
    $("mr-msg").textContent = "Check the distance, the time (like 28:30) and that the date isn’t in the future.";
    return false;
  }
  storeRun({ id: "r" + Date.now(), date: date, type: runPrefs.type, title: RUN_TYPES[runPrefs.type].label, km: Math.round(km * 1000) / 1000, secs: secs, splits: [], unit: distUnit(), route: [], session: null, gaps: 0 });
  closeSheet();
  return true;
}

$("sheet").addEventListener("click", function (e) {
  const b = e.target.closest("[data-run]");
  if (!b) return;
  const a = b.dataset.run;
  if (a === "draft") { planDraft[b.dataset.k] = b.dataset.k === "perWeek" ? Number(b.dataset.v) : b.dataset.v; planDraft.t5 = ($("pl-t5") || {}).value || planDraft.t5; openPlanSetup(); }
  if (a === "guess") { planDraft.t5 = b.dataset.v; openPlanSetup(); }
  if (a === "day") {
    const day = Number(b.dataset.v), at = planDraft.days.indexOf(day);
    if (at >= 0) planDraft.days.splice(at, 1); else planDraft.days.push(day);
    planDraft.days.sort();
    planDraft.t5 = ($("pl-t5") || {}).value || planDraft.t5;
    openPlanSetup();
  }
  if (a === "plan-save") { planDraft.t5 = ($("pl-t5") || {}).value || planDraft.t5; savePlanDraft(); }
  if (a === "plan-end" && confirm("End this plan? Your runs stay in your history.")) { runPlan = null; planDraft = null; saveRunPlan(); closeSheet(); renderRun(); }
  if (a === "manual-save") saveManualRun();
  if (a === "gpx") exportGpx(b.dataset.id);
  if (a === "gym-pic") { b.disabled = true; b.textContent = "Making picture…"; shareWorkoutPic(Number(b.dataset.i)).then(function () { b.disabled = false; b.textContent = "Share picture"; }); }
  if (a === "share") { b.disabled = true; b.textContent = "Making picture…"; shareRun(b.dataset.id).then(function () { b.disabled = false; b.textContent = "Share picture"; }); }
  if (a === "delete" && confirm("Delete this from your runs?")) {
    const id = b.dataset.id;
    runs = runs.filter(function (r) { return r.id !== id; });
    saveRuns();
    if (runPlan) Object.keys(runPlan.done).forEach(function (k) { if (runPlan.done[k] === id) delete runPlan.done[k]; });
    saveRunPlan(); closeSheet(); renderRun();
  }
});

// A run that was cut short because the app was closed
function renderRunResume() {
  const el = $("run-resume");
  if (!el) return;
  const live = load("runLive", null);
  if (!live || trk.on || !(live.km > 0.05)) { el.innerHTML = ""; return; }
  el.innerHTML = `<div class="card"><div class="card-label">Unfinished ${RUN_TYPES[live.type] ? RUN_TYPES[live.type].verb : "run"}</div>
    <div class="feed-meta">The app closed during a ${fmtKm(live.km)}, ${runClock(live.secs)} ${RUN_TYPES[live.type] ? RUN_TYPES[live.type].verb : "run"} on ${niceDate(live.date)}. Keep what was recorded?</div>
    <div class="btn-row"><button class="btn" data-rr="keep">Save it</button><button class="btn ghost" data-rr="drop">Discard</button></div></div>`;
}
$("run-resume").addEventListener("click", function (e) {
  const b = e.target.closest("[data-rr]");
  if (!b) return;
  const live = load("runLive", null);
  try { localStorage.removeItem("runLive"); } catch (err) {}
  if (b.dataset.rr === "keep" && live && !runs.some(function (r) { return r.id === live.id; })) storeRun(live);
  renderRun();
});

function renderRun() {
  renderRunResume();
  renderCoach();
  renderRunSetup();
  renderRunList();
}

// Minutes of running, riding and walking in a week (added to your gym cardio)
function runMinutes(offset, days) {
  const b = periodBounds(offset, days);
  return runs.reduce(function (n, r) { return n + (r.date >= b.start && r.date <= b.end ? r.secs / 60 : 0); }, 0);
}


// =====================================================================
// ONE WEEK, GYM AND RUNNING TOGETHER
// The gym planner and the running coach each know their own sessions.
// This puts both on the same seven days, picks sensible days to run,
// and points out clashes (heavy legs the day before a long run).
// =====================================================================
function addDays(key, n) { const d = new Date(key + "T00:00:00"); d.setDate(d.getDate() + n); return dateKey(d); }
// How hard a gym session is on your legs: 2 = leg day, 1 = some legs, 0 = none
function legLoad(name) { return /leg|lower/i.test(name || "") ? 2 : /full body/i.test(name || "") ? 1 : 0; }

// The best days to run, given the days you lift. Prefers days off from the gym,
// a weekend day for the long run, and runs spread out rather than bunched up.
function autoRunDays(perWeek, gymDays) {
  let best = null, bestScore = -1e9;
  for (let mask = 0; mask < 128; mask++) {
    const days = [];
    for (let d = 0; d < 7; d++) if (mask & (1 << d)) days.push(d);
    if (days.length !== perWeek) continue;
    let score = 0;
    days.forEach(function (d) { if (gymDays.indexOf(d) < 0) score += 3; });
    const longDay = days.indexOf(6) >= 0 ? 6 : days.indexOf(5) >= 0 ? 5 : -1;
    if (longDay >= 0) score += 2 + (gymDays.indexOf(longDay) < 0 ? 2 : 0);
    let minGap = 7;
    days.forEach(function (d, i) { const next = days[(i + 1) % days.length]; minGap = Math.min(minGap, ((next - d + 7) % 7) || 7); });
    score += minGap * 2;
    if (score > bestScore) { bestScore = score; best = days; }
  }
  return best || [];
}
function runDays() {
  if (!runPlan) return [];
  const own = (runPlan.days || []).filter(function (d) { return d >= 0 && d <= 6; });
  return own.length === runPlan.perWeek ? own.slice().sort() : autoRunDays(runPlan.perWeek, goals.trainDays);
}
// Which run goes on which day: the long run (or race) on the weekend day (or, on a
// shift pattern, the last run day of the week), the rest in order
function placeRuns(sessions, days, weekend) {
  const out = {};
  if (!sessions.length || days.length < sessions.length) return out;
  const sorted = days.slice().sort();
  const last = sorted[sorted.length - 1];
  const longDay = weekend === false ? last : sorted.indexOf(6) >= 0 ? 6 : sorted.indexOf(5) >= 0 ? 5 : last;
  const rest = sorted.filter(function (d) { return d !== longDay; });
  sessions.forEach(function (s, i) { out[i === sessions.length - 1 ? longDay : rest[i]] = s; });
  return out;
}

// The runs of one plan week on the days of one calendar week (Monday = mondayKey).
// Gives back { place: {weekday: session}, spare: how many runs didn't fit }.
function runPlacement(mondayKey, sessions) {
  if (!goals.rota) return { place: placeRuns(sessions, runDays()), spare: 0 };
  // On a shift pattern the days you can run change from week to week
  const r = goals.rota, all = [0, 1, 2, 3, 4, 5, 6];
  const pos = function (d) { return cyclePos(addDays(mondayKey, d)); };
  let cand;
  if (r.run.length) cand = all.filter(function (d) { return r.run.indexOf(pos(d)) >= 0; });
  else {
    cand = all.filter(function (d) { return r.work.indexOf(pos(d)) < 0 && r.gym.indexOf(pos(d)) < 0; });      // days off with no gym
    if (cand.length < sessions.length) cand = all.filter(function (d) { return r.work.indexOf(pos(d)) < 0; }); // any day off
    if (cand.length < sessions.length) cand = all.slice();                                                    // any day at all
  }
  let keep = sessions.slice();
  if (cand.length < keep.length) {
    // Not enough run days this week: keep the long run, then the hard run, then easy ones
    const rank = function (x) { return x.type === "long" || x.type === "race" ? 0 : x.type === "intervals" || x.type === "tempo" ? 1 : 2; };
    const best = keep.slice().sort(function (a, b) { return rank(a) - rank(b); }).slice(0, cand.length);
    keep = keep.filter(function (x) { return best.indexOf(x) >= 0; });
  }
  // The long run goes on the day you are most rested (the later one if it is a tie)
  const rec = function (d) { return recovery(addDays(mondayKey, d)); };
  const longDay = cand.slice().sort(function (a, b) { return rec(b) - rec(a) || b - a; })[0];
  let rest = cand.filter(function (d) { return d !== longDay; });
  const others = keep.slice(0, -1);
  if (rest.length > others.length) {                       // more run days than runs: spread them out
    const pick = [];
    for (let j = 0; j < others.length; j++) pick.push(rest[Math.floor(j * rest.length / others.length)]);
    rest = pick;
  }
  // Of the days left, the hard run (intervals or tempo) takes the most rested one
  const hardAt = others.findIndex(function (x) { return x.type === "intervals" || x.type === "tempo"; });
  const place = {};
  if (keep.length) place[longDay] = keep[keep.length - 1];
  if (hardAt >= 0 && rest.length) {
    const bestDay = rest.slice().sort(function (a, b) { return rec(b) - rec(a) || a - b; })[0];
    place[bestDay] = others[hardAt];
    const easyDays = rest.filter(function (d) { return d !== bestDay; });
    others.filter(function (x, i) { return i !== hardAt; }).forEach(function (x, i) { if (easyDays[i] !== undefined) place[easyDays[i]] = x; });
  } else others.forEach(function (x, i) { if (rest[i] !== undefined) place[rest[i]] = x; });
  return { place: place, spare: sessions.length - keep.length };
}
// Which week of the running plan a date falls in (1 = first)
function planWeekOf(key) {
  return Math.floor(Math.round((new Date(key + "T00:00:00") - new Date(runPlan.start + "T00:00:00")) / 86400000) / 7) + 1;
}

// A run of days starting at startKey (n of them), with the gym session and run
// planned for each, as things stand "now".
function schedule(startKey, n, now) {
  now = now || new Date();
  const today = dateKey(now);
  const history = getHistory();
  const fixed = hasFixedDays();
  const doneOn = {};
  history.forEach(function (w) { doneOn[w.date] = w.name; });

  // One extra day in front, so a clash with the day before the first one is still seen
  const days = [];
  for (let i = -1; i < n; i++) {
    const date = addDays(startKey, i), wd = weekdayOf(date);
    days.push({ i: wd, date: date, name: DAY_NAMES[wd], dom: Number(date.slice(8)), today: date === today, past: date < today,
                work: isWorkDate(date), off: !!goals.rota && !isWorkDate(date), shift: shiftType(date), rec: recovery(date), gym: null, run: null, warn: "" });
  }
  const byDate = {};
  days.forEach(function (d) { byDate[d.date] = d; });

  // Gym: what you did on past days; from today on, the next sessions of your split in order
  const lastDate = days[days.length - 1].date;
  const slots = [];                                       // gym days still to come, from today to the end of the range
  for (let key = today; key <= lastDate; key = addDays(key, 1)) if (fixed && isGymDate(key) && !doneOn[key]) slots.push(key);
  const coming = upcomingSessions(slots.length);
  days.forEach(function (d) {
    if (doneOn[d.date]) d.gym = { name: doneOn[d.date], done: true };
    else if (fixed && isGymDate(d.date)) d.gym = d.past ? { name: "Gym", missed: true } : { name: coming[slots.indexOf(d.date)] };
  });

  // Running: each plan week's runs on that calendar week's run days
  let late = 0, spare = 0;
  if (runPlan) {
    const weeks = planWeeks(runPlan), seen = {};
    days.forEach(function (d) {
      const monday = weekStartKey(d.date);
      if (seen[monday]) return;
      seen[monday] = true;
      const w = planWeekOf(monday);
      if (w < 1 || w > weeks.length) return;
      const fit = runPlacement(monday, weeks[w - 1].sessions);
      if (monday === weekStartKey(today)) spare = fit.spare;
      Object.keys(fit.place).forEach(function (k) {
        const s = fit.place[k], doneId = runPlan.done[s.id];
        let key = addDays(monday, Number(k));
        if (doneId) {                                       // show a finished run on the day it was actually done
          const rec = runs.filter(function (r) { return r.id === doneId; })[0];
          if (rec && weekStartKey(rec.date) === monday) key = rec.date;
        }
        const d2 = byDate[key];
        if (!d2 || d2.run) return;
        d2.run = { s: s, done: !!doneId, late: !doneId && d2.past };
        if (!doneId && d2.past && monday === weekStartKey(today)) late++;
      });
    });
  }
  // Runs or rides you did outside the plan still show up
  runs.forEach(function (r) { const d = byDate[r.date]; if (d && !d.run) d.run = { free: r, done: true }; });

  // Clashes worth knowing about (only for days still to come)
  days.forEach(function (d, i) {
    if (d.past || !d.run || d.run.done || !d.run.s) return;
    const type = d.run.s.type, prev = i > 0 ? days[i - 1] : null;
    const hard = type === "intervals" || type === "tempo", big = type === "long" || type === "race";
    if (d.gym && !d.gym.done && legLoad(d.gym.name) === 2 && (hard || big)) d.warn = "Leg day and a " + (big ? "long" : "hard") + " run on the same day. Run first, or move one of them.";
    else if (big && prev && prev.gym && !prev.gym.missed && legLoad(prev.gym.name) === 2) prev.warn = "Leg day the day before your " + (type === "race" ? "race" : "long run") + ". Go lighter on legs, or swap the days.";
    else if (hard && prev && prev.gym && !prev.gym.missed && legLoad(prev.gym.name) === 2) d.warn = "Fast run the day after leg day. Expect heavy legs; an easy start helps.";
  });
  // Shifts: a gym session or hard run on a day you are short of recovery
  days.forEach(function (d) {
    if (d.past || d.warn || d.rec === null) return;
    const busy = (d.gym && !d.gym.done && !d.gym.missed) || (d.run && !d.run.done && d.run.s && d.run.s.type !== "easy");
    if (busy && (d.rec < 50 || d.shift === "night")) d.warn = recoveryNote(d.date);
  });
  return { days: days.slice(1), fixed: fixed, late: late, spare: spare, monday: startKey };
}
// The seven days of a calendar week (offset 0 = this week, 1 = next week)
function weekSchedule(offset, now) {
  now = now || new Date();
  return schedule(addDays(weekStartKey(dateKey(now)), 7 * (offset || 0)), 7, now);
}
function runShort(s) { return s.title.replace(/^Intervals: /, "Intervals ").replace(/^Tempo: /, "Tempo ") + (s.type === "easy" || s.type === "long" ? " " + fmtKm(s.km) : ""); }
function dayPlanText(d) {
  const bits = [];
  if (d.gym && !d.gym.missed) bits.push(d.gym.name);
  if (d.run) bits.push(d.run.s ? runShort(d.run.s) : fmtKm(d.run.free.km) + " " + RUN_TYPES[d.run.free.type].verb);
  return bits.join(" + ");
}

function renderWeekPlan() {
  const el = $("weekplan");
  if (!el) return;
  const upnext = $("upnext");
  if (!runPlan && !hasFixedDays()) { el.hidden = true; el.innerHTML = ""; upnext.hidden = false; return; }
  el.hidden = false;
  upnext.hidden = true;        // this card shows the same sessions, on their days
  // On a shift pattern a Monday-to-Sunday week means little, so show one full cycle from today
  const r = goals.rota;
  const span = r ? Math.max(7, Math.min(10, r.len)) : 7;
  const wk = r ? schedule(dateKey(new Date()), span) : weekSchedule(0);
  const item = function (text, done, cls) { return `<span class="wp-item${done ? " done" : ""}${cls ? " " + cls : ""}">${done ? "✓ " : ""}${esc(text)}</span>`; };
  let html = `<div class="card-label">${r ? "Next " + span + " days" : "This week"} · ${esc(goals.split === "auto" ? autoSplitLabel() : SPLITS[goals.split].label)}${runPlan ? " + running" : ""}</div>`;
  wk.days.forEach(function (d) {
    let what = "";
    if (d.gym) what += d.gym.missed ? item("Gym missed", false, "miss") : item(d.gym.name, d.gym.done);
    if (d.run) what += d.run.s ? item(runShort(d.run.s), d.run.done, d.run.late ? "miss" : "run") : item(fmtKm(d.run.free.km) + " " + RUN_TYPES[d.run.free.type].verb, true, "run");
    if (!what) what = `<span class="wp-rest">Rest</span>`;
    html += `<div class="wp-row${d.today ? " today" : ""}${d.past ? " past" : ""}${r ? " rota" : ""}"><b>${d.name}${r ? " " + d.dom + `<i class="${d.work ? "w" : "o"}">${d.shift === "night" ? "nights" : d.work ? "work" : "off"}</i>` : ""}</b><div>${what}${d.warn ? `<div class="wp-warn">${esc(d.warn)}</div>` : ""}</div></div>`;
  });
  const notes = [];
  if (wk.late) notes.push(wk.late === 1 ? "One run from earlier this week is still to do: fit it in on a rest day, or let it go." : wk.late + " runs from earlier this week are still to do. Don’t cram them: do the long run and drop the rest.");
  if (wk.spare) notes.push((wk.spare === 1 ? "One run doesn’t" : wk.spare + " runs don’t") + " fit your run days this week, so the easy " + (wk.spare === 1 ? "one is" : "ones are") + " left out.");
  if (!wk.fixed) notes.push(r ? "Pick your gym days in your shift pattern (Me → Goals) to see lifting on here too." : "Pick your gym days in Me → Goals to see lifting on here too.");
  if (runPlan && !r && !(runPlan.days || []).length) notes.push("Run days were chosen to fit around the gym. Change them in the running coach.");
  if (r) notes.unshift("Today is " + cycleLabel(cyclePos(dateKey(new Date()))) + " of your shift pattern.");
  if (notes.length) html += `<div class="feed-meta" style="margin-top:.6rem">${notes.join(" ")}</div>`;
  const own = workout.fromRoutine || workout.name !== upcomingSessions(1)[0];
  html += `<button class="btn ghost" data-wp="skip" style="margin-top:.8rem">${own ? "Back to my split" : "Skip to next gym session"}</button>`;
  el.innerHTML = html;
}


// =====================================================================
// REMINDERS AND THE LOCKED-PHONE REST ALERT (installed app only)
// The website can't send notifications when it is closed; the installed
// app can. Reminders for the next 8 days are worked out from the week
// above and handed to Android, and re-done whenever something changes.
// =====================================================================
const REMIND_IDS = [];
for (let i = 0; i < 9; i++) REMIND_IDS.push(2000 + i);
const REST_NOTE_ID = 900;

// What to remind you about, and when. Pure working-out: nothing is sent here.
function reminderPlan(now) {
  now = now || new Date();
  if (settings.remind !== "on") return [];
  const parts = String(settings.remindAt || "17:00").split(":"), out = [];
  const todayKey = dateKey(now);
  const all = schedule(todayKey, 14, now).days;
  all.forEach(function (d) {
    if (d.date < todayKey || out.length >= 8) return;
    const todo = [];
    if (d.gym && !d.gym.done && !d.gym.missed) todo.push(d.gym.name);
    if (d.run && !d.run.done && d.run.s) todo.push(runShort(d.run.s));
    if (!todo.length) return;
    const at = new Date(d.date + "T00:00:00");
    at.setHours(Number(parts[0]) || 17, Number(parts[1]) || 0, 0, 0);
    if (at.getTime() <= now.getTime() + 60000) return;
    out.push({ id: REMIND_IDS[out.length], at: at, title: "Today: " + todo.join(" + "),
               body: d.warn || (d.run && !d.run.done && d.run.s ? sessionLine(d.run.s) : "Your next session is ready when you are.") });
  });
  // Sunday nudge if the week's goal is slipping and nothing is planned for it
  const goalDays = periodGoal();
  const wb = periodBounds(0);
  const doneDays = getWorkoutDates().filter(function (k) { return k >= wb.start && k <= wb.end; }).length;
  const sunday = new Date(wb.end + "T00:00:00");
  sunday.setHours(Number(parts[0]) || 17, Number(parts[1]) || 0, 0, 0);
  const sundayBusy = out.some(function (r) { return dateKey(r.at) === wb.end; });
  if (doneDays < goalDays && !sundayBusy && sunday.getTime() > now.getTime() + 60000 && out.length < REMIND_IDS.length) {
    const short = goalDays - doneDays;
    out.push({ id: REMIND_IDS[out.length], at: sunday, title: short === 1 ? "One session short this " + periodWord() : short + " sessions short this " + periodWord(),
               body: "Today is the last chance to hit your goal of " + goalDays + ". Even a 20-minute version counts." });
  }
  return out;
}

let remindTimer = null, channelsMade = false;
function makeChannels() {
  if (channelsMade) return;
  channelsMade = true;
  nativeCall("LocalNotifications", "createChannel", { id: "reminders", name: "Workout reminders", description: "A nudge on your training days", importance: 3, visibility: 1 }).catch(function () {});
  nativeCall("LocalNotifications", "createChannel", { id: "rest", name: "Rest timer", description: "Tells you when your rest is over", importance: 5, visibility: 1, vibration: true }).catch(function () {});
}
function syncReminders() {
  if (!NATIVE) return Promise.resolve([]);
  makeChannels();
  const list = reminderPlan(new Date());
  const backup = backupReminder(new Date());
  if (backup) list.push(backup);
  return nativeCall("LocalNotifications", "cancel", { notifications: REMIND_IDS.concat([2100]).map(function (id) { return { id: id }; }) })
    .catch(function () {})
    .then(function () {
      if (!list.length) return list;
      return nativeCall("LocalNotifications", "schedule", { notifications: list.map(function (r) {
        return { id: r.id, title: r.title, body: r.body, channelId: "reminders", schedule: { at: r.at.toISOString(), allowWhileIdle: true } };
      }) }).then(function () { return list; });
    }).catch(function (err) { nativeNote = "Reminders: " + (err && err.message ? err.message : "could not be set"); return []; });
}
// Many things change the week (finishing a workout, a new plan...), so wait a moment and do it once
function queueReminders() {
  if (!NATIVE) return;
  clearTimeout(remindTimer);
  remindTimer = setTimeout(syncReminders, 1500);
}

// Rest timer: if you lock the phone or switch app mid-rest, Android rings when the rest is over
function restNotify(on) {
  if (!NATIVE) return;
  makeChannels();
  nativeCall("LocalNotifications", "cancel", { notifications: [{ id: REST_NOTE_ID }] }).catch(function () {});
  if (!on || restTimer === null || restEnd - Date.now() < 2000) return;
  nativeCall("LocalNotifications", "schedule", { notifications: [{ id: REST_NOTE_ID, title: "Rest over", body: "Time for your next set.", channelId: "rest",
    schedule: { at: new Date(restEnd).toISOString(), allowWhileIdle: true } }] }).catch(function () {});
}
document.addEventListener("visibilitychange", function () {
  restNotify(document.visibilityState === "hidden");
  if (document.visibilityState === "visible") queueReminders();
});


// =====================================================================
// SHIFT-AWARE TRAINING
// Knowing your rota, the app can guess how recovered you are on any day:
// worst on the first day off after night shifts, best a few days into
// your time off. That guess lightens sessions, picks the day for your
// long run, and shows on the schedule.
// =====================================================================
// "night", "day" or "off" for a date (null with no shift pattern)
function shiftType(key) {
  const r = goals.rota;
  if (!r) return null;
  const p = cyclePos(key);
  if (r.work.indexOf(p) < 0) return "off";
  return (r.nights || []).indexOf(p) >= 0 ? "night" : "day";
}
// How recovered you are likely to be, 0 to 100 (null with no shift pattern).
// A rule of thumb, not a measurement: it knows your shifts, not how you slept.
function recovery(key) {
  if (!goals.rota) return null;
  const type = shiftType(key);
  if (type === "off") {
    let off = 0, k = key;
    while (off < 14 && shiftType(k) === "off") { off++; k = addDays(k, -1); }   // off = 1 on the first day off
    const afterNights = shiftType(k) === "night";
    if (off === 1) return afterNights ? 40 : 70;
    if (off === 2) return afterNights ? 75 : 95;
    return 100;
  }
  let run = 0, nights = 0, k2 = addDays(key, -1);                                // shifts in a row before today
  while (run < 14 && shiftType(k2) !== "off") { run++; if (shiftType(k2) === "night") nights++; k2 = addDays(k2, -1); }
  return Math.max(30, (type === "night" ? 55 : 75) - run * 6 - nights * 2);
}
function recoveryNote(key) {
  const rec = recovery(key), type = shiftType(key);
  if (rec === null) return "";
  if (type === "off" && rec < 50) return "First day off after nights. Keep it light: sleep comes first.";
  if (type === "night") return "Night shift today. Train before it and keep it short.";
  if (type === "day" && rec < 60) return "Several shifts in a row. A shorter session is fine.";
  return "";
}
// The cycle days you are likely to be freshest on, best first (for choosing gym days)
function freshestDays() {
  const r = goals.rota;
  if (!r) return [];
  const list = [];
  for (let i = 0; i < r.len; i++) list.push({ i: i, rec: recovery(addDays(r.start, i)) });
  return list.filter(function (d) { return d.rec >= 90; }).map(function (d) { return d.i; });
}
// What your shifts suggest for "How do you feel today?" when you haven't said
function shiftReadiness() {
  const rec = recovery(dateKey(new Date()));
  return rec !== null && rec < 50 ? "tired" : null;
}


// =====================================================================
// RACE YOUR PAST SELF ("ghost")
// Start a run where you have started one before and the app finds your
// best run from there. As you go it compares where you are with where
// that run was at the same distance.
// =====================================================================
// A past run as distance-against-time, ready to compare with
function ghostData(r) {
  const pts = decodeRoute(r.route);
  if (pts.length < 4) return null;
  let total = 0;
  const cum = pts.map(function (p, i) { if (i) total += haversine(pts[i - 1][0], pts[i - 1][1], p[0], p[1]); return total; });
  let t = decodeTimes(r.rt);
  if (t.length !== pts.length) t = cum.map(function (d) { return total > 0 ? r.secs * d / total : 0; });
  if (total < 0.3) return null;
  return { id: r.id, date: r.date, pts: pts, cum: cum, t: t, total: total, secs: t[t.length - 1] };
}
// Your quickest past run of this kind that started within 150 m of here
function ghostFor(lat, lng, type) {
  let best = null;
  runs.forEach(function (r) {
    if (r.type !== type || !r.route || r.route.length < 8) return;
    if (haversine(lat, lng, r.route[0] / 1e5, r.route[1] / 1e5) > 0.15) return;
    const g = ghostData(r);
    if (g && (!best || g.secs / g.total < best.secs / best.total)) best = g;
  });
  return best;
}
// How long the ghost took to reach a distance, and how far it had got by a time
function ghostTimeAt(g, km) {
  if (km >= g.total) return g.secs;
  let i = 0;
  while (i + 1 < g.cum.length && g.cum[i + 1] < km) i++;
  const span = g.cum[i + 1] - g.cum[i];
  return span > 0 ? g.t[i] + (g.t[i + 1] - g.t[i]) * (km - g.cum[i]) / span : g.t[i];
}
function ghostDistAt(g, secs) {
  if (secs >= g.secs) return g.total;
  let i = 0;
  while (i + 1 < g.t.length && g.t[i + 1] < secs) i++;
  const span = g.t[i + 1] - g.t[i];
  return span > 0 ? g.cum[i] + (g.cum[i + 1] - g.cum[i]) * (secs - g.t[i]) / span : g.cum[i];
}
// Seconds you are ahead (+) or behind (-) at your current distance
function ghostGap(now) {
  const g = trk.ghost;
  if (!g || trk.dist > g.total || trk.dist < 0.05) return null;
  return ghostTimeAt(g, trk.dist) - trackElapsed(now);
}
function ghostWords(gap) {
  const s = Math.round(Math.abs(gap));
  if (s < 3) return "Level with your best.";
  return (s >= 60 ? sayDur(s) : s + " seconds") + (gap > 0 ? " ahead of your best." : " behind your best.");
}
function ghostShort(gap, now) {
  const g = trk.ghost, s = Math.round(Math.abs(gap));
  const metres = Math.round(Math.abs(ghostDistAt(g, trackElapsed(now)) - trk.dist) * 1000);
  return s < 3 ? "Level with your best" : (s >= 60 ? runClock(s) : s + " s") + (gap > 0 ? " ahead" : " behind") + " · " + metres + " m";
}
// Still on the ghost's route? Five points in a row more than 120 m from it ends the race.
function ghostCheck(lat, lng) {
  const g = trk.ghost;
  if (!g || trk.dist < 0.2) return;
  let near = Infinity;
  for (let i = 0; i < g.pts.length; i++) near = Math.min(near, haversine(lat, lng, g.pts[i][0], g.pts[i][1]));
  trk.ghostOff = near > 0.12 ? (trk.ghostOff || 0) + 1 : 0;
  if (trk.ghostOff >= 5) { trk.ghost = null; runSay("This is a different route, so the race with your best is off."); }
}
// At the finish: how you did against it, if you covered its distance
function ghostResult(marks) {
  const g = trk.ghost;
  if (!g || !marks.length || marks[marks.length - 1][0] < g.total * 0.97) return null;
  let i = 0;
  while (i + 1 < marks.length && marks[i + 1][0] < g.total) i++;
  const a = marks[i], b = marks[Math.min(i + 1, marks.length - 1)];
  const mine = b[0] > a[0] ? a[1] + (b[1] - a[1]) * Math.min(1, (g.total - a[0]) / (b[0] - a[0])) : a[1];
  return { secs: Math.round(g.secs - mine), date: g.date };
}


// =====================================================================
// TALK TO IT
// "eighty for eight" logs 80 kg x 8 on the next set. The clever part is
// turning spoken words into numbers; the listening itself is done by the
// phone (and needs a small add-on in the installed app).
// =====================================================================
const NUM_WORDS = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
// "eighty two point five for eight" -> "82.5 for 8"
function wordsToDigits(text) {
  const words = String(text || "").toLowerCase().replace(/[-,]/g, " ").replace(/\s+/g, " ").trim().split(" ");
  const out = [];
  let cur = null, frac = null;                          // the number being built, and digits after "point"
  const flush = function () { if (cur !== null) { out.push(String(cur) + (frac !== null ? "." + frac : "")); cur = null; frac = null; } };
  for (let i = 0; i < words.length; i++) {
    const w = words[i], n = NUM_WORDS[w];
    if (/^\d+(\.\d+)?$/.test(w)) { flush(); out.push(w); continue; }
    if (frac !== null && n !== undefined && n < 10) { frac += String(n); continue; }
    if (n !== undefined) {
      if (cur === null) cur = n;
      else if (n < 10 && cur % 10 === 0 && cur >= 20) cur += n;          // "eighty" + "two"
      else if (cur >= 100 && cur % 100 === 0) cur += n;                  // "hundred" + "ten"
      else if (cur >= 100 && n < 10 && cur % 10 === 0) cur += n;         // "hundred twenty" + "five"
      else { flush(); cur = n; }
      continue;
    }
    if (w === "hundred") { cur = (cur === null || cur === 0 ? 1 : cur) * 100; continue; }
    if (w === "a" && words[i + 1] === "hundred") continue;
    if (w === "and" && cur !== null && (words[i + 1] === "a" && words[i + 2] === "half")) { cur += 0.5; i += 2; continue; }
    if (w === "and" && cur !== null && cur >= 100 && NUM_WORDS[words[i + 1]] !== undefined) continue;   // "a hundred and ten"
    if (w === "point" && cur !== null && NUM_WORDS[words[i + 1]] !== undefined) { frac = ""; continue; }
    flush();
    out.push(w);
  }
  flush();
  return out.join(" ");
}
// What did they mean? { kind: "set", weight (number, 0 for bodyweight, or null = leave as it is), reps (or null) }
// or { kind: "cmd", cmd: "done" | "skip" | "next" | "finish" }, or null if it made no sense.
function parseSetSpeech(text) {
  const t = wordsToDigits(text).replace(/kilograms?|kilos?|kgs?|kg|pounds?|lbs?/g, " kg ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (/^(same|same again|again|same as last time)$/.test(t)) return { kind: "set", weight: null, reps: null };
  if (/^(done|tick|log it|that's it|finished set)$/.test(t)) return { kind: "cmd", cmd: "done" };
  if (/skip( the)? rest|^skip$/.test(t)) return { kind: "cmd", cmd: "skip" };
  if (/what'?s next|^next$|what is next/.test(t)) return { kind: "cmd", cmd: "next" };
  if (/finish( the)? workout/.test(t)) return { kind: "cmd", cmd: "finish" };
  let m = /(?:body ?weight|no weight)\D*(\d+)/.exec(t);
  if (m) return { kind: "set", weight: 0, reps: Number(m[1]) };
  m = /(\d+(?:\.\d+)?)(?: kg)? (?:for|by|x|times|at) (\d+)(?! ?kg)/.exec(t);
  if (m) return { kind: "set", weight: Number(m[1]), reps: Number(m[2]) };
  m = /(\d+) (?:reps?|times) (?:at|of|with|on) (\d+(?:\.\d+)?)/.exec(t);
  if (m) return { kind: "set", weight: Number(m[2]), reps: Number(m[1]) };
  m = /(\d+(?:\.\d+)?) kg (\d+)/.exec(t);
  if (m) return { kind: "set", weight: Number(m[1]), reps: Number(m[2]) };
  m = /^(\d+) reps?$/.exec(t);
  if (m) return { kind: "set", weight: null, reps: Number(m[1]) };
  m = /^(\d+(?:\.\d+)?) kg$/.exec(t);
  if (m) return { kind: "set", weight: Number(m[1]), reps: null };
  m = /^(\d+(?:\.\d+)?) (\d+)$/.exec(t);
  if (m) return { kind: "set", weight: Number(m[1]), reps: Number(m[2]) };
  return null;
}
// Speak a short line (workout voice, separate from the run voice)
function coachSay(text) {
  if (NATIVE) { nativeCall("TextToSpeech", "speak", { text: text, lang: "en-GB", rate: 1.0, pitch: 1.0, volume: 1.0, queueStrategy: 1 }).catch(function () {}); return; }
  try {
    if (typeof speechSynthesis === "undefined" || typeof SpeechSynthesisUtterance === "undefined") return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-GB";
    speechSynthesis.speak(u);
  } catch (err) { /* optional */ }
}
// Acts on what was heard. Gives back the words to show and say.
function voiceApply(heard) {
  const p = parseSetSpeech(heard);
  if (!p) return { ok: false, say: "Sorry, I didn’t catch a set in that. Try “eighty for eight”." };
  if (p.kind === "cmd") {
    if (p.cmd === "skip") { stopRest(); return { ok: true, say: "Rest skipped." }; }
    if (p.cmd === "finish") return { ok: true, say: "Tap Finish workout when you’re ready.", finish: true };
    if (p.cmd === "next") {
      const t0 = focusTarget();
      return { ok: true, say: t0 ? "Next is " + workout.exercises[t0.ei].name + "." : "Every set is ticked." };
    }
  }
  const t = focusTarget();
  if (!t) return { ok: false, say: "Every set is already ticked." };
  const ex = workout.exercises[t.ei], s = ex.sets[t.si];
  if (isCardio(ex.name)) return { ok: false, say: "Voice logging works for weights and reps, not cardio yet." };
  if (p.kind === "set") {
    if (p.weight !== null) {
      if (p.weight < 0 || p.weight > 600) return { ok: false, say: "That weight doesn’t sound right." };
      s.weight = p.weight > 0 ? Math.round(fromDisp(p.weight) * 1000) / 1000 : "";
    }
    if (p.reps !== null) {
      if (p.reps < 1 || p.reps > 100) return { ok: false, say: "That number of reps doesn’t sound right." };
      s.reps = String(p.reps);
    }
  }
  if (String(s.reps).trim() === "") s.reps = String(parseInt(ex.target) || "");
  const said = ((parseFloat(s.weight) || 0) > 0 ? fmtW(s.weight) + " " + (unit() === "kg" ? "kilos" : "pounds") + " for " : "") + s.reps + ((parseFloat(s.weight) || 0) > 0 ? "" : " reps");
  completeSet({ ex: ex, s: s, t: t });
  return { ok: true, say: "Logged " + said + "." };
}
function voiceAvailable() {
  if (NATIVE) return !!(window.Capacitor.Plugins && window.Capacitor.Plugins.SpeechRecognition);
  return typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}
// Listens once and gives back the list of things it might have heard
function listenOnce() {
  if (NATIVE) {
    return nativeCall("SpeechRecognition", "requestPermissions", {}).catch(function () {})
      .then(function () { return nativeCall("SpeechRecognition", "start", { language: "en-GB", maxResults: 4, prompt: "Say your set, like eighty for eight", partialResults: false, popup: true }); })
      .then(function (res) { return (res && res.matches) || []; });
  }
  return new Promise(function (resolve, reject) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { reject(new Error("no speech recognition")); return; }
    const rec = new SR();
    rec.lang = "en-GB"; rec.maxAlternatives = 4; rec.interimResults = false;
    let got = false;
    rec.onresult = function (e) { got = true; const alts = []; for (let i = 0; i < e.results[0].length; i++) alts.push(e.results[0][i].transcript); resolve(alts); };
    rec.onerror = function (e) { if (!got) reject(new Error(e.error || "could not listen")); };
    rec.onend = function () { if (!got) resolve([]); };
    rec.start();
  });
}
function voiceLog() {
  const status = $("fo-voice");
  if (status) status.textContent = "Listening…";
  return listenOnce().then(function (alts) {
    // The phone offers a few guesses: use the first that makes sense
    let pick = alts.filter(function (a) { return parseSetSpeech(a); })[0] || alts[0] || "";
    if (!pick) { if ($("fo-voice")) $("fo-voice").textContent = "Didn’t hear anything. Tap the mic and try again."; return null; }
    const res = voiceApply(pick);
    coachSay(res.say);
    if (focusOn) renderFocus();
    if ($("fo-voice")) $("fo-voice").textContent = "“" + pick + "” → " + res.say;
    return res;
  }, function (err) {
    if ($("fo-voice")) $("fo-voice").textContent = "Couldn’t listen: " + (err && err.message ? err.message : "microphone not available") + ".";
    return null;
  });
}


// =====================================================================
// THE PHONE COUNTS YOUR REPS (beta)
// With the phone strapped to the bar, or in a pocket that moves with the
// lift, its motion sensor feels each rep. The app counts them and notices
// when they slow down, which is the sign you are near your limit.
// This is new and needs tuning on real lifts: treat the numbers as a guide.
// =====================================================================
function newRepCounter() {
  return { g: null, a: 0, v: 0, lastT: 0, side: 0, first: 0, reps: [], peak: 0, lastRepT: 0, lastMoveT: 0, startT: 0 };
}
// One sensor reading: t in seconds, x/y/z = acceleration including gravity (m/s²).
// Gives back true when this reading completed a rep.
function repFeed(rc, t, x, y, z) {
  if (!rc.g) { rc.g = [x, y, z]; rc.lastT = t; rc.startT = t; rc.lastMoveT = t; return false; }
  const dt = Math.min(0.1, Math.max(0.001, t - rc.lastT));
  rc.lastT = t;
  // Gravity changes slowly; movement changes quickly. Follow gravity slowly and what is left is the movement.
  const kg = dt / (3 + dt);
  rc.g = [rc.g[0] + (x - rc.g[0]) * kg, rc.g[1] + (y - rc.g[1]) * kg, rc.g[2] + (z - rc.g[2]) * kg];
  const gm = Math.sqrt(rc.g[0] * rc.g[0] + rc.g[1] * rc.g[1] + rc.g[2] * rc.g[2]) || 9.81;
  const up = ((x - rc.g[0]) * rc.g[0] + (y - rc.g[1]) * rc.g[1] + (z - rc.g[2]) * rc.g[2]) / gm;   // movement along up/down
  rc.a += (up - rc.a) * (dt / (0.12 + dt));                 // smooth out jitter
  rc.v = (rc.v + rc.a * dt) * Math.exp(-dt / 1.2);          // speed, slowly forgetting so errors don't build up
  const TH = 0.1;                                            // m/s: slower than this is "not moving"
  if (Math.abs(rc.v) > TH) rc.lastMoveT = t;
  rc.peak = Math.max(rc.peak, Math.abs(rc.v));
  const side = rc.v > TH ? 1 : rc.v < -TH ? -1 : 0;
  if (side === 0 || side === rc.side) return false;
  // Speed has swung to the other direction. A rep is one swing out and one swing back,
  // so count it each time the swing goes against the direction the set started in.
  if (rc.side === 0 && !rc.first) { rc.first = side; rc.side = side; rc.lastRepT = t; return false; }
  rc.side = side;
  if (side === rc.first) return false;
  const took = t - rc.lastRepT;
  rc.lastRepT = t;
  if (took < (rc.reps.length ? 0.6 : 0.3)) { rc.peak = 0; return false; }   // too quick to be a rep: a knock or a re-grip
  rc.reps.push({ secs: Math.round(took * 100) / 100, peak: Math.round(rc.peak * 100) / 100 });
  rc.peak = 0;
  return true;
}
// How much slower the last rep was than your best early one (0.3 = 30% slower)
function repSlowdown(rc) {
  if (rc.reps.length < 3) return null;
  const early = Math.max(rc.reps[0].peak, rc.reps[1].peak), last = rc.reps[rc.reps.length - 1].peak;
  return early > 0 ? Math.max(0, Math.round((1 - last / early) * 100) / 100) : null;
}
function repAdvice(rc) {
  const slow = repSlowdown(rc);
  if (slow === null) return "";
  if (slow >= 0.4) return "That last rep was a grind: you were at your limit.";
  if (slow >= 0.25) return "Slowing down: about one rep left in the tank.";
  if (slow >= 0.12) return "About two reps left in the tank.";
  return "Still moving fast: three or more left. Add weight next set.";
}

let repRC = null, repOn = false, repDoneTimer = null;
function repMotion(e) {
  const a = e.accelerationIncludingGravity;
  if (!repRC || !a || a.x === null) return;
  const t = (e.timeStamp || Date.now()) / 1000;
  if (repFeed(repRC, t, a.x, a.y, a.z)) { ivBeep(990, 60); repShow(); }
}
function repShow() {
  const el = $("fo-reps");
  if (!el || !repRC) return;
  el.textContent = repRC.reps.length ? repRC.reps.length + (repRC.reps.length === 1 ? " rep" : " reps") + " counted" : "Counting: start your set";
}
// Three seconds of stillness after at least two reps = the set is over
function repWatch() {
  if (!repOn || !repRC) return;
  const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
  if (repRC.reps.length >= 2 && repRC.lastT - repRC.lastMoveT > 3) repFinish();
}
function repFinish() {
  if (!repRC || !repRC.reps.length) return null;
  const n = repRC.reps.length, advice = repAdvice(repRC);
  const box = $("fo-b");
  if (box) box.value = String(n);
  coachSay(n + " reps. " + advice);
  const el = $("fo-reps");
  if (el) el.textContent = n + " reps counted. " + advice + " Check the number, then tap Done.";
  repRC = newRepCounter();
  return { reps: n, advice: advice };
}
function repToggle() {
  if (repOn) { repStop(); if (focusOn) renderFocus(); return; }
  const begin = function () {
    repOn = true; repRC = newRepCounter();
    window.addEventListener("devicemotion", repMotion);
    repDoneTimer = setInterval(repWatch, 500);
    if (focusOn) renderFocus();
  };
  try {
    if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
      DeviceMotionEvent.requestPermission().then(function (ans) { if (ans === "granted") begin(); }).catch(function () {});
    } else begin();
  } catch (err) { /* no motion sensor */ }
}
function repStop() {
  repOn = false; repRC = null;
  try { window.removeEventListener("devicemotion", repMotion); } catch (err) {}
  clearInterval(repDoneTimer);
}
function repAvailable() { return typeof window !== "undefined" && typeof window.DeviceMotionEvent !== "undefined"; }


// =====================================================================
// AI COACH
// Sends a short summary of your training to Claude (Anthropic's AI) with
// your question, and shows the answer. It uses your own API key, kept on
// this phone only and never put in backups. Each question costs a small
// amount on your Anthropic account.
// =====================================================================
const AI_MODELS = [["claude-haiku-5-5", "Quick"], ["claude-sonnet-5-5", "Thorough"]];
let aiChat = [];           // this conversation: [{ role: "user" | "assistant", content }]
let aiBusy = false;
function aiKey() { try { return localStorage.getItem("aiKey") || ""; } catch (err) { return ""; } }
function aiModel() { return AI_MODELS.some(function (m) { return m[0] === settings.aiModel; }) ? settings.aiModel : AI_MODELS[0][0]; }

// Everything the coach is told about you, as plain text
function coachContext() {
  const L = [];
  const today = dateKey(new Date());
  L.push("Today: " + today + " (" + DAY_FULL[weekdayOf(today)] + "). Units: " + unit() + ", " + distUnit() + ".");
  L.push("Goal: " + goals.goal + ". Experience: " + goals.experience + ". Session length: " + goals.minutes + " min. Split: " + (goals.split === "auto" ? autoSplitLabel() : SPLITS[goals.split].label) + ".");
  if (goals.focus.length) L.push("Focus muscles: " + goals.focus.join(", ") + ".");
  if (goals.avoid.length) L.push("Avoiding (injury or niggle): " + goals.avoid.join(", ") + ".");
  if (goals.rota) {
    const r = goals.rota;
    L.push("Shift pattern: " + r.len + "-day cycle, works days " + r.work.map(function (d) { return d + 1; }).join(",") + (r.nights && r.nights.length ? " (nights on days " + r.nights.map(function (d) { return d + 1; }).join(",") + ")" : "") +
      ". Today is " + cycleLabel(cyclePos(today)) + ". Gym on: " + r.gym.map(cycleLabel).join(", ") + ". Estimated recovery today: " + recovery(today) + "/100.");
  } else if (goals.trainDays.length) L.push("Trains on: " + goals.trainDays.map(function (d) { return DAY_NAMES[d]; }).join(", ") + ".");
  else L.push("Aims for " + goals.days + " gym days a week, no fixed days.");
  const body = load("bodyLog", []);
  if (body.length) L.push("Bodyweight: " + fmtW(body[body.length - 1].weight) + " " + unit() + (body.length > 1 ? " (was " + fmtW(body[0].weight) + " on " + body[0].date + ")" : "") + ".");
  L.push("Streak: " + streakText(weekStreak()) + ". This " + periodWord() + ": " + weekStats(0).workouts + " workouts, " + weekStats(0).sets + " sets. Last " + periodWord() + ": " + weekStats(1).workouts + " workouts, " + weekStats(1).sets + " sets.");
  const hist = getHistory().slice(-10);
  if (hist.length) {
    L.push("Recent gym sessions (oldest first):");
    hist.forEach(function (w) {
      L.push("- " + w.date + " " + w.name + (w.feel ? " (rated " + w.feel + "/5)" : "") + (w.memo ? " note: " + w.memo : "") + ": " +
        w.exercises.slice(0, 8).map(function (ex) {
          if (isCardio(ex.name)) return ex.name + " " + ex.sets.map(cardioText).join("+");
          let best = null;
          ex.sets.forEach(function (s) { const kg = parseFloat(s.weight) || 0; if (!best || kg > best.kg) best = { kg: kg, reps: parseInt(s.reps) || 0 }; });
          return ex.name + " " + ex.sets.length + "x" + (best && best.kg ? fmtW(best.kg) + unit() + "x" + best.reps : (best ? best.reps : 0) + " reps");
        }).join("; "));
    });
  } else L.push("No gym sessions logged yet.");
  if (runPlan) L.push("Running plan: " + RUN_GOALS[runPlan.goal].label + ", " + runPlan.perWeek + " runs a week, week " + planWeekNow() + " of " + RUN_GOALS[runPlan.goal].weeks + ", current 5K " + runClock(runPlan.t5) + ".");
  const rr = runs.slice(-6);
  if (rr.length) L.push("Recent runs: " + rr.map(function (r) { return r.date + " " + r.type + " " + fmtKm(r.km) + " in " + runClock(r.secs) + (r.type === "ride" || !r.km ? "" : " (" + paceStr(r.secs / r.km) + paceUnit() + ")"); }).join("; ") + ".");
  const days = schedule(today, 8).days.filter(function (d) { return d.gym || d.run; }).map(function (d) { return d.name + " " + d.dom + ": " + dayPlanText(d) + (d.warn ? " [" + d.warn + "]" : ""); });
  if (days.length) L.push("Planned next 8 days: " + days.join("; ") + ".");
  return L.join("\n");
}
const AI_SYSTEM = "You are the coach inside BTB (Beyond The Body), a personal strength and running app. " +
  "Answer the user's question using the training summary provided. Be specific to their numbers, practical and brief: a few short paragraphs or a short list, in plain English. " +
  "If the summary doesn't hold what you need, say so. You are not a doctor: for pain, injury or health worries, suggest seeing a professional. Never invent sessions or numbers that are not in the summary.";

// Asks the coach. Gives back the answer text, or throws an Error with a plain message.
function askCoach(question) {
  const key = aiKey();
  if (!key) return Promise.reject(new Error("Add your API key first."));
  const messages = aiChat.slice(-6).concat([{ role: "user", content: question }]);
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: aiModel(), max_tokens: 700, system: AI_SYSTEM + "\n\nTRAINING SUMMARY\n" + coachContext(), messages: messages })
  }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (data) {
      if (!res.ok) {
        const why = data && data.error && data.error.message ? data.error.message : "error " + res.status;
        throw new Error(res.status === 401 ? "That API key was not accepted. Check it in the coach settings." : res.status === 429 ? "The coach is busy or your account is out of credit. Try again shortly." : "The coach couldn’t answer (" + why + ").");
      }
      const text = (data.content || []).filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("\n").trim();
      if (!text) throw new Error("The coach sent back an empty answer.");
      aiChat.push({ role: "user", content: question }, { role: "assistant", content: text });
      return text;
    });
  }, function () { throw new Error("Couldn’t reach the coach. Check your internet connection."); });
}
// Shows the coach's words safely: your text can't break the page, **bold** and new lines work
function aiHtml(text) {
  return esc(text).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/^\s*[-•]\s+/gm, "• ").replace(/\n/g, "<br>");
}
function openCoach(note) {
  if (!aiKey()) {
    openSheet(`<div class="card-label">AI coach</div><div class="big">Ask about your training</div>
      <div class="feed-meta" style="margin:.6rem 0">The coach reads a summary of your sessions, runs, shifts and goals, then answers in plain English: “review my last cycle”, “why has my bench stalled?”, “what should I change?”.</div>
      <div class="card-label" style="margin-top:.8rem">It needs your own Anthropic API key</div>
      <div class="feed-meta">1. Go to console.anthropic.com and create an account.<br>2. Add a little credit (it is pay as you go; each question costs a small amount).<br>3. Create an API key and paste it here.</div>
      <input type="password" class="inp-date" id="ai-key" placeholder="sk-ant-…" autocomplete="off" style="margin-top:.6rem">
      <div class="feed-meta" id="ai-msg" style="margin-top:.4rem">${esc(note || "The key stays on this phone and is never put in backups. Your training summary is sent to Anthropic to get each answer.")}</div>
      <button class="btn" data-run="ai-save">Save key</button><button class="btn ghost" data-a="add-close">Not now</button>`);
    return;
  }
  const quick = ["Review my last " + periodWord(), "What should I change?", "Am I recovering enough?", "Where am I strongest and weakest?"];
  openSheet(`<div class="card-label">AI coach</div>
    <div class="ai-log" id="ai-log">${aiChat.length ? aiChat.map(function (m) { return `<div class="ai-msg ${m.role === "user" ? "me" : "it"}">${aiHtml(m.content)}</div>`; }).join("") : `<div class="feed-meta">Ask anything about your training. The coach can see your recent sessions, runs, shifts and plan.</div>`}${aiBusy ? `<div class="ai-msg it">Thinking…</div>` : ""}</div>
    ${note ? `<div class="feed-meta" style="color:#e0b050">${esc(note)}</div>` : ""}
    <div class="chips" style="margin:.6rem 0">${quick.map(function (q) { return `<button class="chip" data-run="ai-quick" data-q="${esc(q)}">${esc(q)}</button>`; }).join("")}</div>
    <textarea class="set-input note" id="ai-q" rows="2" maxlength="400" placeholder="Your question"></textarea>
    <button class="btn" data-run="ai-ask"${aiBusy ? " disabled" : ""}>Ask</button>
    <div class="chips" style="margin-top:.6rem">${AI_MODELS.map(function (m) { return `<button class="chip${aiModel() === m[0] ? " on" : ""}" data-run="ai-model" data-v="${m[0]}">${m[1]}</button>`; }).join("")}
      <button class="chip" data-run="ai-forget">Remove key</button></div>
    <button class="btn ghost" data-a="add-close">Close</button>`);
  const log = $("ai-log");
  if (log) log.scrollTop = log.scrollHeight;
}
function coachSend(question) {
  question = String(question || "").trim();
  if (!question || aiBusy) return Promise.resolve(null);
  aiBusy = true;
  aiChat.push({ role: "user", content: question });      // shown straight away; replaced by the real pair when the answer lands
  openCoach();
  aiChat.pop();
  return askCoach(question).then(function (text) { aiBusy = false; openCoach(); return text; },
    function (err) { aiBusy = false; openCoach(err.message); return null; });
}
$("sheet").addEventListener("click", function (e) {
  const b = e.target.closest("[data-run]");
  if (!b) return;
  const a = b.dataset.run;
  if (a === "ai-save") {
    const v = String(($("ai-key") || {}).value || "").trim();
    if (v.length < 20) { $("ai-msg").textContent = "That doesn’t look like a full API key."; return; }
    try { localStorage.setItem("aiKey", v); } catch (err) {}
    openCoach();
  }
  if (a === "ai-ask") coachSend(($("ai-q") || {}).value);
  if (a === "ai-quick") coachSend(b.dataset.q);
  if (a === "ai-model") { settings.aiModel = b.dataset.v; save("settings", settings); openCoach(); }
  if (a === "ai-forget" && confirm("Remove your API key from this phone?")) { try { localStorage.removeItem("aiKey"); } catch (err) {} aiChat = []; openCoach(); }
});


function renderAll() {
  renderRun();
  renderEquipment();
  renderGoals();
  renderTargets();
  renderProgramme();
  renderReadiness();
  renderSore();
  renderSettings();
  renderGear();
  renderCustom();
  renderRoutines();
  renderDeload();
  refreshHome();
  renderWorkout();
  renderFeed();
  renderProgress();
  renderBodyForm();
  renderPhotoForm();
  renderPhotos();
  renderPin();
  renderBackupStatus();
}

// First ever launch (or old data we can't read): build a workout to start with
if (!workout || !Array.isArray(workout.exercises)) {
  workout = newWorkout(buildPlan() || template);
  saveWorkout();
}

renderAll();

// Reopen on the tab you were last using
const lastTab = load("lastTab", null);
if (typeof lastTab === "string" && $(lastTab)) showTab(lastTab);
else showTab("home");

maybeWelcome();   // brand-new here? walk through a quick setup

// Lets the app install to your home screen and open offline.
// (Browsers only allow this on https:// or localhost.)
if (!NATIVE && "serviceWorker" in navigator &&
    (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  navigator.serviceWorker.register("sw.js").catch(function () {});
}

// =====================================================================
// UPDATE CHECK
// Fetches app.js fresh from the server, reads the version number out of it,
// and compares it with the version this phone is running.
// =====================================================================
function versionFrom(text) {
  const m = /const APP_VERSION = "([^"]+)"/.exec(String(text));
  return m ? m[1] : null;
}

function showUpdateBanner(newVersion) {
  $("update-text").textContent = "Update available (v" + newVersion + ")";
  $("update-banner").classList.add("show");
}

let lastUpdateCheck = 0;
function checkForUpdate(manual) {
  if (typeof fetch !== "function") return Promise.resolve(null);
  const now = Date.now();
  if (!manual && now - lastUpdateCheck < 60000) return Promise.resolve(null);   // at most once a minute
  lastUpdateCheck = now;

  return fetch("app.js?check=" + now, { cache: "no-store" })
    .then(function (res) { return res.ok ? res.text() : null; })
    .then(function (text) {
      const latest = versionFrom(text);
      if (!latest) return "unknown";
      if (latest !== APP_VERSION) { showUpdateBanner(latest); return "update"; }
      return "current";
    })
    .catch(function () { return "offline"; });
}

// Reload properly: ask the server for fresh copies of every file first (this also
// replaces the copies the browser was holding on to), clear the offline copies, then reload.
function refreshApp() {
  $("update-text").textContent = "Updating…";
  const files = ["./", "index.html", "style.css", "app.js", "manifest.json", "sw.js"];
  const fetches = typeof fetch === "function"
    ? files.map(function (f) { return fetch(f, { cache: "reload" }).catch(function () {}); })
    : [];
  return Promise.all(fetches)
    .then(function () {
      return (typeof caches !== "undefined")
        ? caches.keys().then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); })
        : null;
    })
    .catch(function () {})
    .then(function () { location.reload(); });
}

$("update-reload").addEventListener("click", refreshApp);
$("update-dismiss").addEventListener("click", function () { $("update-banner").classList.remove("show"); });

$("version-check").addEventListener("click", function () {
  $("version-status").textContent = "Checking…";
  checkForUpdate(true).then(function (r) {
    $("version-status").textContent =
      r === "update" ? "A new version is ready. Tap Reload in the banner." :
      r === "current" ? "You have the latest version." :
      r === "offline" ? "Couldn’t check. Are you online?" : "Couldn’t read the version.";
  });
});

$("version-label").textContent = "Version " + APP_VERSION;

// Check when the app starts and whenever you come back to it
checkForUpdate(false);
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible") checkForUpdate(false);
});
