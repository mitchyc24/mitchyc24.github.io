// app.js — view wiring for miFitness. The data layer lives in db.js, the
// training maths in stats.js, and the SVG charts in charts.js; this module is
// the part that renders and reacts.

import * as db from './db.js';
import * as S from './stats.js';
import { renderStatTiles, renderBarChart, renderDonut, renderLineChart, renderDataTable, hideTooltip } from './charts.js';
import {
    $, $$, createEl, icon, clear, emptyState, toast,
    wireDialogs, openDialog, confirmDialog, promptDialog, sheetDialog,
    initials, downloadBlob
} from './ui.js';

// --- State ----------------------------------------------------------------

const settings = {
    units: 'kg',
    restSeconds: 90,
    autoRest: true,
    vibrate: true,
    sound: false,
    wakeLock: true,
    theme: 'system',
    accent: 'ember'
};

const ACCENTS = [
    ['ember', '#e2542c'], ['lime', '#4d9a20'], ['ocean', '#0f7fb5'],
    ['violet', '#7048c8'], ['rose', '#d13c6b'], ['slate', '#4a5568']
];

const state = {
    view: 'home',
    tab: 'home',
    backTo: null,
    sessionId: null,        // the workout being logged
    sessionStart: null,
    detailExerciseId: null,
    detailSessionId: null,
    exerciseFilter: { search: '', group: '' },
    progressRange: 30,
    historyPage: 0
};

let sessionTimer = null;
let restTimer = null;
let restState = null;       // { remaining, total, label }
let wakeLock = null;
let audioContext = null;

const TABS = ['home', 'history', 'exercises', 'progress', 'settings'];
const HISTORY_PAGE_SIZE = 20;

// --- Settings -------------------------------------------------------------

const loadSettings = () => {
    const stored = db.getAllSettings();
    for (const key of Object.keys(settings)) {
        if (!(key in stored)) continue;
        const value = stored[key];
        settings[key] = typeof settings[key] === 'boolean' ? value === 'true'
            : typeof settings[key] === 'number' ? Number(value)
            : value;
    }
};

const setSetting = async (key, value) => {
    settings[key] = value;
    await db.saveSetting(key, value);
};

const applyAppearance = () => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.accent = settings.accent;
    const meta = $('meta[name="theme-color"]');
    const accent = ACCENTS.find(([name]) => name === settings.accent);
    if (meta && accent) meta.setAttribute('content', accent[1]);
};

// --- Formatting shortcuts -------------------------------------------------

const units = () => settings.units;
const showWeight = (kg, withUnit = false) => S.formatWeight(kg, units(), { withUnit });
const showVolume = (kg) => S.formatVolume(kg, units());
const weightStep = () => S.stepFor(units());

/** Axis-friendly magnitude: 12500 -> "12.5k". */
const compactNumber = (value) => (value >= 10000
    ? `${S.formatNumber(value / 1000)}k`
    : S.formatNumber(value, 0));

/** Set-level summary line: "100 kg × 8" (or "8 reps" for bodyweight work). */
const setLabel = (set) => (set.weight_kg > 0
    ? `${showWeight(set.weight_kg)} × ${set.reps}`
    : `${set.reps} reps`);

// --- Navigation -----------------------------------------------------------

const showView = (view, { backTo = null } = {}) => {
    state.view = view;
    state.backTo = backTo;
    for (const section of $$('.view')) section.classList.toggle('active', section.id === `view-${view}`);
    if (TABS.includes(view)) state.tab = view;
    for (const tab of $$('.tab')) tab.setAttribute('aria-selected', String(tab.dataset.tab === state.tab));
    $('#finish-bar').hidden = view !== 'workout';
    hideTooltip();
    window.scrollTo({ top: 0 });
    updateHeader();
};

const goBack = () => showView(state.backTo || state.tab);

const updateHeader = () => {
    const actions = clear($('#header-actions'));
    const lead = $('#header-lead');
    lead.hidden = false;

    if (state.view === 'workout') {
        actions.appendChild(createEl('button.btn.sm', {
            onclick: () => showView('home'),
            title: 'Leave the workout running and come back later'
        }, ['Minimise']));
        actions.appendChild(createEl('button.icon-btn', {
            title: 'Workout options',
            onclick: openWorkoutMenu
        }, [icon('more')]));
    }
};

const goToTab = (tab) => {
    // Tapping "Train" while a workout is running goes straight back into it.
    if (tab === 'home' && state.sessionId && state.view !== 'workout') {
        renderWorkout();
        showView('workout');
        return;
    }
    showView(tab);
    if (tab === 'home') renderHome();
    if (tab === 'history') { state.historyPage = 0; renderHistory(); }
    if (tab === 'exercises') renderExerciseList();
    if (tab === 'progress') renderProgress();
    if (tab === 'settings') renderSettings();
};

// ==========================================================================
// Home
// ==========================================================================

const renderHome = () => {
    renderResumeBanner();
    renderWeekStats();
    renderRoutines();
    renderRecentSessions();

    const totals = db.getLifetimeTotals();
    $('#hero-eyebrow').textContent = totals.sessions > 0 ? 'Ready when you are' : 'Welcome';
    $('#hero-title').textContent = totals.sessions > 0 ? 'Start training' : 'Log your first workout';
    $('#hero-sub').textContent = totals.sessions > 0
        ? `${totals.sessions} workouts logged · ${showVolume(totals.volume_kg)} ${units()} lifted all time.`
        : 'Pick a routine or start empty. Everything stays on this device.';
};

const renderResumeBanner = () => {
    const slot = clear($('#resume-slot'));
    const active = db.getActiveSession();
    if (!active) return;

    const sets = db.getSetsForSession(active.id).filter((s) => s.is_complete);
    slot.appendChild(createEl('div.resume-banner', {}, [
        icon('flame', 22),
        createEl('div.body', {}, [
            createEl('div.title', { text: active.name || 'Workout in progress' }),
            createEl('div.meta', {
                text: `Started ${S.relativeDay(active.start_time).toLowerCase()} · ${sets.length} sets logged`
            })
        ]),
        createEl('button.btn.sm', { onclick: () => resumeSession(active) }, ['Resume'])
    ]));
};

const renderWeekStats = () => {
    const host = clear($('#week-stats'));
    const weekStart = S.startOfWeek();
    const sets = db.getSetsSince(weekStart.toISOString());
    const dates = db.getSessionDates();
    const sessionsThisWeek = new Set(sets.map((s) => s.session_id)).size;

    renderStatTiles(host, [
        { value: String(sessionsThisWeek), label: 'Workouts' },
        { value: showVolume(S.totalVolume(sets)), unit: units(), label: 'Volume' },
        { value: String(sets.filter(S.isWorkingSet).length), label: 'Work sets' },
        { value: String(S.weekStreak(dates)), label: 'Week streak' }
    ]);
};

const renderRoutines = () => {
    const host = clear($('#routine-list'));
    const routines = db.listRoutines();
    if (routines.length === 0) {
        host.appendChild(emptyState('No routines yet', 'Save a workout as a routine, or build one from scratch.'));
        return;
    }
    for (const routine of routines) {
        host.appendChild(createEl('button.routine-card', {
            type: 'button',
            onclick: () => startFromRoutine(routine)
        }, [
            createEl('div.name', { text: routine.name }),
            routine.description ? createEl('div.desc', { text: routine.description }) : null,
            createEl('div.foot', {}, [
                createEl('span.badge', { text: `${routine.exercise_count} exercises` }),
                createEl('span.icon-btn', {
                    role: 'button',
                    tabindex: '0',
                    title: 'Edit routine',
                    onclick: (event) => { event.stopPropagation(); openRoutineDialog(routine.id); },
                    onkeydown: (event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.stopPropagation();
                        event.preventDefault();
                        openRoutineDialog(routine.id);
                    }
                }, [icon('settings', 16)])
            ])
        ]));
    }
};

