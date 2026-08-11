// Lightweight hand-rolled SVG charts — no external chart library, fully
// offline. Colors come from CSS custom properties so theme switches apply.

const SVG_NS = 'http://www.w3.org/2000/svg';

const svgEl = (tag, attrs = {}) => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
};

// --- Shared tooltip -------------------------------------------------------

let tooltipEl = null;
const getTooltip = () => {
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'chart-tooltip';
        document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
};

const showTooltip = (event, html) => {
    const tip = getTooltip();
    tip.innerHTML = html;
    tip.style.display = 'block';
    const pad = 12;
    let x = event.clientX + pad;
    let y = event.clientY + pad;
    const rect = tip.getBoundingClientRect();
    if (x + rect.width > window.innerWidth - 8) x = event.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = event.clientY - rect.height - pad;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
};

const hideTooltip = () => {
    if (tooltipEl) tooltipEl.style.display = 'none';
};

// --- KPI tiles ------------------------------------------------------------

export const renderStatTiles = (container, tiles) => {
    const row = document.createElement('div');
    row.className = 'kpi-row';
    for (const tile of tiles) {
        const el = document.createElement('div');
        el.className = 'stat-tile';
        const value = document.createElement('div');
        value.className = 'stat-value';
        value.textContent = tile.value;
        const label = document.createElement('div');
        label.className = 'stat-label';
        label.textContent = tile.label;
        el.append(value, label);
        row.appendChild(el);
    }
    container.appendChild(row);
    return row;
};

// --- Donut ----------------------------------------------------------------

// segments: [{ label, value, cssClass, chipClass }]
export const renderDonut = (container, segments, { centerLabel = 'tasks' } = {}) => {
    const total = segments.reduce((s, seg) => s + seg.value, 0);

    if (total === 0) {
        const note = document.createElement('div');
        note.className = 'empty-note';
        note.textContent = 'No tasks yet — add some to see the breakdown.';
        container.appendChild(note);
        return;
    }

    const size = 160;
    const c = size / 2;
    const r = 58;
    const strokeW = 20;
    const circumference = 2 * Math.PI * r;
    const gap = 2; // px spacer between segments

    const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, role: 'img' });

    const visible = segments.filter(s => s.value > 0);
    let offset = -circumference / 4; // start at 12 o'clock

    for (const seg of visible) {
        const len = (seg.value / total) * circumference;
        const drawn = visible.length > 1 ? Math.max(len - gap, 0.5) : len;
        const circle = svgEl('circle', {
            cx: c, cy: c, r,
            fill: 'none',
            'stroke-width': strokeW,
            'stroke-dasharray': `${drawn} ${circumference - drawn}`,
            'stroke-dashoffset': -offset,
            'stroke-linecap': visible.length > 1 ? 'butt' : 'round',
            class: seg.cssClass
        });
        circle.style.stroke = `var(--viz-${seg.chipClass})`;
        circle.addEventListener('mousemove', (e) => showTooltip(e,
            `<span class="tooltip-label">${seg.label}</span> <strong>${seg.value}</strong> (${Math.round(seg.value / total * 100)}%)`));
        circle.addEventListener('mouseleave', hideTooltip);
        svg.appendChild(circle);
        offset += len;
    }

    const centerValue = svgEl('text', {
        x: c, y: c - 2, 'text-anchor': 'middle', class: 'donut-center-value'
    });
    centerValue.textContent = String(total);
    const centerLbl = svgEl('text', {
        x: c, y: c + 16, 'text-anchor': 'middle', class: 'donut-center-label'
    });
    centerLbl.textContent = centerLabel;
    svg.append(centerValue, centerLbl);

    container.appendChild(svg);

    // Visible legend with values (identity + numbers never rely on hue alone).
    const legend = document.createElement('div');
    legend.className = 'chart-legend';
    for (const seg of segments) {
        const item = document.createElement('span');
        item.className = 'legend-item';
        const chip = document.createElement('span');
        chip.className = `legend-chip ${seg.chipClass}`;
        const label = document.createElement('span');
        label.textContent = seg.label;
        const value = document.createElement('span');
        value.className = 'legend-value';
        value.textContent = String(seg.value);
        item.append(chip, label, value);
        legend.appendChild(item);
    }
    container.appendChild(legend);
};

// --- Bar chart (single series, completions over time) ---------------------

