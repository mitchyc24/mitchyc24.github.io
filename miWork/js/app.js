import { initDB, getTaskById, getTasksByParentId, updateTask, addTask, deleteTask, deleteTasksRecursive, getAllData, saveSetting, getSetting } from './db.js';

let currentParentId = 'root';
let breadcrumbTrail = []; // Array of task objects {id, title}

// DOM Elements
const breadcrumbContainer = document.getElementById('breadcrumb-container');
const taskModal = document.getElementById('task-modal');
const taskForm = document.getElementById('task-form');
const btnCancelTask = document.getElementById('btn-cancel-task');
const addBtns = document.querySelectorAll('.btn-add-task');
const btnToggleView = document.getElementById('btn-toggle-view');
const btnStats = document.getElementById('btn-stats');
const btnSettings = document.getElementById('btn-settings');

const statsModal = document.getElementById('stats-modal');
const settingsModal = document.getElementById('settings-modal');
const btnCloseStats = document.getElementById('btn-close-stats');
const btnCloseSettings = document.getElementById('btn-close-settings');

const settingShowNotes = document.getElementById('setting-show-notes');
const settingShowUrl = document.getElementById('setting-show-url');
const btnExportData = document.getElementById('btn-export-data');

let editingTaskId = null;
let newTaskStatus = 'todo';

// Initialize Application
const initApp = async () => {
    try {
        await initDB();
        console.log("Database initialized");

        // Initial breadcrumb setup
        updateBreadcrumbs();

        // Setup Sortable
        setupSortable();

        setupTaskModal();

        setupViews();

        setupSettings();

        setupStats();

        // Load Settings
        await loadSettings();

        // Initial render
        await renderBoard();

    } catch (e) {
        console.error("Failed to initialize app", e);
    }
};

// Navigation / Breadcrumbs
const updateBreadcrumbs = () => {
    breadcrumbContainer.innerHTML = '';

    // Home Breadcrumb
    const homeEl = document.createElement('span');
    homeEl.className = 'breadcrumb-item';
    homeEl.textContent = 'Home';
    homeEl.onclick = () => navigateTo('root');
    breadcrumbContainer.appendChild(homeEl);

    // Dynamic Trail
    breadcrumbTrail.forEach((crumb, index) => {
        const separator = document.createElement('span');
        separator.textContent = ' > ';
        breadcrumbContainer.appendChild(separator);

        const crumbEl = document.createElement('span');
        crumbEl.className = 'breadcrumb-item';
        crumbEl.textContent = crumb.title;
        crumbEl.onclick = () => {
            // Cut trail off after this crumb
            const newTrail = breadcrumbTrail.slice(0, index + 1);
            navigateTo(crumb.id, newTrail);
        };
        breadcrumbContainer.appendChild(crumbEl);
    });
};

const navigateTo = async (parentId, newTrail = []) => {
    currentParentId = parentId;
    breadcrumbTrail = newTrail;
    updateBreadcrumbs();

    // Render Board for new parentId
    await renderBoard();
};

