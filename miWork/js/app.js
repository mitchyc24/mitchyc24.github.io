import {
    initDB, getTaskById, updateTask, addTask, deleteTasksRecursive,
    getAllTasks, getAllData, bulkPutTasks, importData, saveSetting, getSetting
} from './db.js';
import {
    buildChildrenMap, computeProgress, subtaskStats, countByStatus,
    completionsPerDay, completionStreak
} from './progress.js';
import {
    renderStatTiles, renderDonut, renderBarChart, renderProjectProgress
} from './charts.js';

let currentParentId = 'root';
let breadcrumbTrail = []; // Array of {id, title}
let editingTaskId = null;
let newTaskStatus = 'todo';
let taskCache = new Map();      // id -> task, for tasks on the visible board
let childrenMapCache = new Map();

const STATUSES = ['todo', 'in-progress', 'done'];

// Defaults for every persisted setting
const settings = {
    theme: 'system',
    accent: 'indigo',
    font: 'sans',
    density: 'comfortable',
    view: 'detailed',
    showDesc: true,
    showNotes: true,
    showUrl: true,
    showProgress: true,
    confirmDelete: true
};

// DOM elements
const breadcrumbContainer = document.getElementById('breadcrumb-container');
const taskModal = document.getElementById('task-modal');
const taskForm = document.getElementById('task-form');
const statsModal = document.getElementById('stats-modal');
const settingsModal = document.getElementById('settings-modal');
const parentBanner = document.getElementById('parent-progress-banner');

// --- Init -----------------------------------------------------------------

const initApp = async () => {
    try {
        await initDB();

        await loadSettings();
        applyAppearance();
        applyView();

        updateBreadcrumbs();
        setupSortable();
        setupTaskModal();
        setupHeaderControls();
        setupSettingsModal();
        setupDataButtons();

        await renderBoard();

        registerServiceWorker();
    } catch (e) {
        console.error('Failed to initialize app', e);
    }
};

const registerServiceWorker = () => {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        navigator.serviceWorker.register('./sw.js').catch(err =>
            console.warn('Service worker registration failed:', err));
    }
};

// --- Settings -------------------------------------------------------------

const loadSettings = async () => {
    for (const key of Object.keys(settings)) {
        const stored = await getSetting(key);
        if (stored !== null && stored !== undefined) settings[key] = stored;
    }
};

const setSetting = async (key, value) => {
    settings[key] = value;
    await saveSetting(key, value);
};

const applyAppearance = () => {
    const root = document.documentElement;
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    root.setAttribute('data-accent', settings.accent);
    root.setAttribute('data-font', settings.font);
    root.setAttribute('data-density', settings.density);
};

const applyView = () => {
    const simplified = settings.view === 'simplified';
    document.body.classList.toggle('simplified-view', simplified);
    document.body.classList.toggle('detailed-view', !simplified);
    document.getElementById('view-toggle-label').textContent =
        simplified ? 'Detailed' : 'Simplified';
};

// --- Breadcrumbs / navigation --------------------------------------------

const updateBreadcrumbs = () => {
    breadcrumbContainer.innerHTML = '';

    const addCrumb = (title, isCurrent, onClick) => {
        const el = document.createElement('span');
        el.className = 'breadcrumb-item' + (isCurrent ? ' current' : '');
        el.textContent = title;
        if (!isCurrent) el.onclick = onClick;
        breadcrumbContainer.appendChild(el);
    };

    const addSep = () => {
        const sep = document.createElement('span');
        sep.className = 'breadcrumb-sep';
        sep.textContent = '›';
        breadcrumbContainer.appendChild(sep);
    };

    addCrumb('Home', breadcrumbTrail.length === 0, () => navigateTo('root'));

    breadcrumbTrail.forEach((crumb, index) => {
        addSep();
        const isLast = index === breadcrumbTrail.length - 1;
        addCrumb(crumb.title, isLast, () => {
            navigateTo(crumb.id, breadcrumbTrail.slice(0, index + 1));
        });
    });
};

const navigateTo = async (parentId, newTrail = []) => {
    currentParentId = parentId;
    breadcrumbTrail = newTrail;
    updateBreadcrumbs();
    await renderBoard();
};

const drillDown = async (taskId) => {
    const task = await getTaskById(taskId);
    if (!task) return;
    navigateTo(task.id, [...breadcrumbTrail, { id: task.id, title: task.title }]);
};

