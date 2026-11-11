// =====================================================================
// APP VERSION
// Change this number every time you upload new files to GitHub.
// Phones check it, and show an "Update available" banner when it changes.
// =====================================================================
const APP_VERSION = "2.6.1";

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
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
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
const REST_OPTIONS = [45, 60, 90, 120, 180, 240];

let settings = load("settings", { units: "kg", rest: 90 });
if (!settings.warmup) settings.warmup = "off";
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
    group("Auto warm-up sets", "warmup", [["off", "Off"], ["barbell", "Barbell lifts"]]);
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
  save("settings", settings);
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
  train:    { subs: [{ screen: "workout", label: "Workout" }, { screen: "library", label: "Library" }] },
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
    html += `<div class="eq-head${open ? " open" : ""}" data-eq="toggle" data-cat="${esc(category)}">
      <div class="eq-title"><svg class="eq-chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>${esc(category)} <span class="eq-have">${have}/${all.length}</span></div>
      <button class="eq-all" data-eq="all" data-cat="${esc(category)}">${allOn ? "Clear" : "Select all"}</button>
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
  $("home-equip").textContent = selected.length + " items";
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
  return g;
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
  return r && r.date === dateKey(new Date()) ? r.level : null;
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

function renderGoals() {
  let html = "";

  for (const key in goalOptions) {
    const g = goalOptions[key];
    html += `<div class="goal-group">
               <div class="card-label">${g.label}</div>
               <div class="chips">`;
    g.options.forEach(function (opt) {
      const isOn = goals[key] === opt;
      html += `<button class="chip${isOn ? " on" : ""}" data-key="${key}" data-value="${opt}">${opt}${g.suffix || ""}</button>`;
    });
    html += `</div>`;
    if (key === "goal") html += `<div class="feed-meta goal-blurb">${esc(goalProfile().blurb)}</div>`;
    html += `</div>`;
  }

  html += `<div class="goal-group"><div class="card-label">Focus muscles (up to 3)</div><div class="chips">`;
  MUSCLES.forEach(function (m) {
    html += `<button class="chip${goals.focus.includes(m[0]) ? " on" : ""}" data-multi="focus" data-value="${m[0]}">${m[1]}</button>`;
  });
  html += `</div><div class="feed-meta goal-blurb">${goals.focus.length ? "These get an extra set and an extra exercise when the session allows." : "None picked: your plan is balanced."}</div></div>`;

  html += `<div class="goal-group"><div class="card-label">Avoid (injuries or niggles)</div><div class="chips">`;
  Object.keys(AVOID_AREAS).forEach(function (a) {
    html += `<button class="chip${goals.avoid.includes(a) ? " on" : ""}" data-multi="avoid" data-value="${a}">${a}</button>`;
  });
  html += `</div><div class="feed-meta goal-blurb">${goals.avoid.length ? "Exercises that load these are left out of your plans." : "Nothing avoided."}</div></div>`;

  html += `<div class="goal-group"><div class="card-label">Rest timer</div><div class="chips">
    <button class="chip${goals.autoRest ? " on" : ""}" data-key="autoRest" data-value="1">Set by goal</button>
    <button class="chip${!goals.autoRest ? " on" : ""}" data-key="autoRest" data-value="0">Always my setting</button></div></div>`;

  const t = weeklyTargets();
  html += `<details class="goal-weekly"><summary>Your weekly set targets</summary>` +
    MUSCLES.map(function (m) { return `<div class="obj-line"><span>${m[1]}</span><span>${t[m[0]][0]}-${t[m[0]][1]} sets</span></div>`; }).join("") +
    `</details>`;

  $("goals-card").innerHTML = html;
}

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
  const btn = e.target.closest("[data-key]");
  if (!btn) return;
  if (btn.dataset.key === "autoRest") goals.autoRest = btn.dataset.value === "1";
  else goals[btn.dataset.key] = btn.dataset.value;
  save("goals", goals);
  renderGoals();
  refreshPlanAfterGoalChange();
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
  const b = weekBounds(0);
  const goalDays = Math.max(1, Math.min(7, Number(goals.days) || 3));
  const doneDays = new Set(getWorkoutDates().filter(function (d) { return d >= b.start && d <= b.end; })).size;
  const mc = muscleCounts(0).counts;
  const tg = weeklyTargets();
  const bar = function (pct) { return `<div class="obj-bar"><i style="width:${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%"></i></div>`; };

  let html = `<div class="card-label">This week</div>`;
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
  html += `<details class="goal-weekly"><summary>All muscles</summary>` + order.map(function (k) {
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

function calcStreak(dates) {
  const set = new Set(dates);
  const d = new Date();
  if (!set.has(dateKey(d))) d.setDate(d.getDate() - 1);
  let count = 0;
  while (set.has(dateKey(d))) {
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
}

function longestStreak(dates) {
  const sorted = [...new Set(dates)].sort();
  let best = 0, run = 0, prev = null;
  sorted.forEach(function (key) {
    const d = new Date(key + "T00:00:00");
    if (prev && Math.round((d - prev) / 86400000) === 1) run++;
    else run = 1;
    best = Math.max(best, run);
    prev = d;
  });
  return best;
}

function renderStreak() {
  const n = calcStreak(getWorkoutDates());
  $("streak").textContent = n + (n === 1 ? " day" : " days");
}

function renderHeatmap() {
  const el = $("heatmap");
  const done = new Set(getWorkoutDates());
  const today = new Date();

  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 11 * 7);

  el.innerHTML = "";
  for (let i = 0; i < 84; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);

    const cell = document.createElement("div");
    let cls = "cell";
    if (done.has(dateKey(d))) cls += " on";
    if (dateKey(d) === dateKey(today)) cls += " today";
    else if (d > today) cls += " future";
    cell.className = cls;
    el.appendChild(cell);
  }
}

const badges = [
  { icon: "🔥", name: "First rep",     desc: "Log 1 workout",    test: function (s) { return s.total >= 1; } },
  { icon: "💪", name: "Getting going", desc: "Log 5 workouts",   test: function (s) { return s.total >= 5; } },
  { icon: "🏅", name: "Dedicated",     desc: "Log 20 workouts",  test: function (s) { return s.total >= 20; } },
  { icon: "⚡", name: "3-day streak",  desc: "3 days in a row",  test: function (s) { return s.longest >= 3; } },
  { icon: "🚀", name: "7-day streak",  desc: "7 days in a row",  test: function (s) { return s.longest >= 7; } },
  { icon: "👑", name: "Century",       desc: "Log 100 workouts", test: function (s) { return s.total >= 100; } }
];

function renderBadges() {
  const el = $("badges");
  const dates = getWorkoutDates();
  const stats = { total: dates.length, longest: longestStreak(dates) };

  el.innerHTML = "";
  badges.forEach(function (b) {
    const div = document.createElement("div");
    div.className = "badge" + (b.test(stats) ? "" : " locked");
    div.innerHTML = `<div class="b-icon">${b.icon}</div>
                     <div class="b-name">${b.name}</div>
                     <div class="b-desc">${b.desc}</div>`;
    el.appendChild(div);
  });
}

// The segmented bar: one segment per training day in your goal, filled as you complete them
function renderWeekbar() {
  const goalDays = Math.max(1, Math.min(7, Number(goals.days) || 3));
  const b = weekBounds(0);
  const doneDays = new Set(getWorkoutDates().filter(function (d) { return d >= b.start && d <= b.end; })).size;
  const n = calcStreak(getWorkoutDates());

  let segs = "";
  for (let i = 0; i < goalDays; i++) segs += `<i class="${i < doneDays ? "on" : ""}"></i>`;
  $("weekbar").innerHTML = `<div class="wb-segs">${segs}</div>
    <div class="wb-text"><span>${doneDays} of ${goalDays} completed this week</span>
    <span>Streak: ${n} ${n === 1 ? "day" : "days"}</span></div>`;
}

// The big "Next workout" card: what's in it and roughly how long it takes
function renderHero() {
  const exercises = workout.exercises.length;
  let sets = 0;
  workout.exercises.forEach(function (ex) {
    ex.sets.forEach(function (s) { if (!s.warmup) sets++; });
  });
  const mins = Math.max(5, Math.round(sets * 3.5 / 5) * 5);   // about 3.5 minutes a set, rest included
  const _ph = programmeInfo();
  $("hero-label").textContent = (goals.goal || "") + (_ph && !_ph.done ? " · Week " + _ph.week + " of " + _ph.weeks : "");
  $("next-meta").textContent = exercises
    ? exercises + (exercises === 1 ? " exercise" : " exercises") + " • " + sets + (sets === 1 ? " set" : " sets") + " • ~" + mins + " mins"
    : "Add some exercises to get started";
  $("home-gym-sub").textContent = selected.length + (selected.length === 1 ? " item of equipment" : " items of equipment");
}

$("alt-tiles").addEventListener("click", function (e) {
  const b = e.target.closest("[data-home]");
  if (!b) return;
  const a = b.dataset.home;

  if (a === "shuffle") { showTab("workout"); generateWorkout(); return; }

  if (a === "routines") {
    showTab("workout");
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

function refreshHome() {
  renderWeekbar();
  renderObjectives();
  renderWeek();
  renderStreak();
  renderHeatmap();
  renderBadges();
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
}

function tickRest() {
  const left = Math.ceil((restEnd - Date.now()) / 1000);
  if (left <= 0) {
    stopRest();
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    return;
  }
  $("rest-time").textContent = mmss(left);
}

function stopRest() {
  clearInterval(restTimer);
  restTimer = null;
  $("rest").classList.remove("show");
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

// Which sessions make up your week, based on days per week, goal and experience
function getSplit() {
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
    return ex.muscle === muscle && !used.includes(ex.name) && hasEquipment(ex) && !isAvoided(ex);
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
  const split = getSplit();
  const finished = getHistory().filter(function (w) { return !w.routine; }).length;   // your own routines don't advance the split
  const sessionIndex = finished % split.length;
  const planName = split[sessionIndex];
  const why = [];

  const ready = readinessToday();
  let count = { "30": 4, "45": 5, "60": 6, "90": 8 }[goals.minutes] || 6;
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
    const ex = pickExercise(slot.m, slot.k, used, stick ? lastNames : null);
    if (!ex) return;
    used.push(ex.name);
    const reduce = since[slot.m] < 2 || weekDone[slot.m] >= tg[slot.m][1];
    if (reduce && eased.indexOf(slot.m) < 0) eased.push(slot.m);
    const lead = !leadDone && ex.type === "compound";
    if (lead) leadDone = true;
    const rx = prescription(ex, { focus: goals.focus.includes(slot.m), reduce: reduce, lead: lead });
    exercises.push({ name: ex.name, sets: rx.sets, reps: rx.reps });
    if (isStalled(ex.name)) why.push(ex.name + ": no progress for 3 sessions, so drop 10% and build back up");
  });

  // Keep the session inside your time: about 3.5 minutes a set, rest included
  const budget = Math.round(Number(goals.minutes) / 3.5) + 1;
  const total = function () { return exercises.reduce(function (n, e) { return n + e.sets; }, 0); };
  const isFocusEx = function (e) { const l = library.find(function (q) { return q.name === e.name; }); return l && goals.focus.includes(l.muscle); };
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
    }).join("") + `</div>`;
}

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
    return { bar: toKg(45), plates: [2.5, 5, 10, 25, 45].map(toKg), dumbbells: [] };
  }
  return { bar: 20, plates: [1.25, 2.5, 5, 10, 20], dumbbells: [] };
}

let gear = load("gear", null) || defaultGear();

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
  $("gear-card").innerHTML = `
    <div class="goal-group">
      <div class="card-label">Barbell weight (${unit()})</div>
      <input class="set-input" id="gear-bar" inputmode="decimal" value="${fmtW(gear.bar)}" style="text-align:left;padding-left:.8rem">
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

