import { GSG_BUEHNENBILDER, GSG_FIGUR_GROESSE, GSG_FIGUREN, type GsgFigur } from "./GsgFigurenLibrary";
import { eigeneFiguren } from "./GsgEigeneFiguren";

/**
 * Blöckly (Paket 18c): Rechnungen für Figur und Bühne ohne Grafik – Koordinaten wie in Scratch, Kostüme nach
 * Blickrichtung, Rand und Abprallen. FigurClass und BuehneClass zeichnen nur, was hier ausgerechnet wird; die Tests
 * laufen ohne Grafik mit denselben Rechnungen.
 *
 * Bühne 480 × 360, Mittelpunkt (0 | 0), x nach rechts, y nach oben. Richtung in Grad wie in Scratch:
 * 90 = nach rechts, 0 = nach oben, 180 = nach unten, -90 = nach links.
 */
export const BUEHNE_BREITE = 480;
export const BUEHNE_HOEHE = 360;
const RAND_X = BUEHNE_BREITE / 2;
const RAND_Y = BUEHNE_HOEHE / 2;

/** Ansicht einer Figur: von welcher Seite man sie sieht */
export type Ansicht = "vorne" | "rechts" | "links" | "hinten";
const ANSICHTEN: Ansicht[] = ["vorne", "rechts", "links", "hinten"];

/**
 * Drehstil (Einstellung je Figur):
 * - blickrichtung: Die Figur dreht sich nicht, sondern zeigt das Kostüm zur Richtung (vorne, rechts, links, hinten).
 * - links-rechts: nur die Kostüme nach rechts und links.
 * - rundherum: das Kostüm nach rechts, gedreht in die Richtung (wie in Scratch).
 * - nicht drehen: Die Richtung ändert das Kostüm nicht.
 */
export type Drehstil = "blickrichtung" | "links-rechts" | "rundherum" | "nicht drehen";
export const DREHSTILE: Drehstil[] = ["blickrichtung", "links-rechts", "rundherum", "nicht drehen"];

/** Vergleichsschlüssel für Namen: klein, ohne Umlaute, Leer- und Satzzeichen („Roter Panda“ = „roterpanda“) */
export function schluessel(name: string): string {
    return name.toLowerCase()
        .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
        .replace(/[^a-z0-9]/g, "");
}

export function drehstilAus(name: string): Drehstil | undefined {
    const k = schluessel(name);
    return DREHSTILE.find((d) => schluessel(d) === k);
}

/** Richtung auf (-180, 180] bringen (wie Scratch) */
export function richtungNormal(grad: number): number {
    if (!Number.isFinite(grad)) return 90;
    let r = ((grad % 360) + 360) % 360;
    if (r > 180) r -= 360;
    return r;
}

/** Werte wie 6.1e-17 (aus sin/cos) als 0 zeigen – wie Scratch */
export function gerundet(wert: number): number {
    const r = Math.round(wert);
    return Math.abs(wert - r) < 1e-9 ? r : wert;
}

/** Ansicht zur Richtung; undefined: die Ansicht bleibt (Drehstil „nicht drehen“) */
export function ansichtZurRichtung(richtung: number, stil: Drehstil): Ansicht | undefined {
    const d = richtungNormal(richtung);
    switch (stil) {
        case "nicht drehen": return undefined;
        case "rundherum": return "rechts";
        case "links-rechts": return d < 0 ? "links" : "rechts";
        default:
            if (d >= 45 && d <= 135) return "rechts";
            if (d <= -45 && d >= -135) return "links";
            if (Math.abs(d) < 45) return "hinten";
            return "vorne";
    }
}

/** Kostüme einer Bibliotheksfigur, geordnet nach Ansicht und Pose (stehen, laufen1 …, winken) */
export class Kostueme {
    private posen = new Map<Ansicht, string[]>();

    constructor(readonly figur: GsgFigur) {
        for (const k of figur.kostueme) {
            const [ansicht, pose] = k.id.split("-") as [Ansicht, string];
            if (!this.posen.has(ansicht)) this.posen.set(ansicht, []);
            this.posen.get(ansicht)!.push(pose);
        }
    }

    static fuer(name: string): Kostueme | undefined {
        const k = schluessel(name);
        const passt = (f: GsgFigur) => schluessel(f.name) === k || schluessel(f.titel) === k;
        // eigene Figuren (Paket 18i) aus der Bildtafel des Projekts
        const figur = GSG_FIGUREN.find(passt) ?? eigeneFiguren().find(passt);
        return figur ? new Kostueme(figur) : undefined;
    }

    /** alle Figuren: Bibliothek und eigene Figuren des Projekts */
    static alleFiguren(): GsgFigur[] {
        return [...GSG_FIGUREN, ...eigeneFiguren()];
    }

