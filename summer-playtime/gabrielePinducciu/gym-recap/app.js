// SetLog — app logic
// See SPEC.md for the design this implements, CLAUDE.md for working
// conventions. Built in the order CLAUDE.md lays out: data layer, then
// Today, History, Progress, Settings — each section below in that order.

'use strict';

// =======================================================================
// Data layer
// =======================================================================

const STORAGE_KEYS = {
  sessions: 'setlog.sessions',
  customExercises: 'setlog.customExercises',
  draft: 'setlog.draft',
};

const BUILT_IN_EXERCISES = [
  { id: 'bench-press', name: 'Bench Press', muscleGroup: 'Chest' },
  { id: 'incline-bench-press', name: 'Incline Bench Press', muscleGroup: 'Chest' },
  { id: 'chest-fly', name: 'Chest Fly', muscleGroup: 'Chest' },
  { id: 'overhead-press', name: 'Overhead Press', muscleGroup: 'Shoulders' },
  { id: 'dumbbell-shoulder-press', name: 'Dumbbell Shoulder Press', muscleGroup: 'Shoulders' },
  { id: 'lateral-raise', name: 'Lateral Raise', muscleGroup: 'Shoulders' },
  { id: 'barbell-row', name: 'Barbell Row', muscleGroup: 'Back' },
  { id: 'pull-up', name: 'Pull-up', muscleGroup: 'Back' },
  { id: 'lat-pulldown', name: 'Lat Pulldown', muscleGroup: 'Back' },
  { id: 'deadlift', name: 'Deadlift', muscleGroup: 'Back' },
  { id: 'squat', name: 'Squat', muscleGroup: 'Legs' },
  { id: 'front-squat', name: 'Front Squat', muscleGroup: 'Legs' },
  { id: 'romanian-deadlift', name: 'Romanian Deadlift', muscleGroup: 'Legs' },
  { id: 'leg-press', name: 'Leg Press', muscleGroup: 'Legs' },
  { id: 'leg-curl', name: 'Leg Curl', muscleGroup: 'Legs' },
  { id: 'leg-extension', name: 'Leg Extension', muscleGroup: 'Legs' },
  { id: 'hip-thrust', name: 'Hip Thrust', muscleGroup: 'Legs' },
  { id: 'bicep-curl', name: 'Bicep Curl', muscleGroup: 'Arms' },
  { id: 'tricep-pushdown', name: 'Tricep Pushdown', muscleGroup: 'Arms' },
  { id: 'plank', name: 'Plank', muscleGroup: 'Core' },
];

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function todayISO() {
  // Local calendar date, not UTC — a workout at 11pm shouldn't roll to
  // "tomorrow" just because of timezone math.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.error(`SetLog: failed to read ${key} from localStorage`, err);
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // Most likely quota exceeded or storage disabled (private browsing).
    console.error(`SetLog: failed to write ${key} to localStorage`, err);
    alert('Could not save — your browser storage may be full or disabled.');
  }
}

function loadSessions() {
  return readJSON(STORAGE_KEYS.sessions, []);
}
function saveSessions(sessions) {
  writeJSON(STORAGE_KEYS.sessions, sessions);
}

function loadCustomExercises() {
  return readJSON(STORAGE_KEYS.customExercises, []);
}
function saveCustomExercises(list) {
  writeJSON(STORAGE_KEYS.customExercises, list);
}

function loadDraft() {
  return readJSON(STORAGE_KEYS.draft, null);
}
function saveDraft(draft) {
  writeJSON(STORAGE_KEYS.draft, draft);
}
function clearDraft() {
  localStorage.removeItem(STORAGE_KEYS.draft);
}

function getAllExercises() {
  return BUILT_IN_EXERCISES.concat(loadCustomExercises());
}

function findExercise(exerciseId) {
  return getAllExercises().find((e) => e.id === exerciseId) || null;
}

// =======================================================================
// Quick stats (week count + streak) — read-only over saved sessions
// =======================================================================

/** Monday (as a Date, local midnight) of the week containing `date`. */
function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function workoutsThisWeek(sessions) {
  const monday = mondayOf(new Date());
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const start = isoDate(monday), end = isoDate(sunday);
  return sessions.filter((s) => s.dateISO >= start && s.dateISO <= end).length;
}

