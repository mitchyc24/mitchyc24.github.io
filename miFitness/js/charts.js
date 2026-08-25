// charts.js — hand-rolled SVG charts. No chart library, so everything works
// offline, and every colour comes from a CSS custom property so theme and
// accent switches apply without a re-render.

const NS = 'http://www.w3.org/2000/svg';

const el = (tag, attrs = {}, parent = null) => {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (parent) parent.appendChild(node);
    return node;
};

const div = (className, text = '') => {
    const node = document.createElement('div');
    node.className = className;
    if (text) node.textContent = text;
    return node;
};

/** Categorical slots, in the validated order. Never cycled — see `Other`. */
export const SERIES_VARS = ['--viz-1', '--viz-2', '--viz-3', '--viz-4', '--viz-5', '--viz-6', '--viz-7', '--viz-8'];
export const seriesColor = (index) => `var(${SERIES_VARS[index] || '--viz-axis'})`;

// --- Tooltip --------------------------------------------------------------

let tooltip = null;
const getTooltip = () => {
    if (!tooltip) {
        tooltip = div('chart-tooltip');
        document.body.appendChild(tooltip);
    }
    return tooltip;
};

const showTooltip = (event, html) => {
    const tip = getTooltip();
    tip.innerHTML = html;
    tip.style.display = 'block';
    const rect = tip.getBoundingClientRect();
    const pad = 12;
    let x = event.clientX + pad;
    let y = event.clientY - rect.height - pad;
    if (x + rect.width > window.innerWidth - 8) x = event.clientX - rect.width - pad;
    if (y < 8) y = event.clientY + pad;
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${y}px`;
};

export const hideTooltip = () => {
    if (tooltip) tooltip.style.display = 'none';
};

const bindTooltip = (node, html) => {
    const show = (event) => showTooltip(event, typeof html === 'function' ? html() : html);
    node.addEventListener('pointerenter', show);
    node.addEventListener('pointermove', show);
    node.addEventListener('pointerleave', hideTooltip);
};

// --- Shared pieces --------------------------------------------------------

/** Rounded-top bar anchored to the baseline, so zero reads as zero. */
const barPath = (x, y, width, height, radius = 4) => {
    const r = Math.min(radius, width / 2, Math.max(height, 0));
    if (height <= 0) return '';
    return `M${x},${y + height}L${x},${y + r}Q${x},${y} ${x + r},${y}` +
           `L${x + width - r},${y}Q${x + width},${y} ${x + width},${y + r}` +
           `L${x + width},${y + height}Z`;
};

/** The smallest "round" number at or above the data maximum. */
const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
const niceMax = (value) => {
    if (value <= 0) return 1;
    const magnitude = 10 ** Math.floor(Math.log10(value));
    const normalized = value / magnitude;
    const step = NICE_STEPS.find((candidate) => normalized <= candidate + 1e-9) ?? 10;
    return step * magnitude;
};

/**
 * Charts draw in CSS pixels rather than a stretched viewBox — a distorted
 * viewBox turns rounded bar caps into ellipses and thickens strokes unevenly.
 */
const plotWidth = (container, fallback = 320) => {
    const style = getComputedStyle(container);
    const inner = container.clientWidth
        - parseFloat(style.paddingLeft || 0)
        - parseFloat(style.paddingRight || 0);
    return Math.max(240, Math.round(inner) || fallback);
};

const emptyState = (container, message) => {
    container.appendChild(div('empty', message));
};

// --- KPI tiles ------------------------------------------------------------

/** tiles: [{ value, unit, label }] — a hero number needs no plot. */
export const renderStatTiles = (container, tiles) => {
    const row = div('kpi-row');
    for (const tile of tiles) {
        const card = div('stat-tile');
        const value = div('value');
        value.textContent = tile.value;
        if (tile.unit) {
            const unit = document.createElement('span');
            unit.className = 'unit';
            unit.textContent = tile.unit;
            value.appendChild(unit);
        }
        card.appendChild(value);
        card.appendChild(div('label', tile.label));
        row.appendChild(card);
    }
    container.appendChild(row);
    return row;
};

// --- Bar chart ------------------------------------------------------------

/**
 * Single-series bars (volume per week / per day). `data` is
 * [{ label, value, tooltip }]; the newest bar is highlighted, the rest dimmed
 * only when `dimPast` is set.
 */
export const renderBarChart = (container, data, {
    height = 150, formatValue = String, labelEvery = 1,
    emptyMessage = 'No data in this window yet.',
    ariaLabel = `Bar chart, ${data.length} periods`
} = {}) => {
    if (!data.length || data.every((d) => d.value === 0)) {
        emptyState(container, emptyMessage);
        return;
    }

    const width = plotWidth(container);
    const padding = { top: 10, right: 4, bottom: 20, left: 34 };
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;
    const max = niceMax(Math.max(...data.map((d) => d.value)));

    const svg = el('svg', {
        viewBox: `0 0 ${width} ${height}`,
        role: 'img',
        'aria-label': ariaLabel
    }, container);
    svg.style.height = `${height}px`;

    // Recessive gridlines with value labels on the left.
    for (let i = 0; i <= 2; i += 1) {
        const value = (max / 2) * i;
        const y = padding.top + plotH - (value / max) * plotH;
        el('line', {
            x1: padding.left, x2: width - padding.right, y1: y, y2: y, class: 'chart-grid-line'
        }, svg);
        const text = el('text', {
            x: padding.left - 6, y: y + 3, 'text-anchor': 'end', class: 'chart-axis-text'
        }, svg);
        text.textContent = formatValue(value);
    }

    const slot = plotW / data.length;
    const barW = Math.max(3, slot - 2); // 2px surface gap between adjacent bars

    data.forEach((point, index) => {
        const x = padding.left + index * slot + (slot - barW) / 2;
        const h = max > 0 ? (point.value / max) * plotH : 0;
        const y = padding.top + plotH - h;

        if (h > 0) {
            const bar = el('path', {
                d: barPath(x, y, barW, h),
                class: 'chart-bar',
                tabindex: '0',
                role: 'graphics-symbol',
                'aria-label': `${point.label}: ${formatValue(point.value)}`
            }, svg);
            bindTooltip(bar, () => point.tooltip || `<strong>${formatValue(point.value)}</strong><br>${point.label}`);
        }

        // A generous invisible hit target — bars can be a few pixels wide.
        const hit = el('rect', {
            x: padding.left + index * slot, y: padding.top, width: slot, height: plotH, fill: 'transparent'
        }, svg);
        bindTooltip(hit, () => point.tooltip || `<strong>${formatValue(point.value)}</strong><br>${point.label}`);

        if (index % labelEvery === 0 || index === data.length - 1) {
            const label = el('text', {
                x: padding.left + index * slot + slot / 2,
                y: height - 6,
                'text-anchor': 'middle',
                class: 'chart-axis-text'
            }, svg);
            label.textContent = point.label;
        }
    });
};

// --- Donut ----------------------------------------------------------------

/**
 * Categorical share (sets per muscle group). Legend rows carry direct labels,
 * which is also the relief the light-mode palette requires.
 */
export const renderDonut = (container, slices, {
    size = 150, centerLabel = '', centerValue = '',
    emptyMessage = 'Nothing logged in this window yet.',
    ariaLabel = `Donut chart of ${slices.length} categories`
} = {}) => {
    const total = slices.reduce((sum, s) => sum + s.value, 0);
    if (total === 0) {
        emptyState(container, emptyMessage);
        return;
    }

    const wrap = div('donut-wrap');
    wrap.style.display = 'flex';
    wrap.style.justifyContent = 'center';

    const radius = size / 2;
    const thickness = size * 0.22;
    const inner = radius - thickness;
    const svg = el('svg', {
        viewBox: `0 0 ${size} ${size}`,
        width: size, height: size,
        role: 'img',
        'aria-label': ariaLabel
    }, wrap);
    svg.style.width = `${size}px`;
    svg.style.flex = '0 0 auto';

    const gapAngle = total > 0 ? Math.min(0.03, (Math.PI * 2) / (slices.length * 8)) : 0;
    let angle = -Math.PI / 2;

    slices.forEach((slice, index) => {
        const sweep = (slice.value / total) * Math.PI * 2;
        const start = angle + gapAngle / 2;
        const end = angle + sweep - gapAngle / 2;
        angle += sweep;
        if (end <= start) return;

        const point = (r, a) => `${radius + r * Math.cos(a)},${radius + r * Math.sin(a)}`;
        const large = end - start > Math.PI ? 1 : 0;
        const path = el('path', {
            d: `M${point(radius, start)}A${radius},${radius} 0 ${large} 1 ${point(radius, end)}` +
               `L${point(inner, end)}A${inner},${inner} 0 ${large} 0 ${point(inner, start)}Z`,
            fill: slice.color || seriesColor(index),
            stroke: 'var(--viz-surface)',
            'stroke-width': 2 // the 2px surface gap between adjacent fills
        }, svg);
        bindTooltip(path, `<strong>${slice.label}</strong><br>${slice.display || slice.value} · ${Math.round((slice.value / total) * 100)}%`);
    });

    if (centerValue) {
        const value = el('text', {
            x: radius, y: radius - 1, 'text-anchor': 'middle',
            fill: 'var(--text)', 'font-size': '19', 'font-weight': '700'
        }, svg);
        value.textContent = centerValue;
        const label = el('text', {
            x: radius, y: radius + 14, 'text-anchor': 'middle',
            fill: 'var(--text-muted)', 'font-size': '9.5',
            'letter-spacing': '0.08em'
        }, svg);
        label.textContent = centerLabel.toUpperCase();
    }

    container.appendChild(wrap);

    const legend = div('donut-legend');
    slices.forEach((slice, index) => {
        const row = div('row');
        const swatch = div('swatch');
        swatch.style.background = slice.color || seriesColor(index);
        row.appendChild(swatch);
        row.appendChild(div('name', slice.label));
        row.appendChild(div('value', slice.display || String(slice.value)));
        row.appendChild(div('pct', `${Math.round((slice.value / total) * 100)}%`));
        legend.appendChild(row);
    });
    container.appendChild(legend);
};

// --- Line chart -----------------------------------------------------------

/**
 * Single-series trend (estimated 1RM, body weight) with a crosshair. `points`
 * is [{ date, value, tooltip }], oldest first.
 */
export const renderLineChart = (container, points, {
    height = 160, formatValue = String,
    emptyMessage = 'Not enough history to chart yet.',
    ariaLabel = `Line chart, ${points.length} points`,
    locale
} = {}) => {
    if (points.length === 0) {
        emptyState(container, emptyMessage);
        return;
    }

    const width = plotWidth(container);
    const padding = { top: 12, right: 10, bottom: 20, left: 38 };
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;

    const values = points.map((p) => p.value);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    // Pad the band so a flat series doesn't collapse onto the axis.
    const span = rawMax - rawMin || Math.max(rawMax * 0.1, 1);
    const min = Math.max(0, rawMin - span * 0.15);
    const max = rawMax + span * 0.15;

    const xFor = (i) => (points.length === 1
        ? padding.left + plotW / 2
        : padding.left + (i / (points.length - 1)) * plotW);
    const yFor = (v) => padding.top + plotH - ((v - min) / (max - min)) * plotH;

    const svg = el('svg', {
        viewBox: `0 0 ${width} ${height}`,
        role: 'img',
        'aria-label': ariaLabel
    }, container);
    svg.style.height = `${height}px`;

    for (let i = 0; i <= 2; i += 1) {
        const value = min + ((max - min) / 2) * i;
        const y = yFor(value);
        el('line', { x1: padding.left, x2: width - padding.right, y1: y, y2: y, class: 'chart-grid-line' }, svg);
        const text = el('text', {
            x: padding.left - 6, y: y + 3, 'text-anchor': 'end', class: 'chart-axis-text'
        }, svg);
        text.textContent = formatValue(value);
    }

    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i)},${yFor(p.value)}`).join('');
    el('path', {
        d: `${line}L${xFor(points.length - 1)},${padding.top + plotH}L${xFor(0)},${padding.top + plotH}Z`,
        class: 'chart-area'
    }, svg);
    el('path', { d: line, class: 'chart-line' }, svg);

    const crosshair = el('line', {
        y1: padding.top, y2: padding.top + plotH, class: 'chart-crosshair', opacity: '0'
    }, svg);

    points.forEach((point, index) => {
        el('circle', { cx: xFor(index), cy: yFor(point.value), r: 4, class: 'chart-dot' }, svg);
        const hit = el('rect', {
            x: xFor(index) - plotW / (points.length * 2) - 6,
            y: padding.top,
            width: plotW / points.length + 12,
            height: plotH,
            fill: 'transparent'
        }, svg);
        const html = point.tooltip
            || `<strong>${formatValue(point.value)}</strong><br>${point.date.toLocaleDateString()}`;
        hit.addEventListener('pointerenter', () => {
            crosshair.setAttribute('x1', xFor(index));
            crosshair.setAttribute('x2', xFor(index));
            crosshair.setAttribute('opacity', '1');
        });
        hit.addEventListener('pointermove', (event) => showTooltip(event, html));
        hit.addEventListener('pointerleave', () => {
            crosshair.setAttribute('opacity', '0');
            hideTooltip();
        });
    });

    // Only the endpoints get date labels — a label per point is unreadable.
    const first = el('text', {
        x: padding.left, y: height - 6, 'text-anchor': 'start', class: 'chart-axis-text'
    }, svg);
    first.textContent = points[0].date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    if (points.length > 1) {
        const last = el('text', {
            x: width - padding.right, y: height - 6, 'text-anchor': 'end', class: 'chart-axis-text'
        }, svg);
        last.textContent = points.at(-1).date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    }
};

// --- Table view -----------------------------------------------------------

/** The non-visual read of a chart — required alongside every plot. */
export const renderDataTable = (container, headers, rows, summary = 'Show the numbers') => {
    if (rows.length === 0) return;
    const details = document.createElement('details');
    details.className = 'data-table';
    const summaryEl = document.createElement('summary');
    summaryEl.textContent = summary;
    details.appendChild(summaryEl);

    const table = document.createElement('table');
    table.className = 'chart-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const header of headers) {
        const th = document.createElement('th');
        th.textContent = header;
        headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const row of rows) {
        const tr = document.createElement('tr');
        for (const cell of row) {
            const td = document.createElement('td');
            td.textContent = cell;
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    details.appendChild(table);
    container.appendChild(details);
};