    /** Ansicht, deren Bilder gezeigt werden: eigene Figuren haben oft nur Bilder von vorne */
    private gezeigteAnsicht(ansicht: Ansicht): Ansicht {
        if (this.posen.has(ansicht)) return ansicht;
        if (this.posen.has("vorne")) return "vorne";
        return this.posen.keys().next().value ?? ansicht;
    }

    posenFuer(ansicht: Ansicht): string[] {
        return this.posen.get(this.gezeigteAnsicht(ansicht)) ?? ["stehen"];
    }

    /** Pose, die in dieser Ansicht gezeigt wird: „laufen 3“ gibt es von vorne nicht → „laufen 1“; „winken“ nur vorne */
    gezeigtePose(ansicht: Ansicht, pose: string): string {
        const posen = this.posenFuer(ansicht);
        if (posen.includes(pose)) return pose;
        const lauf = /^laufen(\d+)$/.exec(pose);
        const laufen = posen.filter((p) => p.startsWith("laufen"));
        if (lauf && laufen.length) return laufen[(Number(lauf[1]) - 1) % laufen.length];
        return posen[0];
    }

    /** Nummer des Bildes auf der Bildtafel (SpriteLibrary.<Name>#nummer) */
    bildnummer(ansicht: Ansicht, pose: string): number {
        const id = `${this.gezeigteAnsicht(ansicht)}-${this.gezeigtePose(ansicht, pose)}`;
        return Math.max(0, this.figur.kostueme.findIndex((k) => k.id === id));
    }

    /** nächstes Kostüm: beim Laufen das nächste Laufbild (laufen 4 → laufen 1), sonst das nächste der Liste */
    naechste(ansicht: Ansicht, pose: string): string {
        const gezeigt = this.gezeigtePose(ansicht, pose);
        const posen = this.posenFuer(ansicht);
        const laufen = posen.filter((p) => p.startsWith("laufen"));
        if (gezeigt.startsWith("laufen") && laufen.length > 1) return laufen[(laufen.indexOf(gezeigt) + 1) % laufen.length];
        return posen[(posen.indexOf(gezeigt) + 1) % posen.length];
    }

    /** Name wie „laufen 1“ (ohne Ansicht) */
    static titel(pose: string): string {
        return pose.replace(/(\D)(\d)/, "$1 $2");
    }

    /** alle Posen (für Fehlermeldungen): stehen, laufen 1 … winken */
    alleTitel(): string[] {
        const result: string[] = [];
        for (const a of ANSICHTEN) for (const p of this.posenFuer(a)) if (!result.includes(p)) result.push(p);
        return result.sort((x, y) => this.reihenfolge(x) - this.reihenfolge(y)).map(Kostueme.titel);
    }

    private reihenfolge(pose: string) {
        if (pose === "stehen") return 0;
        const lauf = /^laufen(\d+)$/.exec(pose);
        return lauf ? Number(lauf[1]) : 100;
    }

    /**
     * Kostümname lesen: „laufen 1“ (Pose, Ansicht bleibt) oder „rechts laufen 1“ (Ansicht und Pose).
     * undefined: unbekannt
     */
    lese(name: string): { ansicht?: Ansicht; pose: string } | undefined {
        const k = schluessel(name);
        for (const kostuem of this.figur.kostueme) {
            if (schluessel(kostuem.id) === k) {
                const [ansicht, pose] = kostuem.id.split("-") as [Ansicht, string];
                return { ansicht, pose };
            }
        }
        for (const a of ANSICHTEN) {
            const pose = this.posenFuer(a).find((p) => schluessel(p) === k);
            if (pose) return { pose };
        }
        return undefined;
    }
}

/** Bühnenbild über Name („Schulhof“) oder Kennung („schulhof“) */
export function buehnenbildAus(name: string): { index: number; id: string; titel: string } | undefined {
    const k = schluessel(name);
    return GSG_BUEHNENBILDER.find((b) => schluessel(b.id) === k || schluessel(b.titel) === k);
}

export type Rechteck = { links: number; rechts: number; oben: number; unten: number };

/** Lage und Aussehen einer Figur, wie Scratch sie beschreibt */
export type FigurZustand = {
    x: number;
    y: number;
    richtung: number;
    groesse: number;        // in Prozent
    drehstil: Drehstil;
    ansicht: Ansicht;
    pose: string;
    sichtbar: boolean;
};

export function neuerZustand(x = 0, y = 0): FigurZustand {
    return { x, y, richtung: 90, groesse: 100, drehstil: "blickrichtung", ansicht: "vorne", pose: "stehen", sichtbar: true };
}

/** Drehwinkel des Bildes in Grad (im Uhrzeigersinn); nur beim Drehstil „rundherum“ */
export function bilddrehung(z: FigurZustand): number {
    return z.drehstil === "rundherum" ? richtungNormal(z.richtung) - 90 : 0;
}

