// Full-text search + note graph.
//
// A MiniSearch inverted index lives in memory and is persisted to IndexedDB
// (together with a lightweight docs map) so subsequent loads only re-read
// files whose mtime changed. Queries support fuzzy matching, "exact phrases",
// AND/OR operators and -exclusions.

import MiniSearch from '../vendor/minisearch.js';
import { parseFrontmatter, metaTags, metaAliases, extractWikilinks } from './markdown.js';

const CACHE_VERSION = 1;

const MS_OPTIONS = {
  idField: 'path',
  fields: ['title', 'content', 'tags', 'aliases'],
  storeFields: ['title'],
  searchOptions: {
    boost: { title: 3, tags: 2, aliases: 2 },
    fuzzy: 0.2,
    prefix: true,
  },
};

export class NoteIndex {
  constructor() {
    this.ms = new MiniSearch(MS_OPTIONS);
    /** @type {Map<string, {title, content, tags, aliases, links, lastModified}>} */
    this.docs = new Map();
  }

  // ---------------------------------------------------------- persistence

  static fromCache(payload) {
    if (!payload || payload.version !== CACHE_VERSION) return null;
    try {
      const idx = new NoteIndex();
      idx.ms = MiniSearch.loadJSON(payload.indexJson, MS_OPTIONS);
      idx.docs = new Map(payload.docs);
      return idx;
    } catch {
      return null;
    }
  }

  serialize() {
    return {
      version: CACHE_VERSION,
      indexJson: JSON.stringify(this.ms.toJSON()),
      docs: [...this.docs.entries()],
    };
  }

  // ------------------------------------------------------------- syncing

  /**
   * Reconcile the index with the current directory listing.
   * `files` is [{path, title, lastModified}], readFile(path) -> text.
   * Returns true if anything changed.
   */
  async sync(files, readFile) {
    const seen = new Set();
    let changed = false;

    for (const f of files) {
      seen.add(f.path);
      const existing = this.docs.get(f.path);
      if (existing && existing.lastModified === f.lastModified) continue;
      let text;
      try {
        text = await readFile(f.path);
      } catch {
        continue; // unreadable file; leave any stale entry in place
      }
      this.upsert(f.path, f.title, text, f.lastModified);
      changed = true;
    }

    for (const path of [...this.docs.keys()]) {
      if (!seen.has(path)) {
        this.remove(path);
        changed = true;
      }
    }
    return changed;
  }

  upsert(path, title, text, lastModified) {
    const { meta, body } = parseFrontmatter(text);
    const doc = {
      title,
      content: body,
      tags: metaTags(meta),
      aliases: metaAliases(meta),
      links: extractWikilinks(text),
      lastModified,
    };
    if (this.docs.has(path)) this.ms.discard(path);
    this.docs.set(path, doc);
    this.ms.add({
      path,
      title,
      content: body,
      tags: doc.tags.join(' '),
      aliases: doc.aliases.join(' '),
    });
  }

  remove(path) {
    if (!this.docs.has(path)) return;
    this.ms.discard(path);
    this.docs.delete(path);
  }

  // -------------------------------------------------------- graph helpers

  /** Resolve a wikilink target to a note path (title or alias, case-insensitive). */
  resolve(target) {
    const want = target.trim().toLowerCase();
    for (const [path, doc] of this.docs) {
      if (doc.title.toLowerCase() === want) return path;
    }
    for (const [path, doc] of this.docs) {
      if (doc.aliases.some((a) => a.toLowerCase() === want)) return path;
    }
    return null;
  }

  /** Paths of notes that link to the given note. */
  backlinks(path) {
    const doc = this.docs.get(path);
    if (!doc) return [];
    const names = new Set([doc.title.toLowerCase(),
      ...doc.aliases.map((a) => a.toLowerCase())]);
    const result = [];
    for (const [otherPath, other] of this.docs) {
      if (otherPath === path) continue;
      if (other.links.some((l) => names.has(l.toLowerCase()))) result.push(otherPath);
    }
    return result;
  }

  // --------------------------------------------------------------- search

  /**
   * Query grammar:
   *   word          fuzzy/prefix term (terms are ANDed by default)
   *   "some phrase" exact phrase filter
   *   a OR b        either side may match
   *   -word         exclude notes containing word
   */
  search(query) {
    const { terms, phrases, exclusions, useOr } = parseQuery(query);
    let results;

    if (terms.length === 0 && phrases.length > 0) {
      // Phrase-only query: seed candidates from the phrase words.
      results = this.ms.search(phrases.join(' '), { combineWith: 'OR' });
    } else if (terms.length > 0) {
      results = this.ms.search(terms.join(' '), { combineWith: useOr ? 'OR' : 'AND' });
    } else {
      return [];
    }

    const lcPhrases = phrases.map((p) => p.toLowerCase());
    const lcExclusions = exclusions.map((e) => e.toLowerCase());

    return results
      .filter((r) => {
        const doc = this.docs.get(r.id);
        if (!doc) return false;
        const haystack = `${doc.title}\n${doc.content}`.toLowerCase();
        if (lcPhrases.some((p) => !haystack.includes(p))) return false;
        if (lcExclusions.some((e) => haystack.includes(e))) return false;
        return true;
      })
      .slice(0, 50)
      .map((r) => {
        const doc = this.docs.get(r.id);
        const highlight = [...r.terms, ...phrases];
        return {
          path: r.id,
          title: doc.title,
          score: r.score,
          snippet: makeSnippet(doc.content, highlight),
        };
      });
  }
}

function parseQuery(query) {
  const phrases = [];
  const rest = query.replace(/"([^"]+)"/g, (_, p) => {
    phrases.push(p.trim());
    return ' ';
  });
  const terms = [];
  const exclusions = [];
  let useOr = false;
  for (const raw of rest.split(/\s+/)) {
    const token = raw.trim();
    if (!token) continue;
    if (token === 'OR') { useOr = true; continue; }
    if (token === 'AND') continue; // AND is the default
    if (token.startsWith('-') && token.length > 1) exclusions.push(token.slice(1));
    else terms.push(token);
  }
  return { terms, phrases, exclusions, useOr };
}

/** Plain-text snippet around the first match, with <mark> highlights. */
function makeSnippet(content, highlightTerms, radius = 70) {
  const lc = content.toLowerCase();
  let pos = -1;
  for (const term of highlightTerms) {
    const p = lc.indexOf(term.toLowerCase());
    if (p !== -1 && (pos === -1 || p < pos)) pos = p;
  }
  const start = pos === -1 ? 0 : Math.max(0, pos - radius);
  let slice = content.slice(start, start + radius * 2 + 40).replace(/\s+/g, ' ').trim();
  if (start > 0) slice = `…${slice}`;
  if (start + radius * 2 + 40 < content.length) slice = `${slice}…`;

  let html = escapeHtml(slice);
  for (const term of highlightTerms) {
    if (term.length < 2) continue;
    html = html.replace(new RegExp(`(${escapeRegExp(escapeHtml(term))})`, 'gi'), '<mark>$1</mark>');
  }
  return html;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
