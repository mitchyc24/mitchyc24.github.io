// Pure task-tree helpers — no DOM, no IndexedDB, unit-testable in Node.

export const STATUS_WEIGHT = { 'todo': 0, 'in-progress': 0.5, 'done': 1 };

// parentId -> [children], stable-sorted by manual order then creation time.
export const buildChildrenMap = (tasks) => {
    const map = new Map();
    for (const task of tasks) {
        const key = task.parentId ?? 'root';
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(task);
    }
    for (const children of map.values()) {
        children.sort((a, b) =>
            (a.order ?? Infinity) - (b.order ?? Infinity) || (a.createdAt ?? 0) - (b.createdAt ?? 0)
        );
    }
    return map;
};

// Recursive completeness in [0, 1]. A task with sub-tasks is as complete as
// the average of its sub-tasks; a leaf scores by its own status.
export const computeProgress = (taskId, childrenMap, statusOf = null) => {
    const children = childrenMap.get(taskId) || [];
    if (children.length === 0) {
        const status = statusOf ?? 'todo';
        return STATUS_WEIGHT[status] ?? 0;
    }
    let sum = 0;
    for (const child of children) {
        sum += computeProgress(child.id, childrenMap, child.status);
    }
    return sum / children.length;
};

// Direct-child summary for card badges: { total, done, inProgress }.
export const subtaskStats = (taskId, childrenMap) => {
    const children = childrenMap.get(taskId) || [];
    return {
        total: children.length,
        done: children.filter(c => c.status === 'done').length,
        inProgress: children.filter(c => c.status === 'in-progress').length
    };
};

export const countByStatus = (tasks) => {
    const counts = { 'todo': 0, 'in-progress': 0, 'done': 0 };
    for (const task of tasks) {
        if (task.status in counts) counts[task.status]++;
    }
    return counts;
};

// Local-date key (YYYY-MM-DD) for a timestamp.
export const dayKey = (ts) => {
    const d = new Date(ts);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
};

// Completions per day for the trailing `days` days (inclusive of today).
// Returns [{ key, label, value }] oldest → newest. `now` injectable for tests.
export const completionsPerDay = (tasks, days = 14, now = Date.now()) => {
    const counts = new Map();
    for (const task of tasks) {
        if (task.status === 'done' && task.completedAt) {
            const key = dayKey(task.completedAt);
            counts.set(key, (counts.get(key) || 0) + 1);
        }
    }
    const out = [];
    const MS_DAY = 24 * 60 * 60 * 1000;
    for (let i = days - 1; i >= 0; i--) {
        const ts = now - i * MS_DAY;
        const key = dayKey(ts);
        const d = new Date(ts);
        out.push({
            key,
            label: `${d.getMonth() + 1}/${d.getDate()}`,
            value: counts.get(key) || 0
        });
    }
    return out;
};

// Consecutive days (ending today or yesterday) with >= 1 completion.
export const completionStreak = (tasks, now = Date.now()) => {
    const doneDays = new Set(
        tasks.filter(t => t.status === 'done' && t.completedAt).map(t => dayKey(t.completedAt))
    );
    const MS_DAY = 24 * 60 * 60 * 1000;
    let streak = 0;
    // A streak survives until a full day is missed — start from today,
    // but allow the streak to begin yesterday if today has no completions yet.
    let offset = doneDays.has(dayKey(now)) ? 0 : 1;
    while (doneDays.has(dayKey(now - (offset + streak) * MS_DAY))) {
        streak++;
    }
    return streak;
};
