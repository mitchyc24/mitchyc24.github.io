// db.js — SQLite (via sql.js) persisted as a single blob in IndexedDB.
//
// The whole database is a few tens of KB even after years of training, so
// exporting the blob after each write is cheap and gives us a file the user
// can back up or move between devices. Writes are debounced so a fast set of
// taps doesn't serialize the database once per keystroke.

const IDB_NAME = 'mifitness_db';
const IDB_STORE = 'files';
const DB_FILE_NAME = 'mifitness.sqlite';
const SCHEMA_VERSION = 2;
const SAVE_DEBOUNCE_MS = 250;

let SQL = null;
let db = null;
let saveTimer = null;

/** Test seam: inject an already-initialised sql.js module. */
export const setSqlJs = (module) => { SQL = module; };

export const getDb = () => db;

const loadSqlJs = async () => {
    if (SQL) return SQL;
    const factory = globalThis.initSqlJs;
    if (typeof factory !== 'function') {
        throw new Error('sql.js is not loaded — vendor/sql-wasm.js must run before the app.');
    }
    SQL = await factory({ locateFile: (file) => `vendor/${file}` });
    return SQL;
};

// --- IndexedDB blob storage ----------------------------------------------

const openIdb = () => new Promise((resolve, reject) => {
    const api = globalThis.indexedDB;
    if (!api) {
        reject(new Error('IndexedDB is unavailable — MiFitness cannot persist data here.'));
        return;
    }
    const request = api.open(IDB_NAME, 1);
    request.onupgradeneeded = (event) => {
        const idb = event.target.result;
        if (!idb.objectStoreNames.contains(IDB_STORE)) idb.createObjectStore(IDB_STORE);
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
});

const readBlob = async () => {
    const idb = await openIdb();
    return new Promise((resolve, reject) => {
        const request = idb.transaction([IDB_STORE], 'readonly').objectStore(IDB_STORE).get(DB_FILE_NAME);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject(event.target.error);
    });
};

const writeBlob = async (bytes) => {
    const idb = await openIdb();
    return new Promise((resolve, reject) => {
        const tx = idb.transaction([IDB_STORE], 'readwrite');
        tx.objectStore(IDB_STORE).put(bytes, DB_FILE_NAME);
        tx.oncomplete = () => resolve();
        tx.onerror = (event) => reject(event.target.error);
    });
};

/** Persist immediately, cancelling any debounced save. */
export const flush = async () => {
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    if (!db) return;
    await writeBlob(db.export());
};

/**
 * Queue a write. Callers get a resolved promise straight away — the UI should
 * never wait on the debounce, and reads all come from the in-memory database.
 * `flush()` covers the moments where durability actually matters.
 */
const save = () => {
    if (!db) return Promise.resolve();
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveTimer = null;
        if (!db) return;
        writeBlob(db.export()).catch((error) => console.error('miFitness: save failed', error));
    }, SAVE_DEBOUNCE_MS);
    // Under Node (tests) a pending save should not hold the process open.
    saveTimer.unref?.();
    return Promise.resolve();
};

// --- Query helpers --------------------------------------------------------

const rowsFrom = (result) => {
    if (!result || result.length === 0) return [];
    const { columns, values } = result[0];
    return values.map((row) => Object.fromEntries(columns.map((col, i) => [col, row[i]])));
};

export const query = (sql, params = []) => rowsFrom(db.exec(sql, params));

export const queryOne = (sql, params = []) => query(sql, params)[0] || null;

const run = (sql, params = []) => db.run(sql, params);

const uuid = () => globalThis.crypto.randomUUID();

const now = () => new Date().toISOString();

const tableExists = (name) => !!queryOne(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [name]
);

const columnExists = (table, column) =>
    query(`PRAGMA table_info(${table})`).some((c) => c.name === column);

const addColumn = (table, column, definition) => {
    if (!columnExists(table, column)) run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
};

// --- Schema ---------------------------------------------------------------

