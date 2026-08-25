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
import {
    t, tn, tGroup, tEquipment, seedName, seedDescription,
    setLocale, intlLocale, detectLocale, applyStaticStrings
} from './i18n.js';

// --- State ----------------------------------------------------------------

const settings = {
    locale: 'en',
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
    // First run (or after a reset): follow the browser's language if we speak it.
    settings.locale = stored.locale || detectLocale();
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

/** Point the catalog at the chosen locale and refill the static markup. */
const applyLocale = () => {
    settings.locale = setLocale(settings.locale);
    applyStaticStrings();
};

/**
 * Re-render whatever is on screen. Every view builds itself from the database
 * on each render, so switching language needs nothing more than this.
 */
const rerenderAll = () => {
    renderHome();
    renderSettings();
    if (state.sessionId) renderWorkout();
    if (state.view === 'history') renderHistory();
    if (state.view === 'session') renderSessionDetail();
    if (state.view === 'exercises') renderExerciseList();
    if (state.view === 'exercise') renderExerciseDetail();
    if (state.view === 'progress') renderProgress();
    updateHeader();
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

// Display names for seeded rows; a row the user renamed keeps their wording.
const exName = (id, name) => seedName(id, name, db.SEED_EXERCISE_NAMES);

/** Fold case and accents, so "elevation" finds "Élévation latérale". */
const searchKey = (text) => String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/**
 * Exercise search runs here rather than in SQL because it has to match the
 * name the user can actually see — a French reader searching "traction" must
 * find the row stored as "Pull-Up".
 */
const matchesSearch = (exercise, query) => {
    if (!query) return true;
    const needle = searchKey(query);
    return searchKey(exercise.name).includes(needle)
        || searchKey(exName(exercise.id, exercise.name)).includes(needle);
};
const routineTitle = (routine) => seedName(routine.id, routine.name, db.SEED_ROUTINE_NAMES);
const routineBlurb = (routine) =>
    seedDescription(routine.id, routine.description, db.SEED_ROUTINE_DESCRIPTIONS);

const durationUnits = () => ({
    h: t('duration.hours'), m: t('duration.minutes'), s: t('duration.seconds')
});
const showDuration = (ms) => S.formatDuration(ms, durationUnits());

const dayLabels = () => ({
    today: t('history.today'), yesterday: t('history.yesterday'), locale: intlLocale()
});
const showDay = (date) => S.relativeDay(date, new Date(), dayLabels());

const showDate = (date, options = { dateStyle: 'medium' }) =>
    new Date(date).toLocaleDateString(intlLocale(), options);

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
            title: t('workout.minimiseHint')
        }, [t('workout.minimise')]));
        actions.appendChild(createEl('button.icon-btn', {
            title: t('workout.options'),
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
    const trained = totals.sessions > 0;
    $('#hero-eyebrow').textContent = t(trained ? 'home.eyebrowReady' : 'home.eyebrowWelcome');
    $('#hero-title').textContent = t(trained ? 'home.titleReady' : 'home.titleFirst');
    $('#hero-sub').textContent = trained
        ? t('home.subReady', {
            count: totals.sessions, volume: showVolume(totals.volume_kg), unit: units()
        })
        : t('home.subFirst');
};

const renderResumeBanner = () => {
    const slot = clear($('#resume-slot'));
    const active = db.getActiveSession();
    if (!active) return;

    const sets = db.getSetsForSession(active.id).filter((s) => s.is_complete);
    slot.appendChild(createEl('div.resume-banner', {}, [
        icon('flame', 22),
        createEl('div.body', {}, [
            createEl('div.title', { text: active.name || t('home.inProgress') }),
            createEl('div.meta', {
                text: t('home.resumeMeta', {
                    when: showDay(active.start_time).toLocaleLowerCase(intlLocale()),
                    count: sets.length
                })
            })
        ]),
        createEl('button.btn.sm', { onclick: () => resumeSession(active) }, [t('home.resume')])
    ]));
};

const renderWeekStats = () => {
    const host = clear($('#week-stats'));
    const weekStart = S.startOfWeek();
    const sets = db.getSetsSince(weekStart.toISOString());
    const dates = db.getSessionDates();
    const sessionsThisWeek = new Set(sets.map((s) => s.session_id)).size;

    renderStatTiles(host, [
        { value: String(sessionsThisWeek), label: t('stat.workouts') },
        { value: showVolume(S.totalVolume(sets)), unit: units(), label: t('stat.volume') },
        { value: String(sets.filter(S.isWorkingSet).length), label: t('stat.workSets') },
        { value: String(S.weekStreak(dates)), label: t('stat.weekStreak') }
    ]);
};

const renderRoutines = () => {
    const host = clear($('#routine-list'));
    const routines = db.listRoutines();
    if (routines.length === 0) {
        host.appendChild(emptyState(t('home.noRoutines'), t('home.noRoutinesHint')));
        return;
    }
    for (const routine of routines) {
        host.appendChild(createEl('button.routine-card', {
            type: 'button',
            onclick: () => startFromRoutine(routine)
        }, [
            createEl('div.name', { text: routineTitle(routine) }),
            routine.description ? createEl('div.desc', { text: routineBlurb(routine) }) : null,
            createEl('div.foot', {}, [
                createEl('span.badge', { text: tn('common.exercisesCount', routine.exercise_count) }),
                createEl('span.icon-btn', {
                    role: 'button',
                    tabindex: '0',
                    title: t('routine.edit'),
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
    const name = session.name || t('workout.title');
    return createEl('button.list-item', {
        type: 'button',
        onclick: () => openSessionDetail(session.id)
    }, [
        createEl('div.avatar', { text: initials(name) }),
        createEl('div.body', {}, [
            createEl('div.title', { text: name }),
            createEl('div.meta', {}, [
                createEl('span', { text: showDay(session.start_time) }),
                createEl('span', { text: showDuration(S.sessionDurationMs(session)) }),
                createEl('span', { text: tn('common.exercisesCount', session.exercise_count) }),
                createEl('span', { text: tn('common.sets', session.set_count) }),
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
        host.appendChild(emptyState(t('home.noWorkouts'), t('home.noWorkoutsHint')));
        return;
    }
    for (const session of sessions) host.appendChild(sessionListItem(session));
};

// ==========================================================================
// Workout
// ==========================================================================

const startEmptyWorkout = async () => {
    const id = await db.startSession({ name: t('workout.title') });
    await enterSession(id);
    openExercisePicker();
};

const startFromRoutine = async (routine) => {
    if (db.getActiveSession()) {
        const proceed = await confirmDialog({
            title: t('home.alreadyRunning'),
            message: t('home.alreadyRunningHint'),
            confirmLabel: t('home.openIt')
        });
        if (proceed) resumeSession(db.getActiveSession());
        return;
    }
    const id = await db.startSession({ name: routineTitle(routine), routineId: routine.id });
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
            t('workout.nothingAdded'),
            t('workout.nothingAddedHint'),
            createEl('button.btn.primary', { onclick: openExercisePicker }, [t('workout.addExercise')])
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
                    text: exName(entry.exercise_id, entry.name)
                }),
                createEl('div.sub', {
                    text: `${tGroup(entry.target_group)} · ${tEquipment(entry.primary_equipment)}`
                })
            ]),
            createEl('button.icon-btn', {
                title: t('workout.exerciseOptions'),
                onclick: () => openExerciseMenu(entry, index, total)
            }, [icon('more')])
        ])
    ]);

    if (previous) {
        card.appendChild(createEl('div.previous-note', {}, [
            icon('history', 14),
            createEl('span', { text: `${showDay(previous.startTime)}:` }),
            createEl('span.sets', { text: previous.sets.map(setLabel).join(', ') })
        ]));
    }

    const grid = createEl('div.set-grid', {}, [
        createEl('div.head-cell', { text: t('workout.colSet') }),
        createEl('div.head-cell', { text: units() }),
        createEl('div.head-cell', { text: t('workout.colReps') }),
        createEl('div.head-cell', { text: t('workout.colRpe') }),
        createEl('div.head-cell', { text: '' })
    ]);
    entry.sets.forEach((set, setIndex) => {
        grid.appendChild(renderSetRow(entry, set, setIndex, previous));
    });
    card.appendChild(grid);

    card.appendChild(createEl('div.set-actions', {}, [
        createEl('button.btn.sm', {
            onclick: () => addSetTo(entry, { isWarmup: 1 })
        }, [t('workout.addWarmup')]),
        createEl('button.btn.sm', {
            onclick: () => addSetTo(entry)
        }, [icon('plus', 15), t('workout.addSet')])
    ]));

    return card;
};

const renderSetRow = (entry, set, setIndex, previous) => {
    const row = createEl('div.set-row', { dataset: { setId: set.id } });
    if (set.is_complete) row.classList.add('done');

    const indexButton = createEl(`button.set-index${set.is_warmup ? '.warmup' : ''}`, {
        title: t(set.is_warmup ? 'workout.unmarkWarmup' : 'workout.markWarmup'),
        text: set.is_warmup ? t('workout.warmupShort') : String(setIndex + 1),
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
        'aria-label': t('workout.weightAria', { index: setIndex + 1 })
    });
    const repsInput = createEl('input.set-input', {
        type: 'number',
        inputmode: 'numeric',
        step: '1',
        min: '0',
        value: set.reps > 0 ? String(set.reps) : '',
        placeholder: priorSet ? String(priorSet.reps) : '0',
        'aria-label': t('workout.repsAria', { index: setIndex + 1 })
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
        title: t('workout.rpeTitle'),
        onclick: () => pickRpe(set)
    });

    const checkButton = createEl('button.check-btn', {
        title: t(set.is_complete ? 'workout.undoSet' : 'workout.completeSet'),
        'aria-label': t(set.is_complete ? 'workout.undoSet' : 'workout.completeSet'),
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
        toast(t('workout.needReps'), { type: 'error' });
        repsInput.focus();
        return;
    }

    await db.updateSet(set.id, { weightKg, reps, isComplete: true });

    if (!set.is_warmup) {
        const history = db.getExerciseHistory(entry.exercise_id)
            .filter((s) => s.session_id !== state.sessionId);
        const records = S.detectPRs({ weight_kg: weightKg, reps, is_complete: 1, is_warmup: 0 }, history);
        if (records.length > 0 && history.length > 0) {
            const names = { weight: 'workout.prWeight', '1rm': 'workout.pr1rm', volume: 'workout.prVolume' };
            toast(t('workout.prToast', {
                name: exName(entry.exercise_id, entry.name),
                record: t(names[records[0]])
            }), { type: 'pr', duration: 3200 });
        }
    }

    renderWorkout();
    if (settings.autoRest && !set.is_warmup) {
        startRest(entry.rest_seconds || settings.restSeconds, exName(entry.exercise_id, entry.name));
    }
};

const pickRpe = async (set) => {
    const options = [{ label: t('workout.rpeClear'), value: 'clear', sub: t('workout.rpeNone') }].concat(
        [10, 9.5, 9, 8.5, 8, 7.5, 7, 6].map((value) => ({
            label: String(value),
            value: String(value),
            sub: t(value >= 10 ? 'workout.rpeFailure'
                : value >= 9 ? 'workout.rpeOne'
                : value >= 8 ? 'workout.rpeTwo'
                : 'workout.rpeEasy')
        }))
    );
    // sheetDialog resolves null when dismissed, so "Clear" carries its own value.
    const chosen = await sheetDialog({ title: t('workout.rpeTitle'), options });
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
        title: exName(entry.exercise_id, entry.name),
        options: [
            { label: t('workout.viewHistory'), value: 'detail' },
            entry.primary_equipment === 'Barbell' ? { label: t('workout.plateCalculator'), value: 'plates' } : null,
            index > 0 ? { label: t('workout.moveUp'), value: 'up' } : null,
            index < total - 1 ? { label: t('workout.moveDown'), value: 'down' } : null,
            { label: t('workout.removeExercise'), value: 'remove', danger: true }
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
            title: t('workout.removeConfirm', { name: exName(entry.exercise_id, entry.name) }),
            message: t('workout.removeConfirmHint'),
            confirmLabel: t('common.remove'),
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
    const plates = perSide.length
        ? perSide.map((plate) => S.formatWeight(plate, units())).join(' + ')
        : t('common.justTheBar');
    const params = { load: showWeight(heaviest || 60, true), plates, short: showWeight(remainderKg, true) };
    toast(t(remainderKg ? 'common.perSideShort' : 'common.perSide', params),
        { type: 'success', duration: 5000, iconName: 'scale' });
};

const openWorkoutMenu = async () => {
    const choice = await sheetDialog({
        title: t('workout.title'),
        options: [
            { label: t('workout.renameWorkout'), value: 'rename' },
            { label: t('workout.addExercise'), value: 'add' },
            { label: t('workout.finish'), value: 'finish' },
            { label: t('workout.discard'), value: 'discard', danger: true }
        ]
    });
    if (choice === 'rename') {
        const session = db.getSession(state.sessionId);
        const name = await promptDialog({ title: t('workout.workoutName'), value: session.name || '' });
        if (name) {
            await db.updateSession(state.sessionId, { name });
            toast(t('workout.renamed'));
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
            title: t('workout.nothingLogged'),
            message: t('workout.nothingLoggedHint'),
            confirmLabel: t('workout.discardAction'),
            danger: true
        });
        if (discard) await discardWorkout({ skipConfirm: true });
        return;
    }

    const summary = S.summarizeSession(db.getSetsForSession(state.sessionId));
    const ok = await confirmDialog({
        title: t('workout.finishConfirm'),
        message: t('workout.finishConfirmHint', {
            sets: tn('common.workingSets', summary.setCount),
            volume: showVolume(summary.volumeKg),
            unit: units(),
            duration: showDuration(Date.now() - state.sessionStart)
        }),
        confirmLabel: t('workout.finishAction')
    });
    if (!ok) return;

    await db.endSession(state.sessionId);
    stopSessionTimer();
    stopRest();
    releaseWakeLock();
    state.sessionId = null;
    toast(t('workout.saved'));
    goToTab('home');
};

const discardWorkout = async ({ skipConfirm = false } = {}) => {
    if (!skipConfirm) {
        const ok = await confirmDialog({
            title: t('workout.discardConfirm'),
            message: t('workout.discardConfirmHint'),
            confirmLabel: t('workout.discardAction'),
            danger: true
        });
        if (!ok) return;
    }
    await db.deleteSession(state.sessionId);
    stopSessionTimer();
    stopRest();
    releaseWakeLock();
    state.sessionId = null;
    toast(t('workout.discarded'));
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
    toast(t('rest.done'), { type: 'success', iconName: 'clock' });
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
    $('#history-count').textContent = total ? tn('common.workoutsCount', total) : '';

    if (sessions.length === 0) {
        host.appendChild(emptyState(t('history.empty'), t('history.emptyHint')));
        return;
    }

    let currentMonth = '';
    let list = null;
    for (const session of sessions) {
        const month = showDate(session.start_time, { month: 'long', year: 'numeric' });
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
        }, [t('common.loadMore')]));
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

    $('#session-detail-title').textContent = session.name || t('workout.title');
    $('#session-detail-sub').textContent = [
        new Date(session.start_time).toLocaleString(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' }),
        showDuration(S.sessionDurationMs(session))
    ].join(' · ');

    const body = clear($('#session-detail-body'));

    renderStatTiles(body, [
        { value: showVolume(summary.volumeKg), unit: units(), label: t('stat.volume') },
        { value: String(summary.setCount), label: t('stat.workSets') },
        { value: String(summary.reps), label: t('stat.reps') },
        { value: String(summary.exerciseCount), label: t('stat.exercises') }
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
                    text: exName(entry.exercise_id, entry.name),
                    onclick: () => openExerciseDetail(entry.exercise_id, { backTo: 'session' })
                }),
                createEl('span.group', { text: tGroup(entry.target_group) })
            ]),
            createEl('div.set-pill-row', {}, performed.map((set) => createEl(
                `span.set-pill${top && set.id === top.id ? '.top' : ''}`,
                {
                    text: `${setLabel(set)}`
                        + `${set.is_warmup ? ` · ${t('workout.warmupShort')}` : ''}`
                        + `${set.rpe ? ` @${set.rpe}` : ''}`
                }
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
                const name = await promptDialog({ title: t('workout.renameWorkout'), value: session.name || '' });
                if (!name) return;
                await db.updateSession(session.id, { name });
                renderSessionDetail();
                toast(t('workout.renamed'));
            }
        }, [t('common.rename')]),
        createEl('button.btn.block', {
            onclick: async () => {
                const name = await promptDialog({
                    title: t('session.saveAsRoutine'),
                    value: session.name || t('routine.newTitle')
                });
                if (!name) return;
                await db.routineFromSession(session.id, name);
                toast(t('workout.routineSaved'));
            }
        }, [t('session.saveAsRoutine')])
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
            text: group ? tGroup(group) : t('common.all'),
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
    const exercises = db.listExercises({ group: state.exerciseFilter.group })
        .filter((exercise) => matchesSearch(exercise, state.exerciseFilter.search));

    if (exercises.length === 0) {
        host.appendChild(emptyState(t('common.nothingMatches'), t('exercises.noMatchHint')));
        return;
    }

    for (const exercise of exercises) {
        const name = exName(exercise.id, exercise.name);
        host.appendChild(createEl('button.list-item', {
            type: 'button',
            onclick: () => openExerciseDetail(exercise.id, { backTo: 'exercises' })
        }, [
            createEl('div.avatar', { text: initials(name) }),
            createEl('div.body', {}, [
                createEl('div.title', { text: name }),
                createEl('div.meta', {}, [
                    createEl('span', { text: tGroup(exercise.target_group) }),
                    createEl('span', { text: tEquipment(exercise.primary_equipment) }),
                    exercise.set_count > 0
                        ? createEl('span', { text: tn('exercises.setsLogged', exercise.set_count) })
                        : createEl('span', { text: t('exercises.neverTrained') })
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

    $('#exercise-detail-title').textContent = exName(exercise.id, exercise.name);
    $('#exercise-detail-sub').textContent = `${tGroup(exercise.target_group)} · ${tEquipment(exercise.primary_equipment)}`
        + (exercise.is_custom ? ` · ${t('exercises.custom')}` : '');
    $('#btn-fav-exercise').style.color = exercise.is_favorite ? 'var(--accent)' : '';

    const body = clear($('#exercise-detail-body'));

    if (exercise.notes) {
        body.appendChild(createEl('div.previous-note', { style: { marginBottom: 'var(--sp-3)' } }, [
            icon('info', 14),
            createEl('span', { text: exercise.notes })
        ]));
    }

    if (history.length === 0) {
        body.appendChild(emptyState(t('exercises.noHistory'), t('exercises.noHistoryHint')));
        return;
    }

    const records = S.personalRecords(history);
    renderStatTiles(body, [
        { value: showWeight(records.heaviest.weight_kg), unit: units(), label: t('stat.heaviest') },
        { value: showWeight(records.oneRepMaxKg), unit: units(), label: t('stat.oneRepMax') },
        { value: showVolume(S.setVolume(records.bestVolume)), unit: units(), label: t('stat.bestSet') },
        { value: String(history.length), label: t('stat.setsLogged') }
    ]);

    const trend = S.oneRepMaxTrend(history);
    if (trend.length >= 2) {
        const chart = createEl('div.card.chart-card', { style: { marginTop: 'var(--sp-4)' } }, [
            createEl('div.chart-title', { text: t('progress.oneRepMax') }),
            createEl('div.chart-sub', { text: t('progress.oneRepMaxSub', { unit: units() }) })
        ]);
        body.appendChild(chart);
        renderLineChart(chart, trend.map((point) => ({
            date: point.date,
            value: S.fromKg(point.oneRepMaxKg, units()),
            tooltip: `<strong>${t('progress.tooltip1rm', { value: showWeight(point.oneRepMaxKg, true) })}</strong><br>`
                + `${showWeight(point.weightKg)} × ${point.reps} · ${showDate(point.date)}`
        })), {
            formatValue: (value) => S.formatNumber(value, 0),
            emptyMessage: t('progress.notEnough'),
            ariaLabel: t('progress.lineChartAria', { count: trend.length }),
            locale: intlLocale()
        });
        renderDataTable(chart,
            [t('progress.colDate'), t('progress.colTopSet'), t('progress.col1rm', { unit: units() })],
            trend.slice().reverse().map((point) => [
                showDate(point.date),
                `${showWeight(point.weightKg)} × ${point.reps}`,
                S.formatNumber(S.fromKg(point.oneRepMaxKg, units()), 0)
            ]),
            t('progress.showNumbers')
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
        createEl('h3', { text: t('exercises.sessionHistory') })
    ]));

    const list = createEl('div.list');
    body.appendChild(list);
    for (const [sessionId, group] of [...bySession.entries()].reverse()) {
        const top = S.bestSet(group.sets);
        list.appendChild(createEl('div.card.history-day', {}, [
            createEl('div.day-head', {}, [
                createEl('button.date', {
                    style: { background: 'none', border: 'none', padding: '0', font: 'inherit', fontWeight: '650' },
                    text: showDay(group.date),
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

/** Options keep their canonical English value; only the label is translated. */
const fillSelect = (select, values, label) => {
    clear(select);
    for (const value of values) select.appendChild(createEl('option', { value, text: label(value) }));
};

const openExerciseEditor = (exerciseId = null) => {
    const dialog = $('#exercise-dialog');
    const exercise = exerciseId ? db.getExercise(exerciseId) : null;

    $('#exercise-dialog-title').textContent = t(exercise ? 'exercises.editTitle' : 'exercises.newTitle');
    fillSelect($('#exercise-group'), db.MUSCLE_GROUPS, tGroup);
    fillSelect($('#exercise-equipment'), db.EQUIPMENT_TYPES, tEquipment);

    // Show the name on screen. If it comes back unchanged we keep the stored
    // canonical name, so opening and saving the dialog is not a rename.
    const shownName = exercise ? exName(exercise.id, exercise.name) : '';
    $('#exercise-name').value = shownName;
    $('#exercise-group').value = exercise?.target_group || db.MUSCLE_GROUPS[0];
    $('#exercise-equipment').value = exercise?.primary_equipment || db.EQUIPMENT_TYPES[0];
    $('#exercise-rest').value = exercise?.rest_seconds ?? '';
    $('#exercise-notes').value = exercise?.notes || '';

    const deleteButton = $('#exercise-delete');
    deleteButton.hidden = !exercise;
    deleteButton.onclick = async () => {
        const outcome = await confirmDialog({
            title: t('exercises.deleteConfirm', { name: exName(exercise.id, exercise.name) }),
            message: t('exercises.deleteConfirmHint'),
            confirmLabel: t('common.delete'),
            danger: true
        });
        if (!outcome) return;
        const result = await db.deleteExercise(exercise.id);
        dialog.close();
        toast(t(result === 'archived' ? 'exercises.archived' : 'exercises.deleted'));
        goToTab('exercises');
    };

    const form = $('#exercise-form');
    form.onsubmit = async (event) => {
        event.preventDefault();
        const rest = parseInt($('#exercise-rest').value, 10);
        const typedName = $('#exercise-name').value.trim();
        const fields = {
            name: exercise && typedName === shownName ? exercise.name : typedName,
            target_group: $('#exercise-group').value,
            primary_equipment: $('#exercise-equipment').value,
            notes: $('#exercise-notes').value.trim(),
            rest_seconds: Number.isFinite(rest) ? rest : null
        };
        if (!typedName) return;

        if (exercise) {
            await db.updateExercise(exercise.id, fields);
        } else {
            const id = await db.createExercise(fields);
            state.detailExerciseId = id;
        }
        dialog.close();
        toast(t(exercise ? 'exercises.updated' : 'exercises.added'));
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
    const exercises = db.listExercises({ group: pickerGroup })
        .filter((exercise) => matchesSearch(exercise, $('#picker-search').value.trim()));

    if (exercises.length === 0) {
        host.appendChild(emptyState(t('common.nothingMatches'), t('exercises.pickerNoMatchHint')));
        return;
    }

    for (const exercise of exercises) {
        const selected = pickerSelection.has(exercise.id);
        const name = exName(exercise.id, exercise.name);
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
            createEl('div.avatar', { text: initials(name) }),
            createEl('div.body', {}, [
                createEl('div.name', { text: name }),
                createEl('div.sub', {
                    text: `${tGroup(exercise.target_group)} · ${tEquipment(exercise.primary_equipment)}`
                })
            ]),
            selected ? icon('check', 18) : null
        ]));
    }
};

const updatePickerConfirm = () => {
    const button = $('#picker-confirm');
    button.disabled = pickerSelection.size === 0;
    button.textContent = pickerSelection.size > 1
        ? t('common.addCount', { count: pickerSelection.size })
        : t('common.add');
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
    openPicker(t('workout.addExercise'), async (ids) => {
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
        host.appendChild(emptyState(t('routine.noExercises'), t('routine.noExercisesHint')));
        return;
    }

    routineDraft.exercises.forEach((item, index) => {
        host.appendChild(createEl('div.list-item', {}, [
            createEl('div.body', {}, [
                createEl('div.title', { text: exName(item.exercise_id, item.name) }),
                createEl('div.meta', {}, [createEl('span', { text: tGroup(item.target_group) })])
            ]),
            createEl('input.set-input', {
                type: 'number', min: '1', max: '20', value: String(item.target_sets),
                style: { width: '46px' },
                'aria-label': t('routine.setsAria', { name: exName(item.exercise_id, item.name) }),
                onchange: (event) => { item.target_sets = parseInt(event.target.value, 10) || 3; }
            }),
            createEl('span', { text: '×', style: { color: 'var(--text-muted)' } }),
            createEl('input.set-input', {
                type: 'number', min: '1', max: '100', value: String(item.target_reps),
                style: { width: '46px' },
                'aria-label': t('routine.repsAria', { name: exName(item.exercise_id, item.name) }),
                onchange: (event) => { item.target_reps = parseInt(event.target.value, 10) || 10; }
            }),
            createEl('button.icon-btn', {
                type: 'button',
                title: t('workout.moveUp'),
                onclick: () => {
                    if (index === 0) return;
                    const list = routineDraft.exercises;
                    [list[index - 1], list[index]] = [list[index], list[index - 1]];
                    renderRoutineDraft();
                }
            }, [icon('up', 16)]),
            createEl('button.icon-btn.danger', {
                type: 'button',
                title: t('common.remove'),
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

    $('#routine-dialog-title').textContent = t(routine ? 'routine.editTitle' : 'routine.newTitle');
    $('#routine-name').value = routine ? routineTitle(routine) : '';
    $('#routine-desc').value = routine ? routineBlurb(routine) : '';
    renderRoutineDraft();

    const deleteButton = $('#routine-delete');
    deleteButton.hidden = !routine;
    deleteButton.onclick = async () => {
        const ok = await confirmDialog({
            title: t('routine.deleteConfirm', { name: routineTitle(routine) }),
            message: t('routine.deleteConfirmHint'),
            confirmLabel: t('common.delete'),
            danger: true
        });
        if (!ok) return;
        await db.deleteRoutine(routine.id);
        dialog.close();
        toast(t('routine.deleted'));
        renderRoutines();
    };

    $('#routine-form').onsubmit = async (event) => {
        event.preventDefault();
        const name = $('#routine-name').value.trim();
        if (!name) return;
        if (routineDraft.exercises.length === 0) {
            toast(t('routine.needExercise'), { type: 'error' });
            return;
        }
        await db.saveRoutine({
            id: routineDraft.id,
            name,
            description: $('#routine-desc').value.trim(),
            exercises: routineDraft.exercises
        });
        dialog.close();
        toast(t(routineDraft.id ? 'routine.updated' : 'routine.created'));
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
        { value: String(sessionIds.size), label: t('stat.workouts') },
        { value: showVolume(S.totalVolume(working)), unit: units(), label: t('stat.volume') },
        { value: String(working.length), label: t('stat.workSets') },
        { value: String(S.weekStreak(dates)), label: t('stat.weekStreak') }
    ]);

    if (working.length === 0) {
        body.appendChild(emptyState(t('progress.empty'), t('progress.emptyHint')));
        return;
    }

    // --- Volume over time
    const weeks = Math.min(26, Math.max(4, Math.round(days / 7)));
    const byWeek = S.volumeByWeek(sets, weeks);
    const volumeCard = createEl('div.card.chart-card', { style: { marginTop: 'var(--sp-4)' } }, [
        createEl('div.chart-title', { text: t('progress.weeklyVolume') }),
        createEl('div.chart-sub', { text: t('progress.weeklyVolumeSub', { unit: units() }) })
    ]);
    body.appendChild(volumeCard);
    renderBarChart(volumeCard, byWeek.map((week) => ({
        label: showDate(week.date, { day: 'numeric', month: 'short' }),
        value: S.fromKg(week.volumeKg, units()),
        tooltip: `<strong>${t('progress.tooltipVolume', { volume: showVolume(week.volumeKg), unit: units() })}</strong><br>`
            + t('progress.tooltipWeek', { sets: tn('common.sets', week.sets), date: showDate(week.date) })
    })), {
        formatValue: compactNumber,
        labelEvery: Math.ceil(weeks / 4),
        emptyMessage: t('progress.noVolume'),
        ariaLabel: t('progress.barChartAria', { count: byWeek.length })
    });
    renderDataTable(volumeCard,
        [t('progress.colWeekOf'), t('progress.colVolume', { unit: units() }), t('progress.colSets')],
        byWeek.slice().reverse().map((week) => [
            showDate(week.date),
            showVolume(week.volumeKg),
            String(week.sets)
        ]),
        t('progress.showNumbers')
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
        createEl('div.chart-title', { text: t('progress.muscleSplit') }),
        createEl('div.chart-sub', { text: t('progress.muscleSplitSub') })
    ]);
    body.appendChild(splitCard);
    renderDonut(splitCard, shown.map((group) => ({
        label: group.group === 'Other' ? t('progress.other') : tGroup(group.group),
        value: group.sets,
        display: tn('common.sets', group.sets)
    })), {
        centerValue: String(working.length),
        centerLabel: t('common.setsWord'),
        emptyMessage: t('progress.nothingLogged'),
        ariaLabel: t('progress.donutAria', { count: shown.length })
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
        createEl('h3', { text: t('progress.mostTrained') })
    ]));
    const list = createEl('div.list');
    body.appendChild(list);
    for (const exercise of top) {
        list.appendChild(createEl('button.list-item', {
            type: 'button',
            onclick: () => openExerciseDetail(exercise.id, { backTo: 'progress' })
        }, [
            createEl('div.body', {}, [
                createEl('div.title', { text: exName(exercise.id, exercise.name) }),
                createEl('div.meta', {}, [
                    createEl('span', { text: tn('common.sets', exercise.sets) }),
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
            createEl('div.chart-title', { text: t('progress.bodyWeight') }),
            createEl('div.chart-sub', { text: t('progress.bodyWeightSub', { unit: units() }) })
        ]);
        body.appendChild(card);
        renderLineChart(card, bodyWeights.map((entry) => ({
            date: new Date(entry.logged_at),
            value: S.fromKg(entry.weight_kg, units()),
            tooltip: `<strong>${showWeight(entry.weight_kg, true)}</strong><br>${showDate(entry.logged_at)}`
        })), {
            formatValue: (value) => S.formatNumber(value),
            emptyMessage: t('progress.notEnough'),
            ariaLabel: t('progress.lineChartAria', { count: bodyWeights.length }),
            locale: intlLocale()
        });
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
    syncSegmented($('#set-locale'), settings.locale);
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
            'aria-label': t('settings.accentAria', { name }),
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
    $('#about-storage').textContent = t('settings.aboutStorage', {
        workouts: tn('common.workoutsCount', totals.sessions),
        sets: tn('common.sets', totals.sets),
        volume: showVolume(totals.volume_kg),
        unit: units()
    });
};

const renderBodyWeightList = () => {
    const host = clear($('#bodyweight-list'));
    const entries = db.listBodyWeight({ limit: 5 });
    if (entries.length === 0) {
        host.appendChild(createEl('p', {
            style: { fontSize: '0.82rem', color: 'var(--text-muted)' },
            text: t('settings.noWeightEntries')
        }));
        return;
    }
    for (const entry of entries) {
        host.appendChild(createEl('div.switch-row', {}, [
            createEl('div', {}, [
                createEl('div.label', { text: showWeight(entry.weight_kg, true) }),
                createEl('div.hint', { text: showDate(entry.logged_at) })
            ]),
            createEl('button.icon-btn.danger', {
                title: t('settings.deleteEntry'),
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
    toast(t('data.backupDownloaded'));
};

const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(db.exportJson(), null, 2)], { type: 'application/json' });
    downloadBlob(blob, `mifitness-${S.dayKey(new Date())}.json`);
    toast(t('data.jsonExported'));
};

const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const ok = await confirmDialog({
        title: t('data.importConfirm'),
        message: t('data.importConfirmHint', { name: file.name }),
        confirmLabel: t('data.import'),
        danger: true
    });
    if (!ok) return;

    try {
        await db.importDatabase(await file.arrayBuffer());
        loadSettings();
        applyAppearance();
        applyLocale();
        state.sessionId = null;
        stopSessionTimer();
        toast(t('data.restored'));
        goToTab('home');
    } catch (error) {
        toast(t('data.importFailed', { error: error.message }), { type: 'error', duration: 5000 });
    }
};

const handleReset = async () => {
    const ok = await confirmDialog({
        title: t('data.resetConfirm'),
        message: t('data.resetConfirmHint'),
        confirmLabel: t('data.resetAction'),
        danger: true
    });
    if (!ok) return;
    await db.resetDatabase();
    state.sessionId = null;
    stopSessionTimer();
    loadSettings();
    applyAppearance();
    applyLocale();
    toast(t('data.resetDone'));
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
            title: t('home.startFromRoutine'),
            options: routines.map((routine) => ({
                label: routineTitle(routine),
                sub: tn('common.exercisesCount', routine.exercise_count),
                value: routine.id
            }))
        });
        if (!choice) return;
        await startFromRoutine(routines.find((r) => r.id === choice));
    });
    $('#btn-new-routine').addEventListener('click', () => openRoutineDialog());
    $('#routine-add-exercise').addEventListener('click', () => {
        openPicker(t('routine.addToRoutine'), (ids) => {
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
            title: t('session.deleteConfirm'),
            message: t('session.deleteConfirmHint'),
            confirmLabel: t('common.delete'),
            danger: true
        });
        if (!ok) return;
        await db.deleteSession(state.detailSessionId);
        toast(t('session.deleted'));
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
    for (const button of $$('#set-locale button')) {
        button.addEventListener('click', async () => {
            if (button.dataset.value === settings.locale) return;
            await setSetting('locale', button.dataset.value);
            applyLocale();
            rerenderAll();
        });
    }
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
            toast(t('settings.needWeight'), { type: 'error' });
            return;
        }
        await db.logBodyWeight(S.toKg(value, units()));
        input.value = '';
        renderBodyWeightList();
        toast(t('settings.weightLogged'));
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
                <strong>${t('app.failed')}</strong><br>${error.message}
             </div>`;
        return;
    }

    loadSettings();
    applyLocale();
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
