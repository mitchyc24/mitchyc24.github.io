import test from 'node:test';
import assert from 'node:assert';
import initSqlJs from 'sql.js';

// Setup IndexedDB mock for Node.js
import 'fake-indexeddb/auto';

// Setup before importing db.js
globalThis.initSqlJs = initSqlJs;

// Dynamically import db.js to ensure hooks run
await import('../js/db.js');
const db = globalThis.dbModule;

test('Database Initialization and Seed Data', async (t) => {
    // Inject node-friendly sql.js init
    db.setSqlJs(await initSqlJs());

    // Init Database
    await db.initDB();

    const exercises = db.getAllExercises();

    assert.strictEqual(exercises.length, 25, 'Should have seeded exactly 25 exercises');

    const benchPress = exercises.find(ex => ex.name === 'Flat Barbell Bench Press');
    assert.ok(benchPress, 'Flat Barbell Bench Press should exist');
    assert.strictEqual(benchPress.target_group, 'Chest', 'Bench Press should target Chest');
});

test('Session and Set Logging', async (t) => {
    const sessionId = await db.startSession();
    assert.ok(sessionId, 'Should return a valid session ID');

    const exercises = db.getAllExercises();
    const squat = exercises.find(ex => ex.name === 'Barbell High-Bar Back Squat');

    const setId = await db.logSet(sessionId, squat.id, 100, 10, 1);
    assert.ok(setId, 'Should return a valid set ID');

    const sets = db.getSetsForSession(sessionId);
    assert.strictEqual(sets.length, 1, 'Should return 1 logged set');
    assert.strictEqual(sets[0].weight_kg, 100, 'Weight should match');
    assert.strictEqual(sets[0].reps, 10, 'Reps should match');

    await db.deleteSet(setId);
    const setsAfterDelete = db.getSetsForSession(sessionId);
    assert.strictEqual(setsAfterDelete.length, 0, 'Should have 0 sets after deletion');

    await db.endSession(sessionId);
    const recent = db.getRecentSessions();
    const session = recent.find(s => s.id === sessionId);
    assert.ok(session.end_time, 'Session should have an end time');
});