// --- Board rendering ------------------------------------------------------

const renderBoard = async () => {
    const lists = {
        'todo': document.getElementById('list-todo'),
        'in-progress': document.getElementById('list-in-progress'),
        'done': document.getElementById('list-done')
    };

    Object.values(lists).forEach(list => list.innerHTML = '');

    try {
        const allTasks = await getAllTasks();
        childrenMapCache = buildChildrenMap(allTasks);

        const tasks = childrenMapCache.get(currentParentId) || [];
        taskCache = new Map(tasks.map(t => [t.id, t]));

        for (const task of tasks) {
            const card = buildTaskCard(task);
            if (lists[task.status]) lists[task.status].appendChild(card);
        }

        // Column counts
        const counts = countByStatus(tasks);
        for (const status of STATUSES) {
            document.getElementById(`count-${status}`).textContent = counts[status];
        }

        renderParentBanner();
    } catch (e) {
        console.error('Error rendering board:', e);
    }
};

// Progress banner for the task we're currently drilled into
const renderParentBanner = () => {
    if (currentParentId === 'root') {
        parentBanner.hidden = true;
        return;
    }
    const crumb = breadcrumbTrail[breadcrumbTrail.length - 1];
    const children = childrenMapCache.get(currentParentId) || [];
    const pct = computeProgress(currentParentId, childrenMapCache, 'todo');
    const stats = subtaskStats(currentParentId, childrenMapCache);

    parentBanner.hidden = false;
    document.getElementById('parent-progress-label').textContent =
        children.length
            ? `${crumb?.title ?? 'Task'} — ${stats.done} of ${stats.total} sub-tasks complete`
            : `${crumb?.title ?? 'Task'} — no sub-tasks yet`;
    document.getElementById('parent-progress-pct').textContent = `${Math.round(pct * 100)}%`;
    const fill = document.getElementById('parent-progress-fill');
    fill.style.width = `${Math.round(pct * 100)}%`;
    fill.classList.toggle('complete', pct >= 1);
};

const iconSvg = (paths) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = paths;
    return svg;
};

const ICONS = {
    edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    subtasks: '<path d="M3 5h8"/><path d="M3 12h5"/><path d="M3 19h5"/><path d="M13 12h8"/><path d="M13 19h8"/><path d="M13 12v7"/>',
    note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'
};

