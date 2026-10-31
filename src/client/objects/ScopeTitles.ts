import type { BaseSymbolTable } from "../../compiler/common/BaseSymbolTable";
import type { JavaSymbolTable } from "../../compiler/java/codegenerator/JavaSymbolTable";

/**
 * Paket 16g: Überschriften für die Gültigkeitsbereiche im Reiter „Variablen“ – „Hauptprogramm“,
 * „Methode zeige()“, „in der for-Schleife (Zeile 2–5)“ … Die Wörter richten sich nach der Ansicht:
 * Java (mit Zeilen), Blöcke (Namen der Blöcke) oder Struktogramm (allgemein, ohne Zeilen).
 */

export type ScopeStyle = "java" | "blocks" | "structogram";

/** Gültigkeitsbereich einer Variablen: key trennt die Bereiche, inner = Block innerhalb einer Operation, lines: Zeilen im Quelltext */
export type VariableScope = { key: string; title: string; inner: boolean; lines?: { from: number; to: number } };

type Method = { identifier: string; isConstructor?: boolean; classEnumInterface?: { identifier: string; isMainClass?: boolean } };

/** Tabelle der Parameter (äußerste Tabelle mit dieser Methode) */
export function methodRootTable(t: BaseSymbolTable): BaseSymbolTable {
    const method = (t as JavaSymbolTable).methodContext;
    let x: BaseSymbolTable = t;
    while (x.parent && (x.parent as JavaSymbolTable).methodContext === method) x = x.parent;
    return x;
}

/** gehört die Tabelle zur Operation selbst (Parameter bzw. äußerster Block) – nicht zu einer Schleife darin? */
export function isFrameLevel(t: BaseSymbolTable): boolean {
    if (!(t as JavaSymbolTable).methodContext) return true;
    const root = methodRootTable(t);
    return t === root || t.parent === root;
}

/** Name der laufenden Operation: „Hauptprogramm“, „Methode zeige()“, „Operation zeige“ … */
export function frameTitle(table: BaseSymbolTable | undefined, style: ScopeStyle): string {
    const method = (table as JavaSymbolTable | undefined)?.methodContext as Method | undefined;
    const cls = method?.classEnumInterface;
    if (!method || method.identifier === "$main" || (cls?.isMainClass && method.identifier === "main")) return "Hauptprogramm";
    const name = method.identifier;
    if (method.isConstructor) return `Konstruktor von ${cls?.identifier ?? name}`;
    const of = cls && !cls.isMainClass ? ` von ${cls.identifier}` : "";
    return style === "java" ? `Methode ${name}()${of}` : `Operation ${name}${of}`;
}

const PART_TITLES: Record<string, [string, (trigger: string) => string]> = {
    WennTaste: ["@WennTaste", (t) => `„wenn Taste ${t} gedrückt“`],
    WennNachricht: ["@WennNachricht", (t) => `„wenn ich Nachricht ${t} empfange“`],
    WennAngeklickt: ["@WennAngeklickt", (t) => `„wenn ${t} angeklickt wird“`],
    BeimStart: ["@BeimStart", () => "„wenn das Programm startet“"],
};

/** Programmteil (@WennTaste …): „Programmteil taste() – @WennTaste("a")“ bzw. „Programmteil „wenn Taste a gedrückt““; sonst undefined */
export function partTitle(table: BaseSymbolTable, style: ScopeStyle): string | undefined {
    const method = (table as JavaSymbolTable).methodContext as (Method & { getAnnotation?(a: string): { parameter?: string } | undefined }) | undefined;
    if (!method?.getAnnotation) return undefined;
    for (const [annotation, [java, label]] of Object.entries(PART_TITLES)) {
        const a = method.getAnnotation(annotation);
        if (!a) continue;
        const trigger = String(a.parameter ?? "");
        if (style === "java") return `Programmteil ${method.identifier}() – ${java}${trigger ? `("${trigger}")` : ""}`;
        return `Programmteil ${label(trigger)}`;
    }
    return undefined;
}

/** Anweisung, zu der ein Block gehört: Text ab Zeilenanfang (ohne „}“), sonst die Zeile davor („{“ in eigener Zeile) */
function statementOf(lines: string[], table: BaseSymbolTable): string {
    let n = table.range.startLineNumber - 1;
    let text = (lines[n] ?? "").trim().replace(/^\}\s*/, "");
    while (/^\{?$/.test(text) && n > 0) text = (lines[--n] ?? "").trim().replace(/^\}\s*/, "");
    return text;
}

const JAVA_PLACES: [RegExp, string][] = [
    [/^for\b/, "in der for-Schleife"], [/^while\b/, "in der while-Schleife"], [/^do\b/, "in der do-while-Schleife"],
    [/^else\s+if\b/, "im else-if-Zweig"], [/^if\b/, "im if-Zweig"], [/^else\b/, "im else-Zweig"],
    [/^(switch|case|default)\b/, "im switch-Block"], [/^try\b/, "im try-Block"], [/^catch\b/, "im catch-Block"],
    [/^finally\b/, "im finally-Block"],
];

/** wie die Blöcke heißen (BlockTypeSystem: CONTAINER_LABEL) */
const BLOCK_PLACES: [RegExp, string][] = [
    [/^for\s*\(\s*int\s+durchlauf\d*\b/, "in „wiederhole … mal“"], [/^for\s*\([^)]*:/, "in „für jedes Element …“"],
    [/^for\b/, "in „wiederhole für …“"], [/^while\s*\(\s*true\s*\)/, "in „wiederhole fortlaufend“"],
    [/^(while|do)\b/, "in „wiederhole …“"], [/^(if|else)\b/, "in „falls …“"],
];

const STRUCTOGRAM_PLACES: [RegExp, string][] = [
    [/^(for|while|do)\b/, "in der Schleife"], [/^(if|else|switch|case|default)\b/, "in der Verzweigung"],
];

/** Überschrift eines inneren Blocks: „in der for-Schleife (Zeile 2–5)“, „in „wiederhole für …““ … */
export function blockTitle(lines: string[], table: BaseSymbolTable, style: ScopeStyle): string {
    const statement = statementOf(lines, table);
    const places = style === "java" ? JAVA_PLACES : style === "blocks" ? BLOCK_PLACES : STRUCTOGRAM_PLACES;
    const place = places.find(([re]) => re.test(statement))?.[1] ?? "in einem inneren Block";
    if (style !== "java") return place;
    const { startLineNumber: from, endLineNumber: to } = table.range;
    return `${place} (${from === to ? `Zeile ${from}` : `Zeile ${from}–${to}`})`;
}

/** Quelltext der Tabelle (für blockTitle), als Zeilen */
export function sourceLines(table: BaseSymbolTable | undefined): string[] {
    try {
        return ((table as JavaSymbolTable | undefined)?.module?.file?.getText?.() ?? "").split("\n");
    } catch {
        return [];
    }
}
