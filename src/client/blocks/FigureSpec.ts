/**
 * Blockmodus Paket 8 (Figuren und Sprites, Tasten und Maus): gemeinsame Beschreibung für
 * Blockdefinitionen, Parser (Java -> Blöcke), Generator (Blöcke -> Java), Typsystem und Struktogramm.
 * Ohne Abhängigkeit von Blockly.
 *
 * Bedienung wie in einer Spielschleife: Figuren im Hauptprogramm anlegen, dann
 *     while (true) { if (Input.isKeyDown("ArrowRight")) { ball.move(5, 0); } … Thread.sleep(20); }
 */
import { B } from "./BlockTypes";

export const FIGURE_CLASSES = ["Circle", "Rectangle", "Text", "Sprite"] as const;
export type FigureClass = typeof FIGURE_CLASSES[number];

export function isFigureClass(t: string | null | undefined): t is FigureClass {
    return !!t && (FIGURE_CLASSES as readonly string[]).includes(t);
}

/** Klassen mit Füllfarbe (Sprites haben Bilder) */
export const FILLED: FigureClass[] = ["Circle", "Rectangle", "Text"];

export const FIGURE_NAMES_DE: Record<FigureClass, string> = { Circle: "Kreis", Rectangle: "Rechteck", Text: "Text", Sprite: "Sprite" };

/** Vorschlag für den Namen einer neuen Figur */
export const DEFAULT_FIGURE_NAME: Record<FigureClass, string> = { Circle: "ball", Rectangle: "wand", Text: "anzeige", Sprite: "figur" };

/** Figur anlegen: Block, Klasse, Eingänge in der Reihenfolge der Konstruktor-Parameter */
export type FigureCreation = { block: string; cls: FigureClass; inputs: string[] };
export const FIGURE_CREATIONS: FigureCreation[] = [
    { block: B.figCircle, cls: "Circle", inputs: ["X", "Y", "R"] },
    { block: B.figRect, cls: "Rectangle", inputs: ["X", "Y", "W", "H"] },
    { block: B.figText, cls: "Text", inputs: ["X", "Y", "SIZE", "TEXT"] },
    { block: B.figSprite, cls: "Sprite", inputs: ["X", "Y", "IMG", "INDEX"] },   // IMG ist ein Feld (SpriteLibrary.…)
];

/** Anweisungen der Form figur.methode(eingänge…); */
export type FigureCall = { block: string; method: string; inputs: string[]; kinds?: FigureClass[] };
export const FIGURE_CALLS: FigureCall[] = [
    { block: B.figMove, method: "move", inputs: ["DX", "DY"] },
    { block: B.figMoveTo, method: "moveTo", inputs: ["X", "Y"] },
    { block: B.figRotate, method: "rotate", inputs: ["A"] },
    { block: B.figForward, method: "forward", inputs: ["D"] },
    { block: B.figScale, method: "scale", inputs: ["F"] },
    { block: B.figSetText, method: "setText", inputs: ["TEXT"], kinds: ["Text"] },
    { block: B.figSetImage, method: "setImageIndex", inputs: ["I"], kinds: ["Sprite"] },
    { block: B.figBounce, method: "bounceOffEdge", inputs: [] },
    { block: B.figSay, method: "say", inputs: ["TEXT"] },
    { block: B.figSayFor, method: "say", inputs: ["TEXT", "SECS"] },
];

/** figAction: Feld ACTION -> Java-Aufruf */
export const FIGURE_ACTIONS: [string, string, string][] = [
    // [Anzeige, Wert, Java]
    ["zeige", "show", "setVisible(true)"],
    ["verstecke", "hide", "setVisible(false)"],
    ["hole nach vorne", "front", "bringToFront()"],
    ["schiebe nach hinten", "back", "sendToBack()"],
    ["entferne", "destroy", "destroy()"],
];

/** figProp: Feld PROP -> Methode */
export const FIGURE_PROPS: [string, string, string][] = [
    ["x-Position (Mitte)", "x", "getCenterX"],
    ["y-Position (Mitte)", "y", "getCenterY"],
    ["Drehwinkel", "angle", "getAngle"],
];

/** Farben: Anzeige, Java-Farbname ("random" = Color.randomColor()) */
export const COLOURS: [string, string][] = [
    ["rot", "red"], ["orange", "orange"], ["gelb", "yellow"], ["grün", "green"], ["hellgrün", "lightgreen"],
    ["blau", "blue"], ["hellblau", "lightblue"], ["türkis", "turquoise"], ["lila", "purple"], ["rosa", "pink"],
    ["braun", "brown"], ["schwarz", "black"], ["grau", "gray"], ["weiß", "white"], ["zufällige Farbe", "random"],
];