const createSchema = () => {
    db.run(`
        CREATE TABLE IF NOT EXISTS exercises (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            target_group TEXT NOT NULL,
            primary_equipment TEXT NOT NULL,
            notes TEXT,
            rest_seconds INTEGER,
            is_custom INTEGER NOT NULL DEFAULT 0,
            is_favorite INTEGER NOT NULL DEFAULT 0,
            is_archived INTEGER NOT NULL DEFAULT 0,
            created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS workout_sessions (
            id TEXT PRIMARY KEY,
            name TEXT,
            routine_id TEXT,
            start_time TEXT NOT NULL,
            end_time TEXT,
            notes TEXT
        );

        CREATE TABLE IF NOT EXISTS workout_sets (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            exercise_id TEXT NOT NULL,
            set_order INTEGER NOT NULL,
            weight_kg REAL NOT NULL DEFAULT 0,
            reps INTEGER NOT NULL DEFAULT 0,
            rpe REAL,
            is_warmup INTEGER NOT NULL DEFAULT 0,
            is_complete INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY(session_id) REFERENCES workout_sessions(id),
            FOREIGN KEY(exercise_id) REFERENCES exercises(id)
        );

        CREATE TABLE IF NOT EXISTS session_exercises (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            exercise_id TEXT NOT NULL,
            position INTEGER NOT NULL,
            notes TEXT,
            FOREIGN KEY(session_id) REFERENCES workout_sessions(id)
        );

        CREATE TABLE IF NOT EXISTS routines (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS routine_exercises (
            id TEXT PRIMARY KEY,
            routine_id TEXT NOT NULL,
            exercise_id TEXT NOT NULL,
            position INTEGER NOT NULL,
            target_sets INTEGER,
            target_reps INTEGER,
            FOREIGN KEY(routine_id) REFERENCES routines(id)
        );

        CREATE TABLE IF NOT EXISTS body_weight (
            id TEXT PRIMARY KEY,
            logged_at TEXT NOT NULL,
            weight_kg REAL NOT NULL,
            note TEXT
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_sets_session ON workout_sets(session_id);
        CREATE INDEX IF NOT EXISTS idx_sets_exercise ON workout_sets(exercise_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_start ON workout_sessions(start_time);
        CREATE INDEX IF NOT EXISTS idx_session_exercises ON session_exercises(session_id);
    `);
};

/**
 * Bring an older database up to the current schema. Version 1 is the original
 * prototype, which had no user_version and only three tables.
 */
const migrate = () => {
    const version = queryOne('PRAGMA user_version')?.user_version ?? 0;
    if (version >= SCHEMA_VERSION) return;

    // Everything below is additive, so running createSchema first fills in the
    // tables introduced after v1 and leaves existing data untouched.
    createSchema();

    if (tableExists('exercises')) {
        addColumn('exercises', 'notes', 'TEXT');
        addColumn('exercises', 'rest_seconds', 'INTEGER');
        addColumn('exercises', 'is_custom', 'INTEGER NOT NULL DEFAULT 0');
        addColumn('exercises', 'is_favorite', 'INTEGER NOT NULL DEFAULT 0');
        addColumn('exercises', 'is_archived', 'INTEGER NOT NULL DEFAULT 0');
        addColumn('exercises', 'created_at', 'TEXT');
    }
    if (tableExists('workout_sessions')) {
        addColumn('workout_sessions', 'name', 'TEXT');
        addColumn('workout_sessions', 'routine_id', 'TEXT');
    }
    if (tableExists('workout_sets')) {
        addColumn('workout_sets', 'is_complete', 'INTEGER NOT NULL DEFAULT 0');
        // Prototype rows were only ever written once they had been performed.
        run('UPDATE workout_sets SET is_complete = 1 WHERE is_complete = 0');
    }

    // Prototype sessions had no per-session exercise list; rebuild it from the
    // sets that were logged so old workouts still open in the new UI.
    const orphaned = query(`
        SELECT DISTINCT ws.session_id, ws.exercise_id, MIN(ws.created_at) AS first_at
        FROM workout_sets ws
        WHERE NOT EXISTS (
            SELECT 1 FROM session_exercises se
            WHERE se.session_id = ws.session_id AND se.exercise_id = ws.exercise_id
        )
        GROUP BY ws.session_id, ws.exercise_id
        ORDER BY first_at
    `);
    const positions = new Map();
    for (const row of orphaned) {
        const position = positions.get(row.session_id) ?? 0;
        positions.set(row.session_id, position + 1);
        run(
            'INSERT INTO session_exercises (id, session_id, exercise_id, position) VALUES (?, ?, ?, ?)',
            [uuid(), row.session_id, row.exercise_id, position]
        );
    }

    run(`PRAGMA user_version = ${SCHEMA_VERSION}`);
};

