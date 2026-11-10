// =====================================================================
// APP VERSION
// Change this number every time you upload new files to GitHub.
// Phones check it, and show an "Update available" banner when it changes.
// =====================================================================
const APP_VERSION = "1.6.0";

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
if (!settings.theme) settings.theme = "grit";

// The look of the app: "grit" (stark, concrete, no glass) or "classic" (the glassy one)
function applyTheme() {
  document.documentElement.setAttribute("data-theme", settings.theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", settings.theme === "grit" ? "#070707" : "#0d0d10");
}
applyTheme();
let restMap = load("restMap", {});   // per-exercise rest times, e.g. { "Deadlift": 180 }

function unit() { return settings.units; }
function toDisp(kg) { return settings.units === "lb" ? kg / KG_PER_LB : kg; }
function fromDisp(v) { return settings.units === "lb" ? v * KG_PER_LB : v; }
function fmt(n) { return String(Number(n.toFixed(2))); }
function fmtW(kg) { return fmt(toDisp(parseFloat(kg) || 0)); }   // kg in, display number out
function restFor(name) { return restMap[name] || settings.rest; }

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
    group("Theme", "theme", [["grit", "Grit"], ["classic", "Classic"]]) +
    group("Units", "units", [["kg", "kg"], ["lb", "lb"]]) +
    group("Default rest time", "rest", [[60, "1:00"], [90, "1:30"], [120, "2:00"], [180, "3:00"]]) +
    group("Auto warm-up sets", "warmup", [["off", "Off"], ["barbell", "Barbell lifts"]]);
}

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

function showTab(targetId) {
  screens.forEach(function (s) { s.classList.remove("active"); });
  tabs.forEach(function (t) { t.classList.remove("active"); });

  $(targetId).classList.add("active");
  document.querySelector('[data-target="' + targetId + '"]').classList.add("active");

  if (targetId === "progress") renderProgress();

  save("lastTab", targetId);
  window.scrollTo(0, 0);
}

tabs.forEach(function (tab) {
  tab.addEventListener("click", function () {
    showTab(tab.dataset.target);
  });
});


// =====================================================================
// EQUIPMENT
// =====================================================================
const equipment = {
  "Free weights": ["Dumbbells", "Barbell", "Kettlebells", "Weight plates", "EZ curl bar"],
  "Benches & racks": ["Flat bench", "Adjustable bench", "Squat rack", "Pull-up bar", "Dip station"],
  "Machines": ["Cable machine", "Leg press", "Lat pulldown", "Smith machine"],
  "Other": ["Resistance bands", "Ab wheel", "Skipping rope", "Foam roller", "Treadmill"]
};

let selected = load("selectedEquipment", []);

function renderEquipment() {
  const listEl = $("equipment-list");
  listEl.innerHTML = "";

  for (const category in equipment) {
    const heading = document.createElement("h2");
    heading.textContent = category;
    listEl.appendChild(heading);

    equipment[category].forEach(function (name) {
      const isSelected = selected.includes(name);

      const row = document.createElement("label");
      row.className = "item" + (isSelected ? " selected" : "");
      row.innerHTML = `<input type="checkbox" ${isSelected ? "checked" : ""}> ${name}`;

      row.querySelector("input").addEventListener("change", function () {
        toggleEquipment(name);
      });

      listEl.appendChild(row);
    });
  }

  $("count").textContent = selected.length + " items selected";
  $("home-equip").textContent = selected.length + " items";
}

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
// =====================================================================
const goalOptions = {
  goal:       { label: "Main goal",      options: ["Build muscle", "Get stronger", "Lose fat", "General fitness"] },
  experience: { label: "Experience",     options: ["Beginner", "Intermediate", "Advanced"] },
  days:       { label: "Days per week",  options: ["2", "3", "4", "5", "6"] },
  minutes:    { label: "Session length", options: ["30", "45", "60", "90"], suffix: " min" }
};

let goals = load("goals", {
  goal: "Build muscle",
  experience: "Beginner",
  days: "3",
  minutes: "60"
});

function renderGoals() {
  let html = "";

  for (const key in goalOptions) {
    const g = goalOptions[key];
    html += `<div class="goal-group">
               <div class="card-label">${g.label}</div>
               <div class="chips">`;

    g.options.forEach(function (opt) {
      const isOn = goals[key] === opt;
      html += `<button class="chip${isOn ? " on" : ""}" data-key="${key}" data-value="${opt}">
                 ${opt}${g.suffix || ""}
               </button>`;
    });

    html += `</div></div>`;
  }

  $("goals-card").innerHTML = html;
}

