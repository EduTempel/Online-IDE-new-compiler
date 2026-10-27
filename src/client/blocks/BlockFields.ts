import * as Blockly from "blockly/core";
import { VAR_TYPES } from "./BlockTypes";
import { classInfos, typeLabel } from "./BlockTypeSystem";

/**
 * Auswahl eines Datentyps (Paket 6): einfache Typen, Klassen des Projekts, Reihungen, Listen,
 * DynArray. Modus "return" zusätzlich "nichts (void)", Modus "element" nur einfache Typen und
 * Klassen (Elementtyp einer Reihung bzw. Liste). Nimmt auch Typen an, die (noch) nicht in der
 * Liste stehen – z. B. aus dem Java-Code übernommen.
 */

/** simple: nur einfache Typen und Klassen (erstelle neue Variable – Reihungen, Listen, ADT haben eigene Blöcke) */
export type TypeMode = "full" | "return" | "element" | "simple";

/** Java-Bezeichner: nur Buchstaben, Ziffern, _ und $; nicht mit Ziffer beginnen */
export function identifier(v: string): string | null {
    const cleaned = String(v).replace(/[^\p{L}\p{N}_$]/gu, "");
    return cleaned === "" || /^\p{N}/u.test(cleaned) ? null : cleaned;
}

export class FieldType extends Blockly.FieldDropdown {
    static override fromJson(options: Blockly.FieldDropdownFromJsonConfig) {
        const o = options as { text?: string; mode?: TypeMode };
        return new FieldType(String(o.text ?? "int"), o.mode ?? "full");
    }

    constructor(value: string, private mode: TypeMode) {
        super(function (this: FieldType) { return this.typeOptions(); } as unknown as Blockly.MenuGenerator);
        this.setValue(value);
    }

    private typeOptions(): Blockly.MenuOption[] {
        const mode = this.mode ?? "full";   // im Konstruktor von FieldDropdown noch nicht gesetzt
        const block = this.getSourceBlock();
        const classes = block ? [...classInfos(block.workspace).keys()].sort((a, b) => a.localeCompare(b, "de")) : [];
        const scalars: string[] = [...VAR_TYPES];
        const groups: string[][] = [[...(mode === "return" ? ["void"] : []), ...scalars, ...classes]];
        if (mode !== "element" && mode !== "simple") {
            groups.push([...scalars, ...classes].map((t) => t + "[]"));
            groups.push(scalars.map((t) => t + "[][]"));
            groups.push([...scalars, ...classes].map((t) => `ArrayList<${({ int: "Integer", double: "Double", boolean: "Boolean", char: "Character" } as Record<string, string>)[t] ?? t}>`));
            groups.push(["DynArray", "Stack", "Queue", "BinTree"]);
        }
        const current = this.getValue();
        if (typeof current === "string" && current && !groups.some((g) => g.includes(current))) groups[0].push(current);
        const options: Blockly.MenuOption[] = [];
        groups.forEach((g, i) => {
            if (i > 0) options.push(Blockly.FieldDropdown.SEPARATOR as unknown as Blockly.MenuOption);
            for (const t of g) options.push([t === "void" ? "nichts" : typeLabel(t), t]);
        });
        return options;
    }

    protected override doClassValidation_(newValue?: unknown): string | null {
        return typeof newValue === "string" && /^[\p{L}_$][\p{L}\p{N}_$<>[\]]*$/u.test(newValue) ? newValue : null;
    }

    /** zwischengespeicherte Auswahlliste erneuern, damit der gesetzte Typ darin steht */
    protected override doValueUpdate_(newValue: string) {
        super.doValueUpdate_(newValue);
        this.getOptions(false);
        super.doValueUpdate_(newValue);
    }
}

let registered = false;
export function registerTypeField() {
    if (registered) return;
    registered = true;
    Blockly.fieldRegistry.register("field_gsg_type", FieldType as unknown as Blockly.fieldRegistry.RegistrableField);
}

/** Sichtbarkeit (wie im UML-Klassendiagramm) */
export const VISIBILITY_OPTIONS: [string, string][] = [
    ["öffentlich (+)", "public"], ["privat (-)", "private"], ["geschützt (#)", "protected"], ["ohne Angabe", "package"],
];

/** Sichtbarkeit im Feld -> Java ("package" = ohne Angabe) */
export function visibilityJava(v: string | undefined): string {
    return !v || v === "package" ? "" : v;
}
