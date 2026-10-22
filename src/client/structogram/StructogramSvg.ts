import type { Diagram, SNode } from "./StructogramModel";

/**
 * Zeichnet Struktogramme als SVG (ohne Abhängigkeit vom Browser – die Textbreite misst eine
 * übergebene Funktion). Darstellung wie in den Ergänzenden Hinweisen: dünne schwarze Linien,
 * serifenlose Schrift, Verzweigung mit Dreieck (wahr links, falsch rechts), Schleifen mit
 * Balken links, fußgesteuerte Schleife mit Bedingung unten, mehrseitige Auswahl mit "sonst".
 */

export type Measure = (text: string, bold?: boolean) => number;

export const STYLE = { font: 13, titleFont: 13.5, groupFont: 15, line: 22, pad: 6, bar: 18, minCol: 40, gap: 26 };

/** grobe Schätzung der Textbreite (für Tests ohne Browser) */
export const approxMeasure: Measure = (text, bold) => [...text].length * (bold ? 7.6 : 7.1);

type Box = { w: number; h: number; draw(out: string[], x: number, y: number, width: number, height: number): void };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const n = (v: number) => Math.round(v * 10) / 10;
const rect = (out: string[], x: number, y: number, w: number, h: number) =>
    out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="none" stroke="#000" stroke-width="1"/>`);
const stroke = (out: string[], x1: number, y1: number, x2: number, y2: number) =>
    out.push(`<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="#000" stroke-width="1"/>`);
const text = (out: string[], x: number, y: number, s: string, anchor: "start" | "middle" | "end" = "start", bold = false, size?: number) =>
    out.push(`<text x="${n(x)}" y="${n(y)}" text-anchor="${anchor}"${bold ? ' font-weight="bold"' : ""}${size ? ` font-size="${size}"` : ""}>${esc(s)}</text>`);

const BASE = STYLE.line * 0.7;

class Layout {
    constructor(private measure: Measure) { }

    private lines(s: string): string[] {
        return s.split("\n");
    }

    private textWidth(s: string, bold = false): number {
        return Math.max(...this.lines(s).map((l) => this.measure(l, bold)), 0);
    }

    seq(nodes: SNode[]): Box {
        const boxes = nodes.map((nd) => this.node(nd));
        const { line, minCol } = STYLE;
        const w = Math.max(minCol, ...boxes.map((b) => b.w));
        const h = boxes.length ? boxes.reduce((s, b) => s + b.h, 0) : line;
        return {
            w, h,
            draw: (out, x, y, width, height) => {
                if (!boxes.length) {
                    rect(out, x, y, width, height);
                    return;
                }
                let cy = y;
                boxes.forEach((b, i) => {
                    const bh = i === boxes.length - 1 ? y + height - cy : b.h;   // der letzte füllt den Rest
                    b.draw(out, x, cy, width, bh);
                    cy += bh;
                });
            },
        };
    }

    node(nd: SNode): Box {
        const { line, pad, bar, minCol } = STYLE;
        switch (nd.kind) {
            case "stmt": {
                const ls = this.lines(nd.text);
                return {
                    w: this.textWidth(nd.text) + 2 * pad, h: ls.length * line,
                    draw: (out, x, y, width, height) => {
                        rect(out, x, y, width, height);
                        ls.forEach((l, i) => text(out, x + pad, y + i * line + BASE, l));
                    },
                };
            }
            case "loop":
            case "footloop": {
                const label = nd.kind === "loop" ? nd.head : nd.foot;
                const ls = this.lines(label);
                const th = ls.length * line;
                const body = this.seq(nd.body);
                return {
                    w: Math.max(this.textWidth(label) + 2 * pad, bar + body.w), h: th + body.h,
                    draw: (out, x, y, width, height) => {
                        rect(out, x, y, width, height);
                        if (nd.kind === "loop") {
                            ls.forEach((l, i) => text(out, x + pad, y + i * line + BASE, l));
                            body.draw(out, x + bar, y + th, width - bar, height - th);
                        } else {
                            body.draw(out, x + bar, y, width - bar, height - th);
                            ls.forEach((l, i) => text(out, x + pad, y + height - th + i * line + BASE, l));
                        }
                    },
                };
            }
            case "if": {
                const yes = this.seq(nd.yes), no = this.seq(nd.no);
                const hh = 2 * line;
                const wy = Math.max(yes.w, this.measure("wahr") + 2 * pad, minCol);
                const wn = Math.max(no.w, this.measure("falsch") + 2 * pad, minCol);
                const condW = this.measure(nd.cond) + 2 * pad;
                return {
                    w: Math.max(wy + wn, condW + 3 * pad), h: hh + Math.max(yes.h, no.h),
                    draw: (out, x, y, width, height) => {
                        const extra = width - (wy + wn);
                        const split = x + wy + extra * (wy / (wy + wn));
                        rect(out, x, y, width, hh);
                        stroke(out, x, y, split, y + hh);
                        stroke(out, x + width, y, split, y + hh);
                        const cx = Math.min(Math.max(split - condW / 2, x), x + width - condW);
                        text(out, cx + pad, y + BASE, nd.cond);
                        text(out, x + pad, y + hh - 6, "wahr");
                        text(out, x + width - pad, y + hh - 6, "falsch", "end");
                        yes.draw(out, x, y + hh, split - x, height - hh);
                        no.draw(out, split, y + hh, x + width - split, height - hh);
                    },
                };
            }
            case "switch": {
                const cols = [...nd.cases.map((c) => ({ label: c.label, box: this.seq(c.body) })),
                    ...(nd.other ? [{ label: "sonst", box: this.seq(nd.other) }] : [])];
                // Dreieck oben, darunter eine eigene Zeile für die Fälle (die Diagonale kreuzt sie nie)
                const dh = 1.5 * line;
                const hh = dh + line;
                const mins = cols.map((c) => Math.max(c.box.w, this.measure(c.label) + 2 * pad, minCol));
                const sum = mins.reduce((s, v) => s + v, 0);
                const subjW = this.measure(nd.subject) + 2 * pad;
                return {
                    w: Math.max(sum, subjW + 4 * pad), h: hh + Math.max(...cols.map((c) => c.box.h), line),
                    draw: (out, x, y, width, height) => {
                        const widths = mins.map((m) => m + (width - sum) * (m / sum));
                        const starts: number[] = [];
                        let cx = x;
                        for (const w of widths) {
                            starts.push(cx);
                            cx += w;
                        }
                        rect(out, x, y, width, hh);
                        const apex = nd.other ? starts[starts.length - 1] : x + width;
                        stroke(out, x, y, apex, y + dh);
                        if (nd.other) stroke(out, x + width, y, apex, y + dh);
                        text(out, (nd.other ? apex : x + width) - pad, y + BASE, nd.subject, "end");
                        cols.forEach((c, i) => {
                            const sx = starts[i];
                            if (i > 0) {
                                const yd = sx <= apex ? y + dh * ((sx - x) / Math.max(1, apex - x)) : y + dh * ((x + width - sx) / Math.max(1, x + width - apex));
                                stroke(out, sx, yd, sx, y + hh);
                            }
                            text(out, sx + widths[i] / 2, y + hh - 6, c.label, "middle");
                            c.box.draw(out, sx, y + hh, widths[i], height - hh);
                        });
                    },
                };
            }
        }
    }
}

/** Alle Struktogramme untereinander als ein SVG (mit Überschriften für Klassen) */
export function renderSvg(diagrams: Diagram[], measure: Measure = approxMeasure): { svg: string; width: number; height: number } {
    const layout = new Layout(measure);
    const out: string[] = [];
    const margin = 12;
    let y = margin, width = 0;
    let group: string | undefined;
    for (const d of diagrams) {
        if (d.group && d.group !== group) {
            if (y > margin) y += 8;
            text(out, margin, y + STYLE.groupFont, d.group, "start", true, STYLE.groupFont);
            width = Math.max(width, measure(d.group, true) * (STYLE.groupFont / STYLE.font) * 1.04);
            y += STYLE.groupFont + 12;
        }
        group = d.group;
        text(out, margin, y + STYLE.titleFont, d.title, "start", true, STYLE.titleFont);
        y += STYLE.titleFont + 8;
        const box = layout.seq(d.body);
        const w = Math.max(box.w, 260);
        box.draw(out, margin + 0.5, y + 0.5, w, box.h);
        width = Math.max(width, w, measure(d.title, true) * (STYLE.titleFont / STYLE.font) * 1.04);
        y += box.h + STYLE.gap;
    }
    const W = Math.ceil(width + 2 * margin + 1), H = Math.ceil(y - STYLE.gap + margin + 1);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif" font-size="${STYLE.font}">`
        + `<rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>${out.join("")}</svg>`;
    return { svg, width: W, height: H };
}
