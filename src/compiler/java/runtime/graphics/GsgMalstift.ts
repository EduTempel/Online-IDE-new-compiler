import * as PIXI from "pixi.js";

/**
 * GSG (Paket 19g): Malstift wie in Scratch. Jede Figur hat einen Stift (oben/unten, Farbe, Dicke); ist er unten,
 * zeichnet sie bei jeder Bewegung eine Linie. Linien und Abdrücke landen in einer Zeichenebene: ein Bild über dem
 * Bühnenbild und hinter allen Figuren.
 */

/** Farbe im Farbkreis: h in Grad (0–360), s und v von 0 bis 1 */
export type StiftFarbe = { h: number; s: number; v: number };

export type Stift = {
    unten: boolean;
    farbe: StiftFarbe;
    dicke: number;
    /** wo die Figur beim letzten Zeichnen stand (Bühnenkoordinaten) */
    x: number;
    y: number;
};

/** Auswahl im Block „setze Stiftfarbe auf …“ (Text = Wert, so steht es auch im Java-Code) */
export const STIFTFARBEN: [string, string][] = [
    "rot", "orange", "gelb", "hellgrün", "grün", "türkis", "hellblau", "blau", "lila", "rosa", "braun", "schwarz", "grau", "weiß",
].map((f) => [f, f]);

const FARBEN: Record<string, StiftFarbe> = {
    rot: { h: 0, s: 1, v: 0.9 },
    orange: { h: 30, s: 1, v: 1 },
    gelb: { h: 55, s: 1, v: 1 },
    hellgruen: { h: 90, s: 0.8, v: 0.9 },
    gruen: { h: 125, s: 1, v: 0.6 },
    tuerkis: { h: 175, s: 1, v: 0.8 },
    hellblau: { h: 200, s: 0.7, v: 1 },
    blau: { h: 230, s: 1, v: 0.9 },
    lila: { h: 280, s: 0.8, v: 0.8 },
    rosa: { h: 330, s: 0.5, v: 1 },
    braun: { h: 25, s: 0.75, v: 0.5 },
    schwarz: { h: 0, s: 0, v: 0 },
    grau: { h: 0, s: 0, v: 0.55 },
    weiss: { h: 0, s: 0, v: 1 },
};

const schluessel = (s: string) => s.trim().toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/\s+/g, "");

export function neuerStift(x = 0, y = 0): Stift {
    return { unten: false, farbe: { ...FARBEN.blau }, dicke: 1, x, y };
}

export function kopieDesStifts(s: Stift): Stift {
    return { ...s, farbe: { ...s.farbe } };
}

/** Farbe aus Name („grün“, „gruen“) oder #rrggbb; unbekannt: undefined */
export function farbeAus(name: string): StiftFarbe | undefined {
    const f = FARBEN[schluessel(name)];
    if (f) return { ...f };
    const m = /^#?([0-9a-f]{6})$/i.exec(name.trim());
    if (!m) return undefined;
    const n = parseInt(m[1], 16);
    return rgbZuHsv((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

export function farbnamen(): string {
    return STIFTFARBEN.map((f) => f[0]).join(", ");
}

/** „ändere Stiftfarbe um …“: 100 = einmal um den Farbkreis (wie Scratch) */
export function farbeVerschoben(f: StiftFarbe, um: number): StiftFarbe {
    return { ...f, h: (((f.h + um * 3.6) % 360) + 360) % 360 };
}

/** Stiftdicke wie Scratch: mindestens 1 */
export function dickeBegrenzt(d: number): number {
    return Number.isFinite(d) ? Math.max(1, Math.min(200, d)) : 1;
}

export function farbeAlsZahl(f: StiftFarbe): number {
    const c = f.v * f.s, h = f.h / 60, x = c * (1 - Math.abs((h % 2) - 1)), m = f.v - c;
    const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
    const k = (w: number) => Math.round((w + m) * 255);
    return (k(r) << 16) | (k(g) << 8) | k(b);
}

function rgbZuHsv(r: number, g: number, b: number): StiftFarbe {
    const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255, d = max - min;
    let h = 0;
    if (d > 0) {
        const [rr, gg, bb] = [r / 255, g / 255, b / 255];
        h = max === rr ? 60 * (((gg - bb) / d) % 6) : max === gg ? 60 * ((bb - rr) / d + 2) : 60 * ((rr - gg) / d + 4);
    }
    return { h: (h + 360) % 360, s: max === 0 ? 0 : d / max, v: max };
}

/**
 * Zeichenebene der Bühne (Koordinaten der Grafik: 0–480 nach rechts, 0–360 nach unten). Ohne Grafik (Tests) zählt
 * sie nur mit.
 */
export class StiftEbene {
    linien = 0;
    abdruecke = 0;
    private bild?: PIXI.RenderTexture;
    sprite?: PIXI.Sprite;
    private huelle = new PIXI.Container();

    constructor(private app: PIXI.Application | undefined, private breite: number, private hoehe: number) {
        const renderer = this.renderer();
        if (!renderer) return;
        this.bild = PIXI.RenderTexture.create({ width: breite, height: hoehe, resolution: 2, antialias: true });
        this.sprite = new PIXI.Sprite(this.bild);
        this.app!.stage.addChild(this.sprite);
        this.loesche();
    }

    private renderer(): PIXI.Renderer | undefined {
        return this.app?.renderer && !this.app.stage?.destroyed ? this.app.renderer : undefined;
    }

    private zeichne(inhalt: PIXI.Container, leeren = false) {
        const renderer = this.renderer();
        if (!renderer || !this.bild || this.bild.destroyed) return;
        this.huelle.addChild(inhalt);
        renderer.render({ container: this.huelle, target: this.bild, clear: leeren, clearColor: [0, 0, 0, 0] });
        this.huelle.removeChild(inhalt);
        inhalt.destroy();
    }

    linie(x1: number, y1: number, x2: number, y2: number, farbe: number, dicke: number) {
        this.linien++;
        if (!this.bild) return;
        const g = new PIXI.Graphics();
        if (x1 === x2 && y1 === y2) g.circle(x1, y1, dicke / 2).fill(farbe);
        else g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: dicke, color: farbe, cap: "round", join: "round" });
        this.zeichne(g);
    }

    /** Abdruck eines Bildes mit dieser Lage (Matrix wie beim Sprite der Figur) */
    abdruck(textur: PIXI.Texture, lage: PIXI.Matrix) {
        this.abdruecke++;
        if (!this.bild) return;
        const s = new PIXI.Sprite(textur);
        s.setFromMatrix(lage);
        this.zeichne(s);
    }

    loesche() {
        this.linien = 0;
        this.abdruecke = 0;
        if (this.bild) this.zeichne(new PIXI.Container(), true);
    }
}