// Every total weight you can put on the barbell (up to 8 plates per side)
function loadableWeights() {
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
    .map(function (s) { return Math.round((gear.bar + 2 * Number(s)) * 1000) / 1000; })
    .sort(function (a, b) { return a - b; });
}

function nearest(list, target) {
  return list.reduce(function (best, w) {
    return Math.abs(w - target) < Math.abs(best - target) ? w : best;
  }, list[0]);
}

// Does this exercise load a barbell, or (if you listed dumbbells) dumbbells?
function gearKind(name) {
  const ex = library.find(function (l) { return l.name === name; });
  if (!ex) return null;
  if (ex.need.indexOf("Barbell") !== -1) return "barbell";
  const usesDumbbells = ex.need.some(function (r) { return r.split("|").indexOf("Dumbbells") !== -1; });
  if (usesDumbbells && selected.indexOf("Dumbbells") !== -1 && gear.dumbbells.length) return "dumbbell";
  return null;
}

// Moves a suggested weight onto a weight you can really load.
// Returns null if nothing applies, {kg} if it snapped, or {kg: null, reason} if you
// should add weight but nothing heavier is available.
function snapToGear(name, target, top, wantsMore) {
  const kind = gearKind(name);
  if (!kind) return null;

  const list = kind === "barbell" ? loadableWeights() : gear.dumbbells;
  if (!list.length) return null;

  const pool = wantsMore ? list.filter(function (w) { return w > top + 0.001; }) : list;
  if (!pool.length) {
    return { kg: null, reason: kind === "barbell"
      ? "Nothing heavier fits your plates, so add reps instead"
      : "You’re at your heaviest dumbbells, so add reps instead" };
  }
  return { kg: nearest(pool, target) };
}