// --- Seed data ------------------------------------------------------------

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Stable slug ids keep exports diffable and make seeded exercises easy to
// reference across devices.
const SEED_EXERCISES = [
    ['Flat Barbell Bench Press', 'Chest', 'Barbell', 150],
    ['Incline Dumbbell Press', 'Chest', 'Dumbbell', 120],
    ['Low-to-High Cable Flye', 'Chest', 'Cable', 75],
    ['Dips (Chest-Leaning)', 'Chest', 'Bodyweight', 120],
    ['Machine Chest Press', 'Chest', 'Machine', 90],
    ['Barbell Bent-Over Row', 'Back', 'Barbell', 150],
    ['Neutral-Grip Lat Pulldown', 'Back', 'Cable', 90],
    ['Chest-Supported T-Bar Row', 'Back', 'Machine', 120],
    ['Single-Arm Dumbbell Row', 'Back', 'Dumbbell', 90],
    ['Pull-Up', 'Back', 'Bodyweight', 150],
    ['Seated Cable Row', 'Back', 'Cable', 90],
    ['Conventional Deadlift', 'Back', 'Barbell', 210],
    ['Barbell High-Bar Back Squat', 'Quads', 'Barbell', 180],
    ['Leg Press', 'Quads', 'Machine', 120],
    ['Bulgarian Split Squat', 'Quads', 'Dumbbell', 120],
    ['Seated Leg Extension', 'Quads', 'Machine', 75],
    ['Hack Squat', 'Quads', 'Machine', 150],
    ['Romanian Deadlift', 'Hamstrings & Glutes', 'Barbell', 150],
    ['Lying Leg Curl', 'Hamstrings & Glutes', 'Machine', 75],
    ['Seated Leg Curl', 'Hamstrings & Glutes', 'Machine', 75],
    ['Barbell Hip Thrust', 'Hamstrings & Glutes', 'Barbell', 120],
    ['Seated Dumbbell Overhead Press', 'Shoulders', 'Dumbbell', 120],
    ['Standing Overhead Press', 'Shoulders', 'Barbell', 150],
    ['Standing Cable Lateral Raise', 'Shoulders', 'Cable', 60],
    ['Dumbbell Lateral Raise', 'Shoulders', 'Dumbbell', 60],
    ['Incline Rear Delt Dumbbell Flye', 'Shoulders', 'Dumbbell', 60],
    ['Standing Incline Dumbbell Curl', 'Biceps', 'Dumbbell', 75],
    ['EZ-Bar Preacher Curl', 'Biceps', 'Barbell', 75],
    ['Cable Hammer Curl', 'Biceps', 'Cable', 60],
    ['Dual-Rope Cable Triceps Pushdown', 'Triceps', 'Cable', 60],
    ['Overhead Cable Triceps Extension', 'Triceps', 'Cable', 60],
    ['Close-Grip Bench Press', 'Triceps', 'Barbell', 120],
    ['Skull Crusher', 'Triceps', 'Barbell', 75],
    ['Standing Calf Raise', 'Calves', 'Machine', 60],
    ['Seated Calf Raise', 'Calves', 'Machine', 60],
    ['Hanging Leg Raise', 'Core', 'Bodyweight', 60],
    ['Cable Crunch', 'Core', 'Cable', 60],
    ['Plank', 'Core', 'Bodyweight', 60]
];

export const MUSCLE_GROUPS = [
    'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps',
    'Quads', 'Hamstrings & Glutes', 'Calves', 'Core', 'Cardio', 'Other'
];

export const EQUIPMENT_TYPES = [
    'Barbell', 'Dumbbell', 'Machine', 'Cable', 'Bodyweight', 'Kettlebell', 'Band', 'Other'
];

const seedExercises = () => {
    const stmt = db.prepare(`
        INSERT INTO exercises (id, name, target_group, primary_equipment, rest_seconds, is_custom, created_at)
        VALUES (?, ?, ?, ?, ?, 0, ?)
    `);
    const createdAt = now();
    for (const [name, group, equipment, rest] of SEED_EXERCISES) {
        stmt.run([slug(name), name, group, equipment, rest, createdAt]);
    }
    stmt.free();
};

