// db.js
const DB_STORE_NAME = 'mifitness_db';
const DB_FILE_NAME = 'mifitness.sqlite';

let SQL;
let db;

async function initDB() {
    if (!SQL) {
        SQL = await initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });
    }

    const savedData = await loadFromIndexedDB();
    if (savedData) {
        db = new SQL.Database(savedData);
        console.log("Database loaded from IndexedDB.");
    } else {
        db = new SQL.Database();
        console.log("New database created.");
        createSchema();
        seedData();
        await saveToIndexedDB();
    }
}

function createSchema() {
    db.run(`
        CREATE TABLE IF NOT EXISTS exercises (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            target_group TEXT NOT NULL,
            primary_equipment TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workout_sessions (
            id TEXT PRIMARY KEY,
            start_time TEXT NOT NULL,
            end_time TEXT,
            notes TEXT
        );

        CREATE TABLE IF NOT EXISTS workout_sets (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            exercise_id TEXT NOT NULL,
            set_order INTEGER NOT NULL,
            weight_kg REAL NOT NULL,
            reps INTEGER NOT NULL,
            rpe REAL,
            is_warmup INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY(session_id) REFERENCES workout_sessions(id),
            FOREIGN KEY(exercise_id) REFERENCES exercises(id)
        );
    `);
}

function seedData() {
    const exercises = [
        // Chest
        { id: crypto.randomUUID(), name: 'Flat Barbell Bench Press', target_group: 'Chest', primary_equipment: 'Barbell' },
        { id: crypto.randomUUID(), name: 'Incline Dumbbell Press', target_group: 'Chest', primary_equipment: 'Dumbbell' },
        { id: crypto.randomUUID(), name: 'Low-to-High Cable Flye', target_group: 'Chest', primary_equipment: 'Cable' },
        { id: crypto.randomUUID(), name: 'Dips (Chest-Leaning)', target_group: 'Chest', primary_equipment: 'Bodyweight / Weighted' },

        // Back
        { id: crypto.randomUUID(), name: 'Barbell Bent-Over Row', target_group: 'Back (Lat / Upper)', primary_equipment: 'Barbell' },
        { id: crypto.randomUUID(), name: 'Neutral-Grip Lat Pulldown', target_group: 'Back (Lat / Upper)', primary_equipment: 'Cable / Machine' },
        { id: crypto.randomUUID(), name: 'Chest-Supported T-Bar Row', target_group: 'Back (Lat / Upper)', primary_equipment: 'Machine / T-Bar' },
        { id: crypto.randomUUID(), name: 'Single-Arm Dumbbell Row', target_group: 'Back (Lat / Upper)', primary_equipment: 'Dumbbell' },

        // Quads
        { id: crypto.randomUUID(), name: 'Barbell High-Bar Back Squat', target_group: 'Quads', primary_equipment: 'Barbell' },
        { id: crypto.randomUUID(), name: 'Leg Press', target_group: 'Quads', primary_equipment: 'Machine' },
        { id: crypto.randomUUID(), name: 'Bulgarian Split Squat', target_group: 'Quads', primary_equipment: 'Dumbbell' },
        { id: crypto.randomUUID(), name: 'Seated Leg Extension', target_group: 'Quads', primary_equipment: 'Machine' },

        // Hamstrings & Glutes
        { id: crypto.randomUUID(), name: 'Romanian Deadlift (RDL)', target_group: 'Hamstrings & Glutes', primary_equipment: 'Barbell / Dumbbell' },
        { id: crypto.randomUUID(), name: 'Lying Leg Curl', target_group: 'Hamstrings & Glutes', primary_equipment: 'Machine' },
        { id: crypto.randomUUID(), name: 'Barbell Hip Thrust', target_group: 'Hamstrings & Glutes', primary_equipment: 'Barbell' },

        // Shoulders
        { id: crypto.randomUUID(), name: 'Seated Dumbbell Overhead Press', target_group: 'Shoulders', primary_equipment: 'Dumbbell' },
        { id: crypto.randomUUID(), name: 'Standing Cable Lateral Raise', target_group: 'Shoulders', primary_equipment: 'Cable' },
        { id: crypto.randomUUID(), name: 'Incline Rear Delt Dumbbell Flye', target_group: 'Shoulders', primary_equipment: 'Dumbbell' },

        // Biceps
        { id: crypto.randomUUID(), name: 'Standing Incline Dumbbell Curl', target_group: 'Biceps', primary_equipment: 'Dumbbell' },
        { id: crypto.randomUUID(), name: 'EZ-Bar Preacher Curl', target_group: 'Biceps', primary_equipment: 'Barbell' },

        // Triceps
        { id: crypto.randomUUID(), name: 'Dual-Rope Cable Triceps Pushdown', target_group: 'Triceps', primary_equipment: 'Cable' },
        { id: crypto.randomUUID(), name: 'Overhead Cable Triceps Extension', target_group: 'Triceps', primary_equipment: 'Cable' },
        { id: crypto.randomUUID(), name: 'Close-Grip Bench Press', target_group: 'Triceps', primary_equipment: 'Barbell' },

        // Calves & Abs
        { id: crypto.randomUUID(), name: 'Standing Calf Raise', target_group: 'Calves & Abs', primary_equipment: 'Machine' },
        { id: crypto.randomUUID(), name: 'Hanging Leg Raise', target_group: 'Calves & Abs', primary_equipment: 'Bodyweight' },
    ];

    const stmt = db.prepare('INSERT INTO exercises (id, name, target_group, primary_equipment) VALUES (?, ?, ?, ?)');
    exercises.forEach(ex => {
        stmt.run([ex.id, ex.name, ex.target_group, ex.primary_equipment]);
    });
    stmt.free();
}