/**
 * Consecutive weeks (Mon–Sun) with >=1 session, counted backward from the
 * most recent week that has one. If the current week has no session yet,
 * that doesn't break the streak — the week just isn't over yet; counting
 * starts from the most recent *completed* week that qualifies instead.
 */
function currentStreakWeeks(sessions) {
  const weekHasSession = (mondayDate) => {
    const start = isoDate(mondayDate);
    const end = new Date(mondayDate);
    end.setDate(end.getDate() + 6);
    const endISO = isoDate(end);
    return sessions.some((s) => s.dateISO >= start && s.dateISO <= endISO);
  };

  let cursor = mondayOf(new Date());
  let streak = 0;

  if (weekHasSession(cursor)) {
    streak = 1;
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() - 7);
  } else {
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() - 7);
  }

  while (weekHasSession(cursor)) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 7);
  }

  return streak;
}

// =======================================================================
// App state
// =======================================================================

const state = {
  draft: loadDraft(), // in-progress WorkoutSession, or null
  activeScreen: 'today',
  editingSessionId: null, // session currently open in the History detail modal
  progressExerciseId: null, // exercise currently selected on the Progress screen
  progressMode: 'best', // 'best' weight or total 'volume'
};

// =======================================================================
// Today screen — draft workout actions
// =======================================================================

function startWorkout() {
  state.draft = {
    id: uid('session'),
    dateISO: todayISO(),
    exercises: [],
  };
  saveDraft(state.draft);
  renderToday();
}

function discardWorkout() {
  if (!confirm('Discard this workout? Nothing logged in it will be saved.')) return;
  state.draft = null;
  clearDraft();
  renderToday();
}

function addExerciseToDraft(exerciseId) {
  if (!state.draft) return;
  const exists = state.draft.exercises.some((e) => e.exerciseId === exerciseId);
  if (exists) {
    closePickerModal();
    return; // already added — the set logging UI for it is already on screen
  }
  state.draft.exercises.push({ exerciseId, sets: [] });
  saveDraft(state.draft);
  closePickerModal();
  renderToday();
}

function removeExerciseFromDraft(exerciseId) {
  if (!state.draft) return;
  state.draft.exercises = state.draft.exercises.filter((e) => e.exerciseId !== exerciseId);
  saveDraft(state.draft);
  renderToday();
}

function addSet(exerciseId) {
  if (!state.draft) return;
  const entry = state.draft.exercises.find((e) => e.exerciseId === exerciseId);
  if (!entry) return;
  entry.sets.push({ reps: 0, weightKg: 0 });
  saveDraft(state.draft);
  renderToday();
}

function updateSet(exerciseId, setIndex, field, value) {
  if (!state.draft) return;
  const entry = state.draft.exercises.find((e) => e.exerciseId === exerciseId);
  if (!entry || !entry.sets[setIndex]) return;
  const num = Number(value);
  entry.sets[setIndex][field] = Number.isFinite(num) && num >= 0 ? num : 0;
  saveDraft(state.draft);
  // No re-render here — the input the user is typing in must not be
  // rebuilt out from under them. Stats banner doesn't depend on set
  // values, so nothing else on screen is stale by skipping it.
}

function removeSet(exerciseId, setIndex) {
  if (!state.draft) return;
  const entry = state.draft.exercises.find((e) => e.exerciseId === exerciseId);
  if (!entry) return;
  entry.sets.splice(setIndex, 1);
  saveDraft(state.draft);
  renderToday();
}

function draftIsFinishable(draft) {
  // 0 kg is legitimate (bodyweight work — pull-ups, plank, etc.).
  // 0 reps isn't a set at all, so it doesn't count toward being finishable.
  return draft.exercises.some((e) => e.sets.some((s) => s.reps > 0));
}

function finishWorkout() {
  if (!state.draft || !draftIsFinishable(state.draft)) return;
  const sessions = loadSessions();
  sessions.push(state.draft);
  saveSessions(sessions);
  state.draft = null;
  clearDraft();
  renderToday();
}

function addCustomExercise(name, muscleGroup) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const exercise = { id: uid('custom'), name: trimmed, muscleGroup };
  const list = loadCustomExercises();
  list.push(exercise);
  saveCustomExercises(list);
  return exercise;
}

// =======================================================================
// Today screen — rendering
// =======================================================================

function renderQuickStats() {
  const sessions = loadSessions();
  document.getElementById('stat-week-count').textContent = workoutsThisWeek(sessions);
  document.getElementById('stat-streak').textContent = currentStreakWeeks(sessions);
}

