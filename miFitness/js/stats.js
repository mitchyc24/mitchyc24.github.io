// stats.js — pure training math. No DOM, no database, no side effects, so
// every function here is directly unit-testable.

export const KG_PER_LB = 0.45359237;

export const kgToLb = (kg) => kg / KG_PER_LB;
export const lbToKg = (lb) => lb * KG_PER_LB;

/** Convert a stored (kg) weight into the user's display unit. */
export const fromKg = (kg, units) => (units === 'lb' ? kgToLb(kg) : kg);

/** Convert a user-entered weight back into kg for storage. */
export const toKg = (value, units) => (units === 'lb' ? lbToKg(value) : value);

/** Smallest sensible plate jump for each unit system. */
export const stepFor = (units) => (units === 'lb' ? 5 : 2.5);

/** Trim trailing zeros: 100 -> "100", 102.5 -> "102.5", 102.56 -> "102.6". */
export const formatNumber = (value, decimals = 1) => {
    if (!Number.isFinite(value)) return '0';
    const fixed = value.toFixed(decimals);
    // Only ever trim after a decimal point — the zeros in "1200" are significant.
    return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
};

export const formatWeight = (kg, units, { withUnit = true } = {}) => {
    const text = formatNumber(fromKg(kg, units));
    return withUnit ? `${text} ${units}` : text;
};

/** Round to the nearest loadable increment (e.g. 2.5 kg). */
export const roundToIncrement = (value, increment) => {
    if (!increment) return value;
    return Math.round(value / increment) * increment;
};

// --- Strength estimates ---------------------------------------------------

/**
 * Estimated one-rep max (Epley). A single rep is its own 1RM; above ~12 reps
 * the formula drifts badly, so callers should treat high-rep sets as noisy.
 */
export const estimate1RM = (weightKg, reps) => {
    if (!(weightKg > 0) || !(reps > 0)) return 0;
    if (reps === 1) return weightKg;
    return weightKg * (1 + reps / 30);
};

/** Weight that should be achievable for `reps` given an estimated 1RM. */
export const weightForReps = (oneRepMax, reps) => {
    if (!(oneRepMax > 0) || !(reps > 0)) return 0;
    return oneRepMax / (1 + reps / 30);
};

export const setVolume = (set) => (set.weight_kg || 0) * (set.reps || 0);

/** Only completed, non-warm-up sets count towards volume and records. */
export const isWorkingSet = (set) => !!set.is_complete && !set.is_warmup;

export const totalVolume = (sets) => sets.filter(isWorkingSet).reduce((sum, s) => sum + setVolume(s), 0);

export const totalReps = (sets) => sets.filter(isWorkingSet).reduce((sum, s) => sum + (s.reps || 0), 0);

/** The set with the highest estimated 1RM, or null if there are none. */
export const bestSet = (sets) => {
    let best = null;
    let bestScore = 0;
    for (const set of sets) {
        if (!isWorkingSet(set)) continue;
        const score = estimate1RM(set.weight_kg, set.reps);
        if (score > bestScore) {
            bestScore = score;
            best = set;
        }
    }
    return best;
};

// --- Session summaries ----------------------------------------------------

/**
 * Roll a session's sets up into the numbers the UI shows on a workout card.
 * `sets` rows are expected to carry `exercise_id` and (optionally)
 * `target_group` for the muscle-group breakdown.
 */
export const summarizeSession = (sets) => {
    const working = sets.filter(isWorkingSet);
    const exercises = new Set(sets.map((s) => s.exercise_id));
    const groups = new Set(working.map((s) => s.target_group).filter(Boolean));
    return {
        volumeKg: totalVolume(working),
        reps: totalReps(working),
        setCount: working.length,
        loggedSetCount: sets.length,
        exerciseCount: exercises.size,
        muscleGroups: [...groups].sort(),
        topSet: bestSet(working)
    };
};

export const sessionDurationMs = (session) => {
    if (!session?.start_time) return 0;
    const end = session.end_time ? new Date(session.end_time) : new Date();
    return Math.max(0, end - new Date(session.start_time));
};

/**
 * "1h 12m" / "48m" / "35s". `units` carries the locale's abbreviations and is
 * appended straight after each number, so French passes { h: ' h', m: ' min' }
 * to get "1 h 12 min".
 */
