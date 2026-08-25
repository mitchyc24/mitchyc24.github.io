import test from 'node:test';
import assert from 'node:assert';
import {
    estimate1RM, weightForReps, totalVolume, bestSet, summarizeSession,
    formatDuration, formatClock, formatNumber, formatWeight, formatVolume, kgToLb, lbToKg,
    roundToIncrement, dayKey, weekKey, relativeDay, weekStreak,
    volumeByDay, volumeByWeek, setsByMuscleGroup, oneRepMaxTrend,
    personalRecords, detectPRs, plateBreakdown, suggestProgression
} from '../js/stats.js';

const set = (overrides = {}) => ({
    weight_kg: 100, reps: 5, is_complete: 1, is_warmup: 0,
    created_at: '2026-03-02T10:00:00.000Z', ...overrides
});

test('estimate1RM uses Epley and treats a single rep as its own max', () => {
    assert.strictEqual(estimate1RM(100, 1), 100);
    assert.ok(Math.abs(estimate1RM(100, 10) - 133.333) < 0.01);
    assert.strictEqual(estimate1RM(0, 5), 0, 'no weight means no estimate');
    assert.strictEqual(estimate1RM(100, 0), 0, 'no reps means no estimate');
});

test('weightForReps inverts estimate1RM', () => {
    const oneRm = estimate1RM(100, 10);
    assert.ok(Math.abs(weightForReps(oneRm, 10) - 100) < 1e-9);
});

test('unit conversion round-trips', () => {
    assert.ok(Math.abs(kgToLb(100) - 220.462) < 0.01);
    assert.ok(Math.abs(lbToKg(kgToLb(87.5)) - 87.5) < 1e-9);
    assert.strictEqual(formatWeight(102.5, 'kg'), '102.5 kg');
    assert.strictEqual(formatWeight(100, 'kg'), '100 kg');
});

test('formatNumber trims only fractional zeros', () => {
    assert.strictEqual(formatNumber(100), '100');
    assert.strictEqual(formatNumber(102.5), '102.5');
    assert.strictEqual(formatNumber(102.56), '102.6');
    assert.strictEqual(formatNumber(10, 0), '10', 'integer zeros are significant');
    assert.strictEqual(formatNumber(1200, 0), '1200');
    assert.strictEqual(formatNumber(0, 0), '0');
    assert.strictEqual(formatNumber(Number.NaN), '0');
});

test('formatVolume stays compact without losing magnitude', () => {
    assert.strictEqual(formatVolume(0, 'kg'), '0');
    assert.strictEqual(formatVolume(1200, 'kg'), '1200');
    assert.strictEqual(formatVolume(12500, 'kg'), '12.5k');
    assert.strictEqual(formatVolume(250000, 'kg'), '250k');
});

test('roundToIncrement snaps to loadable jumps', () => {
    assert.strictEqual(roundToIncrement(101, 2.5), 100);
    assert.strictEqual(roundToIncrement(101.5, 2.5), 102.5);
    assert.strictEqual(roundToIncrement(101, 0), 101, 'no increment leaves the value alone');
});

test('volume counts only completed working sets', () => {
    const sets = [
        set({ weight_kg: 100, reps: 5 }),
        set({ weight_kg: 60, reps: 10, is_warmup: 1 }),
        set({ weight_kg: 100, reps: 5, is_complete: 0 })
    ];
    assert.strictEqual(totalVolume(sets), 500);
});

test('bestSet picks the highest estimated 1RM, not the heaviest', () => {
    const sets = [set({ weight_kg: 100, reps: 5 }), set({ weight_kg: 90, reps: 12 })];
    assert.strictEqual(bestSet(sets).weight_kg, 90, '90x12 estimates higher than 100x5');
    assert.strictEqual(bestSet([]), null);
});

