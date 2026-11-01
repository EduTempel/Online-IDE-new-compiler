import type { Diagram, SNode } from "./StructogramModel";

/**
 * Zeichnet Struktogramme als SVG (ohne Abhängigkeit vom Browser – die Textbreite misst eine
 * übergebene Funktion). Darstellung wie in den Ergänzenden Hinweisen: dünne schwarze Linien,
 * serifenlose Schrift, Verzweigung mit Dreieck (wahr links, falsch rechts), Schleifen mit
 * Balken links, fußgesteuerte Schleife mit Bedingung unten, mehrseitige Auswahl mit "sonst".
 */

export type Measure = (text: string, bold?: boolean) => number;

/** wrap: höchste Textbreite in einem Feld, längere Texte werden umgebrochen (lesbar, nicht zu breit) */
export const STYLE = { font: 13, titleFont: 13.5, groupFont: 15, line: 22, pad: 6, bar: 18, minCol: 40, gap: 26, wrap: 230, titleWrap: 340 };

/** grobe Schätzung der Textbreite (für Tests ohne Browser) */
export const approxMeasure: Measure = (text, bold) => [...text].length * (bold ? 7.6 : 7.1);

/**
 * Bricht Text in Zeilen um, die höchstens max breit sind: an Leerzeichen, ein zu langes Wort
 * bevorzugt nach . , ( bzw. vor Operatoren, notfalls irgendwo. Vorhandene Zeilenumbrüche bleiben.
 */
export function wrapText(s: string, max: number, measure: Measure, bold = false): string[] {
    const fits = (t: string) => measure(t, bold) <= max;
    const cut = (word: string): number => {
        let last = 1, nice = 0;
        for (let i = 1; i < word.length; i++) {
            if (!fits(word.slice(0, i))) break;
            last = i;
            if (/[.,(;]/.test(word[i - 1]) || /[-+*\/=<>≠≤≥←&|)]/.test(word[i])) nice = i;
        }
        return nice || last;
    };
    const out: string[] = [];
    for (const para of s.split("\n")) {
        let cur = "";
        for (const word of para.split(" ")) {
            const cand = cur ? cur + " " + word : word;
            if (fits(cand) || (!cur && !word)) {
                cur = cand;
                continue;
            }
            if (cur) out.push(cur);
            let rest = word;
            while (rest.length > 1 && !fits(rest)) {
                const i = cut(rest);
                out.push(rest.slice(0, i));
                rest = rest.slice(i);
            }
            cur = rest;
        }
        out.push(cur);
    }
    return out;
}

/**
 * Höhe eines Dreiecks (Verzweigung, Auswahl), in dem Textzeilen der Breiten widths von oben
 * untereinander stehen: in der Tiefe d ist es nur noch span·(1 − d/h) breit.
 */
function triangleHeight(widths: number[], span: number, min: number): number {
    let h = min;
    widths.forEach((w, i) => {
        const d = i * STYLE.line + BASE + 3;   // Unterkante der Zeile
        if (w < span) h = Math.max(h, (d * span) / (span - w));
    });
    const half = STYLE.line / 2;
    return Math.ceil(h / half - 0.01) * half;
}

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

/**
 * Für den Editor (Struktogramm-Dateien): anklickbare Bereiche (data-sel = Kennung, data-slot =
 * leere Folge), Hervorhebung der Auswahl, "(leer)" in leeren Zweigen, "?" an Text, der in Java
 * ein TODO würde. Ohne diese Angaben sieht das Bild aus wie zum Drucken.
 */
export type RenderOptions = {
    interactive?: boolean;
    selected?: string;
    unrecognized?: (kind: SNode["kind"], text: string) => boolean;
};

const SELECT_COLOUR = "#0a66d6";

class Layout {
    /** wird nach dem Inhalt gezeichnet (Hervorhebung, Hinweise) */
    over: string[] = [];

    constructor(private measure: Measure, private opts: RenderOptions = {}) { }

    /** anklickbarer Bereich */
    private hit(out: string[], x: number, y: number, w: number, h: number, attr: string) {
        if (!this.opts.interactive) return;
        out.push(`<rect class="gsg-hit" ${attr} x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="rgba(0,0,0,0)"/>`);
    }

