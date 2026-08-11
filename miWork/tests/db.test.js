import test from 'node:test';
import assert from 'node:assert';
import { initDB, addTask, getTasksByParentId, updateTask, getTaskById, deleteTask, deleteTasksRecursive, saveSetting, getSetting } from '../js/db.js';

// Setup IndexedDB mock for Node.js
import 'fake-indexeddb/auto';

test('miWork IndexedDB Tests', async (t) => {

    await t.test('Initialize DB', async () => {
        const db = await initDB();
        assert.ok(db);
        assert.strictEqual(db.name, 'miWorkDB');
    });

    await t.test('Add and Get Task', async () => {
        const task = {
            id: 'task1',
            parentId: 'root',
            title: 'Test Task',
            status: 'todo'
        };
        await addTask(task);

        const retrieved = await getTaskById('task1');
        assert.deepStrictEqual(retrieved, task);
    });

    await t.test('Update Task', async () => {
        const task = await getTaskById('task1');
        task.status = 'in-progress';
        await updateTask(task);

        const retrieved = await getTaskById('task1');
        assert.strictEqual(retrieved.status, 'in-progress');
    });

    await t.test('Get Tasks By ParentId', async () => {
        const childTask = {
            id: 'child1',
            parentId: 'task1',
            title: 'Child Task',
            status: 'todo'
        };
        await addTask(childTask);

        const children = await getTasksByParentId('task1');
        assert.strictEqual(children.length, 1);
        assert.deepStrictEqual(children[0], childTask);
    });

    await t.test('Delete Tasks Recursive', async () => {
        await deleteTasksRecursive('task1');

        const parent = await getTaskById('task1');
        const child = await getTaskById('child1');

        assert.strictEqual(parent, undefined);
        assert.strictEqual(child, undefined);
    });

    await t.test('Save and Get Setting', async () => {
        await saveSetting('theme', 'dark');
        const theme = await getSetting('theme');
        assert.strictEqual(theme, 'dark');
    });
});