const renderBoard = async () => {
    const lists = {
        'todo': document.getElementById('list-todo'),
        'in-progress': document.getElementById('list-in-progress'),
        'done': document.getElementById('list-done')
    };

    // Clear lists
    Object.values(lists).forEach(list => list.innerHTML = '');

    try {
        const tasks = await getTasksByParentId(currentParentId);

        tasks.forEach(task => {
            const card = document.createElement('div');
            card.className = 'task-card';
            card.dataset.id = task.id;

            const titleEl = document.createElement('div');
            titleEl.className = 'task-title';
            titleEl.textContent = task.title;
            card.appendChild(titleEl);

            // Edit button (prevent drill down)
            const editBtn = document.createElement('button');
            editBtn.textContent = '✏️';
            editBtn.className = 'btn-edit-task';
            editBtn.style.position = 'absolute';
            editBtn.style.top = '5px';
            editBtn.style.right = '5px';
            editBtn.style.background = 'none';
            editBtn.style.border = 'none';
            editBtn.style.cursor = 'pointer';

            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openTaskModal(task);
            });

            // Delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '🗑️';
            deleteBtn.className = 'btn-delete-task';
            deleteBtn.style.position = 'absolute';
            deleteBtn.style.bottom = '5px';
            deleteBtn.style.right = '5px';
            deleteBtn.style.background = 'none';
            deleteBtn.style.border = 'none';
            deleteBtn.style.cursor = 'pointer';

            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm('Delete this task and all its sub-tasks?')) {
                    await deleteTasksRecursive(task.id);
                    await renderBoard();
                }
            });

            card.style.position = 'relative'; // for absolute positioning of buttons
            card.appendChild(editBtn);
            card.appendChild(deleteBtn);

            // Metadata container
            const metaEl = document.createElement('div');
            metaEl.className = 'task-metadata';

            if (task.description) {
                metaEl.innerHTML += `<div class="metadata-item"><strong>Desc:</strong> ${task.description}</div>`;
            }
            if (task.notes) {
                // Settings check can be handled globally or here. For now we output it.
                metaEl.innerHTML += `<div class="metadata-item notes-meta"><strong>Notes:</strong> ${task.notes}</div>`;
            }
            if (task.url) {
                metaEl.innerHTML += `<div class="metadata-item url-meta"><strong>URL:</strong> <a href="${task.url}" target="_blank" onclick="event.stopPropagation()">Link</a></div>`;
            }

            card.appendChild(metaEl);

            // Apply specific settings visibility to items
            if (task.notes && !window.showNotesSetting) {
                metaEl.querySelector('.notes-meta').style.display = 'none';
            }
            if (task.url && !window.showUrlSetting) {
                metaEl.querySelector('.url-meta').style.display = 'none';
            }

            // Wheel event to expand/collapse locally
            card.addEventListener('wheel', (e) => {
                // Only if global view is NOT forced to simplified
                if (document.body.classList.contains('simplified-view')) return;

                if (e.deltaY > 0 && !card.classList.contains('expanded')) {
                    card.classList.add('expanded'); // scroll down -> expand
                    e.preventDefault();
                } else if (e.deltaY < 0 && card.classList.contains('expanded')) {
                    card.classList.remove('expanded'); // scroll up -> collapse
                    e.preventDefault();
                }
                // If it's already expanded and they scroll down, or collapsed and scroll up,
                // we allow the default vertical scroll to happen.
            }, { passive: false });

            // Adding drill-down action on click
            card.addEventListener('click', (e) => {
                // Ignore clicks if grabbing/dragging
                if (card.classList.contains('sortable-drag')) return;
                drillDown(task.id);
            });

            if (lists[task.status]) {
                lists[task.status].appendChild(card);
            }
        });
    } catch (e) {
        console.error("Error rendering board:", e);
    }
};

const setupSortable = () => {
    const listEls = document.querySelectorAll('.task-list');

    listEls.forEach(listEl => {
        new Sortable(listEl, {
            group: 'shared', // set both lists to same group
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: async function (evt) {
                const itemEl = evt.item;  // dragged HTMLElement
                const toListEl = evt.to;    // target list

                const taskId = itemEl.dataset.id;
                const newStatus = toListEl.parentElement.dataset.status;

                try {
                    const task = await getTaskById(taskId);
                    if (task && task.status !== newStatus) {
                        task.status = newStatus;
                        await updateTask(task);
                    }
                } catch (e) {
                    console.error("Failed to update task status:", e);
                }
            }
        });
    });
};

const drillDown = async (taskId) => {
    const task = await getTaskById(taskId);
    if (!task) return;

    breadcrumbTrail.push({ id: task.id, title: task.title });
    navigateTo(task.id, breadcrumbTrail);
};

// --- Views ---
let isSimplified = false;
const setupViews = () => {
    btnToggleView.addEventListener('click', () => {
        isSimplified = !isSimplified;
        if (isSimplified) {
            document.body.classList.add('simplified-view');
            document.body.classList.remove('detailed-view');
            btnToggleView.textContent = "Switch to Detailed View";
        } else {
            document.body.classList.remove('simplified-view');
            document.body.classList.add('detailed-view');
            btnToggleView.textContent = "Switch to Simplified View";
        }
    });
};

