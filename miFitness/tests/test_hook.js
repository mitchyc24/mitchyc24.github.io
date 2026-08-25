import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Simple hook to mock crypto and indexedDB for db.js
export function resolve(specifier, context, nextResolve) {
  return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
  if (url.endsWith('miFitness/js/db.js')) {
    const mock = `
      import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';
      import crypto from 'crypto';

      const idb = fakeIndexedDB;
      globalThis.indexedDB = idb;
      globalThis.crypto = crypto;
      // export for hook usage
      const indexedDB = idb;
      globalThis.idbAPI = idb;
    `;

    return nextLoad(url, context).then(result => {
        return {
            ...result,
            source: mock + result.source.toString()
        };
    });
  }
  return nextLoad(url, context);
}