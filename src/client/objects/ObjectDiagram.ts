import { levels, objectNames, type HeapNode, type HeapSnapshot, type HeapValue } from "./HeapSnapshot";

/**
 * Objektdiagramm (Paket 9) als SVG im Stil eines UML-Objektdiagramms: links die Variablen,
 * rechts die Objekte („ball : Kreis“, unterstrichen) mit ihren Attributen; Verweise als Pfeile.
 * Reihungen aus einfachen Werten als Zellenreihe, sonst Element für Element.
 */

export type Measure = (text: string, bold?: boolean) => number;

const FONT = 13;
const ROW = 20;
const HEAD = 24;
const PAD = 8;
const DOT = 16;
const COL_GAP = 70;
const ROW_GAP = 18;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Breite eines Textes; ohne Leinwand (Tests) geschätzt */
export function canvasMeasure(): Measure {
    let ctx: CanvasRenderingContext2D | null = null;
    try {
        ctx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
    } catch {
        ctx = null;
    }
    return (text, bold) => {
        if (!ctx) return text.length * FONT * 0.6;
        ctx.font = `${bold ? "bold " : ""}${FONT}px Consolas, "Cascadia Mono", monospace`;
        return ctx.measureText(text).width;
    };
}

type Box = {
    node: HeapNode;
    x: number;
    y: number;
    w: number;
    h: number;
    title: string;
    /** Zellenreihe statt Zeilen */
    strip: boolean;
    cellW: number[];
};

const valueText = (v: HeapValue) => (v.kind === "prim" ? v.text : v.kind === "null" ? "null" : "");

