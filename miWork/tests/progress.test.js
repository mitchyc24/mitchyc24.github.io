import test from 'node:test';
import assert from 'node:assert';
import {
    buildChildrenMap, computeProgress, subtaskStats, countByStatus,
    completionsPerDay, completionStreak, dayKey
} from '../js/progress.js';

const MS_DAY = 24 * 60 * 60 * 1000;

test('miWork progress helpers', async (t) => {

    await t.test('buildChildrenMap groups and sorts by order then createdAt', () => {
        const tasks = [
            { id: 'b', parentId: 'root', order: 1, createdAt: 1 },
            { id: 'a', parentId: 'root', order: 0, createdAt: 2 },
            { id: 'c', parentId: 'root', createdAt: 3 }, // no order -> last
            { id: 'child', parentId: 'a', createdAt: 4 }
        ];
        const map = buildChildrenMap(tasks);
        assert.deepStrictEqual(map.get('root').map(x => x.id), ['a', 'b', 'c']);
        assert.deepStrictEqual(map.get('a').map(x => x.id), ['child']);
    });

    await t.test('computeProgress for a leaf follows status weight', () => {
        const map = buildChildrenMap([]);
        assert.strictEqual(computeProgress('x', map, 'todo'), 0);
        assert.strictEqual(computeProgress('x', map, 'in-progress'), 0.5);
        assert.strictEqual(computeProgress('x', map, 'done'), 1);
    });

    await t.test('computeProgress averages direct children', () => {
        const tasks = [
            { id: 'c1', parentId: 'p', status: 'done' },
            { id: 'c2', parentId: 'p', status: 'todo' }
        ];
        const map = buildChildrenMap(tasks);
        assert.strictEqual(computeProgress('p', map, 'todo'), 0.5);
    });

    await t.test('computeProgress recurses into grandchildren', () => {
        // p -> c1 (has 2 children: one done, one todo => 0.5), c2 (done => 1)
        const tasks = [
            { id: 'c1', parentId: 'p', status: 'todo' },
            { id: 'c2', parentId: 'p', status: 'done' },
            { id: 'g1', parentId: 'c1', status: 'done' },
            { id: 'g2', parentId: 'c1', status: 'todo' }
        ];
        const map = buildChildrenMap(tasks);
        // (0.5 + 1) / 2 = 0.75; c1's own status is ignored because it has children
        assert.strictEqual(computeProgress('p', map, 'todo'), 0.75);
    });

    await t.test('subtaskStats counts direct children only', () => {
        const tasks = [
            { id: 'c1', parentId: 'p', status: 'done' },
            { id: 'c2', parentId: 'p', status: 'in-progress' },
            { id: 'g1', parentId: 'c1', status: 'todo' }
        ];
        const map = buildChildrenMap(tasks);
        assert.deepStrictEqual(subtaskStats('p', map), { total: 2, done: 1, inProgress: 1 });
        assert.deepStrictEqual(subtaskStats('nope', map), { total: 0, done: 0, inProgress: 0 });
    });

    await t.test('countByStatus tallies the three statuses', () => {
        const tasks = [
            { status: 'todo' }, { status: 'todo' },
            { status: 'in-progress' }, { status: 'done' }
        ];
        assert.deepStrictEqual(countByStatus(tasks), { 'todo': 2, 'in-progress': 1, 'done': 1 });
    });

    await t.test('completionsPerDay buckets by local day, oldest first', () => {
        const now = Date.now();
        const tasks = [
            { status: 'done', completedAt: now },
            { status: 'done', completedAt: now },
            { status: 'done', completedAt: now - MS_DAY },
            { status: 'done', completedAt: now - 30 * MS_DAY }, // outside window
            { status: 'todo', completedAt: now } // not done, ignored
        ];
        const series = completionsPerDay(tasks, 7, now);
        assert.strictEqual(series.length, 7);
        assert.strictEqual(series[6].value, 2);       // today
        assert.strictEqual(series[5].value, 1);       // yesterday
        assert.strictEqual(series[6].key, dayKey(now));
        assert.strictEqual(series.reduce((s, d) => s + d.value, 0), 3);
    });

    await t.test('completionStreak counts consecutive days, tolerating an empty today', () => {
        const now = Date.now();
        assert.strictEqual(completionStreak([], now), 0);

        const threeDay = [
            { status: 'done', completedAt: now },
            { status: 'done', completedAt: now - MS_DAY },
            { status: 'done', completedAt: now - 2 * MS_DAY }
        ];
        assert.strictEqual(completionStreak(threeDay, now), 3);

        // Nothing today, but yesterday and the day before → streak of 2 still alive
        const noToday = [
            { status: 'done', completedAt: now - MS_DAY },
            { status: 'done', completedAt: now - 2 * MS_DAY }
        ];
        assert.strictEqual(completionStreak(noToday, now), 2);

        // A gap breaks the streak
        const gapped = [
            { status: 'done', completedAt: now },
            { status: 'done', completedAt: now - 3 * MS_DAY }
        ];
        assert.strictEqual(completionStreak(gapped, now), 1);
    });
});
