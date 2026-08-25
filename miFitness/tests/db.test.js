import test from 'node:test';
import assert from 'node:assert';
import initSqlJs from 'sql.js';
import 'fake-indexeddb/auto';

import * as db from '../js/db.js';

const SQL = await initSqlJs();
db.setSqlJs(SQL);

/** Fresh, seeded database for each test — IndexedDB is shared, so reset it. */
const freshDb = async () => {
    await db.initDB();
    await db.resetDatabase();
};

test('a new database seeds exercises and starter routines', async () => {
    await freshDb();

    const exercises = db.listExercises();
    assert.ok(exercises.length >= 30, 'the seed library should be substantial');

    const bench = exercises.find((e) => e.name === 'Flat Barbell Bench Press');
    assert.ok(bench, 'the bench press should be seeded');
    assert.strictEqual(bench.target_group, 'Chest');
    assert.strictEqual(bench.id, 'flat-barbell-bench-press', 'seeded ids are stable slugs');
    assert.strictEqual(bench.is_custom, 0);

    const routines = db.listRoutines();
    assert.deepStrictEqual(routines.map((r) => r.name), ['Leg Day', 'Pull Day', 'Push Day']);
    assert.ok(routines.every((r) => r.exercise_count >= 5));
});

test('exercise filters narrow by search, group and favourites', async () => {
    await freshDb();

    assert.ok(db.listExercises({ search: 'squat' }).every((e) => /squat/i.test(e.name)));
    assert.ok(db.listExercises({ group: 'Chest' }).every((e) => e.target_group === 'Chest'));
    assert.ok(db.listExercises({ equipment: 'Cable' }).every((e) => e.primary_equipment === 'Cable'));

    assert.strictEqual(db.listExercises({ favoritesOnly: true }).length, 0);
    await db.toggleFavorite('leg-press');
    const favorites = db.listExercises({ favoritesOnly: true });
    assert.deepStrictEqual(favorites.map((e) => e.id), ['leg-press']);
    assert.strictEqual(db.listExercises()[0].id, 'leg-press', 'favourites sort to the top');
});

test('custom exercises can be created, edited and removed', async () => {
    await freshDb();

    const id = await db.createExercise({
        name: 'Zercher Squat', target_group: 'Quads', primary_equipment: 'Barbell'
    });
    const created = db.getExercise(id);
    assert.strictEqual(created.name, 'Zercher Squat');
    assert.strictEqual(created.is_custom, 1);

    await db.updateExercise(id, { name: 'Zercher Squat (SSB)', rest_seconds: 180 });
    assert.strictEqual(db.getExercise(id).name, 'Zercher Squat (SSB)');
    assert.strictEqual(db.getExercise(id).rest_seconds, 180);

    assert.strictEqual(await db.deleteExercise(id), 'deleted');
    assert.strictEqual(db.getExercise(id), null);
});

test('an exercise with logged history is archived instead of deleted', async () => {
    await freshDb();

    const sessionId = await db.startSession();
    await db.addExerciseToSession(sessionId, 'leg-press');
    const setId = await db.addSet(sessionId, 'leg-press', { weightKg: 200, reps: 10 });
    await db.updateSet(setId, { isComplete: true });
    await db.endSession(sessionId);

    assert.strictEqual(await db.deleteExercise('leg-press'), 'archived');
    assert.strictEqual(db.getExercise('leg-press').is_archived, 1);
    assert.ok(!db.listExercises().some((e) => e.id === 'leg-press'), 'archived exercises are hidden');
    assert.ok(db.listExercises({ includeArchived: true }).some((e) => e.id === 'leg-press'));
});

test('sets are logged, corrected, renumbered and deleted', async () => {
    await freshDb();

    const sessionId = await db.startSession();
    await db.addExerciseToSession(sessionId, 'barbell-high-bar-back-squat');
    const first = await db.addSet(sessionId, 'barbell-high-bar-back-squat', { weightKg: 100, reps: 5 });
    const second = await db.addSet(sessionId, 'barbell-high-bar-back-squat', { weightKg: 100, reps: 5 });
    const third = await db.addSet(sessionId, 'barbell-high-bar-back-squat', { weightKg: 100, reps: 5 });

    assert.deepStrictEqual(db.getSetsForSession(sessionId).map((s) => s.set_order), [1, 2, 3]);

    await db.updateSet(second, { weightKg: 105, reps: 3, rpe: 9, isComplete: true });
    const updated = db.getSet(second);
    assert.strictEqual(updated.weight_kg, 105);
    assert.strictEqual(updated.reps, 3);
    assert.strictEqual(updated.rpe, 9);
    assert.strictEqual(updated.is_complete, 1);

    await db.deleteSet(first);
    assert.deepStrictEqual(db.getSetsForSession(sessionId).map((s) => s.id), [second, third]);
    assert.deepStrictEqual(db.getSetsForSession(sessionId).map((s) => s.set_order), [1, 2],
        'remaining sets are renumbered');
});

