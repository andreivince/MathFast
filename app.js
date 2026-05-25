"use strict";

const STORE_KEY = "aura-math-state-v1";
const DAILY_PLAN = [
  { label: "Warmup facts", mode: "timed", seconds: 120, pool: ["multiply", "squares", "complements"] },
  { label: "Timed arithmetic", mode: "timed", seconds: 180 },
  { label: "Weak facts", mode: "weak", seconds: 120 },
  { label: "Pressure mode", mode: "pressure", seconds: 120 },
  { label: "Flash anzan", mode: "flash", seconds: 60 }
];

const els = {
  homeScreen: document.querySelector("#homeScreen"),
  trainerScreen: document.querySelector("#trainerScreen"),
  startDailyBtn: document.querySelector("#startDailyBtn"),
  missionStatus: document.querySelector("#missionStatus"),
  modeTabs: [...document.querySelectorAll(".mode-tab")],
  swipeDots: [...document.querySelectorAll(".swipe-dots span")],
  phaseLabel: document.querySelector("#phaseLabel"),
  phaseHint: document.querySelector("#phaseHint"),
  timerDisplay: document.querySelector("#timerDisplay"),
  questionText: document.querySelector("#questionText"),
  categoryLabel: document.querySelector("#categoryLabel"),
  answerForm: document.querySelector("#answerForm"),
  answerInput: document.querySelector("#answerInput"),
  feedback: document.querySelector("#feedback"),
  sessionReps: document.querySelector("#sessionReps"),
  sessionAccuracy: document.querySelector("#sessionAccuracy"),
  sessionAvg: document.querySelector("#sessionAvg"),
  weakList: document.querySelector("#weakList"),
  retryWeakBtn: document.querySelector("#retryWeakBtn"),
  statsView: document.querySelector("#statsView"),
  streakPill: document.querySelector("#streakPill"),
  accuracyPill: document.querySelector("#accuracyPill"),
  statStreak: document.querySelector("#statStreak"),
  statReps: document.querySelector("#statReps"),
  statAccuracy: document.querySelector("#statAccuracy"),
  statAvg: document.querySelector("#statAvg"),
  statWeakCats: document.querySelector("#statWeakCats"),
  statBest60: document.querySelector("#statBest60"),
  categoryBars: document.querySelector("#categoryBars")
};

const views = {
  timed: document.querySelector("#drillView"),
  pressure: document.querySelector("#drillView"),
  flash: document.querySelector("#drillView"),
  weak: document.querySelector("#weakView"),
  stats: document.querySelector("#statsView")
};

let state = loadState();
let mode = "timed";
let activeQuestion = null;
let activeStarted = 0;
let timerId = null;
let pressureTimeout = null;
let phaseEndAt = null;
let dailyIndex = -1;
let currentPool = null;
let sixtyWindow = [];
let session = { reps: 0, correct: 0, totalMs: 0 };
let flashRunId = 0;
const browsePages = ["weak", "home", "stats"];
let browsePage = "home";
let drillActive = false;
let swipeStartX = 0;
let swipeStartY = 0;
let swipePointerId = null;
let lastWheelSwipeAt = 0;

function defaultState() {
  return {
    stats: {
      totalReps: 0,
      correct: 0,
      totalMs: 0,
      streak: 0,
      lastDailyDate: null,
      best60: 0,
      categories: {}
    },
    facts: {}
  };
}

