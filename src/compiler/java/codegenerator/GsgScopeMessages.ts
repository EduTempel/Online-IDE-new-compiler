import type { BaseSymbol, BaseSymbolTable } from "../../common/BaseSymbolTable";
import type { Error as CompilerError } from "../../common/Error";
import { IRange, Range } from "../../common/range/Range";
import { JCM } from "../language/JavaCompilerMessages";
import type { JavaCompiledModule } from "../module/JavaCompiledModule";
import { JavaParameter } from "../types/JavaParameter";
import { JavaLocalVariable } from "./JavaLocalVariable";
import type { JavaSymbolTable } from "./JavaSymbolTable";

/**
 * GSG (Paket 16f): „Der Bezeichner x ist an dieser Stelle nicht definiert“ erklären. Nach dem Übersetzen
 * kennt der Compiler alle Symboltabellen – auch die von Blöcken weiter unten. Gibt es eine lokale Variable
 * bzw. einen Parameter mit dem Namen, sagt die Meldung, wo sie angelegt ist und wo sie gilt:
 *  - im selben Block, aber weiter unten  → „wird erst in Zeile … angelegt“
 *  - in einem inneren Block derselben Methode → „wurde in Zeile … in der for-Schleife angelegt und gilt nur dort“
 *  - in einer anderen Methode → „gehört zur Methode …“
 * Sonst: ähnlicher Name mit anderer Groß-/Kleinschreibung → „Meinst du …?“
 */

export type UnknownIdentifier = { error: CompilerError, identifier: string, range: IRange };

type Candidate = { symbol: BaseSymbol, table: BaseSymbolTable };

function allTables(module: JavaCompiledModule): BaseSymbolTable[] {
    const result: BaseSymbolTable[] = [];
    const visit = (t: BaseSymbolTable) => { result.push(t); t.childTables.forEach(visit); };
    module.symbolTables.forEach(visit);
    return result;
}

/** äußerste Tabelle der Methode (innere Blöcke tragen dieselbe Methode), ohne Methode: die oberste */
function methodTable(t: BaseSymbolTable): BaseSymbolTable {
    const method = (t as JavaSymbolTable).methodContext;
    let x: BaseSymbolTable = t;
    while (x.parent && (!method || (x.parent as JavaSymbolTable).methodContext === method)) x = x.parent;
    return x;
}

function innermostTableAt(tables: BaseSymbolTable[], position: { lineNumber: number, column: number }): BaseSymbolTable | undefined {
    let best: BaseSymbolTable | undefined;
    for (const t of tables) {
        if (!Range.containsPosition(t.range, position)) continue;
        if (!best || Range.containsRange(best.range, t.range)) best = t;
    }
    return best;
}

const KEYWORD_PLACES: [RegExp, string][] = [
    [/^for\b/, "in der for-Schleife"], [/^while\b/, "in der while-Schleife"], [/^do\b/, "in der do-while-Schleife"],
    [/^else\s+if\b/, "im else-if-Zweig"], [/^if\b/, "im if-Zweig"], [/^else\b/, "im else-Zweig"],
    [/^(switch|case|default)\b/, "im switch-Block"], [/^try\b/, "im try-Block"], [/^catch\b/, "im catch-Block"],
    [/^finally\b/, "im finally-Block"],
];

/** „in der for-Schleife“, „als Zählvariable der for-Schleife“ … – aus dem Quelltext an der Stelle des Blocks */
function describePlace(lines: string[], table: BaseSymbolTable, symbol: BaseSymbol): string {
    const line = lines[table.range.startLineNumber - 1] ?? "";
    const fromBlockStart = line.slice(Math.max(0, table.range.startColumn - 1)).trimStart();
    // Tabelle der for-Anweisung selbst: Variable im Kopf der Schleife
    if (/^for\b/.test(fromBlockStart) && symbol.identifierRange.startLineNumber == table.range.startLineNumber) {
        return /:/.test(line) ? "als Element der for-each-Schleife" : "als Zählvariable der for-Schleife";
    }
    const statement = line.trimStart().replace(/^\}\s*/, "");
    for (const [re, text] of KEYWORD_PLACES) if (re.test(statement)) return text;
    return "in einem Block { … }";
}

function ownerOf(table: BaseSymbolTable): string {
    const method = (table as JavaSymbolTable).methodContext;
    const cls = (table as JavaSymbolTable).classContext;
    if (!method) return "einer anderen Methode";
    if (method.isConstructor) return `dem Konstruktor von ${cls?.identifier ?? method.identifier}`;
    if (method.identifier == "$main" || ((cls as { isMainClass?: boolean } | undefined)?.isMainClass && method.identifier == "main")) return "dem Hauptprogramm";
    return `der Methode ${method.identifier}()`;
}

export function explainUnknownIdentifiers(module: JavaCompiledModule, unknown: UnknownIdentifier[]) {
    if (unknown.length == 0) return;
    const tables = allTables(module);
    const lines = (module.file?.getText?.() ?? "").split("\n");
    for (const u of unknown) {
        try {
            const message = explain(tables, lines, u);
            if (message) u.error.message = message;
        } catch (e) {
            // Erklärung ist nur eine Hilfe: die ursprüngliche Meldung bleibt stehen
        }
    }
}

function explain(tables: BaseSymbolTable[], lines: string[], u: UnknownIdentifier): string | undefined {
    const position = { lineNumber: u.range.startLineNumber, column: u.range.startColumn };
    const candidates: Candidate[] = [];
    for (const table of tables) {
        const symbol = table.identifierToSymbolMap.get(u.identifier);
        if (symbol && (symbol instanceof JavaLocalVariable || symbol instanceof JavaParameter)) candidates.push({ symbol, table });
    }
    if (candidates.length == 0) {
        // anderer Name mit gleicher Schreibung bis auf Groß-/Kleinbuchstaben?
        const lower = u.identifier.toLowerCase();
        for (const table of tables) {
            for (const name of table.identifierToSymbolMap.keys()) if (name != u.identifier && name.toLowerCase() == lower) return JCM.gsgIdentifierWrongCase(u.identifier, name).message;
            const cls = (table as JavaSymbolTable).classContext as { getFields?: () => { identifier: string }[] } | undefined;
            for (const f of cls?.getFields?.() ?? []) if (f.identifier != u.identifier && f.identifier.toLowerCase() == lower) return JCM.gsgIdentifierWrongCase(u.identifier, f.identifier).message;
        }
        return undefined;
    }
    const here = innermostTableAt(tables, position);
    const hereMethod = here ? methodTable(here) : undefined;
    // 1. im selben (oder einem umschließenden) Block angelegt, aber erst weiter unten
    const later = candidates.find((c) => Range.containsPosition(c.table.range, position));
    if (later) return JCM.gsgVariableDeclaredLater(u.identifier, later.symbol.identifierRange.startLineNumber).message;
    // 2. in einem anderen Block derselben Methode
    const sameMethod = candidates.find((c) => hereMethod && methodTable(c.table) === hereMethod);
    if (sameMethod) {
        const t = sameMethod.table;
        return JCM.gsgVariableOnlyInBlock(u.identifier, sameMethod.symbol.identifierRange.startLineNumber, describePlace(lines, t, sameMethod.symbol),
            t.range.startLineNumber, t.range.endLineNumber).message;
    }
    // 3. in einer anderen Methode
    const other = candidates[0];
    return JCM.gsgVariableOfOtherMethod(u.identifier, other.symbol.identifierRange.startLineNumber, ownerOf(methodTable(other.table))).message;
}