test('starting from a routine pre-fills the planned sets', async () => {
    await freshDb();

    const push = db.listRoutines().find((r) => r.name === 'Push Day');
    const sessionId = await db.startSession({ name: 'Push Day', routineId: push.id });

    const entries = db.getSessionExercises(sessionId);
    assert.strictEqual(entries.length, 5);
    assert.strictEqual(entries[0].exercise_id, 'flat-barbell-bench-press');
    assert.strictEqual(entries[0].sets.length, 4, 'four planned sets for the bench press');
    assert.ok(entries[0].sets.every((s) => s.is_complete === 0), 'planned sets start incomplete');
    assert.strictEqual(entries[0].sets[0].reps, 8, 'target reps are pre-filled');
});

test('finishing a workout discards planned sets that were never performed', async () => {
    await freshDb();

    const push = db.listRoutines().find((r) => r.name === 'Push Day');
    const sessionId = await db.startSession({ routineId: push.id });
    const planned = db.getSessionExercises(sessionId)[0].sets;
    await db.updateSet(planned[0].id, { weightKg: 80, reps: 8, isComplete: true });

    await db.endSession(sessionId);

    const kept = db.getSetsForSession(sessionId);
    assert.strictEqual(kept.length, 1, 'only the performed set survives');
    assert.strictEqual(kept[0].weight_kg, 80);
    assert.ok(db.getSession(sessionId).end_time);
    assert.strictEqual(db.getActiveSession(), null);
});

test('an unfinished workout is resumable as the active session', async () => {
    await freshDb();

    assert.strictEqual(db.getActiveSession(), null);
    const sessionId = await db.startSession({ name: 'Evening lift' });
    const active = db.getActiveSession();
    assert.strictEqual(active.id, sessionId);
    assert.strictEqual(active.name, 'Evening lift');

    await db.endSession(sessionId);
    assert.strictEqual(db.getActiveSession(), null);
});

test('session lists carry the volume and count rollups', async () => {
    await freshDb();

    const sessionId = await db.startSession();
    await db.addExerciseToSession(sessionId, 'leg-press');
    await db.addExerciseToSession(sessionId, 'lying-leg-curl');
    for (const [exercise, weight, reps, warmup] of [
        ['leg-press', 200, 10, 0], ['leg-press', 200, 10, 0], ['lying-leg-curl', 50, 12, 0],
        ['leg-press', 60, 15, 1]
    ]) {
        const id = await db.addSet(sessionId, exercise, { weightKg: weight, reps, isWarmup: warmup });
        await db.updateSet(id, { isComplete: true });
    }
    await db.endSession(sessionId);

    const [session] = db.listSessions();
    assert.strictEqual(session.set_count, 4, 'warm-ups count as sets performed');
    assert.strictEqual(session.exercise_count, 2);
    assert.strictEqual(session.volume_kg, 200 * 10 * 2 + 50 * 12, 'warm-up volume is excluded');
    assert.strictEqual(db.countSessions(), 1);
});

test('previous performance looks past the current session', async () => {
    await freshDb();

    const older = await db.startSession();
    await db.addExerciseToSession(older, 'flat-barbell-bench-press');
    const oldSet = await db.addSet(older, 'flat-barbell-bench-press', { weightKg: 80, reps: 8 });
    await db.updateSet(oldSet, { isComplete: true });
    await db.endSession(older);

    const current = await db.startSession();
    await db.addExerciseToSession(current, 'flat-barbell-bench-press');
    await db.addSet(current, 'flat-barbell-bench-press', { weightKg: 0, reps: 0 });

    const previous = db.getPreviousPerformance('flat-barbell-bench-press', current);
    assert.strictEqual(previous.sessionId, older);
    assert.deepStrictEqual(previous.sets.map((s) => [s.weight_kg, s.reps]), [[80, 8]]);

    assert.strictEqual(db.getPreviousPerformance('conventional-deadlift', current), null,
        'an exercise with no history has no previous performance');
});

