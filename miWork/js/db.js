const DB_NAME = 'miWorkDB';
const DB_VERSION = 1;

let db;

export const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error("Database error: ", event.target.error);
            reject(event.target.error);
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Tasks store
            if (!db.objectStoreNames.contains('tasks')) {
                const objectStore = db.createObjectStore('tasks', { keyPath: 'id' });
                objectStore.createIndex('parentId', 'parentId', { unique: false });
                objectStore.createIndex('status', 'status', { unique: false });
            }

            // Settings store
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'key' });
            }
        };
    });
};

export const addTask = (task) => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['tasks'], 'readwrite');
        const objectStore = transaction.objectStore('tasks');
        const request = objectStore.add(task);

        request.onsuccess = () => resolve(task);
        request.onerror = (event) => reject(event.target.error);
    });
};

export const updateTask = (task) => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['tasks'], 'readwrite');
        const objectStore = transaction.objectStore('tasks');
        const request = objectStore.put(task);

        request.onsuccess = () => resolve(task);
        request.onerror = (event) => reject(event.target.error);
    });
};

// Upsert many tasks in a single transaction (drag reorders, imports).
export const bulkPutTasks = (tasks) => {
    return new Promise((resolve, reject) => {
        if (!tasks.length) return resolve([]);
        const transaction = db.transaction(['tasks'], 'readwrite');
        const objectStore = transaction.objectStore('tasks');
        tasks.forEach(task => objectStore.put(task));

        transaction.oncomplete = () => resolve(tasks);
        transaction.onerror = (event) => reject(event.target.error);
    });
};

export const getTasksByParentId = (parentId) => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['tasks'], 'readonly');
        const objectStore = transaction.objectStore('tasks');
        const index = objectStore.index('parentId');
        const request = index.getAll(parentId);

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
};

export const getAllTasks = () => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['tasks'], 'readonly');
        const objectStore = transaction.objectStore('tasks');
        const request = objectStore.getAll();

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
};

export const getTaskById = (id) => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['tasks'], 'readonly');
        const objectStore = transaction.objectStore('tasks');
        const request = objectStore.get(id);

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
};

export const deleteTask = (id) => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['tasks'], 'readwrite');
        const objectStore = transaction.objectStore('tasks');
        const request = objectStore.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
};

// Also deletes all child tasks recursively
export const deleteTasksRecursive = async (parentId) => {
    const children = await getTasksByParentId(parentId);
    for (const child of children) {
        await deleteTasksRecursive(child.id);
    }
    await deleteTask(parentId);
};

export const saveSetting = (key, value) => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['settings'], 'readwrite');
        const objectStore = transaction.objectStore('settings');
        const request = objectStore.put({ key, value });

        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
};

export const getSetting = (key) => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['settings'], 'readonly');
        const objectStore = transaction.objectStore('settings');
        const request = objectStore.get(key);

        request.onsuccess = (event) => resolve(event.target.result ? event.target.result.value : null);
        request.onerror = (event) => reject(event.target.error);
    });
};

export const getAllData = async () => {
    const tasks = await getAllTasks();

    const settings = await new Promise((resolve, reject) => {
        const transaction = db.transaction(['settings'], 'readonly');
        const objectStore = transaction.objectStore('settings');
        const request = objectStore.getAll();

        request.onsuccess = (event) => {
            const out = {};
            event.target.result.forEach(s => out[s.key] = s.value);
            resolve(out);
        };
        request.onerror = (event) => reject(event.target.error);
    });

    return { tasks, settings };
};

// Merge an exported payload back in: tasks upsert by id, settings by key.
export const importData = async (data) => {
    const tasks = Array.isArray(data?.tasks) ? data.tasks.filter(t => t && t.id) : [];
    await bulkPutTasks(tasks);

    const settings = data?.settings && typeof data.settings === 'object' ? data.settings : {};
    for (const [key, value] of Object.entries(settings)) {
        await saveSetting(key, value);
    }

    return { taskCount: tasks.length, settingCount: Object.keys(settings).length };
};