// Stable ids here too, so the UI can offer a translated display name for a
// starter routine the user has not renamed.
const DEFAULT_ROUTINES = [
    ['routine-push', 'Push Day', 'Chest, shoulders and triceps.', [
        ['flat-barbell-bench-press', 4, 8],
        ['seated-dumbbell-overhead-press', 3, 10],
        ['incline-dumbbell-press', 3, 10],
        ['standing-cable-lateral-raise', 3, 15],
        ['dual-rope-cable-triceps-pushdown', 3, 12]
    ]],
    ['routine-pull', 'Pull Day', 'Back and biceps.', [
        ['barbell-bent-over-row', 4, 8],
        ['neutral-grip-lat-pulldown', 3, 10],
        ['single-arm-dumbbell-row', 3, 10],
        ['incline-rear-delt-dumbbell-flye', 3, 15],
        ['ez-bar-preacher-curl', 3, 12]
    ]],
    ['routine-legs', 'Leg Day', 'Quads, hamstrings and calves.', [
        ['barbell-high-bar-back-squat', 4, 6],
        ['romanian-deadlift', 3, 8],
        ['leg-press', 3, 12],
        ['lying-leg-curl', 3, 12],
        ['standing-calf-raise', 4, 15]
    ]]
];

/**
 * The English names the seed wrote. Display code compares against these to
 * tell an untouched seed row from one the user has renamed — only the former
 * may be shown under a translated name.
 */
export const SEED_EXERCISE_NAMES = Object.fromEntries(
    SEED_EXERCISES.map(([name]) => [slug(name), name])
);

export const SEED_ROUTINE_NAMES = Object.fromEntries(
    DEFAULT_ROUTINES.map(([id, name]) => [id, name])
);

export const SEED_ROUTINE_DESCRIPTIONS = Object.fromEntries(
    DEFAULT_ROUTINES.map(([id, , description]) => [id, description])
);