const buildTaskCard = (task) => {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.dataset.id = task.id;

    // Top row: title + hover actions
    const top = document.createElement('div');
    top.className = 'task-card-top';

    const titleEl = document.createElement('div');
    titleEl.className = 'task-title';
    titleEl.textContent = task.title;
    top.appendChild(titleEl);

    const actions = document.createElement('div');
    actions.className = 'task-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'task-action-btn';
    editBtn.title = 'Edit task';
    editBtn.appendChild(iconSvg(ICONS.edit));
    editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openTaskModal(task);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'task-action-btn danger';
    deleteBtn.title = 'Delete task and sub-tasks';
    deleteBtn.appendChild(iconSvg(ICONS.trash));
    deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const stats = subtaskStats(task.id, childrenMapCache);
        const msg = stats.total > 0
            ? `Delete "${task.title}" and its ${stats.total} sub-task${stats.total === 1 ? '' : 's'}?`
            : `Delete "${task.title}"?`;
        if (!settings.confirmDelete || confirm(msg)) {
            await deleteTasksRecursive(task.id);
            await renderBoard();
        }
    });

    actions.append(editBtn, deleteBtn);
    top.appendChild(actions);
    card.appendChild(top);

    // Badges — always visible, so sub-tasks are discoverable without clicking
    const badges = document.createElement('div');
    badges.className = 'task-badges';

    const stats = subtaskStats(task.id, childrenMapCache);
    if (stats.total > 0) {
        const badge = document.createElement('span');
        badge.className = 'badge badge-subtasks' + (stats.done === stats.total ? ' all-done' : '');
        badge.title = `${stats.done} of ${stats.total} sub-tasks complete`;
        badge.appendChild(iconSvg(ICONS.subtasks));
        badge.appendChild(document.createTextNode(`${stats.done}/${stats.total}`));
        badges.appendChild(badge);
    }

    if (task.notes) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.title = 'Has notes';
        badge.appendChild(iconSvg(ICONS.note));
        badges.appendChild(badge);
    }

    if (task.url) {
        const badge = document.createElement('span');
        badge.className = 'badge badge-link';
        const a = document.createElement('a');
        a.href = task.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.title = task.url;
        a.appendChild(iconSvg(ICONS.link));
        a.appendChild(document.createTextNode('link'));
        a.addEventListener('click', (e) => e.stopPropagation());
        badge.appendChild(a);
        badges.appendChild(badge);
    }

    card.appendChild(badges);

    // Sub-task completeness bar (detailed view, or expanded card)
    if (stats.total > 0 && settings.showProgress) {
        const pct = computeProgress(task.id, childrenMapCache, task.status);
        const wrap = document.createElement('div');
        wrap.className = 'task-progress';

        const track = document.createElement('div');
        track.className = 'progress-track';
        const fill = document.createElement('div');
        fill.className = 'progress-fill' + (pct >= 1 ? ' complete' : '');
        fill.style.width = `${Math.round(pct * 100)}%`;
        track.appendChild(fill);

        const pctEl = document.createElement('span');
        pctEl.className = 'task-progress-pct';
        pctEl.textContent = `${Math.round(pct * 100)}%`;

        wrap.append(track, pctEl);
        card.appendChild(wrap);
    }

    // Metadata (detailed view)
    const metaItems = [];
    if (task.description && settings.showDesc) metaItems.push(['Description', task.description, null]);
    if (task.notes && settings.showNotes) metaItems.push(['Notes', task.notes, null]);
    if (task.url && settings.showUrl) metaItems.push(['URL', task.url, task.url]);

    if (metaItems.length) {
        const metaEl = document.createElement('div');
        metaEl.className = 'task-metadata';
        for (const [label, text, href] of metaItems) {
            const item = document.createElement('div');
            item.className = 'metadata-item';
            const lbl = document.createElement('span');
            lbl.className = 'meta-label';
            lbl.textContent = label;
            item.appendChild(lbl);
            if (href) {
                const a = document.createElement('a');
                a.href = href;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.textContent = text;
                a.addEventListener('click', (e) => e.stopPropagation());
                item.appendChild(a);
            } else {
                item.appendChild(document.createTextNode(text));
            }
            metaEl.appendChild(item);
        }
        card.appendChild(metaEl);
    }

    // Wheel to expand/collapse a single card in simplified view
    card.addEventListener('wheel', (e) => {
        if (!document.body.classList.contains('simplified-view')) return;
        if (e.deltaY > 0 && !card.classList.contains('expanded')) {
            card.classList.add('expanded');
            e.preventDefault();
        } else if (e.deltaY < 0 && card.classList.contains('expanded')) {
            card.classList.remove('expanded');
            e.preventDefault();
        }
    }, { passive: false });

    // Click to drill down into sub-tasks
    card.addEventListener('click', () => {
        if (card.classList.contains('sortable-drag')) return;
        drillDown(task.id);
    });

    return card;
};

// --- Drag and drop --------------------------------------------------------

const applyStatusChange = (task, newStatus) => {
    if (task.status === newStatus) return;
    task.status = newStatus;
    if (newStatus === 'done') task.completedAt = Date.now();
    else delete task.completedAt;
};

const setupSortable = () => {
    document.querySelectorAll('.task-list').forEach(listEl => {
        new Sortable(listEl, {
            group: 'shared',
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: async (evt) => {
                try {
                    const changed = new Map();
                    const listsToSync = new Set([evt.from, evt.to]);

                    for (const list of listsToSync) {
                        const status = list.parentElement.dataset.status;
                        [...list.children].forEach((cardEl, index) => {
                            const task = taskCache.get(cardEl.dataset.id);
                            if (!task) return;
                            if (task.order !== index || task.status !== status) {
                                applyStatusChange(task, status);
                                task.order = index;
                                changed.set(task.id, task);
                            }
                        });
                    }

                    if (changed.size) {
                        await bulkPutTasks([...changed.values()]);
                        await renderBoard();
                    }
                } catch (e) {
                    console.error('Failed to persist drag:', e);
                }
            }
        });
    });
};

// --- Task modal -----------------------------------------------------------

const statusControl = document.getElementById('task-status');

