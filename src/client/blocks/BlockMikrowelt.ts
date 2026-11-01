/**
 * GSG (Paket 19k): Mikrowelten – eine Aufgabe bietet nur ausgewählte Blöcke an. Die Auswahl steht in der Aufgabe
 * (settings.gsgTask.bloecke: Kennung der Kategorie -> Schlüssel der Blöcke) und geht mit ihr beim Austeilen, Teilen
 * und in der Galerie mit. Die Werkzeugleiste zeigt dann nur diese Blöcke; Kategorien ohne Blöcke verschwinden.
 * Schon platzierte Blöcke bleiben und laufen. Lehrkräfte können „alle Blöcke zeigen“.
 *
 * Ohne Abhängigkeit von Blockly: die Blockansicht liefert den Katalog (welche Blöcke es je Kategorie gibt).
 */

/** erlaubte Blöcke: Kategorie -> Schlüssel (siehe blockSchluessel) */
export type Mikrowelt = Record<string, string[]>;

/** ein Eintrag der Werkzeugleiste (Block, Beschriftung, Knopf, Unterkategorie …) */
export type ToolboxEintrag = {
    kind: string;
    type?: string;
    fields?: Record<string, unknown>;
    extraState?: unknown;
    text?: string;
    callbackKey?: string;
    toolboxitemid?: string;
    contents?: unknown;
    [k: string]: unknown;
};

/**
 * Schlüssel eines Blocks der Werkzeugleiste: der Blocktyp, bei Rechen-, Vergleichs- und Mathe-Blöcken mit dem
 * Zeichen (+, <, round …), bei „falls … sonst“ mit „:sonst“ – so wählt die Lehrkraft z. B. nur „+“ und „−“.
 */
export function blockSchluessel(e: ToolboxEintrag): string {
    const f = e.fields ?? {};
    const art = f.OP ?? f.FUNC ?? (e.type === "j_while" ? f.MODE : undefined);
    if (typeof art === "string" && art) return `${e.type}:${art}`;
    const s = e.extraState as { hasElse?: unknown } | undefined;
    if (s && typeof s === "object" && s.hasElse === true) return `${e.type}:sonst`;
    return String(e.type ?? "");
}

/** Auswahl aus der Aufgabe (bereinigt); keine oder leere Auswahl: undefined (alle Blöcke) */
export function mikroweltAus(roh: unknown): Mikrowelt | undefined {
    if (!roh || typeof roh !== "object" || Array.isArray(roh)) return undefined;
    const result: Mikrowelt = {};
    for (const [k, v] of Object.entries(roh as Record<string, unknown>)) {
        if (!Array.isArray(v)) continue;
        const keys = [...new Set(v.filter((x): x is string => typeof x === "string" && x !== ""))];
        if (keys.length) result[k] = keys;
    }
    return Object.keys(result).length ? result : undefined;
}

/** Auswahl der Aufgabe eines Projekts (settings.gsgTask.bloecke) */
export function mikroweltDerAufgabe(settings: unknown): Mikrowelt | undefined {
    return mikroweltAus((settings as { gsgTask?: { bloecke?: unknown } } | undefined)?.gsgTask?.bloecke);
}

// ------------------------------------------------------------------ Lehrkraft: alle Blöcke zeigen

let alleZeigen = false;
const beobachter: (() => void)[] = [];

export function alleBloeckeZeigen(): boolean {
    return alleZeigen;
}

export function setzeAlleBloeckeZeigen(an: boolean) {
    alleZeigen = an;
    mikroweltGeaendert();
}

/** Die Blockansicht meldet sich hier an: Auswahl der Aufgabe oder „alle zeigen“ hat sich geändert */
export function beiMikroweltAenderung(f: () => void) {
    beobachter.push(f);
}

export function mikroweltGeaendert() {
    for (const f of beobachter) f();
}

// ------------------------------------------------------------------ Werkzeugleiste filtern

/** Knöpfe, die nur zu bestimmten Blöcken gehören (z. B. „Neue Liste“ zu den Listen-Blöcken) */
const KNOPF_BLOECKE = new Map<string, string[]>();
export function knopfGehoertZu(callbackKey: string, schluessel: string[]) {
    KNOPF_BLOECKE.set(callbackKey, schluessel);
}