// -- IndexedDB persistence wrapper --
function getIDB() {
    return new Promise((resolve, reject) => {
        const api = typeof indexedDB !== 'undefined' ? indexedDB : (globalThis.idbAPI || globalThis.indexedDB);
        const request = api.open(DB_STORE_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('files')) {
                db.createObjectStore('files');
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function loadFromIndexedDB() {
    const idb = await getIDB();
    return new Promise((resolve, reject) => {
        const transaction = idb.transaction(['files'], 'readonly');
        const store = transaction.objectStore('files');
        const request = store.get(DB_FILE_NAME);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function saveToIndexedDB() {
    if (!db) return;
    const binaryArray = db.export();
    const idb = await getIDB();
    return new Promise((resolve, reject) => {
        const transaction = idb.transaction(['files'], 'readwrite');
        const store = transaction.objectStore('files');
        const request = store.put(binaryArray, DB_FILE_NAME);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

// -- Data Access Functions --

function getAllExercises() {
    const res = db.exec('SELECT * FROM exercises ORDER BY target_group, name');
    if (res.length === 0) return [];
    const cols = res[0].columns;
    return res[0].values.map(row => {
        const obj = {};
        cols.forEach((col, i) => obj[col] = row[i]);
        return obj;
    });
}

async function startSession() {
    const id = crypto.randomUUID();
    const startTime = new Date().toISOString();
    db.run('INSERT INTO workout_sessions (id, start_time) VALUES (?, ?)', [id, startTime]);
    await saveToIndexedDB();
    return id;
}

async function endSession(sessionId) {
    const endTime = new Date().toISOString();
    db.run('UPDATE workout_sessions SET end_time = ? WHERE id = ?', [endTime, sessionId]);
    await saveToIndexedDB();
}

async function logSet(sessionId, exerciseId, weight_kg, reps, set_order) {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    db.run(
        'INSERT INTO workout_sets (id, session_id, exercise_id, set_order, weight_kg, reps, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, sessionId, exerciseId, set_order, weight_kg, reps, createdAt]
    );
    await saveToIndexedDB();
    return id;
}

async function deleteSet(setId) {
    db.run('DELETE FROM workout_sets WHERE id = ?', [setId]);
    await saveToIndexedDB();
}

function getSetsForSession(sessionId) {
    const res = db.exec(`
        SELECT ws.id, ws.exercise_id, e.name as exercise_name, ws.set_order, ws.weight_kg, ws.reps
        FROM workout_sets ws
        JOIN exercises e ON ws.exercise_id = e.id
        WHERE ws.session_id = ?
        ORDER BY ws.created_at ASC
    `, [sessionId]);

    if (res.length === 0) return [];
    const cols = res[0].columns;
    return res[0].values.map(row => {
        const obj = {};
        cols.forEach((col, i) => obj[col] = row[i]);
        return obj;
    });
}

function getRecentSessions() {
    const res = db.exec('SELECT * FROM workout_sessions ORDER BY start_time DESC LIMIT 10');
    if (res.length === 0) return [];
    const cols = res[0].columns;
    return res[0].values.map(row => {
        const obj = {};
        cols.forEach((col, i) => obj[col] = row[i]);
        return obj;
    });
}

async function exportDatabase() {
    const binaryArray = db.export();
    return new Blob([binaryArray], {type: "application/x-sqlite3"});
}

async function importDatabase(arrayBuffer) {
    db = new SQL.Database(new Uint8Array(arrayBuffer));
    await saveToIndexedDB();
}

// Export for tests (Node.js environment)
if (typeof window === 'undefined') {
    globalThis.dbModule = {
        initDB,
        getAllExercises,
        startSession,
        endSession,
        logSet,
        deleteSet,
        getSetsForSession,
        getRecentSessions,
        getDb: () => db,
        setSqlJs: (mockSql) => { SQL = mockSql; }
    };
}
