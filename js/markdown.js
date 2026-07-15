// Markdown pipeline: GFM via marked, [[wikilink]] extension, YAML frontmatter
// extraction, and DOMPurify sanitization (all user content is untrusted — see
// the XSS note in the design spec).

import { Marked } from '../vendor/marked.esm.js';
import DOMPurify from '../vendor/purify.es.mjs';

// ---------------------------------------------------------------- wikilinks

// [[Target]], [[Target|Alias]], [[Target#Heading]]
const WIKILINK_RE = /^\[\[([^\[\]|#\n]+)(?:#([^\[\]|\n]+))?(?:\|([^\[\]\n]+))?\]\]/;

const wikilinkExtension = {
  name: 'wikilink',
  level: 'inline',
  start(src) {
    const i = src.indexOf('[[');
    return i === -1 ? undefined : i;
  },
  tokenizer(src) {
    const match = WIKILINK_RE.exec(src);
    if (!match) return undefined;
    return {
      type: 'wikilink',
      raw: match[0],
      target: match[1].trim(),
      anchor: (match[2] || '').trim(),
      alias: (match[3] || '').trim(),
    };
  },
  renderer(token) {
    const label = token.alias || token.target;
    return `<a class="wikilink" data-wikilink="${escapeAttr(token.target)}" href="#">${escapeHtml(label)}</a>`;
  },
};

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
const escapeAttr = escapeHtml;

// -------------------------------------------------------------- frontmatter

/**
 * Extract YAML frontmatter from the head of a note.
 * Supports the common subset: scalars, [inline, lists] and "- item" lists.
 * Returns { meta, body }.
 */
export function parseFrontmatter(text) {
  const meta = {};
  if (!text.startsWith('---')) return { meta, body: text };
  const end = text.indexOf('\n---', 3);
  if (end === -1) return { meta, body: text };
  const rawBlock = text.slice(text.indexOf('\n') + 1, end);
  const body = text.slice(end + 4).replace(/^[ \t]*\r?\n/, '');

  let currentKey = null;
  for (const rawLine of rawBlock.split(/\r?\n/)) {
    const listItem = rawLine.match(/^\s+-\s*(.+)$/);
    if (listItem && currentKey) {
      if (!Array.isArray(meta[currentKey])) meta[currentKey] = [];
      meta[currentKey].push(parseScalar(listItem[1]));
      continue;
    }
    const kv = rawLine.match(/^([\w][\w .-]*):\s*(.*)$/);
    if (!kv) continue;
    currentKey = kv[1].trim();
    const value = kv[2].trim();
    if (value === '') {
      meta[currentKey] = []; // likely a block list; items follow
    } else if (value.startsWith('[') && value.endsWith(']')) {
      meta[currentKey] = value.slice(1, -1).split(',')
        .map((s) => parseScalar(s.trim())).filter((s) => s !== '');
    } else {
      meta[currentKey] = parseScalar(value);
    }
  }
  return { meta, body };
}

function parseScalar(s) {
  const unquoted = s.replace(/^["']|["']$/g, '');
  if (/^(true|false)$/i.test(unquoted)) return unquoted.toLowerCase() === 'true';
  return unquoted;
}

/** Normalize frontmatter tags into a string array. */
export function metaTags(meta) {
  let tags = meta.tags ?? meta.tag ?? [];
  if (typeof tags === 'string') tags = tags.split(/[,\s]+/);
  return tags.map(String).map((t) => t.replace(/^#/, '').trim()).filter(Boolean);
}

/** Normalize frontmatter aliases into a string array. */
export function metaAliases(meta) {
  let aliases = meta.aliases ?? meta.alias ?? [];
  if (typeof aliases === 'string') aliases = [aliases];
  return aliases.map(String).map((a) => a.trim()).filter(Boolean);
}

// ---------------------------------------------------------------- rendering

const marked = new Marked({ gfm: true, breaks: false });
marked.use({ extensions: [wikilinkExtension] });

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  // External links open in a new tab without opener access.
  if (node.tagName === 'A' && /^https?:/i.test(node.getAttribute('href') || '')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/**
 * Render note text (without frontmatter) to sanitized HTML.
 * data-wikilink attributes survive sanitization (data-* is allowed) and are
 * wired up to navigation by the caller.
 */
export function renderMarkdown(body) {
  const html = marked.parse(body);
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form'],
    FORBID_ATTR: ['style'],
  });
}

/** Collect wikilink targets from note text (for the backlink graph). */
export function extractWikilinks(text) {
  const targets = new Set();
  const re = /\[\[([^\[\]|#\n]+)(?:#[^\[\]|\n]+)?(?:\|[^\[\]\n]+)?\]\]/g;
  let m;
  while ((m = re.exec(text)) !== null) targets.add(m[1].trim());
  return [...targets];
}