// --- Settings ---
const loadSettings = async () => {
    const showNotes = await getSetting('showNotes');
    const showUrl = await getSetting('showUrl');

    window.showNotesSetting = showNotes !== false; // default true
    window.showUrlSetting = showUrl !== false; // default true

    settingShowNotes.checked = window.showNotesSetting;
    settingShowUrl.checked = window.showUrlSetting;
};

const setupSettings = () => {
    btnSettings.addEventListener('click', () => {
        settingsModal.showModal();
    });

    btnCloseSettings.addEventListener('click', () => {
        settingsModal.close();
    });

    settingShowNotes.addEventListener('change', async (e) => {
        await saveSetting('showNotes', e.target.checked);
        window.showNotesSetting = e.target.checked;
        await renderBoard();
    });

    settingShowUrl.addEventListener('change', async (e) => {
        await saveSetting('showUrl', e.target.checked);
        window.showUrlSetting = e.target.checked;
        await renderBoard();
    });

    btnExportData.addEventListener('click', async () => {
        const data = await getAllData();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'miWork_export.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
};

// --- Stats & Metrics ---
let statsChartInstance = null;
const setupStats = () => {
    btnStats.addEventListener('click', async () => {
        await renderStats();
        statsModal.showModal();
    });

    btnCloseStats.addEventListener('click', () => {
        statsModal.close();
    });
};

const renderStats = async () => {
    const allData = await getAllData();
    const tasks = allData.tasks;

    const countTodo = tasks.filter(t => t.status === 'todo').length;
    const countInProgress = tasks.filter(t => t.status === 'in-progress').length;
    const countDone = tasks.filter(t => t.status === 'done').length;

    const ctx = document.getElementById('stats-chart').getContext('2d');

    if (statsChartInstance) {
        statsChartInstance.destroy();
    }

    statsChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['To Do', 'In Progress', 'Done'],
            datasets: [{
                data: [countTodo, countInProgress, countDone],
                backgroundColor: [
                    '#ff6384',
                    '#36a2eb',
                    '#4bc0c0'
                ]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                },
                title: {
                    display: true,
                    text: 'Task Completion Status'
                }
            }
        }
    });
};

// --- Task Management Modals ---
const setupTaskModal = () => {
    addBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            newTaskStatus = btn.dataset.status;
            openTaskModal();
        });
    });

    btnCancelTask.addEventListener('click', () => {
        taskModal.close();
    });

    taskForm.addEventListener('submit', async (e) => {
        // We use dialog form method, but we want to handle data manually
        e.preventDefault();

        const title = document.getElementById('task-title').value;
        const description = document.getElementById('task-description').value;
        const notes = document.getElementById('task-notes').value;
        const url = document.getElementById('task-url').value;

        const taskData = {
            title,
            description,
            notes,
            url,
            status: newTaskStatus,
            parentId: currentParentId
        };

        if (editingTaskId) {
            // Update existing
            try {
                const existingTask = await getTaskById(editingTaskId);
                Object.assign(existingTask, taskData);
                await updateTask(existingTask);
            } catch (err) {
                console.error('Error updating task:', err);
            }
        } else {
            // Add new
            taskData.id = crypto.randomUUID();
            taskData.createdAt = Date.now();
            try {
                await addTask(taskData);
            } catch (err) {
                console.error('Error adding task:', err);
            }
        }

        taskModal.close();
        await renderBoard();
    });
};

const openTaskModal = (task = null) => {
    if (task) {
        editingTaskId = task.id;
        document.getElementById('task-title').value = task.title || '';
        document.getElementById('task-description').value = task.description || '';
        document.getElementById('task-notes').value = task.notes || '';
        document.getElementById('task-url').value = task.url || '';
        newTaskStatus = task.status; // keep current status
    } else {
        editingTaskId = null;
        taskForm.reset();
    }
    taskModal.showModal();
};

// Start
document.addEventListener('DOMContentLoaded', initApp);