/** Umriss des Kostümbildes (achsenparallel, auch gedreht) in Bühnenkoordinaten */
export function umriss(z: FigurZustand, x = z.x, y = z.y): Rechteck {
    const f = z.groesse / 100;
    const hb = GSG_FIGUR_GROESSE.breite / 2 * f;
    const hh = GSG_FIGUR_GROESSE.hoehe / 2 * f;
    const a = bilddrehung(z) * Math.PI / 180;
    const bx = Math.abs(Math.cos(a)) * hb + Math.abs(Math.sin(a)) * hh;
    const by = Math.abs(Math.sin(a)) * hb + Math.abs(Math.cos(a)) * hh;
    return { links: x - bx, rechts: x + bx, oben: y + by, unten: y - by };
}

export function ueberlappen(a: Rechteck, b: Rechteck): boolean {
    return a.links <= b.rechts && b.links <= a.rechts && a.unten <= b.oben && b.unten <= a.oben;
}

/** berührt den Rand: Umriss reicht an den Bühnenrand oder darüber hinaus */
export function beruehrtRand(r: Rechteck): boolean {
    return r.links <= -RAND_X || r.rechts >= RAND_X || r.oben >= RAND_Y || r.unten <= -RAND_Y;
}

/**
 * Zaun wie in Scratch: Eine Figur kann die Bühne nicht ganz verlassen – ein Streifen von bis zu 15 Punkten
 * bleibt sichtbar. Liefert die erlaubte Position.
 */
export function eingezaeunt(z: FigurZustand, x: number, y: number): { x: number; y: number } {
    const r = umriss(z, x, y);
    const rand = Math.floor(Math.min(15, (r.rechts - r.links) / 2, (r.oben - r.unten) / 2));
    if (r.rechts < -RAND_X + rand) x += -RAND_X + rand - r.rechts;
    if (r.links > RAND_X - rand) x -= r.links - (RAND_X - rand);
    if (r.oben < -RAND_Y + rand) y += -RAND_Y + rand - r.oben;
    if (r.unten > RAND_Y - rand) y -= r.unten - (RAND_Y - rand);
    return { x, y };
}

/**
 * pralle vom Rand ab (wie Scratch): am nächsten Rand die Richtung spiegeln und die Figur ganz auf die Bühne
 * schieben. undefined: berührt keinen Rand
 */
export function abgeprallt(z: FigurZustand): { richtung: number; x: number; y: number } | undefined {
    const r = umriss(z);
    const abstand = {
        links: Math.max(0, RAND_X + r.links), rechts: Math.max(0, RAND_X - r.rechts),
        oben: Math.max(0, RAND_Y - r.oben), unten: Math.max(0, RAND_Y + r.unten),
    };
    let naechster: keyof typeof abstand = "links";
    for (const k of Object.keys(abstand) as (keyof typeof abstand)[]) if (abstand[k] < abstand[naechster]) naechster = k;
    if (abstand[naechster] > 0) return undefined;
    const rad = (90 - z.richtung) * Math.PI / 180;
    let dx = Math.cos(rad);
    let dy = Math.sin(rad);    // y nach oben
    if (naechster === "links") dx = Math.max(0.2, Math.abs(dx));
    if (naechster === "rechts") dx = -Math.max(0.2, Math.abs(dx));
    if (naechster === "oben") dy = -Math.max(0.2, Math.abs(dy));
    if (naechster === "unten") dy = Math.max(0.2, Math.abs(dy));
    const richtung = richtungNormal(90 - Math.atan2(dy, dx) * 180 / Math.PI);
    // ganz auf die Bühne
    const neu = { ...z, richtung };
    const u = umriss(neu);
    let x = z.x, y = z.y;
    if (u.links < -RAND_X) x += -RAND_X - u.links;
    if (u.rechts > RAND_X) x -= u.rechts - RAND_X;
    if (u.unten < -RAND_Y) y += -RAND_Y - u.unten;
    if (u.oben > RAND_Y) y -= u.oben - RAND_Y;
    return { richtung, x, y };
}

/** Bühnenkoordinaten → Koordinaten der Grafik (480 × 360, Ursprung oben links, y nach unten) */
export function zurGrafik(x: number, y: number): { x: number; y: number } {
    return { x: x + RAND_X, y: RAND_Y - y };
}

export function ausGrafik(x: number, y: number): { x: number; y: number } {
    return { x: x - RAND_X, y: RAND_Y - y };
}

/** Richtung von (x1|y1) nach (x2|y2) in Grad wie Scratch */
export function richtungNach(x1: number, y1: number, x2: number, y2: number): number {
    if (x1 === x2 && y1 === y2) return 90;
    return richtungNormal(90 - Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI);
}