function loadState() {
  try {
    return { ...defaultState(), ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") };
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(items) {
  return items[rand(0, items.length - 1)];
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function formatTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const min = String(Math.floor(total / 60)).padStart(2, "0");
  const sec = String(total % 60).padStart(2, "0");
  return `${min}:${sec}`;
}

function parseAnswer(value) {
  const cleaned = value.trim().replace(",", ".");
  if (cleaned.includes("/")) {
    const [a, b] = cleaned.split("/").map(Number);
    return b ? a / b : NaN;
  }
  return Number(cleaned);
}

function makeQuestion(pool = null) {
  const types = pool || ["add", "subtract", "multiply", "divide", "percent", "squares", "fractions", "complements", "estimate"];
  const type = pick(types);
  let a;
  let b;
  let answer;
  let prompt;
  let tolerance = 0.001;

  if (type === "add") {
    a = rand(12, 189);
    b = rand(8, 176);
    answer = a + b;
    prompt = `${a} + ${b}`;
  } else if (type === "subtract") {
    a = rand(40, 220);
    b = rand(8, a - 1);
    answer = a - b;
    prompt = `${a} - ${b}`;
  } else if (type === "multiply") {
    a = rand(3, 19);
    b = rand(3, 19);
    answer = a * b;
    prompt = `${a} x ${b}`;
  } else if (type === "divide") {
    b = rand(3, 16);
    answer = rand(3, 18);
    a = b * answer;
    prompt = `${a} / ${b}`;
  } else if (type === "percent") {
    const pct = pick([5, 10, 12.5, 15, 20, 25, 30, 40, 50, 75]);
    b = rand(8, 32) * 10;
    answer = (pct / 100) * b;
    prompt = `${pct}% of ${b}`;
    tolerance = 0.01;
  } else if (type === "squares") {
    a = rand(11, 29);
    answer = a * a;
    prompt = `${a}^2`;
  } else if (type === "fractions") {
    const fraction = pick([[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 5], [2, 5]]);
    b = rand(4, 30) * fraction[1];
    answer = (fraction[0] / fraction[1]) * b;
    prompt = `${fraction[0]}/${fraction[1]} of ${b}`;
  } else if (type === "complements") {
    a = rand(2, 98);
    answer = 100 - a;
    prompt = `${a} + ? = 100`;
  } else {
    a = rand(12, 98);
    b = rand(12, 98);
    answer = Math.round(a * b / 10) * 10;
    prompt = `${a} x ${b} ~=`;
    tolerance = Math.max(10, Math.abs(answer) * 0.12);
  }

  return { type, category: labelForType(type), prompt, answer, tolerance };
}

function makeFlashQuestion() {
  const length = rand(4, 7);
  const sequence = [];
  let total = 0;
  for (let index = 0; index < length; index += 1) {
    const value = rand(4, 35) * (Math.random() > 0.34 ? 1 : -1);
    sequence.push(value);
    total += value;
  }
  return { type: "flash", category: "Flash anzan", prompt: "Flash", answer: total, tolerance: 0.001, sequence };
}

function labelForType(type) {
  return {
    add: "Addition",
    subtract: "Subtraction",
    multiply: "Multiplication",
    divide: "Division",
    percent: "Percentages",
    squares: "Squares",
    fractions: "Fractions",
    complements: "Complements",
    estimate: "Estimates",
    flash: "Flash anzan"
  }[type] || "Arithmetic";
}

function slowLimit(type) {
  return {
    add: 2600,
    subtract: 2900,
    multiply: 2500,
    divide: 3200,
    percent: 3600,
    squares: 3000,
    fractions: 3800,
    complements: 2200,
    estimate: 4200,
    flash: 5200
  }[type] || 3000;
}

function setMode(nextMode) {
  mode = nextMode;
  if (!drillActive && dailyIndex < 0 && browsePages.includes(mode)) {
    browsePage = mode;
  }
  els.modeTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  updateSwipeDots();

  if (mode === "weak") {
    if (dailyIndex >= 0) {
      showView("timed");
      newQuestion();
    } else {
      showView("weak");
      renderWeakFacts();
    }
    els.phaseLabel.textContent = "Weak facts";
    els.phaseHint.textContent = "Retry facts you missed or answered slowly.";
    els.timerDisplay.textContent = phaseEndAt ? els.timerDisplay.textContent : "--:--";
  } else if (mode === "pressure") {
    showView("timed");
    els.phaseLabel.textContent = "Pressure mode";
    els.phaseHint.textContent = "Fast public-style prompts. Answer before the freeze.";
    newQuestion();
  } else if (mode === "flash") {
    showView("timed");
    els.phaseLabel.textContent = "Flash anzan";
    els.phaseHint.textContent = "Keep a running total while numbers appear one by one.";
    newQuestion();
  } else if (mode === "stats") {
    showView("stats");
    els.phaseLabel.textContent = "Stats";
    els.phaseHint.textContent = "Local stats only. No account. No backend.";
    renderStats();
  } else {
    showView("timed");
    els.phaseLabel.textContent = "Timed drill";
    els.phaseHint.textContent = "Speed counts. Slow correct answers become weak facts.";
    newQuestion();
  }
}

function showView(name) {
  Object.values(views).forEach((view) => view.classList.remove("active"));
  const targetView = views[name] || views.timed;
  targetView.classList.add("active");
}

function startTimer(seconds) {
  clearInterval(timerId);
  phaseEndAt = Date.now() + seconds * 1000;
  tickTimer();
  timerId = setInterval(tickTimer, 250);
}

function stopTimer() {
  clearInterval(timerId);
  clearTimeout(pressureTimeout);
  timerId = null;
  phaseEndAt = null;
  els.timerDisplay.textContent = "--:--";
}

function tickTimer() {
  if (!phaseEndAt) return;
  const left = phaseEndAt - Date.now();
  els.timerDisplay.textContent = formatTime(left);
  if (left <= 0) {
    advanceDaily();
  }
}

function startDaily() {
  drillActive = true;
  showTrainer();
  dailyIndex = -1;
  session = { reps: 0, correct: 0, totalMs: 0 };
  if (els.missionStatus) els.missionStatus.textContent = "Mission running.";
  advanceDaily();
}

function advanceDaily() {
  dailyIndex += 1;
  if (dailyIndex >= DAILY_PLAN.length) {
    finishDaily();
    return;
  }
  const phase = DAILY_PLAN[dailyIndex];
  currentPool = phase.pool || null;
  els.phaseLabel.textContent = phase.label;
  if (els.missionStatus) els.missionStatus.textContent = `${phase.label}: ${Math.round(phase.seconds / 60)} min`;
  setMode(phase.mode);
  startTimer(phase.seconds);
}

function finishDaily() {
  stopTimer();
  drillActive = false;
  dailyIndex = -1;
  currentPool = null;
  const today = todayKey();
  if (state.stats.lastDailyDate !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toISOString().slice(0, 10);
    state.stats.streak = state.stats.lastDailyDate === yesterdayKey ? state.stats.streak + 1 : 1;
    state.stats.lastDailyDate = today;
    saveState();
  }
  if (els.missionStatus) els.missionStatus.textContent = "Mission complete.";
  renderAllStats();
  setMode("stats");
}

function newQuestion(forced = null) {
  clearTimeout(pressureTimeout);
  flashRunId += 1;
  els.answerInput.value = "";
  els.answerInput.disabled = false;
  els.feedback.textContent = "";
  els.feedback.className = "feedback";

  if (mode === "flash") {
    activeQuestion = forced || makeFlashQuestion();
    showFlash(activeQuestion);
    return;
  }

  activeQuestion = forced || pullWeakQuestion() || makeQuestion(currentPool);
  activeStarted = performance.now();
  els.categoryLabel.textContent = activeQuestion.category;
  els.questionText.textContent = activeQuestion.prompt;
  if (mode === "pressure") {
    pressureTimeout = window.setTimeout(markFreeze, 6000);
  }
  window.setTimeout(() => els.answerInput.focus(), 40);
}

function markFreeze() {
  if (mode !== "pressure" || !activeQuestion) return;
  recordResult(activeQuestion, false, false, performance.now() - activeStarted);
  els.feedback.textContent = `Freeze. Answer: ${activeQuestion.answer}`;
  els.feedback.className = "feedback bad";
  window.setTimeout(() => newQuestion(), 420);
}

function showFlash(question) {
  const runId = flashRunId;
  activeStarted = performance.now();
  els.categoryLabel.textContent = question.category;
  els.questionText.textContent = "";
  els.answerInput.disabled = true;
  let index = 0;
  const flashNext = () => {
    if (runId !== flashRunId || mode !== "flash") return;
    if (index < question.sequence.length) {
      const value = question.sequence[index];
      els.questionText.textContent = value > 0 ? `+${value}` : String(value);
      index += 1;
      window.setTimeout(flashNext, 560);
    } else {
      els.questionText.textContent = "Total?";
      els.answerInput.disabled = false;
      els.answerInput.focus();
    }
  };
  flashNext();
}

function submitAnswer(event) {
  event.preventDefault();
  if (!activeQuestion || els.answerInput.disabled) return;
  clearTimeout(pressureTimeout);
  const value = parseAnswer(els.answerInput.value);
  if (!Number.isFinite(value)) return;

  const elapsed = performance.now() - activeStarted;
  const correct = Math.abs(value - activeQuestion.answer) <= activeQuestion.tolerance;
  const slow = correct && elapsed > slowLimit(activeQuestion.type);
  recordResult(activeQuestion, correct, slow, elapsed);

  els.feedback.textContent = correct
    ? slow ? `Correct, but slow: ${round(elapsed / 1000, 1)}s` : `Correct: ${round(elapsed / 1000, 1)}s`
    : `Wrong. Answer: ${activeQuestion.answer}`;
  els.feedback.className = `feedback ${correct ? "good" : "bad"}`;

  window.setTimeout(() => newQuestion(), mode === "pressure" ? 260 : 520);
}

function recordResult(question, correct, slow, elapsed) {
  session.reps += 1;
  session.correct += correct ? 1 : 0;
  session.totalMs += elapsed;

  state.stats.totalReps += 1;
  state.stats.correct += correct ? 1 : 0;
  state.stats.totalMs += elapsed;
  state.stats.categories[question.type] ||= { reps: 0, correct: 0, slow: 0 };
  state.stats.categories[question.type].reps += 1;
  state.stats.categories[question.type].correct += correct ? 1 : 0;
  state.stats.categories[question.type].slow += slow ? 1 : 0;

  const fact = state.facts[question.prompt] || {
    prompt: question.prompt,
    type: question.type,
    answer: question.answer,
    tolerance: question.tolerance,
    reps: 0,
    wrong: 0,
    slow: 0,
    totalMs: 0,
    lastSeen: null
  };
  fact.reps += 1;
  fact.wrong += correct ? 0 : 1;
  fact.slow += slow ? 1 : 0;
  fact.totalMs += elapsed;
  fact.lastSeen = new Date().toISOString();
  state.facts[question.prompt] = fact;

  sixtyWindow = sixtyWindow.filter((time) => Date.now() - time < 60000);
  if (correct) sixtyWindow.push(Date.now());
  state.stats.best60 = Math.max(state.stats.best60, sixtyWindow.length);

  saveState();
  renderAllStats();
}

function weakScore(fact) {
  return fact.wrong * 4 + fact.slow * 2 + Math.max(0, fact.totalMs / Math.max(1, fact.reps) - slowLimit(fact.type)) / 1000;
}

function getWeakFacts() {
  return Object.values(state.facts)
    .filter((fact) => fact.wrong > 0 || fact.slow > 0)
    .sort((a, b) => weakScore(b) - weakScore(a));
}

function pullWeakQuestion() {
  if (mode !== "weak") return null;
  const weak = getWeakFacts();
  if (!weak.length) return makeQuestion(["multiply", "percent", "squares", "complements"]);
  const fact = pick(weak.slice(0, Math.min(8, weak.length)));
  return {
    type: fact.type,
    category: labelForType(fact.type),
    prompt: fact.prompt,
    answer: fact.answer,
    tolerance: fact.tolerance
  };
}

function renderWeakFacts() {
  const weak = getWeakFacts();
  if (!weak.length) {
    els.weakList.innerHTML = `<div class="empty-state">No weak facts yet. Start a timed drill.</div>`;
    return;
  }
  els.weakList.innerHTML = weak.slice(0, 18).map((fact) => {
    const avg = round(fact.totalMs / fact.reps / 1000, 1);
    return `
      <div class="weak-item">
        <div>
          <div class="weak-fact">${fact.prompt}</div>
          <div class="weak-meta">${labelForType(fact.type)} | ${fact.wrong} wrong | ${fact.slow} slow | ${avg}s avg</div>
        </div>
        <div class="weak-score">${Math.ceil(weakScore(fact))}</div>
      </div>
    `;
  }).join("");
}

function pct(correct, reps) {
  return reps ? `${Math.round((correct / reps) * 100)}%` : "0%";
}

function avgTime(totalMs, reps) {
  return reps ? `${round(totalMs / reps / 1000, 1)}s` : "0.0s";
}

function renderAllStats() {
  els.sessionReps.textContent = String(session.reps);
  els.sessionAccuracy.textContent = pct(session.correct, session.reps);
  els.sessionAvg.textContent = avgTime(session.totalMs, session.reps);
  if (els.streakPill) els.streakPill.textContent = `${state.stats.streak}d`;
  if (els.accuracyPill) els.accuracyPill.textContent = pct(state.stats.correct, state.stats.totalReps);
  renderStats();
  if (mode === "weak") renderWeakFacts();
}

function showHome() {
  stopTimer();
  drillActive = false;
  dailyIndex = -1;
  currentPool = null;
  browsePage = "home";
  els.homeScreen.hidden = false;
  els.trainerScreen.hidden = true;
  updateSwipeDots();
}

function showTrainer() {
  els.homeScreen.hidden = true;
  els.trainerScreen.hidden = false;
}

function updateSwipeDots() {
  const activeKey = els.trainerScreen.hidden ? "home" : mode;
  const activeIndex = Math.max(0, browsePages.indexOf(activeKey));
  els.swipeDots.forEach((dot, index) => {
    dot.classList.toggle("active", index === activeIndex);
  });
}

function moveBrowsePage(direction) {
  if (drillActive || dailyIndex >= 0) return;
  const currentPage = els.trainerScreen.hidden ? "home" : browsePage;
  const index = Math.max(0, browsePages.indexOf(currentPage));
  const nextIndex = Math.min(browsePages.length - 1, Math.max(0, index + direction));
  const nextPage = browsePages[nextIndex];
  if (nextPage === currentPage) return;
  browsePage = nextPage;
  if (nextPage === "home") {
    showHome();
    return;
  }
  showTrainer();
  setMode(nextPage);
}

function readPoint(event) {
  if (event.changedTouches && event.changedTouches[0]) {
    return event.changedTouches[0];
  }
  return event;
}

function onSwipeStart(event) {
  if (drillActive || dailyIndex >= 0) return;
  const point = readPoint(event);
  swipeStartX = point.clientX;
  swipeStartY = point.clientY;
  swipePointerId = event.pointerId || null;
}

function onSwipeEnd(event) {
  if (drillActive || dailyIndex >= 0) return;
  if (swipePointerId !== null && event.pointerId !== swipePointerId) return;
  const point = readPoint(event);
  const dx = point.clientX - swipeStartX;
  const dy = point.clientY - swipeStartY;
  swipePointerId = null;
  if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
  moveBrowsePage(dx < 0 ? 1 : -1);
}

function onSwipeWheel(event) {
  if (drillActive || dailyIndex >= 0) return;
  if (Math.abs(event.deltaX) < 32 || Math.abs(event.deltaX) < Math.abs(event.deltaY) * 1.2) return;
  const now = Date.now();
  if (now - lastWheelSwipeAt < 420) return;
  lastWheelSwipeAt = now;
  event.preventDefault();
  moveBrowsePage(event.deltaX > 0 ? 1 : -1);
}

function renderStats() {
  const weakTypes = new Set(getWeakFacts().map((fact) => fact.type));
  els.statStreak.textContent = String(state.stats.streak);
  els.statReps.textContent = String(state.stats.totalReps);
  els.statAccuracy.textContent = pct(state.stats.correct, state.stats.totalReps);
  els.statAvg.textContent = avgTime(state.stats.totalMs, state.stats.totalReps);
  els.statWeakCats.textContent = String(weakTypes.size);
  els.statBest60.textContent = String(state.stats.best60);

  const categories = Object.entries(state.stats.categories);
  if (!categories.length) {
    els.categoryBars.innerHTML = `<div class="empty-state">Stats appear after your first rep.</div>`;
    return;
  }
  els.categoryBars.innerHTML = categories.map(([type, item]) => {
    const accuracy = item.reps ? Math.round((item.correct / item.reps) * 100) : 0;
    return `
      <div class="bar-row">
        <span>${labelForType(type)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${accuracy}%"></div></div>
        <strong>${accuracy}%</strong>
      </div>
    `;
  }).join("");
}

els.modeTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    stopTimer();
    dailyIndex = -1;
    currentPool = null;
    setMode(tab.dataset.mode);
  });
});

