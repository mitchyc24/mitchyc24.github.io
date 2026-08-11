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

export const getAllData = () => {
    return new Promise(async (resolve, reject) => {
        try {
            const data = { tasks: [], settings: {} };

            // Get all tasks
            const taskTx = db.transaction(['tasks'], 'readonly');
            const taskStore = taskTx.objectStore('tasks');
            const taskReq = taskStore.getAll();

            taskReq.onsuccess = (event) => {
                data.tasks = event.target.result;

                // Get all settings
                const settingsTx = db.transaction(['settings'], 'readonly');
                const settingsStore = settingsTx.objectStore('settings');
                const settingsReq = settingsStore.getAll();

                settingsReq.onsuccess = (e) => {
                    const settingsArr = e.target.result;
                    settingsArr.forEach(s => data.settings[s.key] = s.value);
                    resolve(data);
                };
            };
        } catch (e) {
            reject(e);
        }
    });
};
