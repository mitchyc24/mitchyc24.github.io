import test from 'node:test';
import assert from 'node:assert';
import { initDB, addTask, getTasksByParentId, updateTask, getTaskById, deleteTask, deleteTasksRecursive, saveSetting, getSetting, bulkPutTasks, getAllTasks, importData, getAllData } from '../js/db.js';

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

    await t.test('Bulk Put Tasks upserts in one transaction', async () => {
        await bulkPutTasks([
            { id: 'bulk1', parentId: 'root', title: 'Bulk 1', status: 'todo', order: 0 },
            { id: 'bulk2', parentId: 'root', title: 'Bulk 2', status: 'done', order: 1 }
        ]);
        await bulkPutTasks([
            { id: 'bulk1', parentId: 'root', title: 'Bulk 1 updated', status: 'done', order: 1 }
        ]);

        const t1 = await getTaskById('bulk1');
        assert.strictEqual(t1.title, 'Bulk 1 updated');
        assert.strictEqual((await getAllTasks()).filter(t => t.id.startsWith('bulk')).length, 2);

        await deleteTask('bulk1');
        await deleteTask('bulk2');
    });

    await t.test('Import merges tasks by id and settings by key', async () => {
        const result = await importData({
            tasks: [
                { id: 'imp1', parentId: 'root', title: 'Imported', status: 'todo' },
                { title: 'invalid, no id' }
            ],
            settings: { accent: 'teal' }
        });

        assert.strictEqual(result.taskCount, 1);
        assert.strictEqual(result.settingCount, 1);
        assert.strictEqual((await getTaskById('imp1')).title, 'Imported');
        assert.strictEqual(await getSetting('accent'), 'teal');

        const all = await getAllData();
        assert.ok(Array.isArray(all.tasks));
        assert.strictEqual(all.settings.accent, 'teal');

        await deleteTask('imp1');
    });
});
