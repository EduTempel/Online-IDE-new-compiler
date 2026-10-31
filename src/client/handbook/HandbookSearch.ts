import { JavaBlockParser } from "../blocks/JavaBlockParser";
import type { HandbookEntry, HandbookSection } from "./Handbook";
import { BUEHNEN_DATEI, BUEHNEN_KLASSE, variablenDerKlasse } from "../bloeckly/BloecklyProjekt";

/** Hilfsfunktionen des Handbuchs (ohne Oberfläche, damit testbar) */

/** Klassen und Interfaces, die ein Programm definiert */
export function definedTypes(code: string): string[] {
    return [...code.matchAll(/^\s*(?:(?:public|abstract|final)\s+)*(?:class|interface)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
}

/** Dateiname für ein Beispiel: Titel ohne Sonderzeichen */
export function exampleFileName(title: string, ext = ".java"): string {
    const base = title.replace(/[„“"'‚‘…/\\:*?<>|()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40).trim();
    return (base || "Beispiel") + ext;
}

/** Struktogramm ohne Kennungen (zum Vergleichen: Beispiel schon als Datei im Projekt?) */
export function structogramShape(doc: { title: string; body: unknown[] }): string {
    return JSON.stringify({ title: doc.title, body: doc.body }, (k, v) => (k === "id" ? undefined : v));
}

const typesCache = new Map<string, Set<string>>();
function blockTypesIn(e: HandbookEntry): Set<string> {
    let types = typesCache.get(e.code);
    if (!types) {
        types = new Set<string>();
        const visit = (o: unknown) => {
            if (!o || typeof o !== "object") return;
            const t = (o as { type?: unknown }).type;
            if (typeof t === "string") types!.add(t);
            for (const v of Object.values(o)) visit(v);
        };
        if (e.bloeckly) {
            // Blöckly (Paket 18h): jede gezeigte Datei mit dem Wissen über die Bühne
            const stage = e.bloeckly.files.find((f) => f.name === BUEHNEN_DATEI);
            const globals = stage ? variablenDerKlasse(stage.text, { stage: BUEHNEN_KLASSE, globals: {} }) : {};
            for (const f of e.bloeckly.files.filter((x) => e.bloeckly!.show.includes(x.name))) {
                visit(JavaBlockParser.parse(f.text, { bloeckly: { stage: BUEHNEN_KLASSE, globals: f === stage ? {} : globals } }).state);
            }
        } else visit(JavaBlockParser.parse(e.code).state);
        typesCache.set(e.code, types);
    }
    return types;
}

/** erstes Beispiel mit diesem Block – zuerst im bevorzugten Abschnitt (und seinen Unterabschnitten) */
export function findBlockEntry(sections: HandbookSection[], blockType: string, preferred?: string): { section: string; index: number } | undefined {
    const ordered = [
        ...sections.filter((s) => s.id === preferred || (preferred && s.parent === preferred)),
        ...sections.filter((s) => !(s.id === preferred || (preferred && s.parent === preferred))),
    ];
    for (const s of ordered) {
        const index = s.entries.findIndex((e) => blockTypesIn(e).has(blockType));
        if (index >= 0) return { section: s.id, index };
    }
    return undefined;
}