const setStatusControl = (value) => {
    newTaskStatus = value;
    statusControl.querySelectorAll('.seg-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === value);
    });
};

const setupTaskModal = () => {
    document.querySelectorAll('.btn-add-task').forEach(btn => {
        btn.addEventListener('click', () => openTaskModal(null, btn.dataset.status));
    });

    statusControl.querySelectorAll('.seg-option').forEach(btn => {
        btn.addEventListener('click', () => setStatusControl(btn.dataset.value));
    });

    document.getElementById('btn-cancel-task').addEventListener('click', () => taskModal.close());

    taskForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const taskData = {
            title: document.getElementById('task-title').value.trim(),
            description: document.getElementById('task-description').value.trim(),
            notes: document.getElementById('task-notes').value.trim(),
            url: document.getElementById('task-url').value.trim()
        };
        if (!taskData.title) return;

        try {
            if (editingTaskId) {
                const existing = await getTaskById(editingTaskId);
                if (existing) {
                    Object.assign(existing, taskData);
                    applyStatusChange(existing, newTaskStatus);
                    await updateTask(existing);
                }
            } else {
                const siblings = childrenMapCache.get(currentParentId) || [];
                const newTask = {
                    ...taskData,
                    id: crypto.randomUUID(),
                    parentId: currentParentId,
                    status: newTaskStatus,
                    order: siblings.length,
                    createdAt: Date.now()
                };
                if (newTaskStatus === 'done') newTask.completedAt = Date.now();
                await addTask(newTask);
            }
        } catch (err) {
            console.error('Error saving task:', err);
        }

        taskModal.close();
        await renderBoard();
    });
};

const openTaskModal = (task = null, status = 'todo') => {
    const subtaskSummary = document.getElementById('task-modal-subtasks');

    if (task) {
        editingTaskId = task.id;
        document.getElementById('task-modal-title').textContent = 'Edit Task';
        document.getElementById('task-title').value = task.title || '';
        document.getElementById('task-description').value = task.description || '';
        document.getElementById('task-notes').value = task.notes || '';
        document.getElementById('task-url').value = task.url || '';
        setStatusControl(task.status);

        const stats = subtaskStats(task.id, childrenMapCache);
        if (stats.total > 0) {
            const pct = computeProgress(task.id, childrenMapCache, task.status);
            subtaskSummary.hidden = false;
            document.getElementById('modal-subtask-label').textContent =
                `${stats.done} of ${stats.total} sub-tasks complete`;
            document.getElementById('modal-subtask-pct').textContent = `${Math.round(pct * 100)}%`;
            const fill = document.getElementById('modal-subtask-fill');
            fill.style.width = `${Math.round(pct * 100)}%`;
            fill.classList.toggle('complete', pct >= 1);
        } else {
            subtaskSummary.hidden = true;
        }
    } else {
        editingTaskId = null;
        document.getElementById('task-modal-title').textContent = 'New Task';
        taskForm.reset();
        setStatusControl(status);
        subtaskSummary.hidden = true;
    }

    taskModal.showModal();
    document.getElementById('task-title').focus();
};

// --- Header controls ------------------------------------------------------

const setupHeaderControls = () => {
    document.getElementById('btn-toggle-view').addEventListener('click', async () => {
        await setSetting('view', settings.view === 'simplified' ? 'detailed' : 'simplified');
        applyView();
    });

    document.getElementById('btn-stats').addEventListener('click', async () => {
        await renderStats();
        statsModal.showModal();
    });
    document.getElementById('btn-close-stats').addEventListener('click', () => statsModal.close());

    document.getElementById('btn-settings').addEventListener('click', () => {
        syncSettingsUI();
        settingsModal.showModal();
    });
    document.getElementById('btn-close-settings').addEventListener('click', () => settingsModal.close());

    // Click on backdrop closes dialogs
    [taskModal, statsModal, settingsModal].forEach(dialog => {
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) dialog.close();
        });
    });
};

// --- Analytics ------------------------------------------------------------