els.startDailyBtn.addEventListener("click", startDaily);
els.answerForm.addEventListener("submit", submitAnswer);
els.retryWeakBtn.addEventListener("click", () => {
  stopTimer();
  drillActive = true;
  mode = "weak";
  els.modeTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  showView("timed");
  els.phaseLabel.textContent = "Weak facts";
  els.phaseHint.textContent = "Retry facts you missed or answered slowly.";
  newQuestion();
});
els.homeScreen.addEventListener("touchstart", onSwipeStart, { passive: true });
els.homeScreen.addEventListener("touchend", onSwipeEnd, { passive: true });
els.trainerScreen.addEventListener("touchstart", onSwipeStart, { passive: true });
els.trainerScreen.addEventListener("touchend", onSwipeEnd, { passive: true });
els.homeScreen.addEventListener("pointerdown", onSwipeStart);
els.homeScreen.addEventListener("pointerup", onSwipeEnd);
els.trainerScreen.addEventListener("pointerdown", onSwipeStart);
els.trainerScreen.addEventListener("pointerup", onSwipeEnd);
els.homeScreen.addEventListener("mousedown", onSwipeStart);
els.homeScreen.addEventListener("mouseup", onSwipeEnd);
els.trainerScreen.addEventListener("mousedown", onSwipeStart);
els.trainerScreen.addEventListener("mouseup", onSwipeEnd);
window.addEventListener("wheel", onSwipeWheel, { passive: false });

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

renderAllStats();
updateSwipeDots();
showHome();
