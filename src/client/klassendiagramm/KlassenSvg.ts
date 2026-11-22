import { eintragText, type KlassenDoc, type Klasse } from "./KlassenDoc";

/**
 * Klassendiagramm als SVG (Paket 20) – wie in den Ergänzenden Hinweisen: Kasten mit Name, Attributen und
 * Operationen, „...“ für weggelassene Einträge, Assoziation als einfache Linie, Vererbung als Pfeil mit
 * offener Spitze zur Oberklasse. Im Editor zusätzlich mit Markierungen zum Anklicken (data-…).
 */

export type Measure = (text: string, bold: boolean) => number;
export type Rect = { x: number; y: number; w: number; h: number };

export const STIL = { font: 13, zeile: 18, rand: 8, minBreite: 110, abstand: 24 };

export type Optionen = {
    interaktiv?: boolean;
    /** ausgewählt: Klassen-, Eintrags- oder Beziehungs-ID */
    ausgewaehlt?: string;
    /** gerade verbinden: Klassen hervorheben */
    verbinden?: boolean;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Zeile = { text: string; id?: string; kursiv?: boolean };
type Kasten = Rect & { klasse: Klasse; attr: Zeile[]; ops: Zeile[]; hName: number; hAttr: number };

function zeilen(k: Klasse, doc: KlassenDoc): { attr: Zeile[]; ops: Zeile[] } {
    const attr: Zeile[] = k.attribute.map((a) => ({ text: eintragText(a, k, doc.typen), id: a.id }));
    if (k.mehrAttribute) attr.push({ text: "..." });
    const ops: Zeile[] = k.operationen.map((o) => ({ text: eintragText(o, k, doc.typen), id: o.id }));
    if (k.mehrOperationen) ops.push({ text: "..." });
    return { attr, ops };
}

/** Größe und Lage jedes Kastens */
export function kaesten(doc: KlassenDoc, measure: Measure): Map<string, Kasten> {
    const result = new Map<string, Kasten>();
    const { zeile, rand, minBreite } = STIL;
    for (const k of doc.klassen) {
        const { attr, ops } = zeilen(k, doc);
        const breite = Math.max(minBreite, measure(k.name || " ", true) + 2 * rand + 8,
            ...[...attr, ...ops].map((z) => measure(z.text, false) + 2 * rand));
        const hName = zeile + rand;
        const hAttr = attr.length ? attr.length * zeile + rand : rand + 4;
        const hOps = ops.length ? ops.length * zeile + rand : rand + 4;
        result.set(k.id, { klasse: k, attr, ops, hName, hAttr, x: k.x, y: k.y, w: Math.ceil(breite), h: hName + hAttr + hOps });
    }
    return result;
}

/** Punkt auf dem Rand von r in Richtung (zx, zy) vom Mittelpunkt aus */
export function randpunkt(r: Rect, zx: number, zy: number): { x: number; y: number } {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const dx = zx - cx, dy = zy - cy;
    if (!dx && !dy) return { x: cx, y: cy };
    const t = Math.min(dx ? (r.w / 2) / Math.abs(dx) : Infinity, dy ? (r.h / 2) / Math.abs(dy) : Infinity);
    return { x: cx + dx * t, y: cy + dy * t };
}

/** Linie zwischen zwei Kästen (vom Rand zum Rand); null, wenn sie sich überlappen */
export function linie(a: Rect, b: Rect): { x1: number; y1: number; x2: number; y2: number } | null {
    const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const p = randpunkt(a, cb.x, cb.y), q = randpunkt(b, ca.x, ca.y);
    // überlappen sich die Kästen, liegt q näher an a als p: keine sinnvolle Linie
    if ((q.x - ca.x) ** 2 + (q.y - ca.y) ** 2 <= (p.x - ca.x) ** 2 + (p.y - ca.y) ** 2) return null;
    return { x1: p.x, y1: p.y, x2: q.x, y2: q.y };
}

const f = (n: number) => Math.round(n * 10) / 10;

export function renderSvg(doc: KlassenDoc, measure: Measure, opt: Optionen = {}): { svg: string; width: number; height: number; boxes: Map<string, Rect> } {
    const boxes = kaesten(doc, measure);
    const { zeile, rand, font, abstand } = STIL;
    const sel = opt.ausgewaehlt;
    const blau = "#0a66d6";
    let width = 0, height = 0;
    for (const b of boxes.values()) {
        width = Math.max(width, b.x + b.w);
        height = Math.max(height, b.y + b.h);
    }
    width = Math.max(width + abstand, opt.interaktiv ? 600 : 0);
    height = Math.max(height + abstand, opt.interaktiv ? 400 : 0);

    const teile: string[] = [];
    // Beziehungen (unter den Kästen)
    for (const bz of doc.beziehungen) {
        const a = boxes.get(bz.von), b = boxes.get(bz.nach);
        if (!a || !b) continue;
        const l = linie(a, b);
        if (!l) continue;
        const aktiv = sel === bz.id;
        const farbe = aktiv ? blau : "#000";
        const breite = aktiv ? 2 : 1.2;
        let x2 = l.x2, y2 = l.y2, spitze = "";
        if (bz.art === "vererbung") {
            // offene Dreiecksspitze an der Oberklasse
            const len = Math.hypot(l.x2 - l.x1, l.y2 - l.y1) || 1;
            const ux = (l.x2 - l.x1) / len, uy = (l.y2 - l.y1) / len;
            const s = 14, h = 8;
            const bx = l.x2 - ux * s, by = l.y2 - uy * s;
            x2 = bx; y2 = by;
            spitze = `<polygon points="${f(l.x2)},${f(l.y2)} ${f(bx - uy * h)},${f(by + ux * h)} ${f(bx + uy * h)},${f(by - ux * h)}" fill="#fff" stroke="${farbe}" stroke-width="${breite}"/>`;
        }
        const daten = opt.interaktiv ? ` data-b="${bz.id}"` : "";
        teile.push(`<g${daten}>`
            + (opt.interaktiv ? `<line x1="${f(l.x1)}" y1="${f(l.y1)}" x2="${f(l.x2)}" y2="${f(l.y2)}" stroke="transparent" stroke-width="12" class="gsg-hit-line"/>` : "")
            + `<line x1="${f(l.x1)}" y1="${f(l.y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${farbe}" stroke-width="${breite}"/>${spitze}</g>`);
    }
    // Kästen
    for (const b of boxes.values()) {
        const k = b.klasse;
        const aktiv = sel === k.id;
        const rahmen = aktiv ? blau : "#000";
        const daten = opt.interaktiv ? ` data-k="${k.id}"` : "";
        const g: string[] = [`<g${daten} class="${opt.interaktiv ? "gsg-kd-klasse" : ""}">`];
        g.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#fff" stroke="${rahmen}" stroke-width="${aktiv ? 2 : 1.2}"${opt.verbinden ? ' class="gsg-kd-ziel"' : ""}/>`);
        const textY = (y: number) => y + zeile - 5;
        g.push(`<text x="${b.x + b.w / 2}" y="${textY(b.y + rand / 2)}" text-anchor="middle" font-weight="bold">${esc(k.name)}</text>`);
        const y1 = b.y + b.hName, y2 = y1 + b.hAttr;
        g.push(`<line x1="${b.x}" y1="${y1}" x2="${b.x + b.w}" y2="${y1}" stroke="${rahmen}" stroke-width="1"/>`);
        g.push(`<line x1="${b.x}" y1="${y2}" x2="${b.x + b.w}" y2="${y2}" stroke="${rahmen}" stroke-width="1"/>`);
        const feld = (liste: Zeile[], top: number) => liste.forEach((z, i) => {
            const y = top + rand / 2 + i * zeile;
            if (z.id && opt.interaktiv) {
                const an = sel === z.id;
                g.push(`<rect x="${b.x + 2}" y="${y}" width="${b.w - 4}" height="${zeile}" data-e="${z.id}" class="gsg-hit" fill="${an ? "rgba(10,102,214,.14)" : "transparent"}"/>`);
            }
            g.push(`<text x="${b.x + rand}" y="${textY(y)}" pointer-events="none">${esc(z.text)}</text>`);
        });
        feld(b.attr, y1);
        feld(b.ops, y2);
        g.push("</g>");
        teile.push(g.join(""));
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" `
        + `font-family="Arial, Helvetica, sans-serif" font-size="${font}">`
        + `<rect width="${width}" height="${height}" fill="#fff"/>${teile.join("")}</svg>`;
    return { svg, width, height, boxes };
}

/** Kästen ohne Lage nebeneinander bzw. nach der Vererbung anordnen (Oberklassen oben) */
export function ordneAn(doc: KlassenDoc, measure: Measure): KlassenDoc {
    const boxes = kaesten(doc, measure);
    const ober = new Map<string, string>();
    for (const b of doc.beziehungen) if (b.art === "vererbung") ober.set(b.von, b.nach);
    const tiefe = (id: string, seen = new Set<string>()): number => {
        const o = ober.get(id);
        if (!o || seen.has(o)) return 0;
        seen.add(id);
        return 1 + tiefe(o, seen);
    };
    const reihen: Klasse[][] = [];
    for (const k of doc.klassen) (reihen[tiefe(k.id)] ??= []).push(k);
    let y = STIL.abstand;
    const d: KlassenDoc = JSON.parse(JSON.stringify(doc));
    for (const reihe of reihen) {
        if (!reihe) continue;
        let x = STIL.abstand, hoehe = 0;
        for (const k of reihe) {
            const b = boxes.get(k.id)!;
            const ziel = d.klassen.find((c) => c.id === k.id)!;
            ziel.x = x;
            ziel.y = y;
            x += b.w + 3 * STIL.abstand;
            hoehe = Math.max(hoehe, b.h);
        }
        y += hoehe + 3 * STIL.abstand;
    }
    return d;
}