const renderStats = async () => {
    const container = document.getElementById('stats-content');
    container.innerHTML = '';

    const tasks = await getAllTasks();
    const childrenMap = buildChildrenMap(tasks);
    const counts = countByStatus(tasks);
    const total = tasks.length;
    const completionRate = total ? Math.round(counts.done / total * 100) : 0;
    const streak = completionStreak(tasks);

    renderStatTiles(container, [
        { label: 'Total tasks', value: total },
        { label: 'Completed', value: `${counts.done}` },
        { label: 'Completion', value: `${completionRate}%` },
        { label: 'In progress', value: counts['in-progress'] },
        { label: 'Day streak', value: streak }
    ]);

    const grid = document.createElement('div');
    grid.className = 'chart-grid';

    const donutCard = document.createElement('div');
    donutCard.className = 'chart-card';
    donutCard.innerHTML = '<h4>Status breakdown</h4>';
    renderDonut(donutCard, [
        { label: 'To Do', value: counts.todo, chipClass: 'todo' },
        { label: 'In Progress', value: counts['in-progress'], chipClass: 'in-progress' },
        { label: 'Done', value: counts.done, chipClass: 'done' }
    ]);
    grid.appendChild(donutCard);

    const barCard = document.createElement('div');
    barCard.className = 'chart-card';
    barCard.innerHTML = '<h4>Tasks completed — last 14 days</h4>';
    renderBarChart(barCard, completionsPerDay(tasks, 14));
    grid.appendChild(barCard);

    container.appendChild(grid);

    const projectCard = document.createElement('div');
    projectCard.className = 'chart-card';
    projectCard.innerHTML = '<h4>Top-level task progress</h4>';
    const roots = childrenMap.get('root') || [];
    renderProjectProgress(projectCard, roots.map(t => ({
        name: t.title,
        pct: computeProgress(t.id, childrenMap, t.status)
    })));
    container.appendChild(projectCard);
};

// --- Settings modal -------------------------------------------------------

const SEGMENTED_SETTINGS = [
    ['setting-theme', 'theme'],
    ['setting-font', 'font'],
    ['setting-density', 'density']
];

const TOGGLE_SETTINGS = [
    ['setting-show-desc', 'showDesc'],
    ['setting-show-notes', 'showNotes'],
    ['setting-show-url', 'showUrl'],
    ['setting-show-progress', 'showProgress'],
    ['setting-confirm-delete', 'confirmDelete']
];

const syncSettingsUI = () => {
    for (const [elId, key] of SEGMENTED_SETTINGS) {
        document.querySelectorAll(`#${elId} .seg-option`).forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === settings[key]);
        });
    }
    document.querySelectorAll('#setting-accent .swatch').forEach(sw => {
        sw.classList.toggle('active', sw.dataset.value === settings.accent);
    });
    for (const [elId, key] of TOGGLE_SETTINGS) {
        document.getElementById(elId).checked = settings[key];
    }
};

const setupSettingsModal = () => {
    for (const [elId, key] of SEGMENTED_SETTINGS) {
        document.querySelectorAll(`#${elId} .seg-option`).forEach(btn => {
            btn.addEventListener('click', async () => {
                await setSetting(key, btn.dataset.value);
                applyAppearance();
                syncSettingsUI();
            });
        });
    }

    document.querySelectorAll('#setting-accent .swatch').forEach(sw => {
        sw.addEventListener('click', async () => {
            await setSetting('accent', sw.dataset.value);
            applyAppearance();
            syncSettingsUI();
        });
    });

    for (const [elId, key] of TOGGLE_SETTINGS) {
        document.getElementById(elId).addEventListener('change', async (e) => {
            await setSetting(key, e.target.checked);
            await renderBoard();
        });
    }
};

// --- Data export / import -------------------------------------------------

const setupDataButtons = () => {
    document.getElementById('btn-export-data').addEventListener('click', async () => {
        const data = await getAllData();
        data.exportedAt = new Date().toISOString();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `miWork_export_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    const fileInput = document.getElementById('import-file-input');
    document.getElementById('btn-import-data').addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        fileInput.value = '';
        if (!file) return;
        try {
            const data = JSON.parse(await file.text());
            if (!Array.isArray(data.tasks)) throw new Error('No "tasks" array found');
            const { taskCount } = await importData(data);
            await loadSettings();
            applyAppearance();
            applyView();
            syncSettingsUI();
            await renderBoard();
            alert(`Imported ${taskCount} task${taskCount === 1 ? '' : 's'}.`);
        } catch (err) {
            console.error('Import failed:', err);
            alert(`Import failed: ${err.message}`);
        }
    });
};

// Start
document.addEventListener('DOMContentLoaded', initApp);