export function colourJava(value: string): string {
    return value === "random" ? "Color.randomColor()" : JSON.stringify(value);
}

export function colourLabel(value: string): string {
    return COLOURS.find(([, v]) => v === value)?.[0] ?? value;
}

/** Tasten (Wert = KeyboardEvent.key; Input.isKeyDown vergleicht ohne Groß/klein) */
export const KEYS: [string, string][] = [
    ["Pfeil rechts →", "ArrowRight"], ["Pfeil links ←", "ArrowLeft"], ["Pfeil oben ↑", "ArrowUp"], ["Pfeil unten ↓", "ArrowDown"],
    ["Leertaste", " "], ["Eingabetaste", "Enter"],
    ..."abcdefghijklmnopqrstuvwxyz0123456789".split("").map((c): [string, string] => [c.toUpperCase(), c]),
];

export function keyLabel(value: string): string {
    return KEYS.find(([, v]) => v.toLowerCase() === value.toLowerCase())?.[0] ?? value;
}

/** Vorschlag für den Namen eines Programmteils „wenn Taste … gedrückt“: pfeilOben, leertaste, tasteA … */
export function keyPartName(key: string): string {
    const named: Record<string, string> = {
        ArrowRight: "pfeilRechts", ArrowLeft: "pfeilLinks", ArrowUp: "pfeilOben", ArrowDown: "pfeilUnten",
        " ": "leertaste", Enter: "eingabetaste",
    };
    return named[key] ?? (/^[a-z0-9]$/i.test(key) ? "taste" + key.toUpperCase() : "tastendruck");
}

/** Wert des Feldes OTHER für den Mauszeiger (kein gültiger Variablenname) */
export const MOUSE_TARGET = "@maus";

/** Ziel als Java-Argument: andere Figur oder Position des Mauszeigers */
export function targetJava(other: string | undefined): string {
    return !other || other === MOUSE_TARGET ? "Mouse.getX(), Mouse.getY()" : other;
}

/** Werte des Feldes OTHER bei „berührt“: Rand bzw. irgendeine Figur (keine gültigen Variablennamen) */
export const EDGE_TARGET = "@rand";
export const ANY_TARGET = "@irgendeine";

/** „A berührt …“ in Java */
export function touchesJava(name: string, other: string | undefined): string {
    if (other === EDGE_TARGET) return `${name}.touchesEdge()`;
    if (other === ANY_TARGET) return `${name}.collidesWithAnyShape()`;
    return `${name}.collidesWith(${other})`;
}

/** „A berührt …“ auf Deutsch (Struktogramm) */
export function touchesLabel(other: string | undefined): string {
    if (other === EDGE_TARGET) return "den Rand";
    if (other === ANY_TARGET) return "irgendeine Figur";
    return other ?? "…";
}

/** Ziel auf Deutsch (Struktogramm) */
export function targetLabel(other: string | undefined): string {
    return !other || other === MOUSE_TARGET ? "Mauszeiger" : other;
}

/** Ergebnistypen der Werte-Blöcke */
export const FIGURE_OUTPUT_TYPES: Record<string, string> = {
    [B.figProp]: "double", [B.figTouches]: "boolean", [B.figOutside]: "boolean", [B.figDistance]: "double", [B.figTouchesColor]: "boolean", [B.figTouchesList]: "boolean",
    [B.keyDown]: "boolean", [B.mouseDown]: "boolean", [B.mouseOver]: "boolean", [B.mouseXY]: "double",
};

/** Was in die Löcher passt (alle übrigen Eingänge: Zahlen) */
export function figureInputType(blockType: string, input: string): string[] | null {
    if (input === "TEXT" && (blockType === B.figSay || blockType === B.figSayFor)) return ["String", "int", "double"];
    if (input === "TEXT") return ["String", "int", "double", "char"];
    if (input === "INDEX" || input === "I") return ["int"];
    if (input === "W" || input === "H") return ["int", "double"];
    if (FIGURE_BLOCK_TYPES.has(blockType)) return ["int", "double"];
    return null;
}

export const FIGURE_BLOCK_TYPES = new Set<string>([
    ...FIGURE_CREATIONS.map((c) => c.block), ...FIGURE_CALLS.map((c) => c.block),
    B.figColor, B.figAction, B.figProp, B.figTouches, B.figOutside, B.figDistance, B.figTurnTo, B.worldNew, B.figTouchesColor, B.figTouchesList,
    B.keyDown, B.mouseDown, B.mouseOver, B.mouseXY,
]);