test('exercise history and lifetime totals only count completed sets', async () => {
    await freshDb();

    const sessionId = await db.startSession();
    await db.addExerciseToSession(sessionId, 'pull-up');
    const done = await db.addSet(sessionId, 'pull-up', { weightKg: 90, reps: 10 });
    await db.updateSet(done, { isComplete: true });
    await db.addSet(sessionId, 'pull-up', { weightKg: 90, reps: 10 }); // left incomplete
    await db.endSession(sessionId);

    const history = db.getExerciseHistory('pull-up');
    assert.strictEqual(history.length, 1);
    assert.ok(history[0].performed_at, 'history rows carry the session date for charting');

    const totals = db.getLifetimeTotals();
    assert.strictEqual(totals.sessions, 1);
    assert.strictEqual(totals.sets, 1);
    assert.strictEqual(totals.volume_kg, 900);
    assert.strictEqual(totals.reps, 10);
});

test('session exercises can be reordered and removed', async () => {
    await freshDb();

    const sessionId = await db.startSession();
    await db.addExerciseToSession(sessionId, 'leg-press');
    await db.addExerciseToSession(sessionId, 'hack-squat');
    await db.addExerciseToSession(sessionId, 'lying-leg-curl');
    await db.addExerciseToSession(sessionId, 'leg-press'); // duplicate is a no-op

    assert.deepStrictEqual(db.getSessionExercises(sessionId).map((e) => e.exercise_id),
        ['leg-press', 'hack-squat', 'lying-leg-curl']);

    await db.moveSessionExercise(sessionId, 'lying-leg-curl', -1);
    assert.deepStrictEqual(db.getSessionExercises(sessionId).map((e) => e.exercise_id),
        ['leg-press', 'lying-leg-curl', 'hack-squat']);

    await db.moveSessionExercise(sessionId, 'leg-press', -1);
    assert.deepStrictEqual(db.getSessionExercises(sessionId).map((e) => e.exercise_id),
        ['leg-press', 'lying-leg-curl', 'hack-squat'], 'moving past the top is a no-op');

    await db.addSet(sessionId, 'hack-squat', { weightKg: 100, reps: 10 });
    await db.removeExerciseFromSession(sessionId, 'hack-squat');
    assert.deepStrictEqual(db.getSessionExercises(sessionId).map((e) => e.exercise_id),
        ['leg-press', 'lying-leg-curl']);
    assert.strictEqual(db.getSetsForSession(sessionId).length, 0, 'its sets go with it');
});

test('routines can be saved, edited, deleted and built from a workout', async () => {
    await freshDb();

    const id = await db.saveRoutine({
        name: 'Upper A',
        description: 'Heavy upper body.',
        exercises: [
            { exercise_id: 'flat-barbell-bench-press', target_sets: 5, target_reps: 5 },
            { exercise_id: 'pull-up', target_sets: 4, target_reps: 8 }
        ]
    });
    const routine = db.getRoutine(id);
    assert.strictEqual(routine.name, 'Upper A');
    assert.strictEqual(routine.exercises.length, 2);
    assert.strictEqual(routine.exercises[0].target_sets, 5);
    assert.strictEqual(routine.exercises[0].name, 'Flat Barbell Bench Press', 'joined with the exercise');

    await db.saveRoutine({ id, name: 'Upper A', exercises: [{ exercise_id: 'pull-up', target_sets: 3, target_reps: 10 }] });
    assert.strictEqual(db.getRoutine(id).exercises.length, 1, 'saving replaces the exercise list');

    const sessionId = await db.startSession();
    await db.addExerciseToSession(sessionId, 'seated-cable-row');
    for (const reps of [10, 10, 8]) {
        const setId = await db.addSet(sessionId, 'seated-cable-row', { weightKg: 70, reps });
        await db.updateSet(setId, { isComplete: true });
    }
    await db.endSession(sessionId);

    const derivedId = await db.routineFromSession(sessionId, 'Row Day');
    const derived = db.getRoutine(derivedId);
    assert.strictEqual(derived.exercises.length, 1);
    assert.strictEqual(derived.exercises[0].target_sets, 3);
    assert.strictEqual(derived.exercises[0].target_reps, 9, 'targets average the reps actually performed');

    await db.deleteRoutine(id);
    assert.strictEqual(db.getRoutine(id), null);
});

test('deleting a session takes its sets with it', async () => {
    await freshDb();

    const sessionId = await db.startSession();
    await db.addExerciseToSession(sessionId, 'plank');
    await db.addSet(sessionId, 'plank', { weightKg: 0, reps: 60 });
    await db.endSession(sessionId);

    await db.deleteSession(sessionId);
    assert.strictEqual(db.getSession(sessionId), null);
    assert.strictEqual(db.getSetsForSession(sessionId).length, 0);
    assert.strictEqual(db.getSessionExercises(sessionId).length, 0);
});

