import test from 'node:test';
import assert from 'node:assert';
import { metaTags, metaAliases, parseFrontmatter } from '../js/markdown.js';

test('metaTags', async (t) => {
  await t.test('handles undefined/missing tags', () => {
    assert.deepStrictEqual(metaTags({}), []);
    assert.deepStrictEqual(metaTags({ other: 'value' }), []);
  });

  await t.test('handles single string with one tag', () => {
    assert.deepStrictEqual(metaTags({ tags: 'javascript' }), ['javascript']);
    assert.deepStrictEqual(metaTags({ tag: 'javascript' }), ['javascript']);
  });

  await t.test('handles string with comma/space separation', () => {
    assert.deepStrictEqual(metaTags({ tags: 'js, react, node' }), ['js', 'react', 'node']);
    assert.deepStrictEqual(metaTags({ tags: 'js react node' }), ['js', 'react', 'node']);
    assert.deepStrictEqual(metaTags({ tags: 'js,react,node' }), ['js', 'react', 'node']);
  });

  await t.test('handles array of strings', () => {
    assert.deepStrictEqual(metaTags({ tags: ['js', 'react', 'node'] }), ['js', 'react', 'node']);
  });

  await t.test('strips leading hashtags', () => {
    assert.deepStrictEqual(metaTags({ tags: '#javascript' }), ['javascript']);
    assert.deepStrictEqual(metaTags({ tags: ['#js', '#react'] }), ['js', 'react']);
    assert.deepStrictEqual(metaTags({ tags: '#js, #react' }), ['js', 'react']);
  });

  await t.test('filters out empty values', () => {
    assert.deepStrictEqual(metaTags({ tags: ['js', '', 'react'] }), ['js', 'react']);
    assert.deepStrictEqual(metaTags({ tags: 'js, , react' }), ['js', 'react']);
  });
});

test('metaAliases', async (t) => {
  await t.test('handles undefined/missing aliases', () => {
    assert.deepStrictEqual(metaAliases({}), []);
    assert.deepStrictEqual(metaAliases({ other: 'value' }), []);
  });

  await t.test('handles single string with one alias', () => {
    assert.deepStrictEqual(metaAliases({ aliases: 'My Note' }), ['My Note']);
    assert.deepStrictEqual(metaAliases({ alias: 'My Note' }), ['My Note']);
  });

  await t.test('handles array of strings', () => {
    assert.deepStrictEqual(metaAliases({ aliases: ['Note 1', 'Note 2'] }), ['Note 1', 'Note 2']);
  });

  await t.test('filters out empty values and trims strings', () => {
    assert.deepStrictEqual(metaAliases({ aliases: [' Note ', '', 'Another Note'] }), ['Note', 'Another Note']);
  });
});

test('parseFrontmatter', async (t) => {
  await t.test('returns empty meta and full body if no frontmatter', () => {
    const text = '# Hello World\nThis is a note.';
    const result = parseFrontmatter(text);
    assert.deepStrictEqual(result.meta, {});
    assert.strictEqual(result.body, text);
  });

  await t.test('parses basic scalar values', () => {
    const text = '---\ntitle: My Note\ndraft: true\ncount: 42\n---\n# Hello World';
    const result = parseFrontmatter(text);
    assert.deepStrictEqual(result.meta, {
      title: 'My Note',
      draft: true,
      count: '42' // parseScalar keeps unquoted numbers as strings based on the implementation
    });
    assert.strictEqual(result.body, '# Hello World');
  });

  await t.test('parses inline lists', () => {
    const text = '---\ntags: [js, react, node]\n---\n# Hello World';
    const result = parseFrontmatter(text);
    assert.deepStrictEqual(result.meta, {
      tags: ['js', 'react', 'node']
    });
  });

  await t.test('parses block lists (bullet points)', () => {
    const text = '---\naliases:\n  - Note 1\n  - Note 2\n---\n# Hello World';
    const result = parseFrontmatter(text);
    assert.deepStrictEqual(result.meta, {
      aliases: ['Note 1', 'Note 2']
    });
  });

  await t.test('strips quotes from string scalars', () => {
    const text = '---\ntitle: "My Note"\nauthor: \'Mitchell\'\n---\nBody';
    const result = parseFrontmatter(text);
    assert.deepStrictEqual(result.meta, {
      title: 'My Note',
      author: 'Mitchell'
    });
  });

  await t.test('handles empty lines or malformed frontmatter gracefully', () => {
    const text = '---\ntitle: Valid\n\ninvalid line without colon\n---\nBody';
    const result = parseFrontmatter(text);
    assert.deepStrictEqual(result.meta, {
      title: 'Valid'
    });
    assert.strictEqual(result.body, 'Body');
  });
});