const sessionListItem = (session) => {
    const summary = `${session.exercise_count} exercises · ${session.set_count} sets`;
    return createEl('button.list-item', {
        type: 'button',
        onclick: () => openSessionDetail(session.id)
    }, [
        createEl('div.avatar', { text: initials(session.name || 'Workout') }),
        createEl('div.body', {}, [
            createEl('div.title', { text: session.name || 'Workout' }),
            createEl('div.meta', {}, [
                createEl('span', { text: S.relativeDay(session.start_time) }),
                createEl('span', { text: S.formatDuration(S.sessionDurationMs(session)) }),
                createEl('span', { text: summary }),
                createEl('span', { text: `${showVolume(session.volume_kg)} ${units()}` })
            ])
        ]),
        createEl('span.chevron', {}, [icon('chevron', 18)])
    ]);
};

const renderRecentSessions = () => {
    const host = clear($('#recent-sessions'));
    const sessions = db.listSessions({ limit: 3 });
    if (sessions.length === 0) {
        host.appendChild(emptyState('No workouts yet', 'Finished workouts show up here.'));
        return;
    }
    for (const session of sessions) host.appendChild(sessionListItem(session));
};

// ==========================================================================
// Workout
// ==========================================================================

const startEmptyWorkout = async () => {
    const id = await db.startSession({ name: 'Workout' });
    await enterSession(id);
    openExercisePicker();
};

const startFromRoutine = async (routine) => {
    if (db.getActiveSession()) {
        const proceed = await confirmDialog({
            title: 'A workout is already running',
            message: 'Finish or discard it before starting another.',
            confirmLabel: 'Open it'
        });
        if (proceed) resumeSession(db.getActiveSession());
        return;
    }
    const id = await db.startSession({ name: routine.name, routineId: routine.id });
    await enterSession(id);
};

const resumeSession = (session) => {
    state.sessionId = session.id;
    state.sessionStart = new Date(session.start_time);
    startSessionTimer();
    requestWakeLock();
    renderWorkout();
    showView('workout');
};

const enterSession = async (id) => {
    const session = db.getSession(id);
    resumeSession(session);
};

const renderWorkout = () => {
    if (!state.sessionId) { showView('home'); return; }
    const entries = db.getSessionExercises(state.sessionId);
    const host = clear($('#workout-exercises'));

    if (entries.length === 0) {
        host.appendChild(emptyState(
            'Nothing added yet',
            'Add the first exercise to start logging sets.',
            createEl('button.btn.primary', { onclick: openExercisePicker }, ['Add exercise'])
        ));
    }

    entries.forEach((entry, index) => host.appendChild(renderExerciseCard(entry, index, entries.length)));
    updateSessionTotals();
    $('#finish-bar').hidden = state.view !== 'workout';
};

const renderExerciseCard = (entry, index, total) => {
    const previous = db.getPreviousPerformance(entry.exercise_id, state.sessionId);

    const card = createEl('div.card.exercise-card', { dataset: { exerciseId: entry.exercise_id } }, [
        createEl('div.head', {}, [
            createEl('div.body', {}, [
                createEl('button.name', {
                    style: { background: 'none', border: 'none', padding: '0', textAlign: 'left', font: 'inherit', fontWeight: '680' },
                    onclick: () => openExerciseDetail(entry.exercise_id, { backTo: 'workout' }),
                    text: entry.name
                }),
                createEl('div.sub', { text: `${entry.target_group} · ${entry.primary_equipment}` })
            ]),
            createEl('button.icon-btn', {
                title: 'Exercise options',
                onclick: () => openExerciseMenu(entry, index, total)
            }, [icon('more')])
        ])
    ]);

    if (previous) {
        card.appendChild(createEl('div.previous-note', {}, [
            icon('history', 14),
            createEl('span', { text: `${S.relativeDay(previous.startTime)}:` }),
            createEl('span.sets', { text: previous.sets.map(setLabel).join(', ') })
        ]));
    }

    const grid = createEl('div.set-grid', {}, [
        createEl('div.head-cell', { text: 'Set' }),
        createEl('div.head-cell', { text: units() }),
        createEl('div.head-cell', { text: 'Reps' }),
        createEl('div.head-cell', { text: 'RPE' }),
        createEl('div.head-cell', { text: '' })
    ]);
    entry.sets.forEach((set, setIndex) => {
        grid.appendChild(renderSetRow(entry, set, setIndex, previous));
    });
    card.appendChild(grid);

    card.appendChild(createEl('div.set-actions', {}, [
        createEl('button.btn.sm', {
            onclick: () => addSetTo(entry, { isWarmup: 1 })
        }, ['+ Warm-up']),
        createEl('button.btn.sm', {
            onclick: () => addSetTo(entry)
        }, [icon('plus', 15), 'Add set'])
    ]));

    return card;
};

const renderSetRow = (entry, set, setIndex, previous) => {
    const row = createEl('div.set-row', { dataset: { setId: set.id } });
    if (set.is_complete) row.classList.add('done');

    const indexButton = createEl(`button.set-index${set.is_warmup ? '.warmup' : ''}`, {
        title: set.is_warmup ? 'Warm-up set — tap to make it a working set' : 'Tap to mark as a warm-up',
        text: set.is_warmup ? 'W' : String(setIndex + 1),
        onclick: async () => {
            await db.updateSet(set.id, { isWarmup: !set.is_warmup });
            renderWorkout();
        }
    });

    const priorSet = previous?.sets[setIndex];
    const weightInput = createEl('input.set-input', {
        type: 'number',
        inputmode: 'decimal',
        step: String(weightStep()),
        min: '0',
        value: set.weight_kg > 0 ? showWeight(set.weight_kg) : '',
        placeholder: priorSet ? showWeight(priorSet.weight_kg) : '0',
        'aria-label': `Weight for set ${setIndex + 1}`
    });
    const repsInput = createEl('input.set-input', {
        type: 'number',
        inputmode: 'numeric',
        step: '1',
        min: '0',
        value: set.reps > 0 ? String(set.reps) : '',
        placeholder: priorSet ? String(priorSet.reps) : '0',
        'aria-label': `Reps for set ${setIndex + 1}`
    });

    const persist = async () => {
        const weight = parseFloat(weightInput.value);
        const reps = parseInt(repsInput.value, 10);
        await db.updateSet(set.id, {
            weightKg: Number.isFinite(weight) ? S.toKg(weight, units()) : 0,
            reps: Number.isFinite(reps) ? reps : 0
        });
        updateSessionTotals();
    };
    weightInput.addEventListener('change', persist);
    repsInput.addEventListener('change', persist);
    for (const input of [weightInput, repsInput]) {
        input.addEventListener('focus', () => input.select());
    }

    const rpeButton = createEl(`button.rpe-btn${set.rpe ? '.set' : ''}`, {
        text: set.rpe ? String(set.rpe) : '–',
        title: 'Rate of perceived exertion',
        onclick: () => pickRpe(set)
    });

    const checkButton = createEl('button.check-btn', {
        title: set.is_complete ? 'Undo this set' : 'Complete this set',
        'aria-label': set.is_complete ? 'Undo set' : 'Complete set',
        onclick: () => toggleSetComplete(entry, set, weightInput, repsInput, priorSet)
    }, [icon('check', 19)]);

    row.append(indexButton, weightInput, repsInput, rpeButton, checkButton);
    return row;
};