function renderToday() {
  renderQuickStats();

  const emptyEl = document.getElementById('today-empty');
  const activeEl = document.getElementById('today-active');

  if (!state.draft) {
    emptyEl.classList.remove('hidden');
    activeEl.classList.add('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  activeEl.classList.remove('hidden');

  document.getElementById('today-date').textContent = state.draft.dateISO;

  const listEl = document.getElementById('draft-exercise-list');
  listEl.innerHTML = '';

  state.draft.exercises.forEach((entry) => {
    const exercise = findExercise(entry.exerciseId);
    const card = document.createElement('div');
    card.className = 'exercise-card';

    const header = document.createElement('div');
    header.className = 'exercise-card-header';
    header.innerHTML = `
      <div><span class="name">${escapeHTML(exercise ? exercise.name : 'Unknown exercise')}</span>
        <span class="muscle-group">${escapeHTML(exercise ? exercise.muscleGroup : '')}</span></div>
    `;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove-exercise';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => removeExerciseFromDraft(entry.exerciseId));
    header.appendChild(removeBtn);
    card.appendChild(header);

    entry.sets.forEach((set, index) => {
      const row = document.createElement('div');
      row.className = 'set-row';

      const idx = document.createElement('div');
      idx.className = 'set-index';
      idx.textContent = index + 1;

      const repsInput = document.createElement('input');
      repsInput.type = 'number';
      repsInput.min = '0';
      repsInput.placeholder = 'reps';
      repsInput.value = set.reps;
      repsInput.addEventListener('input', (e) => updateSet(entry.exerciseId, index, 'reps', e.target.value));

      const weightInput = document.createElement('input');
      weightInput.type = 'number';
      weightInput.min = '0';
      weightInput.step = '0.5';
      weightInput.placeholder = 'kg';
      // Not `set.weightKg || ''` — 0 kg is a legitimate logged value
      // (bodyweight work), so it must render as "0", not blank.
      weightInput.value = set.weightKg;
      weightInput.addEventListener('input', (e) => updateSet(entry.exerciseId, index, 'weightKg', e.target.value));

      const removeSetBtn = document.createElement('button');
      removeSetBtn.textContent = '✕';
      removeSetBtn.addEventListener('click', () => removeSet(entry.exerciseId, index));

      row.appendChild(idx);
      row.appendChild(repsInput);
      row.appendChild(weightInput);
      row.appendChild(removeSetBtn);
      card.appendChild(row);
    });

    const addSetBtn = document.createElement('button');
    addSetBtn.className = 'btn-add-set';
    addSetBtn.textContent = '+ Add set';
    addSetBtn.addEventListener('click', () => addSet(entry.exerciseId));
    card.appendChild(addSetBtn);

    listEl.appendChild(card);
  });

  document.getElementById('btn-finish-workout').disabled = !draftIsFinishable(state.draft);
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// =======================================================================
// Exercise picker modal
// =======================================================================

function openPickerModal() {
  document.getElementById('picker-search').value = '';
  showPickerListView();
  renderPickerResults('');
  document.getElementById('modal-picker').classList.remove('hidden');
  document.getElementById('picker-search').focus();
}

function closePickerModal() {
  document.getElementById('modal-picker').classList.add('hidden');
}

function showPickerListView() {
  document.getElementById('picker-list-view').classList.remove('hidden');
  document.getElementById('picker-new-view').classList.add('hidden');
}

function showPickerNewView() {
  document.getElementById('picker-list-view').classList.add('hidden');
  document.getElementById('picker-new-view').classList.remove('hidden');
  document.getElementById('new-exercise-name').value = '';
  document.getElementById('new-exercise-name').focus();
}

function renderPickerResults(query) {
  const resultsEl = document.getElementById('picker-results');
  resultsEl.innerHTML = '';

  const q = query.trim().toLowerCase();
  const matches = getAllExercises()
    .filter((e) => e.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (matches.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muscle-group';
    empty.textContent = 'No matches — add it as a new exercise below.';
    resultsEl.appendChild(empty);
    return;
  }

  matches.forEach((exercise) => {
    const row = document.createElement('div');
    row.className = 'picker-row';
    row.innerHTML = `<span>${escapeHTML(exercise.name)}</span><span class="muscle-group">${escapeHTML(exercise.muscleGroup)}</span>`;
    row.addEventListener('click', () => addExerciseToDraft(exercise.id));
    resultsEl.appendChild(row);
  });
}

// =======================================================================
// History screen
// =======================================================================

function sessionVolume(session) {
  let total = 0;
  session.exercises.forEach((entry) => {
    entry.sets.forEach((s) => { total += s.reps * s.weightKg; });
  });
  return total;
}

function renderHistory() {
  const listEl = document.getElementById('history-list');
  const emptyEl = document.getElementById('history-empty');

  // Newest first: reverse creation order, then a stable sort by date so
  // same-day sessions keep their most-recently-created-first order.
  const sessions = loadSessions().slice().reverse()
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO));

  listEl.innerHTML = '';

  if (sessions.length === 0) {
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  sessions.forEach((session) => {
    const card = document.createElement('div');
    card.className = 'session-card';

    const dateEl = document.createElement('div');
    dateEl.className = 'session-date';
    dateEl.textContent = session.dateISO;
    card.appendChild(dateEl);

    session.exercises.forEach((entry) => {
      const exercise = findExercise(entry.exerciseId);
      const line = document.createElement('div');
      line.className = 'session-exercise-line';
      const setsText = entry.sets.map((s) => `${s.weightKg}kg×${s.reps}`).join(', ') || 'no sets';
      line.textContent = `${exercise ? exercise.name : 'Unknown exercise'}: ${setsText}`;
      card.appendChild(line);
    });

    const volumeEl = document.createElement('div');
    volumeEl.className = 'session-volume';
    volumeEl.innerHTML = `Total volume: <b>${sessionVolume(session)}</b> kg`;
    card.appendChild(volumeEl);

    card.addEventListener('click', () => openSessionDetail(session.id));
    listEl.appendChild(card);
  });
}

function getSessionById(sessionId) {
  return loadSessions().find((s) => s.id === sessionId) || null;
}

function mutateSession(sessionId, fn) {
  const sessions = loadSessions();
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return;
  fn(session);
  saveSessions(sessions);
}

function updateSessionSet(sessionId, exerciseIndex, setIndex, field, value) {
  mutateSession(sessionId, (session) => {
    const entry = session.exercises[exerciseIndex];
    if (!entry || !entry.sets[setIndex]) return;
    const num = Number(value);
    entry.sets[setIndex][field] = Number.isFinite(num) && num >= 0 ? num : 0;
  });
  // No re-render here either, same reasoning as Today's updateSet: don't
  // rebuild the input the user is actively typing in. The History list's
  // total-volume figure catches up next time that screen is rendered.
}

function removeSessionSet(sessionId, exerciseIndex, setIndex) {
  mutateSession(sessionId, (session) => {
    const entry = session.exercises[exerciseIndex];
    if (!entry) return;
    entry.sets.splice(setIndex, 1);
  });
  renderSessionDetail();
  renderHistory();
}

function removeSessionExercise(sessionId, exerciseIndex) {
  mutateSession(sessionId, (session) => {
    session.exercises.splice(exerciseIndex, 1);
  });
  renderSessionDetail();
  renderHistory();
}

function deleteSession(sessionId) {
  if (!confirm('Delete this entire workout session? This cannot be undone.')) return;
  const sessions = loadSessions().filter((s) => s.id !== sessionId);
  saveSessions(sessions);
  closeSessionDetail();
  renderHistory();
}

function openSessionDetail(sessionId) {
  state.editingSessionId = sessionId;
  renderSessionDetail();
  document.getElementById('modal-session-detail').classList.remove('hidden');
}

function closeSessionDetail() {
  document.getElementById('modal-session-detail').classList.add('hidden');
  state.editingSessionId = null;
  // Reps/weight edits inside the modal don't re-render the list live
  // (same reasoning as Today — don't rebuild inputs mid-typing), so catch
  // it up now in case the total-volume figure is stale.
  renderHistory();
}

function renderSessionDetail() {
  const session = getSessionById(state.editingSessionId);
  if (!session) { closeSessionDetail(); return; }

  document.getElementById('detail-date').textContent = session.dateISO;

  const listEl = document.getElementById('detail-exercise-list');
  listEl.innerHTML = '';

  session.exercises.forEach((entry, exerciseIndex) => {
    const exercise = findExercise(entry.exerciseId);
    const card = document.createElement('div');
    card.className = 'exercise-card';

    const header = document.createElement('div');
    header.className = 'exercise-card-header';
    const nameWrap = document.createElement('div');
    const nameSpan = document.createElement('span');
    nameSpan.className = 'name';
    nameSpan.textContent = exercise ? exercise.name : 'Unknown exercise';
    const groupSpan = document.createElement('span');
    groupSpan.className = 'muscle-group';
    groupSpan.textContent = exercise ? ` ${exercise.muscleGroup}` : '';
    nameWrap.appendChild(nameSpan);
    nameWrap.appendChild(groupSpan);
    header.appendChild(nameWrap);

    const removeExerciseBtn = document.createElement('button');
    removeExerciseBtn.className = 'btn-remove-exercise';
    removeExerciseBtn.textContent = 'Remove';
    removeExerciseBtn.addEventListener('click', () => removeSessionExercise(session.id, exerciseIndex));
    header.appendChild(removeExerciseBtn);
    card.appendChild(header);

    if (entry.sets.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muscle-group';
      empty.textContent = 'No sets.';
      card.appendChild(empty);
    }

    entry.sets.forEach((set, setIndex) => {
      const row = document.createElement('div');
      row.className = 'set-row';

      const idx = document.createElement('div');
      idx.className = 'set-index';
      idx.textContent = setIndex + 1;

      const repsInput = document.createElement('input');
      repsInput.type = 'number';
      repsInput.min = '0';
      repsInput.value = set.reps;
      repsInput.addEventListener('input', (e) => updateSessionSet(session.id, exerciseIndex, setIndex, 'reps', e.target.value));

      const weightInput = document.createElement('input');
      weightInput.type = 'number';
      weightInput.min = '0';
      weightInput.step = '0.5';
      weightInput.value = set.weightKg;
      weightInput.addEventListener('input', (e) => updateSessionSet(session.id, exerciseIndex, setIndex, 'weightKg', e.target.value));

      const removeSetBtn = document.createElement('button');
      removeSetBtn.textContent = '✕';
      removeSetBtn.addEventListener('click', () => removeSessionSet(session.id, exerciseIndex, setIndex));

      row.appendChild(idx);
      row.appendChild(repsInput);
      row.appendChild(weightInput);
      row.appendChild(removeSetBtn);
      card.appendChild(row);
    });

    listEl.appendChild(card);
  });
}

// =======================================================================
// Progress screen
// =======================================================================

function exercisesWithLoggedSets() {
  const ids = new Set();
  loadSessions().forEach((session) => {
    session.exercises.forEach((entry) => {
      if (entry.sets.length > 0) ids.add(entry.exerciseId);
    });
  });
  return getAllExercises().filter((e) => ids.has(e.id));
}

/**
 * One point per session that logged this exercise, in chronological order.
 * `mode` picks the y-value: 'best' = max weight that session, 'volume' =
 * total reps×weight that session (SPEC.md §6).
 */
function computeProgressPoints(exerciseId, mode) {
  const sessions = loadSessions().slice().sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const points = [];
  sessions.forEach((session) => {
    const entry = session.exercises.find((e) => e.exerciseId === exerciseId);
    if (!entry || entry.sets.length === 0) return;
    const value = mode === 'volume'
      ? entry.sets.reduce((sum, s) => sum + s.reps * s.weightKg, 0)
      : Math.max(...entry.sets.map((s) => s.weightKg));
    points.push({ date: session.dateISO, value });
  });
  return points;
}

function allTimeStatsForExercise(exerciseId) {
  let sessionCount = 0, bestWeight = 0, totalVolume = 0;
  loadSessions().forEach((session) => {
    const entry = session.exercises.find((e) => e.exerciseId === exerciseId);
    if (!entry || entry.sets.length === 0) return;
    sessionCount += 1;
    entry.sets.forEach((s) => {
      bestWeight = Math.max(bestWeight, s.weightKg);
      totalVolume += s.reps * s.weightKg;
    });
  });
  return { sessionCount, bestWeight, totalVolume };
}

function renderProgress() {
  const emptyEl = document.getElementById('progress-empty');
  const contentEl = document.getElementById('progress-content');
  const exercises = exercisesWithLoggedSets().sort((a, b) => a.name.localeCompare(b.name));

  if (exercises.length === 0) {
    emptyEl.classList.remove('hidden');
    contentEl.classList.add('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  contentEl.classList.remove('hidden');

  const selectEl = document.getElementById('progress-exercise-select');
  selectEl.innerHTML = '';
  exercises.forEach((ex) => {
    const opt = document.createElement('option');
    opt.value = ex.id;
    opt.textContent = ex.name;
    selectEl.appendChild(opt);
  });

  // Keep the current selection if it's still valid (still has logged sets);
  // otherwise fall back to the first exercise alphabetically.
  const stillValid = exercises.some((e) => e.id === state.progressExerciseId);
  if (!stillValid) state.progressExerciseId = exercises[0].id;
  selectEl.value = state.progressExerciseId;

  renderProgressChart();
}

function renderProgressChart() {
  const exerciseId = state.progressExerciseId;
  if (!exerciseId) return;

  const points = computeProgressPoints(exerciseId, state.progressMode);
  const chartEmptyEl = document.getElementById('progress-chart-empty');
  const canvas = document.getElementById('progress-canvas');

  if (points.length < 2) {
    chartEmptyEl.classList.remove('hidden');
    canvas.classList.add('hidden');
  } else {
    chartEmptyEl.classList.add('hidden');
    canvas.classList.remove('hidden');
    drawProgressChart(canvas, points);
  }

  const stats = allTimeStatsForExercise(exerciseId);
  document.getElementById('progress-summary').textContent =
    `${stats.sessionCount} session${stats.sessionCount === 1 ? '' : 's'} logged · `
    + `Best ever: ${stats.bestWeight}kg · Total volume all-time: ${stats.totalVolume}kg`;
}

function drawProgressChart(canvas, points) {
  // Size to the parent's width (not the canvas's own — that would be
  // circular, since we're about to change it) so the chart is responsive.
  const width = canvas.parentElement.clientWidth;
  canvas.width = width;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const pad = { left: 44, right: 16, top: 16, bottom: 24 };
  const plotW = canvas.width - pad.left - pad.right;
  const plotH = canvas.height - pad.top - pad.bottom;

  const values = points.map((p) => p.value);
  let minV = Math.min(...values), maxV = Math.max(...values);
  if (minV === maxV) { minV -= 1; maxV += 1; } // avoid a zero-range scale

  const xFor = (i) => pad.left + (points.length > 1 ? (i / (points.length - 1)) * plotW : 0);
  const yFor = (v) => pad.top + plotH - ((v - minV) / (maxV - minV)) * plotH;

  // Gridlines + value labels (min/max only — keeps it readable on a small screen).
  ctx.strokeStyle = '#2a323d';
  ctx.fillStyle = '#8b95a3';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  [minV, maxV].forEach((v) => {
    const y = yFor(v);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(canvas.width - pad.right, y);
    ctx.stroke();
    ctx.fillText(String(Math.round(v)), pad.left - 6, y + 4);
  });

  // Line + points.
  ctx.strokeStyle = '#4a90d9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = xFor(i), y = yFor(p.value);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = '#4a90d9';
  points.forEach((p, i) => {
    const x = xFor(i), y = yFor(p.value);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  // First/last date labels only — every point would overlap on a phone screen.
  ctx.fillStyle = '#8b95a3';
  ctx.textAlign = 'left';
  ctx.fillText(points[0].date, pad.left, canvas.height - 6);
  ctx.textAlign = 'right';
  ctx.fillText(points[points.length - 1].date, canvas.width - pad.right, canvas.height - 6);
}

// =======================================================================
// Settings screen — backup / restore / wipe
// =======================================================================

function setSettingsStatus(msg) {
  document.getElementById('settings-status').textContent = msg;
}

function exportBackup() {
  const data = {
    exportedAt: new Date().toISOString(),
    sessions: loadSessions(),
    customExercises: loadCustomExercises(),
    // Deliberately no draft — a backup is history, not an in-progress workout.
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `setlog-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  setSettingsStatus('Backup exported.');
}

function importBackup(file) {
  const reader = new FileReader();

  reader.onerror = () => setSettingsStatus('Import failed — could not read that file.');

  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(reader.result);
    } catch (err) {
      setSettingsStatus('Import failed — that file is not valid JSON.');
      return;
    }
    if (!data || !Array.isArray(data.sessions) || !Array.isArray(data.customExercises)) {
      setSettingsStatus("Import failed — that file doesn't look like a SetLog backup.");
      return;
    }

    const replace = confirm(
      'Import this backup?\n\nOK = Replace all current data with the backup.\nCancel = Merge, keeping both.'
    );

    if (replace) {
      saveSessions(data.sessions);
      saveCustomExercises(data.customExercises);
      setSettingsStatus(`Replaced with backup: ${data.sessions.length} session(s), ${data.customExercises.length} custom exercise(s).`);
    } else {
      const existingSessions = loadSessions();
      const existingIds = new Set(existingSessions.map((s) => s.id));
      const newSessions = data.sessions.filter((s) => !existingIds.has(s.id));
      saveSessions(existingSessions.concat(newSessions));

      const existingExercises = loadCustomExercises();
      const existingExIds = new Set(existingExercises.map((e) => e.id));
      const newExercises = data.customExercises.filter((e) => !existingExIds.has(e.id));
      saveCustomExercises(existingExercises.concat(newExercises));

      setSettingsStatus(`Merged: added ${newSessions.length} new session(s), ${newExercises.length} new custom exercise(s).`);
    }

    // The in-progress draft is untouched — restoring a backup shouldn't
    // wipe out a workout you're mid-way through logging right now.
    renderToday();
  };

  reader.readAsText(file);
}

function clearAllData() {
  if (!confirm('Clear ALL data — every workout, every custom exercise, and any in-progress workout? This cannot be undone.')) return;
  localStorage.removeItem(STORAGE_KEYS.sessions);
  localStorage.removeItem(STORAGE_KEYS.customExercises);
  localStorage.removeItem(STORAGE_KEYS.draft);
  state.draft = null;
  renderToday();
  setSettingsStatus('All data cleared.');
}

// =======================================================================
// Tab navigation
// =======================================================================

function showScreen(name) {
  state.activeScreen = name;
  document.querySelectorAll('.screen').forEach((el) => el.classList.add('hidden'));
  document.getElementById(`screen-${name}`).classList.remove('hidden');
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.screen === name);
  });

  if (name === 'history') renderHistory();
  if (name === 'progress') renderProgress();
  if (name === 'settings') setSettingsStatus('');
}

// =======================================================================
// Event wiring
// =======================================================================

document.getElementById('btn-start-workout').addEventListener('click', startWorkout);
document.getElementById('btn-discard-workout').addEventListener('click', discardWorkout);
document.getElementById('btn-finish-workout').addEventListener('click', finishWorkout);
document.getElementById('btn-add-exercise').addEventListener('click', openPickerModal);

document.getElementById('picker-search').addEventListener('input', (e) => renderPickerResults(e.target.value));
document.getElementById('btn-new-exercise').addEventListener('click', showPickerNewView);
document.getElementById('btn-cancel-new-exercise').addEventListener('click', showPickerListView);
document.getElementById('btn-save-new-exercise').addEventListener('click', () => {
  const name = document.getElementById('new-exercise-name').value;
  const group = document.getElementById('new-exercise-group').value;
  const exercise = addCustomExercise(name, group);
  if (exercise) addExerciseToDraft(exercise.id);
});

// Generic close/cancel wiring — closes whichever modal the button lives in,
// shared by the exercise picker and the session detail modal.
document.querySelectorAll('[data-close-modal]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    const modal = e.target.closest('.modal');
    if (!modal) return;
    if (modal.id === 'modal-session-detail') {
      closeSessionDetail(); // also refreshes the History list behind it
    } else {
      modal.classList.add('hidden');
    }
  });
});

document.getElementById('btn-delete-session').addEventListener('click', () => {
  if (state.editingSessionId) deleteSession(state.editingSessionId);
});

document.getElementById('progress-exercise-select').addEventListener('change', (e) => {
  state.progressExerciseId = e.target.value;
  renderProgressChart();
});

document.querySelectorAll('.toggle-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.progressMode = btn.dataset.mode;
    document.querySelectorAll('.toggle-btn').forEach((b) => b.classList.toggle('active', b === btn));
    renderProgressChart();
  });
});

document.getElementById('btn-export').addEventListener('click', exportBackup);
document.getElementById('file-import').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) importBackup(file);
  e.target.value = ''; // so re-importing the same filename later still fires 'change'
});
document.getElementById('btn-clear-data').addEventListener('click', clearAllData);

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => showScreen(btn.dataset.screen));
});

// =======================================================================
// Boot
// =======================================================================

renderToday();