test('summarizeSession rolls up the numbers a workout card shows', () => {
    const summary = summarizeSession([
        set({ exercise_id: 'squat', target_group: 'Quads', weight_kg: 100, reps: 5 }),
        set({ exercise_id: 'squat', target_group: 'Quads', weight_kg: 100, reps: 5 }),
        set({ exercise_id: 'bench', target_group: 'Chest', weight_kg: 80, reps: 8 }),
        set({ exercise_id: 'bench', target_group: 'Chest', weight_kg: 40, reps: 10, is_warmup: 1 })
    ]);
    assert.strictEqual(summary.volumeKg, 100 * 5 * 2 + 80 * 8);
    assert.strictEqual(summary.setCount, 3);
    assert.strictEqual(summary.loggedSetCount, 4);
    assert.strictEqual(summary.exerciseCount, 2);
    assert.deepStrictEqual(summary.muscleGroups, ['Chest', 'Quads']);
    assert.strictEqual(summary.reps, 18);
});

test('formatDuration and formatClock render the shapes the UI needs', () => {
    assert.strictEqual(formatDuration(45 * 1000), '45s');
    assert.strictEqual(formatDuration(48 * 60 * 1000), '48m');
    assert.strictEqual(formatDuration((72 * 60 + 30) * 1000), '1h 12m');
    assert.strictEqual(formatClock(94), '01:34');
    assert.strictEqual(formatClock(-5), '00:00');
});

test('weekKey anchors to Monday', () => {
    // 2026-03-04 is a Wednesday; the Monday of that week is 2026-03-02.
    assert.strictEqual(weekKey('2026-03-04T12:00:00'), '2026-03-02');
    assert.strictEqual(weekKey('2026-03-02T00:30:00'), '2026-03-02');
    assert.strictEqual(weekKey('2026-03-01T23:00:00'), '2026-02-23', 'Sunday belongs to the prior week');
});

test('relativeDay labels today and yesterday', () => {
    const now = new Date('2026-03-04T09:00:00');
    assert.strictEqual(relativeDay('2026-03-04T20:00:00', now), 'Today');
    assert.strictEqual(relativeDay('2026-03-03T20:00:00', now), 'Yesterday');
    assert.ok(!['Today', 'Yesterday'].includes(relativeDay('2026-02-20T20:00:00', now)));
});

test('weekStreak counts consecutive training weeks and tolerates an empty current week', () => {
    const now = new Date('2026-03-04T09:00:00'); // Wednesday
    assert.strictEqual(weekStreak([], now), 0);
    assert.strictEqual(weekStreak(['2026-03-03', '2026-02-24', '2026-02-17'], now), 3);
    // Nothing yet this week, but the three before it are covered.
    assert.strictEqual(weekStreak(['2026-02-24', '2026-02-17', '2026-02-10'], now), 3);
    // A missed week ends the run.
    assert.strictEqual(weekStreak(['2026-03-03', '2026-02-17'], now), 1);
});

test('volumeByDay and volumeByWeek bucket into fixed windows', () => {
    const now = new Date('2026-03-04T09:00:00');
    const sets = [
        set({ performed_at: '2026-03-04T08:00:00', weight_kg: 100, reps: 5 }),
        set({ performed_at: '2026-03-02T08:00:00', weight_kg: 50, reps: 10 }),
        set({ performed_at: '2025-01-01T08:00:00', weight_kg: 999, reps: 9 })
    ];
    const days = volumeByDay(sets, 7, now);
    assert.strictEqual(days.length, 7);
    assert.strictEqual(days.at(-1).volumeKg, 500);
    assert.strictEqual(days.reduce((sum, d) => sum + d.volumeKg, 0), 1000, 'old sets fall outside the window');

    const weeks = volumeByWeek(sets, 4, now);
    assert.strictEqual(weeks.length, 4);
    assert.strictEqual(weeks.at(-1).volumeKg, 1000, 'both March sets are in the current week');
});

test('setsByMuscleGroup ranks groups by set count', () => {
    const breakdown = setsByMuscleGroup([
        set({ target_group: 'Chest' }), set({ target_group: 'Chest' }),
        set({ target_group: 'Back' }),
        set({ target_group: 'Chest', is_complete: 0 })
    ]);
    assert.deepStrictEqual(breakdown.map((g) => [g.group, g.sets]), [['Chest', 2], ['Back', 1]]);
});

