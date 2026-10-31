import { GSG_FIGUREN, type GsgFigur, type GsgKostuem } from "./GsgFigurenLibrary";

/**
 * Blöckly (Paket 18i): eigene Figuren aus hochgeladenen Bildern. Die Bilder liegen in der Bildtafel des Projekts
 * (wie die eigenen Sprites der IDE, Reihe = Name der Figur, Nummer = Stelle des Kostüms); Name und Kostüme stehen in
 * den Metadaten der Tafel (meta.gsgFiguren). So wandern sie beim Verteilen, Teilen und in die Galerie mit.
 *
 * Beim Öffnen eines Projekts setzt SpritesheetData das Verzeichnis neu; Kostueme.fuer sucht auch hier.
 */

/** so steht eine eigene Figur in den Metadaten der Bildtafel */
export type EigeneFigurDaten = { name: string; titel: string; kostueme: GsgKostuem[] };

/** Rahmen eines Bildes auf der Tafel */
export type Rahmen = { x: number; y: number; w: number; h: number };

/** Bildtafel des Projekts (RGBA-Pixel) für die Bildchen der Oberfläche */
export type EigeneTafel = { rahmen: Record<string, Rahmen>; pixel: Uint8Array; breite: number; hoehe: number };

/** Grenzen: Bilder je Figur, Größe einer Datei, eigene Figuren je Projekt */
export const EIGENE_FIGUR_MAX_BILDER = 8;
export const EIGENE_FIGUR_MAX_BYTES = 1024 * 1024;
export const EIGENE_FIGUREN_MAX = 10;

let figuren: GsgFigur[] = [];
let tafel: EigeneTafel | undefined;
let stand = 0;
const hoerer = new Set<() => void>();

type TafelDaten = {
    frames: Record<string, { frame: Rahmen }>;
    meta: { size: { w: number; h: number }; gsgFiguren?: EigeneFigurDaten[] };
};

/** nur gültige Einträge: Name wie ein Bezeichner, keine Bibliotheksfigur, Kostüme mit Bild auf der Tafel */
export function eigeneFigurenAus(daten: TafelDaten | undefined): GsgFigur[] {
    const result: GsgFigur[] = [];
    const liste = daten?.meta?.gsgFiguren;
    if (!Array.isArray(liste)) return result;
    const vergeben = new Set(GSG_FIGUREN.flatMap((f) => [f.name.toLowerCase(), f.titel.toLowerCase()]));
    for (const e of liste) {
        if (!e || typeof e.name !== "string" || !/^[A-Za-z][A-Za-z0-9_]*$/.test(e.name) || typeof e.titel !== "string") continue;
        if (vergeben.has(e.name.toLowerCase()) || vergeben.has(e.titel.toLowerCase())) continue;
        const kostueme: GsgKostuem[] = [];
        for (const k of Array.isArray(e.kostueme) ? e.kostueme : []) {
            if (!k || typeof k.id !== "string" || !/^(vorne|rechts|links|hinten)-[^-\s]+$/.test(k.id)) break;
            if (!daten!.frames[`${e.name}#${kostueme.length}`]) break;
            kostueme.push({ id: k.id, titel: typeof k.titel === "string" ? k.titel : k.id });
        }
        if (kostueme.length === 0) continue;
        vergeben.add(e.name.toLowerCase());
        vergeben.add(e.titel.toLowerCase());
        result.push({ name: e.name, titel: e.titel, beschreibung: "eigene Figur", kostueme });
    }
    return result;
}

/** neues Projekt geöffnet bzw. Bildtafel geändert (undefined: das Projekt hat keine eigene Bildtafel) */
export function eigeneFigurenSetzen(daten?: TafelDaten, pixel?: Uint8Array) {
    figuren = eigeneFigurenAus(daten);
    tafel = daten && pixel && figuren.length
        ? { rahmen: Object.fromEntries(Object.entries(daten.frames).map(([k, f]) => [k, f.frame])), pixel, breite: daten.meta.size.w, hoehe: daten.meta.size.h }
        : undefined;
    stand++;
    for (const h of hoerer) {
        try { h(); } catch { /* Oberfläche */ }
    }
}