export const DURATION_UNITS_EN = { h: 'h', m: 'm', s: 's' };

export const formatDuration = (ms, units = DURATION_UNITS_EN) => {
    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}${units.h} ${minutes}${units.m}`;
    if (minutes > 0) return `${minutes}${units.m}`;
    return `${seconds}${units.s}`;
};

/** "12:34" — for the live session and rest clocks. */
export const formatClock = (totalSeconds) => {
    const safe = Math.max(0, Math.round(totalSeconds));
    const minutes = String(Math.floor(safe / 60)).padStart(2, '0');
    const seconds = String(safe % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
};

/** Compact volume for tiles: 12500 -> "12.5k". */
export const formatVolume = (kg, units) => {
    const value = fromKg(kg, units);
    if (value >= 100000) return `${Math.round(value / 1000)}k`;
    if (value >= 10000) return `${formatNumber(value / 1000)}k`;
    return formatNumber(Math.round(value), 0);
};

// --- Dates ----------------------------------------------------------------

export const dayKey = (date) => {
    const d = new Date(date);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
};

/** Monday-anchored week key, so "this week" matches most training splits. */
export const weekKey = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const offset = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - offset);
    return dayKey(d);
};

export const startOfWeek = (date = new Date()) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
};

/**
 * "Today" / "Yesterday" / "Mon 4 Mar". The two relative labels and the Intl
 * locale are passed in, keeping this module free of UI strings.
 */
export const relativeDay = (date, now = new Date(), labels = {}) => {
    const { today = 'Today', yesterday: yesterdayLabel = 'Yesterday', locale } = labels;
    const key = dayKey(date);
    if (key === dayKey(now)) return today;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (key === dayKey(yesterday)) return yesterdayLabel;
    return new Date(date).toLocaleDateString(locale, {
        weekday: 'short', day: 'numeric', month: 'short'
    });
};

/**
 * Consecutive Monday-weeks with at least one workout, counting back from the
 * current week. The current week is allowed to be empty without breaking the
 * streak — it isn't over yet.
 */
export const weekStreak = (dates, now = new Date()) => {
    const weeks = new Set(dates.map((d) => weekKey(d)));
    if (weeks.size === 0) return 0;
    const cursor = startOfWeek(now);
    let streak = 0;
    if (!weeks.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 7);
    while (weeks.has(dayKey(cursor))) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 7);
    }
    return streak;
};

/** Bucket volume into the last `days` calendar days, oldest first. */
export const volumeByDay = (sets, days = 14, now = new Date()) => {
    const buckets = new Map();
    for (let i = days - 1; i >= 0; i -= 1) {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        buckets.set(dayKey(d), { date: new Date(d), volumeKg: 0, sets: 0 });
    }
    for (const set of sets) {
        if (!isWorkingSet(set)) continue;
        const bucket = buckets.get(dayKey(set.performed_at || set.created_at));
        if (!bucket) continue;
        bucket.volumeKg += setVolume(set);
        bucket.sets += 1;
    }
    return [...buckets.values()];
};

/** Bucket volume into the last `weeks` Monday-weeks, oldest first. */
export const volumeByWeek = (sets, weeks = 8, now = new Date()) => {
    const buckets = new Map();
    for (let i = weeks - 1; i >= 0; i -= 1) {
        const d = startOfWeek(now);
        d.setDate(d.getDate() - i * 7);
        buckets.set(dayKey(d), { date: new Date(d), volumeKg: 0, sets: 0 });
    }
    for (const set of sets) {
        if (!isWorkingSet(set)) continue;
        const bucket = buckets.get(weekKey(set.performed_at || set.created_at));
        if (!bucket) continue;
        bucket.volumeKg += setVolume(set);
        bucket.sets += 1;
    }
    return [...buckets.values()];
};

/** Working sets per muscle group, biggest first — the "am I balanced?" view. */
export const setsByMuscleGroup = (sets) => {
    const totals = new Map();
    for (const set of sets) {
        if (!isWorkingSet(set)) continue;
        const group = set.target_group || 'Other';
        const entry = totals.get(group) || { group, sets: 0, volumeKg: 0 };
        entry.sets += 1;
        entry.volumeKg += setVolume(set);
        totals.set(group, entry);
    }
    return [...totals.values()].sort((a, b) => b.sets - a.sets);
};

/** One point per session: the best estimated 1RM reached that day. */
export const oneRepMaxTrend = (sets) => {
    const bySession = new Map();
    for (const set of sets) {
        if (!isWorkingSet(set)) continue;
        const key = set.session_id || dayKey(set.performed_at || set.created_at);
        const score = estimate1RM(set.weight_kg, set.reps);
        const existing = bySession.get(key);
        if (!existing || score > existing.oneRepMaxKg) {
            bySession.set(key, {
                date: new Date(set.performed_at || set.created_at),
                oneRepMaxKg: score,
                weightKg: set.weight_kg,
                reps: set.reps
            });
        }
    }
    return [...bySession.values()].sort((a, b) => a.date - b.date);
};

// --- Personal records -----------------------------------------------------

/**
 * Best-ever marks for one exercise across `history` (working sets only).
 * Returns nulls when there is nothing to compare against yet.
 */
export const personalRecords = (history) => {
    let heaviest = null;
    let bestVolume = null;
    let best1RM = null;
    for (const set of history) {
        if (!isWorkingSet(set)) continue;
        if (!heaviest || set.weight_kg > heaviest.weight_kg) heaviest = set;
        if (!bestVolume || setVolume(set) > setVolume(bestVolume)) bestVolume = set;
        if (!best1RM || estimate1RM(set.weight_kg, set.reps) > estimate1RM(best1RM.weight_kg, best1RM.reps)) {
            best1RM = set;
        }
    }
    return {
        heaviest,
        bestVolume,
        best1RM,
        oneRepMaxKg: best1RM ? estimate1RM(best1RM.weight_kg, best1RM.reps) : 0
    };
};

/**
 * Which records `candidate` breaks against prior history. Ties don't count —
 * a record has to actually be beaten.
 */
export const detectPRs = (candidate, history) => {
    const records = [];
    if (!isWorkingSet(candidate)) return records;
    const prior = personalRecords(history);
    if (!prior.heaviest || candidate.weight_kg > prior.heaviest.weight_kg) records.push('weight');
    if (!prior.best1RM || estimate1RM(candidate.weight_kg, candidate.reps) > prior.oneRepMaxKg) records.push('1rm');
    if (!prior.bestVolume || setVolume(candidate) > setVolume(prior.bestVolume)) records.push('volume');
    return records;
};

// --- Plate math -----------------------------------------------------------

export const DEFAULT_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];
export const DEFAULT_PLATES_LB = [45, 35, 25, 10, 5, 2.5];

/**
 * Plates to hang on ONE side of the bar for a target load, heaviest first.
 * `remainderKg` is what the available plates could not make up.
 */
export const plateBreakdown = (targetKg, barKg = 20, plates = DEFAULT_PLATES_KG) => {
    if (!(targetKg > barKg)) return { perSide: [], remainderKg: 0 };
    let perSideRemaining = (targetKg - barKg) / 2;
    const perSide = [];
    for (const plate of [...plates].sort((a, b) => b - a)) {
        while (perSideRemaining >= plate - 1e-6) {
            perSide.push(plate);
            perSideRemaining -= plate;
        }
    }
    return { perSide, remainderKg: Math.max(0, perSideRemaining * 2) };
};

// --- Progression hint -----------------------------------------------------

/**
 * Suggest the next session's load for an exercise from the last one, using
 * double progression: add reps inside the rep range, then add weight and
 * reset to the bottom of the range.
 */
export const suggestProgression = (lastSets, { minReps = 6, maxReps = 12, incrementKg = 2.5 } = {}) => {
    const working = lastSets.filter(isWorkingSet);
    if (working.length === 0) return null;
    const top = working.reduce((a, b) => (setVolume(b) > setVolume(a) ? b : a));
    if (top.reps >= maxReps) {
        return {
            action: 'increase-weight',
            weightKg: top.weight_kg + incrementKg,
            reps: minReps,
            reason: `Hit ${top.reps} reps — add ${formatNumber(incrementKg)} kg and reset reps.`
        };
    }
    return {
        action: 'increase-reps',
        weightKg: top.weight_kg,
        reps: top.reps + 1,
        reason: `Aim for ${top.reps + 1} reps at the same load.`
    };
};
