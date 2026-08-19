import test from 'node:test';
import assert from 'node:assert';
import { noteExists, statNote } from '../js/fs.js';

// Helper to create mock dir handles
function createMockDirHandle(files = {}, dirs = {}) {
  return {
    getDirectoryHandle: async (name) => {
      if (dirs[name]) {
        return dirs[name];
      }
      throw new Error(`NotFoundError: ${name} not found`);
    },
    getFileHandle: async (name) => {
      if (files[name]) {
        return files[name];
      }
      throw new Error(`NotFoundError: ${name} not found`);
    }
  };
}

function createMockFileHandle(fileObj) {
  return {
    getFile: async () => fileObj
  };
}

test('noteExists', async (t) => {
  await t.test('returns true when the file exists in root', async () => {
    const mockFileHandle = createMockFileHandle({ lastModified: 1000 });
    const dirHandle = createMockDirHandle({ 'test.md': mockFileHandle });

    const exists = await noteExists(dirHandle, 'test.md');
    assert.strictEqual(exists, true);
  });

  await t.test('returns true when the file exists in subfolder', async () => {
    const mockFileHandle = createMockFileHandle({ lastModified: 1000 });
    const subFolder = createMockDirHandle({ 'test.md': mockFileHandle });
    const dirHandle = createMockDirHandle({}, { 'folder': subFolder });

    const exists = await noteExists(dirHandle, 'folder/test.md');
    assert.strictEqual(exists, true);
  });

  await t.test('returns false when the file does not exist', async () => {
    const dirHandle = createMockDirHandle(); // empty dir

    const exists = await noteExists(dirHandle, 'test.md');
    assert.strictEqual(exists, false);
  });

  await t.test('returns false when the subfolder does not exist', async () => {
    const dirHandle = createMockDirHandle(); // empty dir

    const exists = await noteExists(dirHandle, 'folder/test.md');
    assert.strictEqual(exists, false);
  });
});

test('statNote', async (t) => {
  await t.test('returns lastModified timestamp when the file exists', async () => {
    const mockFileHandle = createMockFileHandle({ lastModified: 1234567890 });
    const dirHandle = createMockDirHandle({ 'test.md': mockFileHandle });

    const mtime = await statNote(dirHandle, 'test.md');
    assert.strictEqual(mtime, 1234567890);
  });

  await t.test('returns lastModified timestamp when the file exists in subfolder', async () => {
    const mockFileHandle = createMockFileHandle({ lastModified: 9876543210 });
    const subFolder = createMockDirHandle({ 'test.md': mockFileHandle });
    const dirHandle = createMockDirHandle({}, { 'folder': subFolder });

    const mtime = await statNote(dirHandle, 'folder/test.md');
    assert.strictEqual(mtime, 9876543210);
  });

  await t.test('returns null when the file does not exist', async () => {
    const dirHandle = createMockDirHandle(); // empty dir

    const mtime = await statNote(dirHandle, 'test.md');
    assert.strictEqual(mtime, null);
  });

  await t.test('returns null when the subfolder does not exist', async () => {
    const dirHandle = createMockDirHandle(); // empty dir

    const mtime = await statNote(dirHandle, 'folder/test.md');
    assert.strictEqual(mtime, null);
  });
});