const toggleSetComplete = async (entry, set, weightInput, repsInput, priorSet) => {
    if (set.is_complete) {
        await db.updateSet(set.id, { isComplete: false });
        renderWorkout();
        return;
    }

    // Empty fields fall back to the placeholder — last time's numbers.
    const rawWeight = parseFloat(weightInput.value);
    const rawReps = parseInt(repsInput.value, 10);
    const weightKg = Number.isFinite(rawWeight) ? S.toKg(rawWeight, units()) : (priorSet?.weight_kg ?? 0);
    const reps = Number.isFinite(rawReps) ? rawReps : (priorSet?.reps ?? 0);

    if (reps <= 0) {
        toast('Enter the reps first', { type: 'error' });
        repsInput.focus();
        return;
    }

    await db.updateSet(set.id, { weightKg, reps, isComplete: true });

    if (!set.is_warmup) {
        const history = db.getExerciseHistory(entry.exercise_id)
            .filter((s) => s.session_id !== state.sessionId);
        const records = S.detectPRs({ weight_kg: weightKg, reps, is_complete: 1, is_warmup: 0 }, history);
        if (records.length > 0 && history.length > 0) {
            const names = { weight: 'heaviest set', '1rm': 'best estimated 1RM', volume: 'best set volume' };
            toast(`${entry.name}: ${names[records[0]]}!`, { type: 'pr', duration: 3200 });
        }
    }

    renderWorkout();
    if (settings.autoRest && !set.is_warmup) {
        startRest(entry.rest_seconds || settings.restSeconds, entry.name);
    }
};

const pickRpe = async (set) => {
    const options = [{ label: 'Clear', value: 'clear', sub: 'No RPE recorded' }].concat(
        [10, 9.5, 9, 8.5, 8, 7.5, 7, 6].map((value) => ({
            label: String(value),
            value: String(value),
            sub: value >= 10 ? 'No reps left in the tank'
                : value >= 9 ? 'One rep in reserve'
                : value >= 8 ? 'Two reps in reserve'
                : 'Comfortably short of failure'
        }))
    );
    // sheetDialog resolves null when dismissed, so "Clear" carries its own value.
    const chosen = await sheetDialog({ title: 'Rate of perceived exertion', options });
    if (chosen === null) return;
    await db.updateSet(set.id, { rpe: chosen === 'clear' ? null : Number(chosen) });
    renderWorkout();
};

const addSetTo = async (entry, { isWarmup = 0 } = {}) => {
    const last = entry.sets.filter((s) => !!s.is_warmup === !!isWarmup).at(-1)
        || entry.sets.at(-1);
    await db.addSet(state.sessionId, entry.exercise_id, {
        weightKg: last?.weight_kg ?? 0,
        reps: last?.reps ?? 0,
        isWarmup
    });
    renderWorkout();
};

const updateSessionTotals = () => {
    if (!state.sessionId) return;
    const sets = db.getSetsForSession(state.sessionId);
    const working = sets.filter(S.isWorkingSet);
    $('#session-volume').textContent = showVolume(S.totalVolume(working));
    $('#session-volume-unit').textContent = units();
    $('#session-sets').textContent = String(sets.filter((s) => s.is_complete).length);
};

const openExerciseMenu = async (entry, index, total) => {
    const choice = await sheetDialog({
        title: entry.name,
        options: [
            { label: 'View history & records', value: 'detail' },
            entry.primary_equipment === 'Barbell' ? { label: 'Plate calculator', value: 'plates' } : null,
            index > 0 ? { label: 'Move up', value: 'up' } : null,
            index < total - 1 ? { label: 'Move down', value: 'down' } : null,
            { label: 'Remove from workout', value: 'remove', danger: true }
        ].filter(Boolean)
    });
    if (!choice) return;

    if (choice === 'detail') openExerciseDetail(entry.exercise_id, { backTo: 'workout' });
    if (choice === 'plates') showPlateCalculator(entry);
    if (choice === 'up' || choice === 'down') {
        await db.moveSessionExercise(state.sessionId, entry.exercise_id, choice === 'up' ? -1 : 1);
        renderWorkout();
    }
    if (choice === 'remove') {
        const ok = await confirmDialog({
            title: `Remove ${entry.name}?`,
            message: 'Its sets in this workout will be deleted.',
            confirmLabel: 'Remove',
            danger: true
        });
        if (!ok) return;
        await db.removeExerciseFromSession(state.sessionId, entry.exercise_id);
        renderWorkout();
    }
};

const showPlateCalculator = (entry) => {
    const heaviest = entry.sets.reduce((max, set) => Math.max(max, set.weight_kg), 0);
    const { perSide, remainderKg } = S.plateBreakdown(heaviest || 60);
    const perSideText = perSide.length
        ? perSide.map((plate) => S.formatWeight(plate, units())).join(' + ')
        : 'just the bar';
    toast(`${showWeight(heaviest || 60, true)} → ${perSideText} per side${remainderKg ? ` (${showWeight(remainderKg, true)} short)` : ''}`,
        { type: 'success', duration: 5000, iconName: 'scale' });
};

const openWorkoutMenu = async () => {
    const choice = await sheetDialog({
        title: 'Workout',
        options: [
            { label: 'Rename workout', value: 'rename' },
            { label: 'Add exercise', value: 'add' },
            { label: 'Finish workout', value: 'finish' },
            { label: 'Discard workout', value: 'discard', danger: true }
        ]
    });
    if (choice === 'rename') {
        const session = db.getSession(state.sessionId);
        const name = await promptDialog({ title: 'Workout name', value: session.name || '' });
        if (name) {
            await db.updateSession(state.sessionId, { name });
            toast('Renamed');
        }
    }
    if (choice === 'add') openExercisePicker();
    if (choice === 'finish') finishWorkout();
    if (choice === 'discard') discardWorkout();
};

const finishWorkout = async () => {
    const sets = db.getSetsForSession(state.sessionId).filter((s) => s.is_complete);
    if (sets.length === 0) {
        const discard = await confirmDialog({
            title: 'Nothing logged',
            message: 'This workout has no completed sets. Discard it?',
            confirmLabel: 'Discard',
            danger: true
        });
        if (discard) await discardWorkout({ skipConfirm: true });
        return;
    }

    const summary = S.summarizeSession(db.getSetsForSession(state.sessionId));
    const ok = await confirmDialog({
        title: 'Finish workout?',
        message: `${summary.setCount} working sets · ${showVolume(summary.volumeKg)} ${units()} of volume · `
            + `${S.formatDuration(Date.now() - state.sessionStart)}.`,
        confirmLabel: 'Finish'
    });
    if (!ok) return;

    await db.endSession(state.sessionId);
    stopSessionTimer();
    stopRest();
    releaseWakeLock();
    state.sessionId = null;
    toast('Workout saved');
    goToTab('home');
};

const discardWorkout = async ({ skipConfirm = false } = {}) => {
    if (!skipConfirm) {
        const ok = await confirmDialog({
            title: 'Discard this workout?',
            message: 'Every set logged in it will be deleted. This cannot be undone.',
            confirmLabel: 'Discard',
            danger: true
        });
        if (!ok) return;
    }
    await db.deleteSession(state.sessionId);
    stopSessionTimer();
    stopRest();
    releaseWakeLock();
    state.sessionId = null;
    toast('Workout discarded');
    goToTab('home');
};

