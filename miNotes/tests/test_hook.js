import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// A simple hook to stub out DOMPurify so it doesn't crash when testing markdown.js
register(pathToFileURL('./miNotes/tests/loader-hook.js'));