$("goals-card").addEventListener("click", function (e) {
  const btn = e.target.closest("[data-key]");
  if (!btn) return;
  goals[btn.dataset.key] = btn.dataset.value;
  save("goals", goals);
  renderGoals();
});


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

function refreshHome() {
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

function startRest(seconds) {
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
  x("Russian Twist",              "core", "iso", ["Weight plates|Dumbbells|Kettlebells"]),
  x("Dead Bug",                   "core", "iso", []),
  x("Bicycle Crunch",             "core", "iso", [])
];

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

// Which sessions make up your week, based on days per week
function getSplit() {
  const d = goals.days;
  if (d === "2") return ["Full Body A", "Full Body B"];
  if (d === "3") {
    return goals.experience === "Beginner"
      ? ["Full Body A", "Full Body B", "Full Body C"]
      : ["Push Day", "Pull Day", "Leg Day"];
  }
  if (d === "4") return ["Upper Body", "Lower Body", "Upper Body", "Lower Body"];
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

// Choose one exercise for a slot
function pickExercise(muscle, kind, used) {
  // 1. Everything for this muscle that you can do and haven't used yet
  let pool = library.filter(function (ex) {
    return ex.muscle === muscle && !used.includes(ex.name) && hasEquipment(ex);
  });

  // 2. Narrow to the wanted type (if none exist, keep the wider pool)
  const typed = pool.filter(function (ex) { return kind === "any" || ex.type === kind; });
  if (typed.length) pool = typed;

  // 3. Prefer exercises that use your equipment over bodyweight ones
  const equipped = pool.filter(function (ex) { return ex.need.length > 0; });
  if (equipped.length) pool = equipped;

  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Work out sets and reps from your goal and experience
function prescription(ex) {
  const compound = ex.type === "compound";
  const level = { "Beginner": 0, "Intermediate": 1, "Advanced": 2 }[goals.experience] || 0;
  let sets, reps;

  if (goals.goal === "Get stronger") {
    sets = compound ? [3, 4, 5][level] : [2, 3, 3][level];
    reps = compound ? "3-6" : "8-10";
  } else if (goals.goal === "Build muscle") {
    sets = compound ? [3, 4, 4][level] : [2, 3, 3][level];
    reps = compound ? "6-10" : "10-15";
  } else {   // Lose fat or General fitness
    sets = compound ? [3, 3, 4][level] : [2, 3, 3][level];
    reps = compound ? "10-12" : "12-15";
  }

  // Bodyweight moves can't be loaded, so use steadier rep ranges
  if (ex.need.length === 0) reps = "10-15";
  if (ex.timed) reps = "30-45 sec";

  if (isDeload()) sets = Math.max(2, sets - 1);   // easier week: one fewer set

  return { sets: sets, reps: reps };
}

// Builds the plan for your NEXT session (without changing the screen).
// Returns null if nothing could be built.
function buildPlan() {
  const split = getSplit();
  const finished = getHistory().filter(function (w) { return !w.routine; }).length;   // your own routines don't advance the split
  const sessionIndex = finished % split.length;
  const planName = split[sessionIndex];

  const count = { "30": 4, "45": 5, "60": 6, "90": 8 }[goals.minutes] || 6;
  const used = [];
  const exercises = [];

  plans[planName].forEach(function (slot) {
    if (exercises.length >= count) return;
    const ex = pickExercise(slot[0], slot[1], used);
    if (!ex) return;
    used.push(ex.name);
    const rx = prescription(ex);
    exercises.push({ name: ex.name, sets: rx.sets, reps: rx.reps });
  });

  // A little cardio finisher for fat loss / general fitness on longer sessions
  const wantsCardio = (goals.goal === "Lose fat" || goals.goal === "General fitness");
  if (wantsCardio && Number(goals.minutes) >= 45) {
    if (selected.includes("Skipping rope")) {
      exercises.push({ name: "Jump Rope", sets: 3, reps: "60 sec" });
    } else if (selected.includes("Treadmill")) {
      exercises.push({ name: "Treadmill Intervals", sets: 4, reps: "2 min" });
    }
  }

  if (!exercises.length) return null;
  return { name: planName, exercises: exercises, sessionIndex: sessionIndex, splitLength: split.length };
}

// The "Generate" button
function generateWorkout() {
  const statusEl = $("gen-status");

  // Don't throw away a workout you've already started
  const started = workout.exercises.some(function (ex) {
    return ex.sets.some(function (s) { return s.done; });
  });
  if (started && !confirm("Replace your current workout? Ticked sets will be lost.")) return;

  const plan = buildPlan();
  if (!plan) {
    statusEl.textContent = "Couldn’t build a workout. Try ticking more equipment on the Gym tab.";
    return;
  }

  workout = newWorkout(plan);
  saveWorkout();
  renderWorkout();

  statusEl.textContent = plan.name + " (session " + (plan.sessionIndex + 1) + " of " + plan.splitLength +
    " in your split). Tap Generate again for different exercises." +
    (selected.length === 0 ? " No equipment ticked, so this is bodyweight only." : "");
}

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
      return makeExercise(ex.name, ex.sets, ex.reps);
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

    html += `<div class="card">
      <div class="ex-head">
        <div class="ex-name">${esc(ex.name)}</div>
        <div class="tools">
          ${gearKind(ex.name) === "barbell" ? `<button class="tool" data-action="plates" data-ex="${ei}">Plates</button>` : ""}
          ${canWarm ? `<button class="tool" data-action="warmup" data-ex="${ei}">${hasWarm ? "Clear warm-up" : "Warm-up"}</button>` : ""}
          <button class="tool" data-action="history" data-ex="${ei}">History</button>
          <button class="tool" data-action="swap" data-ex="${ei}">Swap</button>
          <button class="tool" data-action="skip" data-ex="${ei}">Skip</button>
        </div>
      </div>
      <div class="hint">${hintFor(ex, allStats[ex.name])}</div>
      <div class="set-row w5 set-head"><div>SET</div><div>${unit().toUpperCase()}</div><div>REPS</div><div>RPE</div><div></div></div>`;

    let n = 0;
    ex.sets.forEach(function (s, si) {
      if (!s.warmup) { totalCount++; if (s.done) doneCount++; }
      const label = s.warmup ? "W" : String(++n);
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

  $("workout-title").textContent = workout.name.toUpperCase();
  $("workout-progress").textContent = doneCount + " of " + totalCount + " sets done" + (isDeload() ? " · Easier week" : "");
  $("next-workout").textContent = workout.name;
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

  const ei = Number(btn.dataset.ex);
  const ex = workout.exercises[ei];
  if (!ex) return;

  if (action === "toggle") {
    const s = ex.sets[btn.dataset.set];
    s.done = !s.done;
    if (s.done) {
      if (!workout.startedAt) workout.startedAt = Date.now();
      // Ticked without typing reps? Log the bottom of the target range
      if (String(s.reps).trim() === "") s.reps = String(parseInt(ex.target) || "");
      startRest(s.warmup ? 45 : restFor(ex.name));
    }
  }

  if (action === "addset") {
    const working = ex.sets.filter(function (s) { return !s.warmup; });
    const last = working[working.length - 1];
    ex.sets.push({ weight: last ? last.weight : "", reps: last ? last.reps : "", done: false });
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

  if (action === "swap") swapExercise(ei);

  if (action === "skip") {
    if (!confirm("Remove " + ex.name + " from today’s workout?")) return;
    workout.exercises.splice(ei, 1);
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

  workout.exercises[ei] = makeExercise(replacement.name, Math.max(1, ex.sets.filter(function (s) { return !s.warmup; }).length), prescription(replacement).reps);
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
        sets: doneSets.map(function (s) { return { weight: s.weight, reps: s.reps, rpe: s.rpe || "" }; })
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

  // Line up your NEXT workout straight away (weights pre-filled from what you just did)
  workout = newWorkout(buildPlan() || template);
  saveWorkout();
  stopRest();

  renderAll();
  openSummary(entry, prs);
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

function openSummary(entry, prs) {
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
    html += `<div class="ex-name">${esc(ex.name)}</div>
      <div class="set-row set-head"><div>SET</div><div>${unit().toUpperCase()}</div><div>REPS</div><div></div></div>`;
    ex.sets.forEach(function (s, si) {
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

    const date = new Date(w.date + "T00:00:00").toLocaleDateString("en-GB", {
      weekday: "short", day: "numeric", month: "short"
    });

    return `<div class="card">
      <div class="feed-top">
        <div class="card-label">${date}</div>
        <div class="feed-meta">${w.minutes ? w.minutes + " min" : ""}</div>
      </div>
      <div class="big">${esc(w.name)}</div>
      <div class="feed-meta">${t.sets} sets · ${Math.round(toDisp(t.volume)).toLocaleString()} ${unit()} lifted</div>
      <div class="feed-lines">${lines}</div>
      <div class="feed-actions">
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
function isDeload() { return !!deload.until && dateKey(new Date()) <= deload.until; }

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

  if (isDeload()) {
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
// START
// =====================================================================
function renderAll() {
  renderEquipment();
  renderGoals();
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