// --- Timers ---------------------------------------------------------------

const startSessionTimer = () => {
    stopSessionTimer();
    const tick = () => {
        const elapsed = (Date.now() - state.sessionStart) / 1000;
        $('#session-clock').textContent = S.formatClock(elapsed);
    };
    tick();
    sessionTimer = setInterval(tick, 1000);
};

const stopSessionTimer = () => {
    clearInterval(sessionTimer);
    sessionTimer = null;
    $('#session-clock').textContent = '00:00';
};

const RING_CIRCUMFERENCE = 2 * Math.PI * 18;

const paintRest = () => {
    const { remaining, total, label } = restState;
    $('#rest-time').textContent = S.formatClock(remaining);
    $('#rest-label').textContent = label;
    const fraction = total > 0 ? Math.max(0, remaining / total) : 0;
    $('#rest-progress').setAttribute('stroke-dashoffset', String(RING_CIRCUMFERENCE * (1 - fraction)));
};

const startRest = (seconds, label = 'Rest') => {
    stopRest();
    // Rest is tracked against a wall-clock deadline so a backgrounded tab
    // resumes with the right number rather than a frozen one.
    const deadline = Date.now() + seconds * 1000;
    restState = { remaining: seconds, total: seconds, label, deadline };
    $('#rest-bar').hidden = false;
    paintRest();

    restTimer = setInterval(() => {
        restState.remaining = Math.round((restState.deadline - Date.now()) / 1000);
        if (restState.remaining <= 0) {
            restFinished();
            return;
        }
        paintRest();
    }, 500);
};

const adjustRest = (delta) => {
    if (!restState) return;
    restState.deadline += delta * 1000;
    restState.total = Math.max(restState.total, Math.round((restState.deadline - Date.now()) / 1000));
    restState.remaining = Math.round((restState.deadline - Date.now()) / 1000);
    if (restState.remaining <= 0) restFinished();
    else paintRest();
};

const stopRest = () => {
    clearInterval(restTimer);
    restTimer = null;
    restState = null;
    $('#rest-bar').hidden = true;
};

const restFinished = () => {
    stopRest();
    if (settings.vibrate && navigator.vibrate) navigator.vibrate([220, 90, 220]);
    if (settings.sound) beep();
    toast('Rest over — next set', { type: 'success', iconName: 'clock' });
};

const beep = () => {
    try {
        audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.25, audioContext.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.45);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch {
        // An unavailable AudioContext is not worth interrupting a workout for.
    }
};

const requestWakeLock = async () => {
    if (!settings.wakeLock || !navigator.wakeLock) return;
    try {
        wakeLock = await navigator.wakeLock.request('screen');
    } catch {
        wakeLock = null;
    }
};

const releaseWakeLock = () => {
    wakeLock?.release?.().catch(() => {});
    wakeLock = null;
};

// ==========================================================================
// History
// ==========================================================================

const renderHistory = () => {
    const host = clear($('#history-list'));
    const total = db.countSessions();
    const sessions = db.listSessions({ limit: HISTORY_PAGE_SIZE * (state.historyPage + 1) });
    $('#history-count').textContent = total ? `${total} workout${total === 1 ? '' : 's'}` : '';

    if (sessions.length === 0) {
        host.appendChild(emptyState('No history yet', 'Finish a workout and it will be filed here.'));
        return;
    }

    let currentMonth = '';
    let list = null;
    for (const session of sessions) {
        const month = new Date(session.start_time).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        if (month !== currentMonth) {
            currentMonth = month;
            host.appendChild(createEl('div.month-label', { text: month }));
            list = createEl('div.list');
            host.appendChild(list);
        }
        list.appendChild(sessionListItem(session));
    }

    if (sessions.length < total) {
        host.appendChild(createEl('button.btn.block', {
            style: { marginTop: 'var(--sp-4)' },
            onclick: () => { state.historyPage += 1; renderHistory(); }
        }, ['Load more']));
    }
};

const openSessionDetail = (sessionId) => {
    state.detailSessionId = sessionId;
    renderSessionDetail();
    showView('session', { backTo: state.tab });
};

