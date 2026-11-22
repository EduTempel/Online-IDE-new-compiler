import { blockSchluessel, filtereEintraege, mikroweltAus, type ToolboxEintrag } from "./BlockMikrowelt";

/**
 * GSG: einzelne Blöcke, die die Lerngruppe nicht bekommt (Verwaltung → Freigaben). Die Lehrkraft hakt sie in der
 * Verwaltung ab; sie stehen in gsgFreigaben.bloeckeGesperrt bzw. bloecklyGesperrt (Kategorie -> Schlüssel wie bei
 * den Mikrowelten, siehe blockSchluessel). Gesperrte Blöcke fehlen in der Werkzeugleiste; Blöcke, die schon im
 * Programm stehen, bleiben und laufen. Ohne Blockly-Abhängigkeit.
 */

/** gesperrte Blöcke: Kennung der Kategorie -> Schlüssel */
export type BlockSperren = Record<string, string[]>;

/** Sperren aus den Freigaben (bereinigt); keine: undefined */
export function sperrenAus(roh: unknown): BlockSperren | undefined {
    return mikroweltAus(roh);
}

/** Einträge einer Kategorie ohne die gesperrten Blöcke (Beschriftungen und Knöpfe wie bei den Mikrowelten) */
export function ohneGesperrte<T extends ToolboxEintrag>(eintraege: T[], gesperrt: readonly string[] | undefined): T[] {
    if (!gesperrt?.length) return eintraege;
    const weg = new Set(gesperrt);
    const erlaubt = eintraege.filter((e) => e.kind === "block").map(blockSchluessel).filter((s) => !weg.has(s));
    return filtereEintraege(eintraege, erlaubt);
}

/**
 * Werkzeugleiste ohne gesperrte Blöcke: feste Inhalte werden gekürzt, dynamische beim Öffnen (ohneGesperrte in der
 * Blockansicht). Eine Kategorie, deren Blöcke alle gesperrt sind, fällt weg – außer sie hat Unterkategorien.
 */
export function sperrenToolbox<T extends { contents?: unknown }>(def: T, sperren: BlockSperren | undefined): T {
    if (!sperren) return def;
    const walk = (items: ToolboxEintrag[]): ToolboxEintrag[] => items.flatMap((c): ToolboxEintrag[] => {
        if (c.kind !== "category" || !Array.isArray(c.contents)) return [c];
        const inhalt = c.contents as ToolboxEintrag[];
        const eigene = inhalt.filter((x) => x.kind !== "category");
        const bleibt = new Set(ohneGesperrte(eigene, sperren[c.toolboxitemid ?? ""]));
        // Reihenfolge bleibt (Einträge und Unterkategorien gemischt)
        const neu = inhalt.flatMap((x) => (x.kind === "category" ? walk([x]) : bleibt.has(x) ? [x] : []));
        const hatteBloecke = eigene.some((x) => x.kind === "block");
        if (hatteBloecke && !neu.some((x) => x.kind === "block" || x.kind === "category")) return [];
        return [{ ...c, contents: neu }];
    });
    const contents = walk((def.contents ?? []) as ToolboxEintrag[]);
    return { ...def, contents: contents.length ? contents : def.contents };
}