test('settings and body weight round-trip', async () => {
    await freshDb();

    assert.deepStrictEqual(db.getAllSettings(), {});
    await db.saveSetting('units', 'lb');
    await db.saveSetting('restSeconds', 120);
    await db.saveSetting('units', 'kg');
    assert.deepStrictEqual(db.getAllSettings(), { units: 'kg', restSeconds: '120' });

    const id = await db.logBodyWeight(82.4, 'morning');
    const entries = db.listBodyWeight();
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].weight_kg, 82.4);
    await db.deleteBodyWeight(id);
    assert.strictEqual(db.listBodyWeight().length, 0);
});

test('export and import round-trip a database', async () => {
    await freshDb();

    const sessionId = await db.startSession({ name: 'Exported workout' });
    await db.addExerciseToSession(sessionId, 'cable-crunch');
    const setId = await db.addSet(sessionId, 'cable-crunch', { weightKg: 40, reps: 15 });
    await db.updateSet(setId, { isComplete: true });
    await db.endSession(sessionId);

    const blob = db.exportDatabase();
    const bytes = await blob.arrayBuffer();

    const json = db.exportJson();
    assert.strictEqual(json.app, 'MiFitness');
    assert.strictEqual(json.sessions.length, 1);
    assert.strictEqual(json.sets.length, 1);

    await db.resetDatabase();
    assert.strictEqual(db.countSessions(), 0);

    await db.importDatabase(bytes);
    assert.strictEqual(db.countSessions(), 1);
    assert.strictEqual(db.listSessions()[0].name, 'Exported workout');
    assert.strictEqual(db.getSetsForSession(sessionId).length, 1);
});

test('a prototype database migrates forward without losing history', async () => {
    await freshDb();

    // Rebuild the original v1 schema and data by hand.
    const legacy = new SQL.Database();
    legacy.run(`
        CREATE TABLE exercises (
            id TEXT PRIMARY KEY, name TEXT NOT NULL,
            target_group TEXT NOT NULL, primary_equipment TEXT NOT NULL
        );
        CREATE TABLE workout_sessions (
            id TEXT PRIMARY KEY, start_time TEXT NOT NULL, end_time TEXT, notes TEXT
        );
        CREATE TABLE workout_sets (
            id TEXT PRIMARY KEY, session_id TEXT NOT NULL, exercise_id TEXT NOT NULL,
            set_order INTEGER NOT NULL, weight_kg REAL NOT NULL, reps INTEGER NOT NULL,
            rpe REAL, is_warmup INTEGER DEFAULT 0, created_at TEXT NOT NULL
        );
        INSERT INTO exercises VALUES ('legacy-ex', 'Legacy Bench', 'Chest', 'Barbell');
        INSERT INTO workout_sessions VALUES
            ('legacy-session', '2026-01-05T10:00:00.000Z', '2026-01-05T11:00:00.000Z', NULL);
        INSERT INTO workout_sets VALUES
            ('legacy-set-1', 'legacy-session', 'legacy-ex', 1, 80, 8, NULL, 0, '2026-01-05T10:10:00.000Z'),
            ('legacy-set-2', 'legacy-session', 'legacy-ex', 2, 80, 7, NULL, 0, '2026-01-05T10:15:00.000Z');
    `);
    const bytes = legacy.export();
    legacy.close();

    await db.importDatabase(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

    assert.strictEqual(db.queryOne('PRAGMA user_version').user_version, 2, 'schema version is stamped');

    const sets = db.getSetsForSession('legacy-session');
    assert.strictEqual(sets.length, 2, 'logged sets survive');
    assert.ok(sets.every((s) => s.is_complete === 1), 'prototype sets were always performed');

    const entries = db.getSessionExercises('legacy-session');
    assert.deepStrictEqual(entries.map((e) => e.exercise_id), ['legacy-ex'],
        'the exercise list is rebuilt from the logged sets');
    assert.strictEqual(entries[0].sets.length, 2);

    assert.strictEqual(db.listSessions()[0].volume_kg, 80 * 8 + 80 * 7);
    assert.strictEqual(db.getLifetimeTotals().sessions, 1);

    // The tables added after v1 exist and are usable.
    await db.saveSetting('units', 'kg');
    assert.deepStrictEqual(db.getAllSettings(), { units: 'kg' });
    assert.strictEqual(db.listRoutines().length, 0, 'migration does not inject starter routines');
});