const renderSessionDetail = () => {
    const session = db.getSession(state.detailSessionId);
    if (!session) { goBack(); return; }

    const entries = db.getSessionExercises(session.id);
    const sets = db.getSetsForSession(session.id);
    const summary = S.summarizeSession(sets);

    $('#session-detail-title').textContent = session.name || 'Workout';
    $('#session-detail-sub').textContent = [
        new Date(session.start_time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
        S.formatDuration(S.sessionDurationMs(session))
    ].join(' · ');

    const body = clear($('#session-detail-body'));

    renderStatTiles(body, [
        { value: showVolume(summary.volumeKg), unit: units(), label: 'Volume' },
        { value: String(summary.setCount), label: 'Work sets' },
        { value: String(summary.reps), label: 'Reps' },
        { value: String(summary.exerciseCount), label: 'Exercises' }
    ]);

    const list = createEl('div.list', { style: { marginTop: 'var(--sp-4)' } });
    for (const entry of entries) {
        const performed = entry.sets.filter((s) => s.is_complete);
        if (performed.length === 0) continue;
        const top = S.bestSet(performed);
        list.appendChild(createEl('div.card.session-detail-exercise', {}, [
            createEl('div.name', {}, [
                createEl('button', {
                    style: { background: 'none', border: 'none', padding: '0', font: 'inherit', fontWeight: '650', textAlign: 'left' },
                    text: entry.name,
                    onclick: () => openExerciseDetail(entry.exercise_id, { backTo: 'session' })
                }),
                createEl('span.group', { text: entry.target_group })
            ]),
            createEl('div.set-pill-row', {}, performed.map((set) => createEl(
                `span.set-pill${top && set.id === top.id ? '.top' : ''}`,
                { text: `${setLabel(set)}${set.is_warmup ? ' · W' : ''}${set.rpe ? ` @${set.rpe}` : ''}` }
            ))),
            entry.notes ? createEl('div', {
                style: { marginTop: 'var(--sp-2)', fontSize: '0.8rem', color: 'var(--text-muted)' },
                text: entry.notes
            }) : null
        ]));
    }
    body.appendChild(list);

    if (session.notes) {
        body.appendChild(createEl('div.card', {
            style: { marginTop: 'var(--sp-3)', padding: 'var(--sp-4)', fontSize: '0.88rem', color: 'var(--text-secondary)' },
            text: session.notes
        }));
    }

    body.appendChild(createEl('div', {
        style: { display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-4)' }
    }, [
        createEl('button.btn.block', {
            onclick: async () => {
                const name = await promptDialog({ title: 'Rename workout', value: session.name || '' });
                if (!name) return;
                await db.updateSession(session.id, { name });
                renderSessionDetail();
                toast('Renamed');
            }
        }, ['Rename']),
        createEl('button.btn.block', {
            onclick: async () => {
                const name = await promptDialog({
                    title: 'Save as routine',
                    value: session.name || 'New routine'
                });
                if (!name) return;
                await db.routineFromSession(session.id, name);
                toast('Routine saved');
            }
        }, ['Save as routine'])
    ]));
};

// ==========================================================================
// Exercises
// ==========================================================================

const renderExerciseFilters = (host, current, onPick) => {
    clear(host);
    const groups = ['', ...db.MUSCLE_GROUPS];
    for (const group of groups) {
        host.appendChild(createEl('button.chip', {
            type: 'button',
            'aria-pressed': String(current === group),
            text: group || 'All',
            onclick: () => onPick(group)
        }));
    }
};

const renderExerciseList = () => {
    renderExerciseFilters($('#exercise-filters'), state.exerciseFilter.group, (group) => {
        state.exerciseFilter.group = group;
        renderExerciseList();
    });

    const host = clear($('#exercise-list'));
    const exercises = db.listExercises({
        search: state.exerciseFilter.search,
        group: state.exerciseFilter.group
    });

    if (exercises.length === 0) {
        host.appendChild(emptyState('Nothing matches', 'Try a different search, or add a custom exercise.'));
        return;
    }

    for (const exercise of exercises) {
        host.appendChild(createEl('button.list-item', {
            type: 'button',
            onclick: () => openExerciseDetail(exercise.id, { backTo: 'exercises' })
        }, [
            createEl('div.avatar', { text: initials(exercise.name) }),
            createEl('div.body', {}, [
                createEl('div.title', { text: exercise.name }),
                createEl('div.meta', {}, [
                    createEl('span', { text: exercise.target_group }),
                    createEl('span', { text: exercise.primary_equipment }),
                    exercise.set_count > 0
                        ? createEl('span', { text: `${exercise.set_count} sets logged` })
                        : createEl('span', { text: 'never trained' })
                ])
            ]),
            exercise.is_favorite ? createEl('span.badge.accent', { text: '★' }) : null,
            createEl('span.chevron', {}, [icon('chevron', 18)])
        ]));
    }
};

const openExerciseDetail = (exerciseId, { backTo } = {}) => {
    state.detailExerciseId = exerciseId;
    renderExerciseDetail();
    showView('exercise', { backTo: backTo || state.tab });
};

const renderExerciseDetail = () => {
    const exercise = db.getExercise(state.detailExerciseId);
    if (!exercise) { goBack(); return; }
    const history = db.getExerciseHistory(exercise.id);

    $('#exercise-detail-title').textContent = exercise.name;
    $('#exercise-detail-sub').textContent = `${exercise.target_group} · ${exercise.primary_equipment}`
        + (exercise.is_custom ? ' · custom' : '');
    $('#btn-fav-exercise').style.color = exercise.is_favorite ? 'var(--accent)' : '';

    const body = clear($('#exercise-detail-body'));

    if (exercise.notes) {
        body.appendChild(createEl('div.previous-note', { style: { marginBottom: 'var(--sp-3)' } }, [
            icon('info', 14),
            createEl('span', { text: exercise.notes })
        ]));
    }

    if (history.length === 0) {
        body.appendChild(emptyState('No history yet', 'Log this exercise in a workout and its records appear here.'));
        return;
    }

    const records = S.personalRecords(history);
    renderStatTiles(body, [
        { value: showWeight(records.heaviest.weight_kg), unit: units(), label: 'Heaviest' },
        { value: showWeight(records.oneRepMaxKg), unit: units(), label: 'Est. 1RM' },
        { value: showVolume(S.setVolume(records.bestVolume)), unit: units(), label: 'Best set' },
        { value: String(history.length), label: 'Sets logged' }
    ]);

    const trend = S.oneRepMaxTrend(history);
    if (trend.length >= 2) {
        const chart = createEl('div.card.chart-card', { style: { marginTop: 'var(--sp-4)' } }, [
            createEl('div.chart-title', { text: 'Estimated 1RM' }),
            createEl('div.chart-sub', { text: `Best set of each session, ${units()} (Epley estimate).` })
        ]);
        body.appendChild(chart);
        renderLineChart(chart, trend.map((point) => ({
            date: point.date,
            value: S.fromKg(point.oneRepMaxKg, units()),
            tooltip: `<strong>${showWeight(point.oneRepMaxKg, true)} est. 1RM</strong><br>`
                + `${showWeight(point.weightKg)} × ${point.reps} · ${point.date.toLocaleDateString()}`
        })), { formatValue: (value) => S.formatNumber(value, 0) });
        renderDataTable(chart,
            ['Date', 'Top set', `Est. 1RM (${units()})`],
            trend.slice().reverse().map((point) => [
                point.date.toLocaleDateString(),
                `${showWeight(point.weightKg)} × ${point.reps}`,
                S.formatNumber(S.fromKg(point.oneRepMaxKg, units()), 0)
            ])
        );
    }

    // History, newest session first.
    const bySession = new Map();
    for (const set of history) {
        const key = set.session_id;
        if (!bySession.has(key)) bySession.set(key, { date: set.performed_at, sets: [] });
        bySession.get(key).sets.push(set);
    }

    body.appendChild(createEl('div.section-head', { style: { marginTop: 'var(--sp-5)' } }, [
        createEl('h3', { text: 'Session history' })
    ]));

    const list = createEl('div.list');
    body.appendChild(list);
    for (const [sessionId, group] of [...bySession.entries()].reverse()) {
        const top = S.bestSet(group.sets);
        list.appendChild(createEl('div.card.history-day', {}, [
            createEl('div.day-head', {}, [
                createEl('button.date', {
                    style: { background: 'none', border: 'none', padding: '0', font: 'inherit', fontWeight: '650' },
                    text: S.relativeDay(group.date),
                    onclick: () => openSessionDetail(sessionId)
                }),
                createEl('span.vol', { text: `${showVolume(S.totalVolume(group.sets))} ${units()}` })
            ]),
            createEl('div.set-pill-row', {}, group.sets.map((set) => createEl(
                `span.set-pill${top && set.id === top.id ? '.top' : ''}`,
                { text: setLabel(set) }
            )))
        ]));
    }
};

// --- Exercise editor ------------------------------------------------------

const fillSelect = (select, values) => {
    clear(select);
    for (const value of values) select.appendChild(createEl('option', { value, text: value }));
};

const openExerciseEditor = (exerciseId = null) => {
    const dialog = $('#exercise-dialog');
    const exercise = exerciseId ? db.getExercise(exerciseId) : null;

    $('#exercise-dialog-title').textContent = exercise ? 'Edit exercise' : 'New exercise';
    fillSelect($('#exercise-group'), db.MUSCLE_GROUPS);
    fillSelect($('#exercise-equipment'), db.EQUIPMENT_TYPES);

    $('#exercise-name').value = exercise?.name || '';
    $('#exercise-group').value = exercise?.target_group || db.MUSCLE_GROUPS[0];
    $('#exercise-equipment').value = exercise?.primary_equipment || db.EQUIPMENT_TYPES[0];
    $('#exercise-rest').value = exercise?.rest_seconds ?? '';
    $('#exercise-notes').value = exercise?.notes || '';

    const deleteButton = $('#exercise-delete');
    deleteButton.hidden = !exercise;
    deleteButton.onclick = async () => {
        const outcome = await confirmDialog({
            title: `Delete ${exercise.name}?`,
            message: 'Exercises with logged sets are archived instead, so your history stays intact.',
            confirmLabel: 'Delete',
            danger: true
        });
        if (!outcome) return;
        const result = await db.deleteExercise(exercise.id);
        dialog.close();
        toast(result === 'archived' ? 'Archived — history kept' : 'Deleted');
        goToTab('exercises');
    };

    const form = $('#exercise-form');
    form.onsubmit = async (event) => {
        event.preventDefault();
        const rest = parseInt($('#exercise-rest').value, 10);
        const fields = {
            name: $('#exercise-name').value.trim(),
            target_group: $('#exercise-group').value,
            primary_equipment: $('#exercise-equipment').value,
            notes: $('#exercise-notes').value.trim(),
            rest_seconds: Number.isFinite(rest) ? rest : null
        };
        if (!fields.name) return;

        if (exercise) {
            await db.updateExercise(exercise.id, fields);
        } else {
            const id = await db.createExercise(fields);
            state.detailExerciseId = id;
        }
        dialog.close();
        toast(exercise ? 'Exercise updated' : 'Exercise added');
        if (state.view === 'exercise') renderExerciseDetail();
        else renderExerciseList();
    };

    openDialog(dialog);
};

// --- Exercise picker ------------------------------------------------------

let pickerSelection = new Set();
let pickerGroup = '';
let pickerOnConfirm = null;

const renderPickerList = () => {
    const host = clear($('#picker-list'));
    const exercises = db.listExercises({
        search: $('#picker-search').value.trim(),
        group: pickerGroup
    });

    if (exercises.length === 0) {
        host.appendChild(emptyState('Nothing matches', 'Add it as a custom exercise from the Exercises tab.'));
        return;
    }

    for (const exercise of exercises) {
        const selected = pickerSelection.has(exercise.id);
        host.appendChild(createEl('button.picker-item', {
            type: 'button',
            'aria-selected': String(selected),
            onclick: () => {
                if (pickerSelection.has(exercise.id)) pickerSelection.delete(exercise.id);
                else pickerSelection.add(exercise.id);
                renderPickerList();
                updatePickerConfirm();
            }
        }, [
            createEl('div.avatar', { text: initials(exercise.name) }),
            createEl('div.body', {}, [
                createEl('div.name', { text: exercise.name }),
                createEl('div.sub', { text: `${exercise.target_group} · ${exercise.primary_equipment}` })
            ]),
            selected ? icon('check', 18) : null
        ]));
    }
};

const updatePickerConfirm = () => {
    const button = $('#picker-confirm');
    button.disabled = pickerSelection.size === 0;
    button.textContent = pickerSelection.size > 1 ? `Add ${pickerSelection.size}` : 'Add';
};

const renderPickerFilters = () => {
    renderExerciseFilters($('#picker-filters'), pickerGroup, (group) => {
        pickerGroup = group;
        renderPickerFilters();
        renderPickerList();
    });
};

const openPicker = (title, onConfirm) => {
    pickerSelection = new Set();
    pickerGroup = '';
    pickerOnConfirm = onConfirm;
    $('#picker-title').textContent = title;
    $('#picker-search').value = '';
    renderPickerFilters();
    renderPickerList();
    updatePickerConfirm();
    openDialog($('#picker-dialog'));
};

const openExercisePicker = () => {
    if (!state.sessionId) return;
    openPicker('Add exercise', async (ids) => {
        for (const id of ids) {
            await db.addExerciseToSession(state.sessionId, id);
            // Give every newly added exercise one blank set, so logging is a
            // single tap rather than "add set, then fill it in".
            const existing = db.getSetsForSession(state.sessionId).filter((set) => set.exercise_id === id);
            if (existing.length === 0) await db.addSet(state.sessionId, id);
        }
        renderWorkout();
    });
};

// ==========================================================================
// Routines
// ==========================================================================

let routineDraft = { id: null, exercises: [] };

const renderRoutineDraft = () => {
    const host = clear($('#routine-exercise-list'));
    if (routineDraft.exercises.length === 0) {
        host.appendChild(emptyState('No exercises yet', 'Add the movements this routine should prompt you for.'));
        return;
    }

    routineDraft.exercises.forEach((item, index) => {
        host.appendChild(createEl('div.list-item', {}, [
            createEl('div.body', {}, [
                createEl('div.title', { text: item.name }),
                createEl('div.meta', {}, [createEl('span', { text: item.target_group })])
            ]),
            createEl('input.set-input', {
                type: 'number', min: '1', max: '20', value: String(item.target_sets),
                style: { width: '46px' },
                'aria-label': `Sets for ${item.name}`,
                onchange: (event) => { item.target_sets = parseInt(event.target.value, 10) || 3; }
            }),
            createEl('span', { text: '×', style: { color: 'var(--text-muted)' } }),
            createEl('input.set-input', {
                type: 'number', min: '1', max: '100', value: String(item.target_reps),
                style: { width: '46px' },
                'aria-label': `Reps for ${item.name}`,
                onchange: (event) => { item.target_reps = parseInt(event.target.value, 10) || 10; }
            }),
            createEl('button.icon-btn', {
                type: 'button',
                title: 'Move up',
                onclick: () => {
                    if (index === 0) return;
                    const list = routineDraft.exercises;
                    [list[index - 1], list[index]] = [list[index], list[index - 1]];
                    renderRoutineDraft();
                }
            }, [icon('up', 16)]),
            createEl('button.icon-btn.danger', {
                type: 'button',
                title: 'Remove',
                onclick: () => {
                    routineDraft.exercises.splice(index, 1);
                    renderRoutineDraft();
                }
            }, [icon('trash', 16)])
        ]));
    });
};

const openRoutineDialog = (routineId = null) => {
    const dialog = $('#routine-dialog');
    const routine = routineId ? db.getRoutine(routineId) : null;

    routineDraft = {
        id: routineId,
        exercises: (routine?.exercises || []).map((ex) => ({
            exercise_id: ex.exercise_id,
            name: ex.name,
            target_group: ex.target_group,
            target_sets: ex.target_sets ?? 3,
            target_reps: ex.target_reps ?? 10
        }))
    };

    $('#routine-dialog-title').textContent = routine ? 'Edit routine' : 'New routine';
    $('#routine-name').value = routine?.name || '';
    $('#routine-desc').value = routine?.description || '';
    renderRoutineDraft();

    const deleteButton = $('#routine-delete');
    deleteButton.hidden = !routine;
    deleteButton.onclick = async () => {
        const ok = await confirmDialog({
            title: `Delete ${routine.name}?`,
            message: 'Workouts already logged from it are not affected.',
            confirmLabel: 'Delete',
            danger: true
        });
        if (!ok) return;
        await db.deleteRoutine(routine.id);
        dialog.close();
        toast('Routine deleted');
        renderRoutines();
    };

    $('#routine-form').onsubmit = async (event) => {
        event.preventDefault();
        const name = $('#routine-name').value.trim();
        if (!name) return;
        if (routineDraft.exercises.length === 0) {
            toast('Add at least one exercise', { type: 'error' });
            return;
        }
        await db.saveRoutine({
            id: routineDraft.id,
            name,
            description: $('#routine-desc').value.trim(),
            exercises: routineDraft.exercises
        });
        dialog.close();
        toast(routineDraft.id ? 'Routine updated' : 'Routine created');
        renderRoutines();
    };

    openDialog(dialog);
};

// ==========================================================================
// Progress
// ==========================================================================

const renderProgress = () => {
    const body = clear($('#progress-body'));
    const days = state.progressRange;
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const sets = db.getSetsSince(since.toISOString());
    const working = sets.filter(S.isWorkingSet);
    const sessionIds = new Set(sets.map((s) => s.session_id));
    const dates = db.getSessionDates();

    renderStatTiles(body, [
        { value: String(sessionIds.size), label: 'Workouts' },
        { value: showVolume(S.totalVolume(working)), unit: units(), label: 'Volume' },
        { value: String(working.length), label: 'Work sets' },
        { value: String(S.weekStreak(dates)), label: 'Week streak' }
    ]);

    if (working.length === 0) {
        body.appendChild(emptyState(
            'Nothing in this window',
            'Log a workout, or widen the range, to see your trends.'
        ));
        return;
    }

    // --- Volume over time
    const weeks = Math.min(26, Math.max(4, Math.round(days / 7)));
    const byWeek = S.volumeByWeek(sets, weeks);
    const volumeCard = createEl('div.card.chart-card', { style: { marginTop: 'var(--sp-4)' } }, [
        createEl('div.chart-title', { text: 'Weekly volume' }),
        createEl('div.chart-sub', { text: `Working-set tonnage per week, in ${units()}.` })
    ]);
    body.appendChild(volumeCard);
    renderBarChart(volumeCard, byWeek.map((week) => ({
        label: week.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
        value: S.fromKg(week.volumeKg, units()),
        tooltip: `<strong>${showVolume(week.volumeKg)} ${units()}</strong><br>`
            + `${week.sets} sets · week of ${week.date.toLocaleDateString()}`
    })), {
        formatValue: compactNumber,
        labelEvery: Math.ceil(weeks / 4)
    });
    renderDataTable(volumeCard,
        ['Week of', `Volume (${units()})`, 'Sets'],
        byWeek.slice().reverse().map((week) => [
            week.date.toLocaleDateString(),
            showVolume(week.volumeKg),
            String(week.sets)
        ])
    );

    // --- Muscle group split
    const groups = S.setsByMuscleGroup(working);
    const shown = groups.slice(0, 7);
    const rest = groups.slice(7);
    if (rest.length > 0) {
        shown.push({
            group: 'Other',
            sets: rest.reduce((sum, g) => sum + g.sets, 0),
            volumeKg: rest.reduce((sum, g) => sum + g.volumeKg, 0)
        });
    }
    const splitCard = createEl('div.card.chart-card', { style: { marginTop: 'var(--sp-3)' } }, [
        createEl('div.chart-title', { text: 'Muscle group split' }),
        createEl('div.chart-sub', { text: 'Share of working sets — the balance check.' })
    ]);
    body.appendChild(splitCard);
    renderDonut(splitCard, shown.map((group) => ({
        label: group.group,
        value: group.sets,
        display: `${group.sets} set${group.sets === 1 ? '' : 's'}`
    })), {
        centerValue: String(working.length),
        centerLabel: 'sets'
    });

    // --- Most trained
    const byExercise = new Map();
    for (const set of working) {
        const entry = byExercise.get(set.exercise_id)
            || { id: set.exercise_id, name: set.exercise_name, sets: 0, volumeKg: 0 };
        entry.sets += 1;
        entry.volumeKg += S.setVolume(set);
        byExercise.set(set.exercise_id, entry);
    }
    const top = [...byExercise.values()].sort((a, b) => b.volumeKg - a.volumeKg).slice(0, 5);

    body.appendChild(createEl('div.section-head', { style: { marginTop: 'var(--sp-5)' } }, [
        createEl('h3', { text: 'Most trained' })
    ]));
    const list = createEl('div.list');
    body.appendChild(list);
    for (const exercise of top) {
        list.appendChild(createEl('button.list-item', {
            type: 'button',
            onclick: () => openExerciseDetail(exercise.id, { backTo: 'progress' })
        }, [
            createEl('div.body', {}, [
                createEl('div.title', { text: exercise.name }),
                createEl('div.meta', {}, [
                    createEl('span', { text: `${exercise.sets} sets` }),
                    createEl('span', { text: `${showVolume(exercise.volumeKg)} ${units()}` })
                ])
            ]),
            createEl('span.chevron', {}, [icon('chevron', 18)])
        ]));
    }

    // --- Body weight
    const bodyWeights = db.listBodyWeight({ limit: 120 })
        .filter((entry) => new Date(entry.logged_at) >= since)
        .reverse();
    if (bodyWeights.length >= 2) {
        const card = createEl('div.card.chart-card', { style: { marginTop: 'var(--sp-4)' } }, [
            createEl('div.chart-title', { text: 'Body weight' }),
            createEl('div.chart-sub', { text: `Logged from Settings, in ${units()}.` })
        ]);
        body.appendChild(card);
        renderLineChart(card, bodyWeights.map((entry) => ({
            date: new Date(entry.logged_at),
            value: S.fromKg(entry.weight_kg, units()),
            tooltip: `<strong>${showWeight(entry.weight_kg, true)}</strong><br>${new Date(entry.logged_at).toLocaleDateString()}`
        })), { formatValue: (value) => S.formatNumber(value) });
    }
};

// ==========================================================================
// Settings
// ==========================================================================

const syncSegmented = (host, value) => {
    for (const button of $$('button', host)) {
        button.setAttribute('aria-pressed', String(button.dataset.value === String(value)));
    }
};

const syncSwitch = (node, value) => node.setAttribute('aria-checked', String(!!value));

const renderSettings = () => {
    syncSegmented($('#set-units'), settings.units);
    syncSegmented($('#set-rest'), settings.restSeconds);
    syncSegmented($('#set-theme'), settings.theme);
    syncSwitch($('#set-auto-rest'), settings.autoRest);
    syncSwitch($('#set-vibrate'), settings.vibrate);
    syncSwitch($('#set-sound'), settings.sound);
    syncSwitch($('#set-wakelock'), settings.wakeLock);

    const swatches = clear($('#set-accent'));
    for (const [name, color] of ACCENTS) {
        swatches.appendChild(createEl('button.accent-swatch', {
            type: 'button',
            title: name,
            'aria-label': `${name} accent`,
            'aria-pressed': String(settings.accent === name),
            style: { background: color },
            onclick: async () => {
                await setSetting('accent', name);
                applyAppearance();
                renderSettings();
            }
        }));
    }

    renderBodyWeightList();

    const totals = db.getLifetimeTotals();
    $('#about-storage').textContent =
        `${totals.sessions} workouts · ${totals.sets} sets · ${showVolume(totals.volume_kg)} ${units()} lifted, `
        + 'all stored in this browser.';
};

const renderBodyWeightList = () => {
    const host = clear($('#bodyweight-list'));
    const entries = db.listBodyWeight({ limit: 5 });
    if (entries.length === 0) {
        host.appendChild(createEl('p', {
            style: { fontSize: '0.82rem', color: 'var(--text-muted)' },
            text: 'No entries yet. Logging weight adds a trend chart to Progress.'
        }));
        return;
    }
    for (const entry of entries) {
        host.appendChild(createEl('div.switch-row', {}, [
            createEl('div', {}, [
                createEl('div.label', { text: showWeight(entry.weight_kg, true) }),
                createEl('div.hint', { text: new Date(entry.logged_at).toLocaleDateString() })
            ]),
            createEl('button.icon-btn.danger', {
                title: 'Delete entry',
                onclick: async () => {
                    await db.deleteBodyWeight(entry.id);
                    renderBodyWeightList();
                }
            }, [icon('trash', 16)])
        ]));
    }
};

const handleExportSqlite = async () => {
    await db.flush();
    downloadBlob(db.exportDatabase(), `mifitness-${S.dayKey(new Date())}.sqlite`);
    toast('Backup downloaded');
};

const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(db.exportJson(), null, 2)], { type: 'application/json' });
    downloadBlob(blob, `mifitness-${S.dayKey(new Date())}.json`);
    toast('JSON exported');
};

