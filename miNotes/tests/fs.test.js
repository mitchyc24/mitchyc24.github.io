import test from 'node:test';
import assert from 'node:assert';
import { noteExists, statNote, listNotes } from '../js/fs.js';

// Helper to create mock dir handles
function createMockDirHandle(files = {}, dirs = {}) {
  return {
    kind: 'directory',
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
    },
    async *entries() {
      for (const [name, handle] of Object.entries(dirs)) {
        yield [name, handle];
      }
      for (const [name, handle] of Object.entries(files)) {
        yield [name, handle];
      }
    }
  };
}

function createMockFileHandle(fileObj, throwError = false) {
  return {
    kind: 'file',
    getFile: async () => {
      if (throwError) throw new Error('Unreadable entry');
      return fileObj;
    }
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

test('listNotes', async (t) => {
  await t.test('handles unreadable entries gracefully', async () => {
    // createMockFileHandle(fileObj, throwError)
    const mockUnreadableFileHandle = createMockFileHandle({ lastModified: 1000, size: 50 }, true);
    const mockReadableFileHandle = createMockFileHandle({ lastModified: 2000, size: 100 }, false);

    const dirHandle = createMockDirHandle({
      'unreadable.md': mockUnreadableFileHandle,
      'readable.md': mockReadableFileHandle
    });

    const notes = await listNotes(dirHandle);

    assert.strictEqual(notes.length, 2);

    // the notes are sorted by lastModified, descending.
    // since unreadable had an error, its lastModified is 0. readable is 2000.
    // so readable should be first.
    assert.strictEqual(notes[0].name, 'readable.md');
    assert.strictEqual(notes[0].lastModified, 2000);
    assert.strictEqual(notes[0].size, 100);

    assert.strictEqual(notes[1].name, 'unreadable.md');
    assert.strictEqual(notes[1].lastModified, 0); // fallback value due to error
    assert.strictEqual(notes[1].size, 0); // fallback value due to error
  });
  await t.test('filters out dotfiles and assets directory', async () => {
    const mockFileHandle = createMockFileHandle({ lastModified: 1000, size: 50 }, false);

    // Directory with valid file, dotfile, and assets dir
    const assetsDir = createMockDirHandle({
      'asset.png': mockFileHandle,
      'should-be-ignored.md': mockFileHandle
    });

    const dirHandle = createMockDirHandle(
      {
        'valid.md': mockFileHandle,
        '.hidden.md': mockFileHandle,
        'not-markdown.txt': mockFileHandle
      },
      {
        'assets': assetsDir,
        '.hiddendir': createMockDirHandle({'hidden-note.md': mockFileHandle})
      }
    );

    const notes = await listNotes(dirHandle);

    // Should only contain valid.md
    assert.strictEqual(notes.length, 1);
    assert.strictEqual(notes[0].name, 'valid.md');
  });

  await t.test('recursively finds notes in subdirectories', async () => {
    const mockFileHandle1 = createMockFileHandle({ lastModified: 1000, size: 50 }, false);
    const mockFileHandle2 = createMockFileHandle({ lastModified: 2000, size: 100 }, false);

    const subDir2 = createMockDirHandle({
      'note3.md': mockFileHandle2
    });

    const subDir1 = createMockDirHandle(
      {
        'note2.md': mockFileHandle1
      },
      {
        'subDir2': subDir2
      }
    );

    const dirHandle = createMockDirHandle(
      {
        'note1.md': mockFileHandle2
      },
      {
        'subDir1': subDir1
      }
    );

    const notes = await listNotes(dirHandle);

    assert.strictEqual(notes.length, 3);

    // Check paths are constructed correctly
    const paths = notes.map(n => n.path).sort();
    assert.deepStrictEqual(paths, ['note1.md', 'subDir1/note2.md', 'subDir1/subDir2/note3.md']);
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
