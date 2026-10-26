import * as Blockly from "blockly/core";
import { hasHandbook, openHandbook } from "../handbook/Handbook";
import { COLOURS } from "./BlockDefinitions";
import { ADT_COLOUR, ARRAYS_COLOUR, LISTS_COLOUR } from "./BlockCollections";
import { CLASSES_COLOUR, OBJECTS_COLOUR } from "./BlockClasses";
import { FIGURES_COLOUR, INPUT_COLOUR } from "./BlockFigures";
import { OPERATIONS_COLOUR } from "./BlockOperations";

/**
 * Rechtsklick auf einen Block → „Hilfe“: öffnet das Handbuch beim ersten Beispiel mit diesem Block,
 * bevorzugt in der Kategorie, zu der der Block gehört (erkannt an seiner Farbe).
 */

const CATEGORY_BY_COLOUR: Record<string, string> = {
    [COLOURS.start]: "steuerung",
    [COLOURS.control]: "steuerung",
    [COLOURS.output]: "ausgabe",
    [COLOURS.variables]: "variablen",
    [COLOURS.conditions]: "bedingungen",
    [COLOURS.values]: "rechnen",
    [COLOURS.text]: "text",
    [COLOURS.java]: "java",
    [COLOURS.comment]: "java",
    [ARRAYS_COLOUR]: "reihungen",
    [LISTS_COLOUR]: "listen",
    [ADT_COLOUR]: "adt",
    [FIGURES_COLOUR]: "figuren",
    [INPUT_COLOUR]: "tasten",
    [OPERATIONS_COLOUR]: "operationen",
    [CLASSES_COLOUR]: "klassen",
    [OBJECTS_COLOUR]: "objekte",
};

/** Kategorie eines Blocks (Kennung wie in der Werkzeugleiste) */
export function categoryOfColour(colour: string): string | undefined {
    const c = colour.toLowerCase();
    return Object.entries(CATEGORY_BY_COLOUR).find(([k]) => k.toLowerCase() === c)?.[1];
}

export function registerBlockHelpMenu() {
    const registry = Blockly.ContextMenuRegistry.registry;
    if (registry.getItem("gsg_block_help")) return;
    registry.register({
        id: "gsg_block_help",
        scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
        displayText: "Hilfe (Handbuch)",
        weight: 200,
        preconditionFn: () => (hasHandbook() ? "enabled" : "hidden"),
        callback: (scope) => {
            const block = scope.block;
            if (!block) return;
            openHandbook({ kind: "blocks", blockType: block.type, section: categoryOfColour(block.getColour()) });
        },
    });
}