export function eigeneFiguren(): GsgFigur[] {
    return figuren;
}

export function eigeneTafel(): EigeneTafel | undefined {
    return tafel;
}

/** zählt bei jeder Änderung hoch (Oberfläche: neu zeichnen) */
export function eigeneFigurenStand(): number {
    return stand;
}

/** Bescheid bei Änderungen; liefert die Abmeldung */
export function beiEigenenFiguren(h: () => void): () => void {
    hoerer.add(h);
    return () => hoerer.delete(h);
}

// —— Hilfen für den Dialog „Eigene Figur hochladen“ (ohne Oberfläche, getestet) ——

export type Ansichtsname = "vorne" | "rechts" | "links" | "hinten";

/** Name der Bildreihe (SpriteLibrary.<Name>): „Robo 2000“ → „EigenRobo2000“ */
export function figurNameFuer(titel: string): string {
    const ascii = titel.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe")
        .replace(/Ü/g, "Ue").replace(/ß/g, "ss").replace(/[^A-Za-z0-9]/g, "");
    return "Eigen" + ascii.charAt(0).toUpperCase() + ascii.slice(1);
}

/** Fehler im Namen einer eigenen Figur oder undefined; ersetzt: Name der Figur, die neu hochgeladen wird */
export function eigenerFigurnameFehler(titel: string, eigene: GsgFigur[], ersetzt?: string): string | undefined {
    const t = titel.trim();
    if (t === "") return "Bitte gib der Figur einen Namen.";
    if (t.length > 30) return "Der Name ist zu lang (höchstens 30 Zeichen).";
    if (!/^\p{L}[\p{L}\p{N} ]*$/u.test(t)) return "Ein Name besteht aus Buchstaben, Ziffern und Leerzeichen und beginnt mit einem Buchstaben.";
    if (!/[A-Za-z]/.test(figurNameFuer(t).slice(5))) return "Der Name braucht mindestens einen Buchstaben von a bis z.";
    const k = vergleich(t), n = figurNameFuer(t).toLowerCase();
    if (GSG_FIGUREN.some((f) => vergleich(f.titel) === k || vergleich(f.name) === k)) return `„${t}“ gibt es schon in der Bibliothek.`;
    if (eigene.some((f) => f.name !== ersetzt && (vergleich(f.titel) === k || f.name.toLowerCase() === n))) return `Eine eigene Figur „${t}“ gibt es schon.`;
    return undefined;
}

function vergleich(name: string): string {
    return name.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]/g, "");
}

/** Pose aus dem Kostümnamen: „Laufen 1“ → „laufen1“ (klein, ohne Leerzeichen und Bindestriche) */
export function poseAus(name: string): string {
    return name.trim().toLowerCase().replace(/[\s\-]+/g, "");
}

/** Kostüme in der Reihenfolge der Bilder; leere oder doppelte Namen bekommen eine Nummer */
export function kostuemeAus(bilder: { ansicht: Ansichtsname; name: string }[]): GsgKostuem[] {
    const vergeben = new Set<string>();
    return bilder.map((b, i) => {
        let pose = poseAus(b.name) || `kostuem${i + 1}`;
        if (vergeben.has(`${b.ansicht}-${pose}`)) {
            let n = 2;
            while (vergeben.has(`${b.ansicht}-${pose}_${n}`)) n++;
            pose = `${pose}_${n}`;
        }
        const id = `${b.ansicht}-${pose}`;
        vergeben.add(id);
        return { id, titel: `${b.ansicht} ${pose.replace(/(\D)(\d)/, "$1 $2")}` };
    });
}

/** Größe, in der ein Bild auf die Tafel kommt: so groß wie die Bibliotheksfiguren (Seitenverhältnis bleibt) */
export function bildgroesse(breite: number, hoehe: number, rahmen = { breite: 110, hoehe: 121 }): { breite: number; hoehe: number } {
    const b = breite > 0 ? breite : rahmen.breite, h = hoehe > 0 ? hoehe : rahmen.hoehe;
    const f = Math.min(rahmen.breite / b, rahmen.hoehe / h);
    return { breite: Math.max(1, Math.round(b * f)), hoehe: Math.max(1, Math.round(h * f)) };
}