/**
 * Inhalt einer Kategorie auf die erlaubten Blöcke kürzen. Beschriftungen bleiben nur, wenn nach ihnen (bis zur
 * nächsten) noch ein Block oder Knopf steht – oder gar nichts stand (reine Hinweise). Knöpfe bleiben, außer sie
 * gehören zu Blöcken, die alle fehlen.
 */
export function filtereEintraege<T extends ToolboxEintrag>(eintraege: T[], erlaubt: string[]): T[] {
    const ok = new Set(erlaubt);
    const bleibt = eintraege.map((e) => {
        if (e.kind === "block") return ok.has(blockSchluessel(e));
        if (e.kind === "button") {
            const zu = KNOPF_BLOECKE.get(String(e.callbackKey ?? ""));
            return !zu || zu.some((s) => ok.has(s));
        }
        return true;
    });
    for (let i = 0; i < eintraege.length; i++) {
        if (eintraege[i].kind !== "label") continue;
        let hatteInhalt = false, hatInhalt = false;
        for (let j = i + 1; j < eintraege.length && eintraege[j].kind !== "label"; j++) {
            if (eintraege[j].kind !== "block" && eintraege[j].kind !== "button") continue;
            hatteInhalt = true;
            if (bleibt[j]) hatInhalt = true;
        }
        bleibt[i] = !hatteInhalt || hatInhalt;
    }
    return eintraege.filter((_, i) => bleibt[i]);
}

/**
 * Werkzeugleiste (Kategorien) für eine Mikrowelt: Kategorien ohne erlaubte Blöcke fallen weg; eine Oberkategorie
 * mit erlaubten Unterkategorien bleibt als Ordner. Feste Inhalte werden gekürzt, dynamische beim Öffnen
 * (filtereEintraege in der Blockansicht).
 */
export function mikroweltToolbox<T extends { contents?: unknown }>(def: T, welt: Mikrowelt | undefined): T {
    if (!welt) return def;
    const walk = (items: ToolboxEintrag[]): ToolboxEintrag[] => items.flatMap((c): ToolboxEintrag[] => {
        if (c.kind !== "category") return [c];
        const erlaubt = welt[c.toolboxitemid ?? ""] ?? [];
        if (!Array.isArray(c.contents)) return erlaubt.length ? [c] : [];
        const inhalt = c.contents as ToolboxEintrag[];
        const unter = walk(inhalt.filter((x) => x.kind === "category"));
        const eigene = filtereEintraege(inhalt.filter((x) => x.kind !== "category"), erlaubt);
        if (!erlaubt.length) return unter.length ? [{ ...c, contents: unter }] : [];
        return [{ ...c, contents: [...eigene, ...unter] }];
    });
    const contents = walk(((def.contents ?? []) as ToolboxEintrag[]));
    return { ...def, contents: contents.length ? contents : def.contents };
}

// ------------------------------------------------------------------ Katalog für den Aufgaben-Editor

export type KatalogBlock = { schluessel: string; text: string };
export type KatalogKategorie = { id: string; name: string; colour?: string; tiefe: number; bloecke: KatalogBlock[] };

/** zwei Kataloge vereinigen (z. B. Blöcke für Figuren und für die Bühne): Reihenfolge des ersten, Neues dahinter */
export function vereinigeKataloge(a: KatalogKategorie[], b: KatalogKategorie[]): KatalogKategorie[] {
    const result = a.map((k) => ({ ...k, bloecke: [...k.bloecke] }));
    for (const k of b) {
        const ziel = result.find((r) => r.id === k.id);
        if (!ziel) {
            result.push({ ...k, bloecke: [...k.bloecke] });
            continue;
        }
        for (const blk of k.bloecke) if (!ziel.bloecke.some((x) => x.schluessel === blk.schluessel)) ziel.bloecke.push(blk);
    }
    return result;
}

let katalogQuelle: (() => KatalogKategorie[]) | undefined;

/** Die Blockansicht liefert den Katalog (sie kennt Werkzeugleiste und Arbeitsfläche) */
export function setzeKatalogQuelle(f: () => KatalogKategorie[]) {
    katalogQuelle = f;
}

/** Alle Blöcke der Werkzeugleiste je Kategorie; undefined: noch keine Blockansicht offen */
export function blockKatalog(): KatalogKategorie[] | undefined {
    try {
        return katalogQuelle?.();
    } catch {
        return undefined;
    }
}
