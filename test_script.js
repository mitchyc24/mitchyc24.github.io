import { indexedDB } from 'fake-indexeddb';
globalThis.idbAPI = indexedDB;
const api = typeof indexedDB !== 'undefined' ? indexedDB : (globalThis.idbAPI || globalThis.indexedDB);
console.log(api);