// data: [{ label, value }] oldest → newest
export const renderBarChart = (container, data, { tooltipLabel = 'completed' } = {}) => {
    const width = 520;
    const height = 170;
    const margin = { top: 14, right: 8, bottom: 22, left: 26 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    const maxV = Math.max(1, ...data.map(d => d.value));
    const yMax = maxV <= 4 ? maxV : Math.ceil(maxV / 2) * 2;

    const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, class: 'bar-chart', role: 'img' });

    // Gridlines + y tick labels (recessive: just 0, mid, max)
    const ticks = yMax <= 2 ? [0, yMax] : [0, yMax / 2, yMax];
    for (const tick of ticks) {
        const y = margin.top + plotH - (tick / yMax) * plotH;
        if (tick !== 0) {
            svg.appendChild(svgEl('line', {
                x1: margin.left, x2: width - margin.right, y1: y, y2: y, class: 'gridline'
            }));
        }
        const lbl = svgEl('text', {
            x: margin.left - 6, y: y + 3, 'text-anchor': 'end', class: 'tick-label'
        });
        lbl.textContent = String(tick);
        svg.appendChild(lbl);
    }

    // Baseline
    svg.appendChild(svgEl('line', {
        x1: margin.left, x2: width - margin.right,
        y1: margin.top + plotH, y2: margin.top + plotH,
        class: 'baseline'
    }));

    const n = data.length;
    const slot = plotW / n;
    const barW = Math.min(24, Math.max(6, slot - 2)); // 2px surface gap between bars
    const rMax = Math.min(4, barW / 2);

    const maxIndex = data.reduce((best, d, i) => d.value > data[best].value ? i : best, 0);

    data.forEach((d, i) => {
        const x = margin.left + i * slot + (slot - barW) / 2;
        const h = (d.value / yMax) * plotH;
        const y = margin.top + plotH - h;

        if (d.value > 0) {
            // Rounded 4px at the data end only; flat at the baseline.
            const rr = Math.min(rMax, h);
            const path = svgEl('path', {
                d: `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + barW - rr},${y} Q${x + barW},${y} ${x + barW},${y + rr} L${x + barW},${y + h} Z`,
                class: 'bar'
            });
            svg.appendChild(path);
        }

        // Wider invisible hit target for hover
        const hit = svgEl('rect', {
            x: margin.left + i * slot, y: margin.top,
            width: slot, height: plotH, fill: 'transparent'
        });
        hit.addEventListener('mousemove', (e) => showTooltip(e,
            `<span class="tooltip-label">${d.label}</span> <strong>${d.value}</strong> ${tooltipLabel}`));
        hit.addEventListener('mouseleave', hideTooltip);
        svg.appendChild(hit);

        // Selective direct label: only the max bar
        if (i === maxIndex && d.value > 0) {
            const lbl = svgEl('text', {
                x: x + barW / 2, y: y - 4, 'text-anchor': 'middle', class: 'value-label'
            });
            lbl.textContent = String(d.value);
            svg.appendChild(lbl);
        }

        // X labels: first, last, and every ~3rd to avoid collisions
        if (i === 0 || i === n - 1 || i % 3 === 0) {
            const lbl = svgEl('text', {
                x: margin.left + i * slot + slot / 2, y: height - 8,
                'text-anchor': 'middle', class: 'tick-label'
            });
            lbl.textContent = d.label;
            svg.appendChild(lbl);
        }
    });

    container.appendChild(svg);
};

// --- Project progress meters ---------------------------------------------

// rows: [{ name, pct }] with pct in [0, 1]
export const renderProjectProgress = (container, rows) => {
    if (!rows.length) {
        const note = document.createElement('div');
        note.className = 'empty-note';
        note.textContent = 'No top-level tasks yet.';
        container.appendChild(note);
        return;
    }

    const list = document.createElement('div');
    list.className = 'project-progress-list';
    for (const row of rows) {
        const el = document.createElement('div');
        el.className = 'project-progress-row';

        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = row.name;
        name.title = row.name;

        const track = document.createElement('div');
        track.className = 'progress-track';
        const fill = document.createElement('div');
        fill.className = 'progress-fill' + (row.pct >= 1 ? ' complete' : '');
        fill.style.width = `${Math.round(row.pct * 100)}%`;
        track.appendChild(fill);

        const pct = document.createElement('span');
        pct.className = 'pct';
        pct.textContent = `${Math.round(row.pct * 100)}%`;

        el.append(name, track, pct);
        list.appendChild(el);
    }
    container.appendChild(list);
};