// Which plates go on each side for a total weight (in kg)?
function platesFor(totalKg) {
  const perSide = Math.round(((totalKg - gear.bar) / 2) * 1000) / 1000;
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
  return { plates: used, loaded: Math.round((gear.bar + 2 * sum) * 1000) / 1000, exact: rest < 0.005 };
}

function openPlates(kg) {
  openSheet(`<div class="card-label">Plate calculator</div>
    <div class="big">Barbell loading</div>
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
  let r = platesFor(target);
  let note = "";

  if (r.tooLight) {
    el.innerHTML = `<p class="feed-meta">That’s lighter than the bar (${fmtW(gear.bar)} ${unit()}).</p>`;
    return;
  }
  if (!r.exact) {
    const alt = nearest(loadableWeights(), target);
    r = platesFor(alt);
    note = `<p class="feed-meta">You can’t make exactly ${fmt(targetDisp)} ${unit()} with your plates. Closest: ${fmtW(r.loaded)} ${unit()}.</p>`;
  }

  const maxPlate = Math.max.apply(null, gear.plates);
  const vis = r.plates.map(function (p) {
    return `<div class="plate" style="height:${Math.round(34 + 66 * p / maxPlate)}px"><span>${fmtW(p)}</span></div>`;
  }).join("");

  el.innerHTML = `${note}
    <div class="plate-vis"><div class="bar-stub"></div>${vis}<div class="bar-tip"></div></div>
    <div class="pr-line">${r.plates.length ? "Each side: <b>" + r.plates.map(function (p) { return fmtW(p); }).join(" + ") + "</b>" : "Just the bar."}</div>
    <div class="feed-meta">Bar ${fmtW(gear.bar)} + 2 × ${fmtW((r.loaded - gear.bar) / 2)} = ${fmtW(r.loaded)} ${unit()}</div>`;
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
  let text = "Last time" + withUnit + ": " + lastText;

  const sug = suggestion(ex.name, ex.target);
  if (sug) text += "<br>Suggested: " + fmtW(sug.kg) + " " + unit() + ". " + sug.why + ".";
  if (last.note) text += "<br>Note last time: " + esc(last.note);
  if (plateauInfo(stat)) text += "<br>⚠ Stalled: no new best in your last 3 sessions. Try one more rep per set, a lighter week, or a variation.";
  return text;
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
  if (settings.warmup === "barbell" && gearKind(name) === "barbell") addWarmups(ex);
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

function renderWorkout() {
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
    html += `<div class="card${gl ? " grouped" : ""}">
      ${gl ? `<div class="grp-tag">${gl.kind} ${gl.tag}</div>` : ""}
      <div class="ex-head">
        <div class="ex-name">${esc(ex.name)}</div>
        <div class="tools">
          <button class="tool" data-action="form" data-ex="${ei}">Form</button>
          ${(ex.group != null || workout.exercises[ei + 1]) ? `<button class="tool" data-action="superset" data-ex="${ei}">${ex.group != null ? "Unlink" : "Superset ↓"}</button>` : ""}
          ${gearKind(ex.name) === "barbell" ? `<button class="tool" data-action="plates" data-ex="${ei}">Plates</button>` : ""}
          ${canWarm ? `<button class="tool" data-action="warmup" data-ex="${ei}">${hasWarm ? "Clear warm-up" : "Warm-up"}</button>` : ""}
          <button class="tool" data-action="history" data-ex="${ei}">History</button>
          <button class="tool" data-action="swap" data-ex="${ei}">Swap</button>
          <button class="tool" data-action="skip" data-ex="${ei}">Skip</button>
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
      html += `<div class="set-row w5${s.done ? " done" : ""}${s.warmup ? " warm" : ""}">
        <div class="set-num">${label}</div>
        <input class="set-input" inputmode="decimal" placeholder="0"
               value="${esc(shownWeight)}" data-ex="${ei}" data-set="${si}" data-field="weight">
        <input class="set-input" inputmode="numeric" placeholder="${esc(ex.target)}"
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
  $("next-workout").textContent = workout.name;
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

  if (action === "toggle") {
    const s = ex.sets[btn.dataset.set];
    s.done = !s.done;
    if (s.done) {
      if (!workout.startedAt) workout.startedAt = Date.now();
      // Ticked without typing reps? Log the bottom of the target range
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
    const next = ex.sets.find(function (s) { return !s.done && !s.warmup; }) || ex.sets[ex.sets.length - 1];
    openPlates(parseFloat(next && next.weight) || gear.bar);
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

  html += `<button class="btn" data-a="summary-done">Done</button>`;
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

  if (a === "summary-done") { closeSheet(); showTab("feed"); }
  if (a === "edit-cancel") closeSheet();
  if (a === "plate-close") closeSheet();
  if (a === "hist-close") closeSheet();
  if (a === "add-close") closeSheet();
  if (a === "lib-hist") openExerciseHistory(b.dataset.name);
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
function renderFeed() {
  const el = $("feed-list");
  const history = getHistory();

  if (!history.length) {
    el.innerHTML = `<p class="sub">No workouts yet. Finish one and it will show up here.</p>`;
    return;
  }

  // Keep each workout's real position so Edit/Delete hit the right one
  const items = history.map(function (w, i) { return { w: w, i: i }; }).reverse();

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
      <div class="feed-stats">
        <div><span>Duration</span><b>${dur}</b></div>
        <div><span>Volume</span><b>${Math.round(toDisp(t.volume)).toLocaleString()} ${unit()}</b></div>
        <div><span>Sets</span><b>${t.sets}</b></div>
        <div><span>Exercises</span><b>${w.exercises.length}</b></div>
      </div>
      <details class="feed-detail"><summary>Sets and notes</summary><div class="feed-lines">${lines}</div></details>
      <div class="feed-actions">
        <button class="tool" data-a="feed-share" data-i="${item.i}">Share</button>
        <button class="tool" data-a="feed-edit" data-i="${item.i}">Edit</button>
        <button class="tool" data-a="feed-del" data-i="${item.i}">Delete</button>
      </div>
    </div>`;
  }).join("");
}

