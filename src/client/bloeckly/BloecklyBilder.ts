import gsgFigurenJson from '/assets/graphics/gsg-figuren.json.txt';
import gsgFigurenPng from '/assets/graphics/gsg-figuren.png';
import { GSG_BUEHNENBILD_NAME } from "../../compiler/java/runtime/graphics/GsgFigurenLibrary";
import { eigeneTafel, type EigeneTafel } from "../../compiler/java/runtime/graphics/GsgEigeneFiguren";

/**
 * Blöckly (Paket 18d): Bilder der Figuren und Bühnenbilder für die Oberfläche (Vorschau der Bühne, Figurenliste,
 * Bibliothek, Kostüme) – direkt aus der Bildtafel gsg-figuren.png, ohne Grafik der IDE.
 */
type Rahmen = { x: number; y: number; w: number; h: number };
export type Bildtafel = { bild: HTMLImageElement; rahmen: Record<string, Rahmen> };

let laden: Promise<Bildtafel> | undefined;

export function bildtafel(): Promise<Bildtafel> {
    laden ??= Promise.all([
        fetch(gsgFigurenJson).then((r) => r.json() as Promise<{ frames: Record<string, { frame: Rahmen }> }>),
        new Promise<HTMLImageElement>((resolve, reject) => {
            const bild = new Image();
            bild.onload = () => resolve(bild);
            bild.onerror = reject;
            bild.src = gsgFigurenPng;
        }),
    ]).then(([daten, bild]) => ({
        bild,
        rahmen: Object.fromEntries(Object.entries(daten.frames).map(([name, f]) => [name, f.frame])),
    }));
    return laden;
}

// —— eigene Figuren (Paket 18i): Bilder aus der Bildtafel des Projekts ——

let eigeneQuelle: { tafel: EigeneTafel; bild: HTMLCanvasElement } | undefined;

/** Bild einer eigenen Figur: Leinwand der Projekt-Tafel und Rahmen */
export function eigenesBild(name: string): { bild: HTMLCanvasElement; r: Rahmen } | undefined {
    const tafel = eigeneTafel();
    const r = tafel?.rahmen[name];
    if (!tafel || !r) return undefined;
    if (eigeneQuelle?.tafel !== tafel) {
        const bild = document.createElement("canvas");
        bild.width = tafel.breite;
        bild.height = tafel.hoehe;
        const pixel = new Uint8ClampedArray(tafel.pixel.subarray(0, tafel.breite * tafel.hoehe * 4));
        bild.getContext("2d")?.putImageData(new ImageData(pixel, tafel.breite, tafel.hoehe), 0, 0);
        eigeneQuelle = { tafel, bild };
    }
    return { bild: eigeneQuelle.bild, r };
}

/** Bild „Name#nummer“ in das Rechteck zeichnen (eigene Figuren mit ihrem Seitenverhältnis, mittig) */
export function zeichne(ctx: CanvasRenderingContext2D, tafel: Bildtafel, name: string, x: number, y: number, b: number, h: number) {
    const eigen = eigenesBild(name);
    if (eigen) {
        const r = eigen.r, f = Math.min(b / r.w, h / r.h);
        ctx.drawImage(eigen.bild, r.x, r.y, r.w, r.h, x + (b - r.w * f) / 2, y + (h - r.h * f) / 2, r.w * f, r.h * f);
        return;
    }
    const r = tafel.rahmen[name];
    if (r) ctx.drawImage(tafel.bild, r.x, r.y, r.w, r.h, x, y, b, h);
}

/** Bild in eine kleine Leinwand zeichnen (Seitenverhältnis bleibt, mittig) */
export function bildchen(name: string, breite: number, hoehe: number, klasse = "gsg-bl-bildchen"): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.round(breite * dpr);
    canvas.height = Math.round(hoehe * dpr);
    canvas.style.width = breite + "px";
    canvas.style.height = hoehe + "px";
    canvas.className = klasse;
    const male = (bild: CanvasImageSource, r: Rahmen | undefined) => {
        const ctx = canvas.getContext("2d");
        if (!r || !ctx) return;
        const f = Math.min(canvas.width / r.w, canvas.height / r.h);
        const b = r.w * f, h = r.h * f;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(bild, r.x, r.y, r.w, r.h, (canvas.width - b) / 2, (canvas.height - h) / 2, b, h);
    };
    const eigen = eigenesBild(name);
    if (eigen) male(eigen.bild, eigen.r);
    else bildtafel().then((tafel) => male(tafel.bild, tafel.rahmen[name])).catch(() => { /* ohne Bild */ });
    return canvas;
}

export function buehnenbildName(index: number): string {
    return `${GSG_BUEHNENBILD_NAME}#${index}`;
}
