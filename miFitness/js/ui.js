// ui.js — small presentation helpers shared by every view: element creation,
// icons from the sprite, toasts, and promise-based dialogs so callers can
// `await` a confirmation instead of nesting callbacks.

import { t } from './i18n.js';

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** createEl('div.card', { onclick }, [child, 'text']) */
export const createEl = (spec, props = {}, children = []) => {
    const [tag, ...classes] = spec.split('.');
    const node = document.createElement(tag || 'div');
    if (classes.length) node.className = classes.join(' ');
    for (const [key, value] of Object.entries(props)) {
        if (value === undefined || value === null || value === false) continue;
        if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key === 'style') Object.assign(node.style, value);
        else if (key.startsWith('on') && typeof value === 'function') {
            node.addEventListener(key.slice(2).toLowerCase(), value);
        } else node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of [].concat(children)) {
        if (child === null || child === undefined || child === false) continue;
        node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
};

/** A sprite reference — icons are defined once in index.html. */
export const icon = (name, size = 18) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); // sprite icons are drawn on a 24-unit grid
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#i-${name}`);
    svg.appendChild(use);
    return svg;
};

export const clear = (node) => {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
};

export const emptyState = (headline, message, action = null) => createEl('div.empty', {}, [
    icon('info', 34),
    createEl('div.headline', { text: headline }),
    message ? createEl('p', { text: message }) : null,
    action
]);

// --- Toasts ---------------------------------------------------------------

export const toast = (message, { type = 'success', duration = 2600, iconName } = {}) => {
    const host = $('#toast-host');
    if (!host) return;
    const node = createEl(`div.toast.${type}`, {}, [
        icon(iconName || (type === 'error' ? 'info' : type === 'pr' ? 'star' : 'check'), 17),
        createEl('span', { text: message })
    ]);
    host.appendChild(node);
    setTimeout(() => {
        node.style.transition = 'opacity 0.2s, transform 0.2s';
        node.style.opacity = '0';
        node.style.transform = 'translateY(6px)';
        setTimeout(() => node.remove(), 220);
    }, duration);
};

// --- Dialogs --------------------------------------------------------------

/** Wire every [data-close-dialog] inside a <dialog> once. */
export const wireDialogs = () => {
    for (const dialog of $$('dialog')) {
        for (const button of $$('[data-close-dialog]', dialog)) {
            button.addEventListener('click', () => dialog.close());
        }
        // Clicking the backdrop closes, clicking the panel does not.
        dialog.addEventListener('click', (event) => {
            if (event.target === dialog) dialog.close();
        });
    }
};

export const openDialog = (dialog) => {
    if (!dialog.open) dialog.showModal();
};

export const confirmDialog = ({ title, message, confirmLabel, danger = false }) =>
    new Promise((resolve) => {
        const dialog = $('#confirm-dialog');
        $('#confirm-title').textContent = title || t('common.areYouSure');
        $('#confirm-message').textContent = message || '';
        const ok = $('#confirm-ok');
        ok.textContent = confirmLabel || t('common.confirm');
        ok.className = danger ? 'btn solid-danger' : 'btn primary';

        const finish = (value) => {
            ok.removeEventListener('click', onOk);
            dialog.removeEventListener('close', onClose);
            resolve(value);
        };
        const onOk = () => { dialog.close(); finish(true); };
        const onClose = () => finish(false);

        ok.addEventListener('click', onOk);
        dialog.addEventListener('close', onClose, { once: true });
        $('#confirm-cancel').onclick = () => dialog.close();
        openDialog(dialog);
    });

export const promptDialog = ({ title, value = '', placeholder = '' }) => new Promise((resolve) => {
    const dialog = $('#prompt-dialog');
    const form = $('#prompt-form');
    const input = $('#prompt-input');
    $('#prompt-title').textContent = title;
    input.value = value;
    input.placeholder = placeholder;

    let submitted = null;
    const onSubmit = (event) => {
        event.preventDefault();
        submitted = input.value.trim();
        dialog.close();
    };
    form.addEventListener('submit', onSubmit);
    dialog.addEventListener('close', () => {
        form.removeEventListener('submit', onSubmit);
        resolve(submitted || null);
    }, { once: true });

    openDialog(dialog);
    requestAnimationFrame(() => input.select());
});

/** A bottom-sheet action list. `options` is [{ label, sub, value, danger }]. */
export const sheetDialog = ({ title, options }) => new Promise((resolve) => {
    const dialog = $('#sheet-dialog');
    $('#sheet-title').textContent = title;
    const list = clear($('#sheet-list'));

    let chosen = null;
    for (const option of options) {
        list.appendChild(createEl('button.picker-item', {
            type: 'button',
            onclick: () => { chosen = option.value; dialog.close(); }
        }, [
            createEl('div.body', {}, [
                createEl('div.name', {
                    text: option.label,
                    style: option.danger ? { color: 'var(--danger)' } : {}
                }),
                option.sub ? createEl('div.sub', { text: option.sub }) : null
            ])
        ]));
    }

    dialog.addEventListener('close', () => resolve(chosen), { once: true });
    openDialog(dialog);
});

// --- Misc -----------------------------------------------------------------

export const initials = (name) => name
    .split(/\s+/)
    .filter((word) => /[a-z0-9]/i.test(word))
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');

/** Trigger a browser download for a Blob. */
export const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const anchor = createEl('a', { href: url, download: filename });
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