$("feed-list").addEventListener("click", function (e) {
  const b = e.target.closest("[data-a]");
  if (!b) return;
  const index = Number(b.dataset.i);

  if (b.dataset.a === "feed-edit") openEditor(index);
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
     <div class="stat"><div class="stat-num">${Math.round(toDisp(totalVolume)).toLocaleString()}</div><div class="stat-lbl">${unit()} lifted</div></div>`;

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

  $("prs").innerHTML = weighted.concat(bodyweight).slice(0, 20).map(function (n) {
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
  }).join("");
}

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

    if (kind === "barbell" || kind === "dumbbell") {
      // Only weights you can really load, and lighter than your working weight
      const list = (kind === "barbell" ? loadableWeights() : gear.dumbbells)
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

function weekBounds(offset) {
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7) - 7 * offset);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
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
const BACKUP_KEYS = ["settings", "restMap", "selectedEquipment", "goals", "workoutDates", "workoutHistory", "currentWorkout", "gear", "customExercises", "routines", "deload", "bodyLog"];

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
    return { ok: false, error: "That doesn’t look like a GymApp backup file." };
  }
  const d = backup.data;

  const arrayKeys = ["selectedEquipment", "workoutDates", "workoutHistory", "customExercises", "routines", "bodyLog"];
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

function exportBackup() {
  const blob = new Blob([JSON.stringify(buildBackup(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "gymapp-backup-" + dateKey(new Date()) + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

  save("lastBackup", Date.now());
  renderBackupStatus();
}

function renderBackupStatus() {
  const last = load("lastBackup", null);
  const workouts = getHistory().length;

  $("backup-status").textContent = last
    ? "Last backup: " + new Date(last).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) + "."
    : "You haven’t backed up yet.";

  // A gentle nudge on Home once you have some history worth protecting
  const stale = !last || (Date.now() - last) > 14 * 86400000;
  $("backup-nudge").style.display = (workouts >= 3 && stale) ? "" : "none";
  $("backup-nudge-text").textContent = last
    ? "It’s been over two weeks since your last backup."
    : "You have " + workouts + " workouts saved only in this browser.";
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
    if (!confirm("Restore this backup? It replaces everything currently in the app (the backup has " + n + " workouts).")) return;

    const result = applyBackup(backup);
    if (!result.ok) { alert(result.error); return; }
    location.reload();
  };
  reader.readAsText(file);
  e.target.value = "";   // lets you pick the same file again later
});


// =====================================================================
// WEEKLY TREND (Progress tab): the last 8 weeks as bars
// =====================================================================
let weeklyMetric = "sets";

function cardioMinutes(offset) {
  const b = weekBounds(offset);
  let m = 0;
  getHistory().forEach(function (w) {
    if (w.date < b.start || w.date > b.end) return;
    w.exercises.forEach(function (ex) {
      if (isCardio(ex.name)) ex.sets.forEach(function (s) { m += parseFloat(s.mins) || 0; });
    });
  });
  return Math.round(m * 10) / 10;
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
    if (isAvoided(l)) tag = "Avoided";
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

function ivStart() {
  save("intervalCfg", ivCfg);
  const plan = intervalPlan(ivCfg);
  ivRun = { plan: plan, idx: 0, end: Date.now() + plan[0].secs * 1000, paused: false, left: 0, lastBeep: -1, totalSecs: plan.reduce(function (n, p) { return n + p.secs; }, 0), elapsedBefore: 0 };
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
  lab.textContent = r.paused ? "Paused" : names[ph.type];
  $("iv-phase").className = "iv-run iv-" + ph.type;
  $("iv-time").textContent = mmss(r.left || ph.secs);
  const rounds = r.plan.filter(function (p) { return p.type === "work"; }).length;
  $("iv-round").textContent = ph.type === "ready" ? "Starting soon" : "Round " + ph.round + " of " + rounds;
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
  if (a === "stop") { ivStop(); return; }
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

function renderAll() {
  renderEquipment();
  renderGoals();
  renderTargets();
  renderProgramme();
  renderReadiness();
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
if ("serviceWorker" in navigator &&
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
