import { JavaBlockParser } from "../blocks/JavaBlockParser";
import type { HandbookSection } from "./Handbook";

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
function blockTypesIn(code: string): Set<string> {
    let types = typesCache.get(code);
    if (!types) {
        types = new Set<string>();
        const visit = (o: unknown) => {
            if (!o || typeof o !== "object") return;
            const t = (o as { type?: unknown }).type;
            if (typeof t === "string") types!.add(t);
            for (const v of Object.values(o)) visit(v);
        };
        visit(JavaBlockParser.parse(code).state);
        typesCache.set(code, types);
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
        const index = s.entries.findIndex((e) => blockTypesIn(e.code).has(blockType));
        if (index >= 0) return { section: s.id, index };
    }
    return undefined;
}