export function renderObjectDiagram(s: HeapSnapshot, measure: Measure, title = "Variablen"): { svg: string; width: number; height: number } {
    const names = objectNames(s);
    const level = levels(s);
    const parts: string[] = [];
    const arrows: { x1: number; y1: number; to: number }[] = [];

    // ---------------------------------------------------------- Variablen
    const varRows = s.vars.map((v) => (v.value.kind === "ref" ? v.name : `${v.name} = ${valueText(v.value)}`));
    const varW = Math.max(measure(title, true) + 2 * PAD, ...varRows.map((r, i) => measure(r) + 2 * PAD + (s.vars[i].value.kind === "ref" ? DOT : 0)), 110);
    const varH = HEAD + Math.max(1, varRows.length) * ROW + PAD / 2;
    const vx = 10, vy = 10;
    parts.push(`<rect class="gsg-od-vars" x="${vx}" y="${vy}" width="${varW}" height="${varH}" rx="4"/>`);
    parts.push(`<text class="gsg-od-head" x="${vx + PAD}" y="${vy + 16}">${esc(title)}</text>`);
    parts.push(`<line class="gsg-od-sep" x1="${vx}" y1="${vy + HEAD - 2}" x2="${vx + varW}" y2="${vy + HEAD - 2}"/>`);
    if (!varRows.length) parts.push(`<text class="gsg-od-empty" x="${vx + PAD}" y="${vy + HEAD + 14}">(keine)</text>`);
    varRows.forEach((r, i) => {
        const y = vy + HEAD + i * ROW + 14;
        parts.push(`<text x="${vx + PAD}" y="${y}">${esc(r)}</text>`);
        const v = s.vars[i].value;
        if (v.kind === "ref") {
            const cx = vx + varW - DOT / 2 - 2, cy = y - 4;
            parts.push(`<circle class="gsg-od-dot" cx="${cx}" cy="${cy}" r="3.5"/>`);
            arrows.push({ x1: cx, y1: cy, to: v.id });
        }
    });

    // ---------------------------------------------------------- Objekte in Spalten
    const boxes = new Map<number, Box>();
    const maxLevel = Math.max(0, ...level.values());
    const columns: HeapNode[][] = [];
    for (const n of s.nodes) {
        const l = level.get(n.id) ?? maxLevel + 1;
        (columns[l] ??= []).push(n);
    }
    let x = vx + varW + COL_GAP;
    let height = vy + varH;
    for (const col of columns) {
        if (!col) continue;
        let y = vy;
        let colW = 0;
        const colBoxes: Box[] = [];
        for (const n of col) {
            const name = names.get(n.id);
            const cls = n.kind === "array" ? n.cls : n.cls;
            const title = `${name ?? ""} : ${cls}`;
            const allPrim = n.slots.every((sl) => sl.value.kind !== "ref");
            const strip = n.kind !== "object" && allPrim && n.slots.length > 0;
            let w = measure(title, true) + 2 * PAD;
            let h = HEAD;
            const cellW: number[] = [];
            if (strip) {
                for (const sl of n.slots) cellW.push(Math.max(measure(valueText(sl.value)) + 12, measure(sl.name) + 8, 22));
                const more = n.more ? measure("…") + 12 : 0;
                w = Math.max(w, cellW.reduce((a, b) => a + b, 0) + more + 2 * PAD);
                h += 14 + ROW + PAD;
            } else {
                const rows = n.slots.map((sl) => (sl.value.kind === "ref" ? label(n, sl.name) : `${label(n, sl.name)} = ${valueText(sl.value)}`));
                if (n.more) rows.push(`… (${n.more} weitere)`);
                for (let i = 0; i < rows.length; i++) {
                    w = Math.max(w, measure(rows[i]) + 2 * PAD + (n.slots[i]?.value.kind === "ref" ? DOT : 0));
                }
                h += Math.max(rows.length, n.kind === "object" ? 0 : 1) * ROW + (rows.length ? PAD / 2 : 0);
            }
            w = Math.max(w, 90);
            const box: Box = { node: n, x, y, w, h, title, strip, cellW };
            boxes.set(n.id, box);
            colBoxes.push(box);
            y += h + ROW_GAP;
            colW = Math.max(colW, w);
        }
        for (const b of colBoxes) b.w = Math.max(b.w, Math.min(colW, b.w + 40));
        height = Math.max(height, y);
        x += colW + COL_GAP;
    }

    for (const b of boxes.values()) {
        const n = b.node;
        parts.push(`<rect class="gsg-od-box${n.kind === "object" ? "" : " gsg-od-coll"}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="3"/>`);
        const tw = measure(b.title, true);
        const tx = b.x + (b.w - tw) / 2;
        parts.push(`<text class="gsg-od-head" x="${tx}" y="${b.y + 16}">${esc(b.title)}</text>`);
        parts.push(`<line class="gsg-od-under" x1="${tx}" y1="${b.y + 19}" x2="${tx + tw}" y2="${b.y + 19}"/>`);
        if (b.strip || n.slots.length || n.more) parts.push(`<line class="gsg-od-sep" x1="${b.x}" y1="${b.y + HEAD - 2}" x2="${b.x + b.w}" y2="${b.y + HEAD - 2}"/>`);
        if (b.strip) {
            let cx = b.x + PAD;
            const top = b.y + HEAD + 12;
            n.slots.forEach((sl, i) => {
                const cw = b.cellW[i];
                parts.push(`<text class="gsg-od-index" x="${cx + cw / 2}" y="${top}" text-anchor="middle">${esc(sl.name)}</text>`);
                parts.push(`<rect class="gsg-od-cell" x="${cx}" y="${top + 3}" width="${cw}" height="${ROW}"/>`);
                parts.push(`<text x="${cx + cw / 2}" y="${top + 17}" text-anchor="middle">${esc(valueText(sl.value))}</text>`);
                cx += cw;
            });
            if (n.more) parts.push(`<text x="${cx + 6}" y="${top + 17}">…</text>`);
        } else {
            n.slots.forEach((sl, i) => {
                const y = b.y + HEAD + i * ROW + 14;
                const text = sl.value.kind === "ref" ? label(n, sl.name) : `${label(n, sl.name)} = ${valueText(sl.value)}`;
                parts.push(`<text x="${b.x + PAD}" y="${y}">${esc(text)}</text>`);
                if (sl.value.kind === "ref") {
                    const cx = b.x + b.w - DOT / 2 - 2, cy = y - 4;
                    parts.push(`<circle class="gsg-od-dot" cx="${cx}" cy="${cy}" r="3.5"/>`);
                    arrows.push({ x1: cx, y1: cy, to: sl.value.id });
                }
            });
            if (n.more) parts.push(`<text class="gsg-od-empty" x="${b.x + PAD}" y="${b.y + HEAD + n.slots.length * ROW + 14}">… (${n.more} weitere)</text>`);
        }
    }

    // ---------------------------------------------------------- Pfeile
    for (const a of arrows) {
        const t = boxes.get(a.to);
        if (!t) continue;
        const ty = t.y + HEAD / 2;
        let d: string;
        if (t.x > a.x1) {
            const x2 = t.x;
            const bend = Math.max(30, (x2 - a.x1) / 2);
            d = `M ${a.x1} ${a.y1} C ${a.x1 + bend} ${a.y1}, ${x2 - bend} ${ty}, ${x2} ${ty}`;
        } else {
            // zurück zu einem Objekt weiter links oder in derselben Spalte: außen herum zur rechten Kante
            const x2 = t.x + t.w;
            const out = Math.max(a.x1, x2) + 50;
            d = `M ${a.x1} ${a.y1} C ${out} ${a.y1}, ${out} ${ty}, ${x2} ${ty}`;
        }
        parts.push(`<path class="gsg-od-arrow" d="${d}" marker-end="url(#gsg-od-head)"/>`);
    }

    const width = Math.max(x - COL_GAP + 60, vx + varW + 20);
    const svgHeight = height + (s.truncated ? 30 : 10);
    if (s.truncated) parts.push(`<text class="gsg-od-empty" x="10" y="${svgHeight - 10}">… weitere Objekte werden nicht gezeigt</text>`);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="gsg-od" width="${width}" height="${svgHeight}" viewBox="0 0 ${width} ${svgHeight}">`
        + `<style>${STYLE}</style>`
        + `<defs><marker id="gsg-od-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">`
        + `<path d="M 0 0 L 10 5 L 0 10 z" class="gsg-od-arrowhead"/></marker></defs>`
        + parts.join("") + `</svg>`;
    return { svg, width, height: svgHeight };
}

/** Aussehen (im SVG, damit es auch gespeichert und gedruckt so aussieht) */
const STYLE = [
    ".gsg-od text{font:13px Consolas,'Cascadia Mono',monospace;fill:#1d1d1d}",
    ".gsg-od .gsg-od-head{font-weight:bold}",
    ".gsg-od-vars{fill:#e3eefc;stroke:#4a6cd4}",
    ".gsg-od-box{fill:#fff8dc;stroke:#7a6a35}",
    ".gsg-od-coll{fill:#e8f5ee;stroke:#2f8a76}",
    ".gsg-od-sep,.gsg-od-under{stroke:#555;stroke-width:1}",
    ".gsg-od-cell{fill:#ffffff;stroke:#2f8a76}",
    ".gsg-od .gsg-od-index{font-size:10px;fill:#666}",
    ".gsg-od-dot{fill:#c0392b}",
    ".gsg-od-arrow{fill:none;stroke:#c0392b;stroke-width:1.6}",
    ".gsg-od-arrowhead{fill:#c0392b}",
    ".gsg-od .gsg-od-empty{fill:#777;font-style:italic}",
].join("");

function label(n: HeapNode, name: string): string {
    return n.kind === "object" ? name : `[${name}]`;
}