test('oneRepMaxTrend keeps one best point per session, in date order', () => {
    const trend = oneRepMaxTrend([
        set({ session_id: 'a', performed_at: '2026-02-01', weight_kg: 100, reps: 5 }),
        set({ session_id: 'a', performed_at: '2026-02-01', weight_kg: 105, reps: 5 }),
        set({ session_id: 'b', performed_at: '2026-02-08', weight_kg: 102.5, reps: 5 })
    ]);
    assert.strictEqual(trend.length, 2);
    assert.strictEqual(trend[0].weightKg, 105);
    assert.ok(trend[0].date < trend[1].date);
});

test('personalRecords and detectPRs distinguish the three record types', () => {
    const history = [set({ weight_kg: 100, reps: 5 }), set({ weight_kg: 80, reps: 12 })];
    const records = personalRecords(history);
    assert.strictEqual(records.heaviest.weight_kg, 100);
    assert.strictEqual(records.bestVolume.weight_kg, 80, '80x12 is 960 kg vs 500 kg');

    assert.deepStrictEqual(detectPRs(set({ weight_kg: 102.5, reps: 5 }), history), ['weight', '1rm']);
    assert.deepStrictEqual(detectPRs(set({ weight_kg: 80, reps: 13 }), history), ['volume'],
        'more reps at a lighter load beats the volume record alone');
    assert.deepStrictEqual(detectPRs(set({ weight_kg: 100, reps: 5 }), history), [], 'matching a record is not beating it');
    assert.deepStrictEqual(detectPRs(set({ weight_kg: 100, reps: 5 }), []), ['weight', '1rm', 'volume'],
        'the first working set sets every record');
    assert.deepStrictEqual(detectPRs(set({ weight_kg: 200, reps: 5, is_warmup: 1 }), history), [],
        'warm-ups never count');
});

test('plateBreakdown loads one side of the bar', () => {
    assert.deepStrictEqual(plateBreakdown(100, 20).perSide, [25, 15], '40 kg a side, heaviest plates first');
    assert.deepStrictEqual(plateBreakdown(102.5, 20).perSide, [25, 15, 1.25]);
    assert.deepStrictEqual(plateBreakdown(20, 20), { perSide: [], remainderKg: 0 }, 'an empty bar needs no plates');
    assert.deepStrictEqual(plateBreakdown(15, 20), { perSide: [], remainderKg: 0 }, 'below the bar is unloadable');
    const odd = plateBreakdown(21, 20);
    assert.deepStrictEqual(odd.perSide, []);
    assert.ok(Math.abs(odd.remainderKg - 1) < 1e-6, 'reports what the plates cannot make up');
});

test('suggestProgression applies double progression', () => {
    assert.strictEqual(suggestProgression([]), null);
    const addReps = suggestProgression([set({ weight_kg: 100, reps: 8 })], { minReps: 6, maxReps: 12 });
    assert.strictEqual(addReps.action, 'increase-reps');
    assert.strictEqual(addReps.reps, 9);

    const addWeight = suggestProgression([set({ weight_kg: 100, reps: 12 })], { minReps: 6, maxReps: 12 });
    assert.strictEqual(addWeight.action, 'increase-weight');
    assert.strictEqual(addWeight.weightKg, 102.5);
    assert.strictEqual(addWeight.reps, 6);
});

test('formatDuration takes its unit words from the caller', () => {
    const fr = { h: ' h', m: ' min', s: ' s' };
    assert.strictEqual(formatDuration(45 * 1000, fr), '45 s');
    assert.strictEqual(formatDuration(48 * 60 * 1000, fr), '48 min');
    assert.strictEqual(formatDuration((72 * 60 + 30) * 1000, fr), '1 h 12 min');
});

test('relativeDay takes its labels and locale from the caller', () => {
    const now = new Date('2026-03-04T09:00:00');
    const fr = { today: 'Aujourd’hui', yesterday: 'Hier', locale: 'fr' };
    assert.strictEqual(relativeDay('2026-03-04T20:00:00', now, fr), 'Aujourd’hui');
    assert.strictEqual(relativeDay('2026-03-03T20:00:00', now, fr), 'Hier');
    assert.match(relativeDay('2026-02-20T20:00:00', now, fr), /févr/, 'older days use the given locale');
});
