import test from 'node:test';
import assert from 'node:assert';
import { parseQuery } from '../js/search.js';

test('parseQuery', async (t) => {
  await t.test('handles empty or whitespace-only queries', () => {
    assert.deepStrictEqual(parseQuery(''), {
      terms: [],
      phrases: [],
      exclusions: [],
      useOr: false,
    });
    assert.deepStrictEqual(parseQuery('   \t  \n '), {
      terms: [],
      phrases: [],
      exclusions: [],
      useOr: false,
    });
  });

  await t.test('parses simple terms', () => {
    assert.deepStrictEqual(parseQuery('apple'), {
      terms: ['apple'],
      phrases: [],
      exclusions: [],
      useOr: false,
    });
    assert.deepStrictEqual(parseQuery('apple banana orange'), {
      terms: ['apple', 'banana', 'orange'],
      phrases: [],
      exclusions: [],
      useOr: false,
    });
  });

  await t.test('extracts exact phrases', () => {
    assert.deepStrictEqual(parseQuery('"hello world"'), {
      terms: [],
      phrases: ['hello world'],
      exclusions: [],
      useOr: false,
    });
    assert.deepStrictEqual(parseQuery('"first phrase" "second phrase"'), {
      terms: [],
      phrases: ['first phrase', 'second phrase'],
      exclusions: [],
      useOr: false,
    });
    // Trims spaces within quotes
    assert.deepStrictEqual(parseQuery('"  padded phrase  "'), {
      terms: [],
      phrases: ['padded phrase'],
      exclusions: [],
      useOr: false,
    });
  });

  await t.test('handles operators AND/OR', () => {
    // AND is ignored as it's the default
    assert.deepStrictEqual(parseQuery('apple AND banana'), {
      terms: ['apple', 'banana'],
      phrases: [],
      exclusions: [],
      useOr: false,
    });

    assert.deepStrictEqual(parseQuery('apple OR banana'), {
      terms: ['apple', 'banana'],
      phrases: [],
      exclusions: [],
      useOr: true,
    });

    // Multiple ORs just set the flag to true
    assert.deepStrictEqual(parseQuery('apple OR banana OR orange'), {
      terms: ['apple', 'banana', 'orange'],
      phrases: [],
      exclusions: [],
      useOr: true,
    });
  });

  await t.test('handles exclusions', () => {
    assert.deepStrictEqual(parseQuery('-apple'), {
      terms: [],
      phrases: [],
      exclusions: ['apple'],
      useOr: false,
    });

    assert.deepStrictEqual(parseQuery('fruit -apple -banana'), {
      terms: ['fruit'],
      phrases: [],
      exclusions: ['apple', 'banana'],
      useOr: false,
    });
  });

  await t.test('handles edge cases', () => {
    // Single dash is just a term
    assert.deepStrictEqual(parseQuery('-'), {
      terms: ['-'],
      phrases: [],
      exclusions: [],
      useOr: false,
    });

    // Empty quotes won't be caught by the regex /"([^"]+)"/ (requires 1+ chars)
    // and thus become a term '""'
    assert.deepStrictEqual(parseQuery('""'), {
      terms: ['""'],
      phrases: [],
      exclusions: [],
      useOr: false,
    });
  });

  await t.test('handles mixed queries', () => {
    assert.deepStrictEqual(
      parseQuery('cat OR dog "pet store" -bird -reptile AND fish'),
      {
        terms: ['cat', 'dog', 'fish'],
        phrases: ['pet store'],
        exclusions: ['bird', 'reptile'],
        useOr: true, // Set to true because of 'OR'
      }
    );
  });
});