    /** ausgewählt: ganze Fläche (Anweisung) bzw. Umriss und Kopf (zusammengesetzt) hervorheben */
    private mark(id: string | undefined, whole: [number, number, number, number], head?: [number, number, number, number]) {
        if (!this.opts.interactive || !id || id !== this.opts.selected) return;
        const [x, y, w, h] = whole;
        if (head) {
            const [hx, hy, hw, hh] = head;
            this.over.push(`<rect x="${n(hx)}" y="${n(hy)}" width="${n(hw)}" height="${n(hh)}" fill="rgba(10,102,214,.13)" pointer-events="none"/>`);
        } else {
            this.over.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="rgba(10,102,214,.13)" pointer-events="none"/>`);
        }
        this.over.push(`<rect x="${n(x + 1)}" y="${n(y + 1)}" width="${n(w - 2)}" height="${n(h - 2)}" fill="none" stroke="${SELECT_COLOUR}" stroke-width="2" pointer-events="none"/>`);
    }

    /** "?" am rechten Rand, wenn der Text in Java nicht erkannt wird */
    private todoMark(kind: SNode["kind"], label: string, x: number, y: number) {
        if (!this.opts.interactive || !this.opts.unrecognized || !label.trim() || !this.opts.unrecognized(kind, label)) return;
        this.over.push(`<g class="gsg-todo" pointer-events="all"><title>Wird beim Umwandeln in Java ein TODO-Kommentar (Formulierung nicht erkannt).</title>`
            + `<circle cx="${n(x)}" cy="${n(y)}" r="7" fill="#f0a020"/><text x="${n(x)}" y="${n(y + 4)}" text-anchor="middle" font-size="11" font-weight="bold" fill="#fff">?</text></g>`);
    }

    private lines(s: string, max = STYLE.wrap): string[] {
        return wrapText(s, max, this.measure);
    }

    private widest(ls: string[]): number {
        return Math.max(...ls.map((l) => this.measure(l)), 0);
    }

    /** Folge von Elementen; slot = Kennung der Folge (für Einfügen in eine leere Folge) */
    seq(nodes: SNode[], slot?: string): Box {
        const boxes = nodes.map((nd) => this.node(nd));
        const { line, minCol } = STYLE;
        const w = Math.max(minCol, ...boxes.map((b) => b.w));
        const h = boxes.length ? boxes.reduce((s, b) => s + b.h, 0) : line;
        return {
            w, h,
            draw: (out, x, y, width, height) => {
                if (!boxes.length) {
                    rect(out, x, y, width, height);
                    if (this.opts.interactive && slot) {
                        out.push(`<text x="${n(x + width / 2)}" y="${n(y + BASE)}" text-anchor="middle" fill="#9aa3ad" font-size="11">(leer)</text>`);
                        this.hit(out, x, y, width, height, `data-slot="${slot}"`);
                        this.mark("slot:" + slot, [x, y, width, height]);
                    }
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
                    w: this.widest(ls) + 2 * pad + (this.opts.interactive ? 16 : 0), h: ls.length * line,
                    draw: (out, x, y, width, height) => {
                        rect(out, x, y, width, height);
                        ls.forEach((l, i) => text(out, x + pad, y + i * line + BASE, l));
                        this.hit(out, x, y, width, height, `data-sel="${nd.id ?? ""}"`);
                        this.mark(nd.id, [x, y, width, height]);
                        this.todoMark("stmt", nd.text, x + width - 10, y + line / 2);
                    },
                };
            }
            case "loop":
            case "footloop": {
                const label = nd.kind === "loop" ? nd.head : nd.foot;
                const ls = this.lines(label);
                const th = ls.length * line;
                const body = this.seq(nd.body, nd.id ? `${nd.id}:body` : undefined);
                return {
                    w: Math.max(this.widest(ls) + 2 * pad + (this.opts.interactive ? 16 : 0), bar + body.w), h: th + body.h,
                    draw: (out, x, y, width, height) => {
                        rect(out, x, y, width, height);
                        const hy = nd.kind === "loop" ? y : y + height - th;
                        this.hit(out, x, hy, width, th, `data-sel="${nd.id ?? ""}"`);
                        this.hit(out, x, y, bar, height, `data-sel="${nd.id ?? ""}"`);
                        if (nd.kind === "loop") {
                            ls.forEach((l, i) => text(out, x + pad, y + i * line + BASE, l));
                            body.draw(out, x + bar, y + th, width - bar, height - th);
                        } else {
                            body.draw(out, x + bar, y, width - bar, height - th);
                            ls.forEach((l, i) => text(out, x + pad, y + height - th + i * line + BASE, l));
                        }
                        this.mark(nd.id, [x, y, width, height], [x, hy, width, th]);
                        this.todoMark(nd.kind, label, x + width - 10, hy + line / 2);
                    },
                };
            }
            case "if": {
                const yes = this.seq(nd.yes, nd.id ? `${nd.id}:yes` : undefined), no = this.seq(nd.no, nd.id ? `${nd.id}:no` : undefined);
                const wy = Math.max(yes.w, this.measure("wahr") + 2 * pad, minCol);
                const wn = Math.max(no.w, this.measure("falsch") + 2 * pad, minCol);
                // Bedingung im Dreieck: umbrechen; das Feld ist mindestens 1,8-mal so breit wie die
                // längste Zeile, das Dreieck so hoch, dass jede Zeile zwischen die Schrägen passt
                const cl = this.lines(nd.cond, Math.max(STYLE.wrap * 0.7, (wy + wn) / 1.8 - 2 * pad));
                const cw = cl.map((l) => this.measure(l) + 2 * pad);
                const w = Math.max(wy + wn, Math.ceil(Math.max(...cw) * 1.8));
                const hh = triangleHeight(cw, w, 2 * line);
                return {
                    w, h: hh + Math.max(yes.h, no.h),
                    draw: (out, x, y, width, height) => {
                        const extra = width - (wy + wn);
                        const split = x + wy + extra * (wy / (wy + wn));
                        rect(out, x, y, width, hh);
                        stroke(out, x, y, split, y + hh);
                        stroke(out, x + width, y, split, y + hh);
                        cl.forEach((l, i) => {
                            const d = i * line + BASE + 3;
                            const left = x + (split - x) * d / hh, right = x + width - (x + width - split) * d / hh;
                            const cx = Math.min(Math.max(split - cw[i] / 2, left), right - cw[i]);
                            text(out, cx + pad, y + i * line + BASE, l);
                        });
                        text(out, x + pad, y + hh - 6, "wahr");
                        text(out, x + width - pad, y + hh - 6, "falsch", "end");
                        this.hit(out, x, y, width, hh, `data-sel="${nd.id ?? ""}"`);
                        yes.draw(out, x, y + hh, split - x, height - hh);
                        no.draw(out, split, y + hh, x + width - split, height - hh);
                        this.mark(nd.id, [x, y, width, height], [x, y, width, hh]);
                        this.todoMark("if", nd.cond, x + width - 10, y + line / 2);
                    },
                };
            }
            case "switch": {
                const slot = (part: string) => (nd.id ? `${nd.id}:${part}` : undefined);
                const cols = [...nd.cases.map((c, i) => ({ label: c.label, box: this.seq(c.body, slot("case" + i)) })),
                    ...(nd.other ? [{ label: "sonst", box: this.seq(nd.other, slot("other")) }] : [])];
                // Dreieck oben, darunter eine eigene Zeile für die Fälle (die Diagonale kreuzt sie nie)
                const mins = cols.map((c) => Math.max(c.box.w, this.measure(c.label) + 2 * pad, minCol));
                const sum = mins.reduce((s, v) => s + v, 0);
                // Text links der Spitze: der Teil bis zur Spitze muss 1,8-mal so breit sein wie die längste Zeile
                const share = nd.other && cols.length > 1 ? (sum - mins[mins.length - 1]) / sum : 1;
                const sl = this.lines(nd.subject, Math.max(STYLE.wrap * 0.7, (sum * share) / 1.8 - 2 * pad));
                const sw = sl.map((l) => this.measure(l) + 2 * pad);
                const w = Math.max(sum, Math.ceil((Math.max(...sw) * 1.8) / share));
                const dh = triangleHeight(sw, w * share, 1.5 * line);
                const hh = dh + line;
                return {
                    w, h: hh + Math.max(...cols.map((c) => c.box.h), line),
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
                        sl.forEach((l, i) => text(out, (nd.other ? apex : x + width) - pad, y + i * line + BASE, l, "end"));
                        this.hit(out, x, y, width, hh, `data-sel="${nd.id ?? ""}"`);
                        this.mark(nd.id, [x, y, width, height], [x, y, width, hh]);
                        this.todoMark("switch", nd.subject, x + 12, y + line / 2);
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
export function renderSvg(diagrams: Diagram[], measure: Measure = approxMeasure, opts: RenderOptions = {}): { svg: string; width: number; height: number } {
    const layout = new Layout(measure, opts);
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
        const box = layout.seq(d.body, opts.interactive ? "root:body" : undefined);
        const w = Math.max(box.w, 260);
        // Überschrift (Signatur): höchstens so breit wie das Struktogramm bzw. titleWrap
        const titleMeasure: Measure = (s) => measure(s, true) * (STYLE.titleFont / STYLE.font) * 1.04;
        const tl = wrapText(d.title, Math.max(w, STYLE.titleWrap), titleMeasure);
        const tlh = STYLE.titleFont + 5;
        tl.forEach((l, i) => text(out, margin, y + STYLE.titleFont + i * tlh, l, "start", true, STYLE.titleFont));
        const th = tl.length * tlh + 3;
        if (opts.interactive) {
            const tw = Math.max(120, ...tl.map((l) => titleMeasure(l) + 8));
            out.push(`<rect class="gsg-hit" data-sel="title" x="${margin - 4}" y="${n(y)}" width="${n(tw)}" height="${n(th)}" fill="rgba(0,0,0,0)"/>`);
            if (opts.selected === "title") out.push(`<rect x="${margin - 4}" y="${n(y)}" width="${n(tw)}" height="${n(th)}" fill="rgba(10,102,214,.13)" stroke="${SELECT_COLOUR}" stroke-width="2" pointer-events="none"/>`);
        }
        y += th;
        box.draw(out, margin + 0.5, y + 0.5, w, box.h);
        width = Math.max(width, w, ...tl.map((l) => titleMeasure(l)));
        y += box.h + STYLE.gap;
    }
    const W = Math.ceil(width + 2 * margin + 1), H = Math.ceil(y - STYLE.gap + margin + 1);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif" font-size="${STYLE.font}">`
        + `<rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>${out.join("")}${layout.over.join("")}</svg>`;
    return { svg, width: W, height: H };
}