const seedRoutines = () => {
    const createdAt = now();
    for (const [routineId, name, description, exercises] of DEFAULT_ROUTINES) {
        run(
            'INSERT INTO routines (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
            [routineId, name, description, createdAt, createdAt]
        );
        exercises.forEach(([exerciseId, sets, reps], index) => {
            run(
                `INSERT INTO routine_exercises (id, routine_id, exercise_id, position, target_sets, target_reps)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [uuid(), routineId, exerciseId, index, sets, reps]
            );
        });
    }
};

// --- Lifecycle ------------------------------------------------------------

export const initDB = async () => {
    await loadSqlJs();
    const saved = await readBlob();
    if (saved) {
        db = new SQL.Database(saved);
        migrate();
        await flush();
    } else {
        db = new SQL.Database();
        createSchema();
        seedExercises();
        seedRoutines();
        run(`PRAGMA user_version = ${SCHEMA_VERSION}`);
        await flush();
    }
    return db;
};

export const exportDatabase = () => new Blob([db.export()], { type: 'application/x-sqlite3' });

export const importDatabase = async (arrayBuffer) => {
    const candidate = new SQL.Database(new Uint8Array(arrayBuffer));
    // Validate before swapping so a bad file can't wipe a working database.
    candidate.exec('SELECT COUNT(*) FROM exercises');
    if (db) db.close();
    db = candidate;
    migrate();
    await flush();
};

export const resetDatabase = async () => {
    if (db) db.close();
    db = new SQL.Database();
    createSchema();
    seedExercises();
    seedRoutines();
    run(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    await flush();
};

export const closeDB = () => {
    if (db) db.close();
    db = null;
};

// --- Settings -------------------------------------------------------------

export const getAllSettings = () => {
    const rows = query('SELECT key, value FROM settings');
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
};

export const saveSetting = async (key, value) => {
    run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [key, String(value)]);
    await save();
};

// --- Exercises ------------------------------------------------------------

export const listExercises = ({ search = '', group = '', equipment = '', favoritesOnly = false, includeArchived = false } = {}) => {
    const clauses = [];
    const params = [];
    if (!includeArchived) clauses.push('e.is_archived = 0');
    if (search) {
        clauses.push('LOWER(e.name) LIKE ?');
        params.push(`%${search.toLowerCase()}%`);
    }
    if (group) {
        clauses.push('e.target_group = ?');
        params.push(group);
    }
    if (equipment) {
        clauses.push('e.primary_equipment = ?');
        params.push(equipment);
    }
    if (favoritesOnly) clauses.push('e.is_favorite = 1');
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return query(`
        SELECT e.*,
               (SELECT COUNT(*) FROM workout_sets s WHERE s.exercise_id = e.id AND s.is_complete = 1) AS set_count,
               (SELECT MAX(s.created_at) FROM workout_sets s WHERE s.exercise_id = e.id AND s.is_complete = 1) AS last_performed
        FROM exercises e
        ${where}
        ORDER BY e.is_favorite DESC, e.target_group, e.name
    `, params);
};

export const getExercise = (id) => queryOne('SELECT * FROM exercises WHERE id = ?', [id]);

export const createExercise = async ({ name, target_group, primary_equipment, notes = '', rest_seconds = null }) => {
    const id = uuid();
    run(`INSERT INTO exercises (id, name, target_group, primary_equipment, notes, rest_seconds, is_custom, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        [id, name.trim(), target_group, primary_equipment, notes, rest_seconds, now()]);
    await save();
    return id;
};

export const updateExercise = async (id, fields) => {
    const allowed = ['name', 'target_group', 'primary_equipment', 'notes', 'rest_seconds', 'is_favorite', 'is_archived'];
    const entries = Object.entries(fields).filter(([key]) => allowed.includes(key));
    if (entries.length === 0) return;
    const assignments = entries.map(([key]) => `${key} = ?`).join(', ');
    run(`UPDATE exercises SET ${assignments} WHERE id = ?`, [...entries.map(([, v]) => v), id]);
    await save();
};

export const toggleFavorite = async (id) => {
    run('UPDATE exercises SET is_favorite = CASE is_favorite WHEN 1 THEN 0 ELSE 1 END WHERE id = ?', [id]);
    await save();
};

/** Exercises with logged sets are archived rather than deleted, to keep history intact. */
export const deleteExercise = async (id) => {
    const used = queryOne('SELECT COUNT(*) AS n FROM workout_sets WHERE exercise_id = ?', [id]).n > 0;
    if (used) {
        run('UPDATE exercises SET is_archived = 1 WHERE id = ?', [id]);
    } else {
        run('DELETE FROM routine_exercises WHERE exercise_id = ?', [id]);
        run('DELETE FROM exercises WHERE id = ?', [id]);
    }
    await save();
    return used ? 'archived' : 'deleted';
};

// --- Sessions -------------------------------------------------------------

export const getActiveSession = () =>
    queryOne('SELECT * FROM workout_sessions WHERE end_time IS NULL ORDER BY start_time DESC LIMIT 1');

export const getSession = (id) => queryOne('SELECT * FROM workout_sessions WHERE id = ?', [id]);

export const startSession = async ({ name = null, routineId = null } = {}) => {
    const id = uuid();
    run('INSERT INTO workout_sessions (id, name, routine_id, start_time) VALUES (?, ?, ?, ?)',
        [id, name, routineId, now()]);

    if (routineId) {
        const planned = query(
            'SELECT * FROM routine_exercises WHERE routine_id = ? ORDER BY position', [routineId]
        );
        planned.forEach((row, index) => {
            run('INSERT INTO session_exercises (id, session_id, exercise_id, position) VALUES (?, ?, ?, ?)',
                [uuid(), id, row.exercise_id, index]);
            for (let i = 0; i < (row.target_sets || 0); i += 1) {
                run(`INSERT INTO workout_sets (id, session_id, exercise_id, set_order, weight_kg, reps, created_at)
                     VALUES (?, ?, ?, ?, 0, ?, ?)`,
                    [uuid(), id, row.exercise_id, i + 1, row.target_reps || 0, now()]);
            }
        });
    }
    await flush();
    return id;
};

export const endSession = async (id) => {
    // Planned-but-never-performed sets would otherwise pollute the history.
    run('DELETE FROM workout_sets WHERE session_id = ? AND is_complete = 0', [id]);
    run('UPDATE workout_sessions SET end_time = ? WHERE id = ?', [now(), id]);
    await flush();
};

export const updateSession = async (id, { name, notes }) => {
    if (name !== undefined) run('UPDATE workout_sessions SET name = ? WHERE id = ?', [name, id]);
    if (notes !== undefined) run('UPDATE workout_sessions SET notes = ? WHERE id = ?', [notes, id]);
    await save();
};

export const deleteSession = async (id) => {
    run('DELETE FROM workout_sets WHERE session_id = ?', [id]);
    run('DELETE FROM session_exercises WHERE session_id = ?', [id]);
    run('DELETE FROM workout_sessions WHERE id = ?', [id]);
    await flush();
};

/** Finished sessions, newest first, with the rollups the history list shows. */
export const listSessions = ({ limit = 20, offset = 0 } = {}) => query(`
    SELECT s.*,
           (SELECT COUNT(*) FROM workout_sets ws WHERE ws.session_id = s.id AND ws.is_complete = 1) AS set_count,
           (SELECT COUNT(DISTINCT ws.exercise_id) FROM workout_sets ws WHERE ws.session_id = s.id AND ws.is_complete = 1) AS exercise_count,
           (SELECT COALESCE(SUM(ws.weight_kg * ws.reps), 0) FROM workout_sets ws
             WHERE ws.session_id = s.id AND ws.is_complete = 1 AND ws.is_warmup = 0) AS volume_kg
    FROM workout_sessions s
    WHERE s.end_time IS NOT NULL
    ORDER BY s.start_time DESC
    LIMIT ? OFFSET ?
`, [limit, offset]);

export const countSessions = () =>
    queryOne('SELECT COUNT(*) AS n FROM workout_sessions WHERE end_time IS NOT NULL').n;

/** Exercises attached to a session, in display order, with their sets. */
export const getSessionExercises = (sessionId) => {
    const rows = query(`
        SELECT se.id AS entry_id, se.exercise_id, se.position, se.notes,
               e.name, e.target_group, e.primary_equipment, e.rest_seconds
        FROM session_exercises se
        JOIN exercises e ON e.id = se.exercise_id
        WHERE se.session_id = ?
        ORDER BY se.position
    `, [sessionId]);
    const sets = getSetsForSession(sessionId);
    return rows.map((row) => ({
        ...row,
        sets: sets.filter((s) => s.exercise_id === row.exercise_id)
    }));
};

export const addExerciseToSession = async (sessionId, exerciseId) => {
    const existing = queryOne(
        'SELECT id FROM session_exercises WHERE session_id = ? AND exercise_id = ?', [sessionId, exerciseId]
    );
    if (existing) return existing.id;
    const position = queryOne(
        'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM session_exercises WHERE session_id = ?', [sessionId]
    ).next;
    const id = uuid();
    run('INSERT INTO session_exercises (id, session_id, exercise_id, position) VALUES (?, ?, ?, ?)',
        [id, sessionId, exerciseId, position]);
    await save();
    return id;
};

export const removeExerciseFromSession = async (sessionId, exerciseId) => {
    run('DELETE FROM workout_sets WHERE session_id = ? AND exercise_id = ?', [sessionId, exerciseId]);
    run('DELETE FROM session_exercises WHERE session_id = ? AND exercise_id = ?', [sessionId, exerciseId]);
    await save();
};

export const setSessionExerciseNotes = async (sessionId, exerciseId, notes) => {
    run('UPDATE session_exercises SET notes = ? WHERE session_id = ? AND exercise_id = ?',
        [notes, sessionId, exerciseId]);
    await save();
};

export const moveSessionExercise = async (sessionId, exerciseId, direction) => {
    const rows = query('SELECT * FROM session_exercises WHERE session_id = ? ORDER BY position', [sessionId]);
    const index = rows.findIndex((r) => r.exercise_id === exerciseId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= rows.length) return;
    [rows[index], rows[target]] = [rows[target], rows[index]];
    rows.forEach((row, position) => {
        run('UPDATE session_exercises SET position = ? WHERE id = ?', [position, row.id]);
    });
    await save();
};

// --- Sets -----------------------------------------------------------------

export const getSetsForSession = (sessionId) => query(`
    SELECT ws.*, e.name AS exercise_name, e.target_group, s.start_time AS performed_at
    FROM workout_sets ws
    JOIN exercises e ON e.id = ws.exercise_id
    JOIN workout_sessions s ON s.id = ws.session_id
    WHERE ws.session_id = ?
    ORDER BY ws.exercise_id, ws.set_order, ws.created_at
`, [sessionId]);

export const addSet = async (sessionId, exerciseId, { weightKg = 0, reps = 0, isWarmup = 0 } = {}) => {
    const order = queryOne(
        'SELECT COALESCE(MAX(set_order), 0) + 1 AS next FROM workout_sets WHERE session_id = ? AND exercise_id = ?',
        [sessionId, exerciseId]
    ).next;
    const id = uuid();
    run(`INSERT INTO workout_sets (id, session_id, exercise_id, set_order, weight_kg, reps, is_warmup, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, sessionId, exerciseId, order, weightKg, reps, isWarmup ? 1 : 0, now()]);
    await save();
    return id;
};

export const updateSet = async (setId, fields) => {
    const allowed = { weightKg: 'weight_kg', reps: 'reps', rpe: 'rpe', isWarmup: 'is_warmup', isComplete: 'is_complete' };
    const entries = Object.entries(fields).filter(([key]) => key in allowed);
    if (entries.length === 0) return;
    const assignments = entries.map(([key]) => `${allowed[key]} = ?`).join(', ');
    const values = entries.map(([key, value]) => (
        key === 'isWarmup' || key === 'isComplete' ? (value ? 1 : 0) : value
    ));
    run(`UPDATE workout_sets SET ${assignments} WHERE id = ?`, [...values, setId]);
    await save();
};

export const getSet = (setId) => queryOne('SELECT * FROM workout_sets WHERE id = ?', [setId]);

export const deleteSet = async (setId) => {
    const set = getSet(setId);
    run('DELETE FROM workout_sets WHERE id = ?', [setId]);
    if (set) {
        // Renumber so the remaining sets read 1, 2, 3… in the UI.
        const remaining = query(
            'SELECT id FROM workout_sets WHERE session_id = ? AND exercise_id = ? ORDER BY set_order, created_at',
            [set.session_id, set.exercise_id]
        );
        remaining.forEach((row, index) => {
            run('UPDATE workout_sets SET set_order = ? WHERE id = ?', [index + 1, row.id]);
        });
    }
    await save();
};

// --- History & analytics --------------------------------------------------

/** Every completed set for an exercise, oldest first. */
export const getExerciseHistory = (exerciseId) => query(`
    SELECT ws.*, s.start_time AS performed_at, e.target_group
    FROM workout_sets ws
    JOIN workout_sessions s ON s.id = ws.session_id
    JOIN exercises e ON e.id = ws.exercise_id
    WHERE ws.exercise_id = ? AND ws.is_complete = 1
    ORDER BY s.start_time, ws.set_order
`, [exerciseId]);

/** The sets from the last time this exercise was trained before `sessionId`. */
export const getPreviousPerformance = (exerciseId, sessionId) => {
    const previous = queryOne(`
        SELECT ws.session_id, s.start_time
        FROM workout_sets ws
        JOIN workout_sessions s ON s.id = ws.session_id
        WHERE ws.exercise_id = ? AND ws.is_complete = 1 AND ws.session_id != ?
        ORDER BY s.start_time DESC
        LIMIT 1
    `, [exerciseId, sessionId || '']);
    if (!previous) return null;
    return {
        sessionId: previous.session_id,
        startTime: previous.start_time,
        sets: query(`
            SELECT * FROM workout_sets
            WHERE session_id = ? AND exercise_id = ? AND is_complete = 1
            ORDER BY set_order
        `, [previous.session_id, exerciseId])
    };
};

/** Completed sets across all sessions since `sinceIso`, for the charts. */
export const getSetsSince = (sinceIso) => query(`
    SELECT ws.*, e.name AS exercise_name, e.target_group, s.start_time AS performed_at
    FROM workout_sets ws
    JOIN exercises e ON e.id = ws.exercise_id
    JOIN workout_sessions s ON s.id = ws.session_id
    WHERE ws.is_complete = 1 AND s.start_time >= ?
    ORDER BY s.start_time
`, [sinceIso]);

export const getSessionDates = () =>
    query('SELECT start_time FROM workout_sessions WHERE end_time IS NOT NULL ORDER BY start_time')
        .map((r) => r.start_time);

export const getLifetimeTotals = () => queryOne(`
    SELECT
        (SELECT COUNT(*) FROM workout_sessions WHERE end_time IS NOT NULL) AS sessions,
        (SELECT COUNT(*) FROM workout_sets WHERE is_complete = 1) AS sets,
        (SELECT COALESCE(SUM(weight_kg * reps), 0) FROM workout_sets WHERE is_complete = 1 AND is_warmup = 0) AS volume_kg,
        (SELECT COALESCE(SUM(reps), 0) FROM workout_sets WHERE is_complete = 1) AS reps
`);

// --- Routines -------------------------------------------------------------

export const listRoutines = () => query(`
    SELECT r.*,
           (SELECT COUNT(*) FROM routine_exercises re WHERE re.routine_id = r.id) AS exercise_count
    FROM routines r
    ORDER BY r.name
`);

export const getRoutine = (id) => {
    const routine = queryOne('SELECT * FROM routines WHERE id = ?', [id]);
    if (!routine) return null;
    routine.exercises = query(`
        SELECT re.*, e.name, e.target_group, e.primary_equipment
        FROM routine_exercises re
        JOIN exercises e ON e.id = re.exercise_id
        WHERE re.routine_id = ?
        ORDER BY re.position
    `, [id]);
    return routine;
};

export const saveRoutine = async ({ id, name, description = '', exercises = [] }) => {
    const timestamp = now();
    const routineId = id || uuid();
    if (id) {
        run('UPDATE routines SET name = ?, description = ?, updated_at = ? WHERE id = ?',
            [name, description, timestamp, id]);
        run('DELETE FROM routine_exercises WHERE routine_id = ?', [id]);
    } else {
        run('INSERT INTO routines (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
            [routineId, name, description, timestamp, timestamp]);
    }
    exercises.forEach((ex, index) => {
        run(`INSERT INTO routine_exercises (id, routine_id, exercise_id, position, target_sets, target_reps)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uuid(), routineId, ex.exercise_id, index, ex.target_sets ?? 3, ex.target_reps ?? 10]);
    });
    await save();
    return routineId;
};

export const deleteRoutine = async (id) => {
    run('DELETE FROM routine_exercises WHERE routine_id = ?', [id]);
    run('DELETE FROM routines WHERE id = ?', [id]);
    await save();
};

/** Turn a finished workout into a reusable routine. */
export const routineFromSession = async (sessionId, name) => {
    const exercises = getSessionExercises(sessionId).map((entry) => {
        const working = entry.sets.filter((s) => s.is_complete && !s.is_warmup);
        const medianReps = working.length
            ? Math.round(working.reduce((sum, s) => sum + s.reps, 0) / working.length)
            : 10;
        return {
            exercise_id: entry.exercise_id,
            target_sets: working.length || 3,
            target_reps: medianReps
        };
    });
    return saveRoutine({ name, description: 'Created from a logged workout.', exercises });
};

// --- Body weight ----------------------------------------------------------

export const logBodyWeight = async (weightKg, note = '') => {
    const id = uuid();
    run('INSERT INTO body_weight (id, logged_at, weight_kg, note) VALUES (?, ?, ?, ?)',
        [id, now(), weightKg, note]);
    await save();
    return id;
};

export const listBodyWeight = ({ limit = 200 } = {}) =>
    query('SELECT * FROM body_weight ORDER BY logged_at DESC LIMIT ?', [limit]);

export const deleteBodyWeight = async (id) => {
    run('DELETE FROM body_weight WHERE id = ?', [id]);
    await save();
};

// --- JSON export ----------------------------------------------------------

/** A human-readable snapshot, for people who'd rather not handle a binary. */
export const exportJson = () => ({
    app: 'MiFitness',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now(),
    exercises: query('SELECT * FROM exercises'),
    sessions: query('SELECT * FROM workout_sessions'),
    sessionExercises: query('SELECT * FROM session_exercises'),
    sets: query('SELECT * FROM workout_sets'),
    routines: query('SELECT * FROM routines'),
    routineExercises: query('SELECT * FROM routine_exercises'),
    bodyWeight: query('SELECT * FROM body_weight'),
    settings: query('SELECT * FROM settings')
});
