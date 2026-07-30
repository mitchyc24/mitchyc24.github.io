// Wikilink autocomplete for the editor textarea.
//
// While the caret sits inside an unclosed [[...  a dropdown of matching note
// titles/aliases appears at the caret. Enter/Tab inserts "Title]]"; arrows
// navigate; Escape dismisses.

const MAX_ITEMS = 8;

// Style properties that affect text layout — copied onto the mirror div used
// to locate the caret inside the textarea.
const MIRROR_PROPS = [
  'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing',
  'lineHeight', 'textTransform', 'wordSpacing', 'textIndent', 'whiteSpace',
  'overflowWrap', 'tabSize',
];

/** Pixel coordinates of the caret inside a textarea, relative to the viewport. */
function caretViewportPosition(textarea) {
  const mirror = document.createElement('div');
  const style = window.getComputedStyle(textarea);
  for (const prop of MIRROR_PROPS) mirror.style[prop] = style[prop];
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';

  mirror.textContent = textarea.value.slice(0, textarea.selectionStart);
  const marker = document.createElement('span');
  marker.textContent = '​';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const rect = textarea.getBoundingClientRect();
  const top = rect.top + (marker.offsetTop - textarea.scrollTop) + parseFloat(style.lineHeight || 20);
  const left = rect.left + (marker.offsetLeft - textarea.scrollLeft);
  mirror.remove();
  return { top, left };
}

/**
 * Wire autocomplete onto `textarea`.
 * getCandidates() -> [{ label, insert, hint }] (already unfiltered; we filter).
 */
export function attachWikilinkAutocomplete(textarea, getCandidates) {
  const box = document.createElement('div');
  box.className = 'wl-autocomplete';
  box.hidden = true;
  document.body.appendChild(box);

  let items = [];
  let selected = 0;
  let queryStart = -1; // index in the value just after "[["

  function close() {
    box.hidden = true;
    items = [];
    queryStart = -1;
  }

  function activeQuery() {
    const pos = textarea.selectionStart;
    const before = textarea.value.slice(0, pos);
    const open = before.lastIndexOf('[[');
    if (open === -1) return null;
    const fragment = before.slice(open + 2);
    // Bail if the link was closed or the fragment spans a newline/pipe.
    if (/[\]\n|#]/.test(fragment)) return null;
    return { start: open + 2, text: fragment };
  }

  function render() {
    box.textContent = '';
    items.forEach((item, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = item.label;
      if (item.hint) {
        const hint = document.createElement('span');
        hint.className = 'wl-alias';
        hint.textContent = item.hint;
        btn.appendChild(hint);
      }
      if (i === selected) btn.classList.add('selected');
      // mousedown so the textarea keeps focus
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        pick(i);
      });
      box.appendChild(btn);
    });
  }

  function pick(i) {
    const item = items[i];
    if (!item || queryStart === -1) return;
    const end = textarea.selectionStart;
    const after = textarea.value.slice(end);
    const closing = after.startsWith(']]') ? '' : ']]';
    textarea.value = textarea.value.slice(0, queryStart) + item.insert + closing + textarea.value.slice(end);
    const caret = queryStart + item.insert.length + closing.length + (closing ? 0 : 2);
    textarea.selectionStart = textarea.selectionEnd = caret;
    close();
    textarea.dispatchEvent(new Event('input'));
    textarea.focus();
  }

  function update() {
    const q = activeQuery();
    if (!q) { close(); return; }
    const needle = q.text.toLowerCase();
    const all = getCandidates();
    const starts = [];
    const contains = [];
    for (const c of all) {
      const hay = c.label.toLowerCase();
      if (needle === '') starts.push(c);
      else if (hay.startsWith(needle)) starts.push(c);
      else if (hay.includes(needle)) contains.push(c);
    }
    items = [...starts, ...contains].slice(0, MAX_ITEMS);
    if (items.length === 0) { close(); return; }
    queryStart = q.start;
    selected = 0;
    render();
    const { top, left } = caretViewportPosition(textarea);
    box.hidden = false;
    const boxWidth = Math.min(340, window.innerWidth - 20);
    box.style.top = `${Math.min(top + 4, window.innerHeight - box.offsetHeight - 10)}px`;
    box.style.left = `${Math.min(left, window.innerWidth - boxWidth - 10)}px`;
  }

  textarea.addEventListener('input', update);
  textarea.addEventListener('click', () => { if (!box.hidden) update(); });
  textarea.addEventListener('blur', () => setTimeout(close, 100));
  textarea.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selected = (selected + 1) % items.length;
      render();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selected = (selected - 1 + items.length) % items.length;
      render();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      pick(selected);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  });

  return { close };
}