const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const ok = await confirmDialog({
        title: 'Replace your data?',
        message: `Importing ${file.name} replaces everything currently stored on this device.`,
        confirmLabel: 'Import',
        danger: true
    });
    if (!ok) return;

    try {
        await db.importDatabase(await file.arrayBuffer());
        loadSettings();
        applyAppearance();
        state.sessionId = null;
        stopSessionTimer();
        toast('Backup restored');
        goToTab('home');
    } catch (error) {
        toast(`Import failed: ${error.message}`, { type: 'error', duration: 5000 });
    }
};

const handleReset = async () => {
    const ok = await confirmDialog({
        title: 'Reset everything?',
        message: 'Every workout, routine and custom exercise is deleted, and the seed library comes back. Export a backup first if you might want it.',
        confirmLabel: 'Delete everything',
        danger: true
    });
    if (!ok) return;
    await db.resetDatabase();
    state.sessionId = null;
    stopSessionTimer();
    loadSettings();
    applyAppearance();
    toast('Reset complete');
    goToTab('home');
};

// ==========================================================================
// Wiring
// ==========================================================================

const bindEvents = () => {
    for (const tab of $$('.tab')) {
        tab.addEventListener('click', () => goToTab(tab.dataset.tab));
    }
    for (const button of $$('[data-back]')) button.addEventListener('click', goBack);
    for (const button of $$('[data-goto]')) {
        button.addEventListener('click', () => goToTab(button.dataset.goto));
    }

    // Home
    $('#btn-start-empty').addEventListener('click', async () => {
        const active = db.getActiveSession();
        if (active) { resumeSession(active); return; }
        await startEmptyWorkout();
    });
    $('#btn-start-routine').addEventListener('click', async () => {
        const routines = db.listRoutines();
        if (routines.length === 0) { openRoutineDialog(); return; }
        const choice = await sheetDialog({
            title: 'Start from a routine',
            options: routines.map((routine) => ({
                label: routine.name,
                sub: `${routine.exercise_count} exercises`,
                value: routine.id
            }))
        });
        if (!choice) return;
        await startFromRoutine(routines.find((r) => r.id === choice));
    });
    $('#btn-new-routine').addEventListener('click', () => openRoutineDialog());
    $('#routine-add-exercise').addEventListener('click', () => {
        openPicker('Add to routine', (ids) => {
            for (const id of ids) {
                const exercise = db.getExercise(id);
                if (routineDraft.exercises.some((item) => item.exercise_id === id)) continue;
                routineDraft.exercises.push({
                    exercise_id: id,
                    name: exercise.name,
                    target_group: exercise.target_group,
                    target_sets: 3,
                    target_reps: 10
                });
            }
            renderRoutineDraft();
        });
    });

    // Workout
    $('#btn-add-exercise').addEventListener('click', openExercisePicker);
    $('#btn-finish').addEventListener('click', finishWorkout);
    $('#btn-skip-rest').addEventListener('click', stopRest);
    for (const button of $$('[data-rest-adjust]')) {
        button.addEventListener('click', () => adjustRest(Number(button.dataset.restAdjust)));
    }

    // Picker
    $('#picker-search').addEventListener('input', renderPickerList);
    $('#picker-confirm').addEventListener('click', async () => {
        const ids = [...pickerSelection];
        $('#picker-dialog').close();
        await pickerOnConfirm?.(ids);
    });

    // Exercises
    $('#exercise-search').addEventListener('input', (event) => {
        state.exerciseFilter.search = event.target.value.trim();
        renderExerciseList();
    });
    $('#btn-new-exercise').addEventListener('click', () => openExerciseEditor());
    $('#btn-edit-exercise').addEventListener('click', () => openExerciseEditor(state.detailExerciseId));
    $('#btn-fav-exercise').addEventListener('click', async () => {
        await db.toggleFavorite(state.detailExerciseId);
        renderExerciseDetail();
    });

    // Session detail
    $('#btn-delete-session').addEventListener('click', async () => {
        const ok = await confirmDialog({
            title: 'Delete this workout?',
            message: 'Its sets are removed from your history and records.',
            confirmLabel: 'Delete',
            danger: true
        });
        if (!ok) return;
        await db.deleteSession(state.detailSessionId);
        toast('Workout deleted');
        goToTab('history');
    });

    // Progress
    for (const button of $$('#progress-range button')) {
        button.addEventListener('click', () => {
            state.progressRange = Number(button.dataset.range);
            syncSegmented($('#progress-range'), state.progressRange);
            renderProgress();
        });
    }

    // Settings
    for (const button of $$('#set-units button')) {
        button.addEventListener('click', async () => {
            await setSetting('units', button.dataset.value);
            syncSegmented($('#set-units'), settings.units);
            renderSettings();
            if (state.sessionId) renderWorkout();
        });
    }
    for (const button of $$('#set-rest button')) {
        button.addEventListener('click', async () => {
            await setSetting('restSeconds', Number(button.dataset.value));
            syncSegmented($('#set-rest'), settings.restSeconds);
        });
    }
    for (const button of $$('#set-theme button')) {
        button.addEventListener('click', async () => {
            await setSetting('theme', button.dataset.value);
            applyAppearance();
            syncSegmented($('#set-theme'), settings.theme);
        });
    }
    const toggles = [
        ['#set-auto-rest', 'autoRest'],
        ['#set-vibrate', 'vibrate'],
        ['#set-sound', 'sound'],
        ['#set-wakelock', 'wakeLock']
    ];
    for (const [selector, key] of toggles) {
        $(selector).addEventListener('click', async () => {
            await setSetting(key, !settings[key]);
            syncSwitch($(selector), settings[key]);
            if (key === 'sound' && settings.sound) beep();
            if (key === 'wakeLock') {
                if (settings.wakeLock && state.sessionId) requestWakeLock();
                else releaseWakeLock();
            }
        });
    }

    $('#btn-log-bodyweight').addEventListener('click', async () => {
        const input = $('#bodyweight-input');
        const value = parseFloat(input.value);
        if (!Number.isFinite(value) || value <= 0) {
            toast('Enter a weight first', { type: 'error' });
            return;
        }
        await db.logBodyWeight(S.toKg(value, units()));
        input.value = '';
        renderBodyWeightList();
        toast('Body weight logged');
    });

    $('#btn-export-sqlite').addEventListener('click', handleExportSqlite);
    $('#btn-export-json').addEventListener('click', handleExportJson);
    $('#btn-import').addEventListener('click', () => $('#import-input').click());
    $('#import-input').addEventListener('change', handleImport);
    $('#btn-reset').addEventListener('click', handleReset);

    // A backgrounded tab stops firing intervals accurately; re-sync on return.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        if (state.sessionId) {
            requestWakeLock();
            const elapsed = (Date.now() - state.sessionStart) / 1000;
            $('#session-clock').textContent = S.formatClock(elapsed);
        }
        if (restState) {
            restState.remaining = Math.round((restState.deadline - Date.now()) / 1000);
            if (restState.remaining <= 0) restFinished();
            else paintRest();
        }
    });

    window.addEventListener('beforeunload', () => db.flush());
};

// --- Init -----------------------------------------------------------------

const init = async () => {
    try {
        await db.initDB();
    } catch (error) {
        $('#loading').innerHTML =
            `<div style="text-align:center;padding:24px;max-width:34ch">
                <strong>miFitness could not start.</strong><br>${error.message}
             </div>`;
        return;
    }

    loadSettings();
    applyAppearance();
    wireDialogs();
    bindEvents();

    renderHome();
    renderSettings();

    $('#loading').hidden = true;
    $('#app').hidden = false;

    // Drop straight back into a workout that is still running.
    const active = db.getActiveSession();
    if (active) {
        state.sessionId = active.id;
        state.sessionStart = new Date(active.start_time);
        startSessionTimer();
        requestWakeLock();
        renderWorkout();
    }
    showView('home');

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {
            // Offline support is a bonus; the app runs fine without it.
        });
    }
};

init();
