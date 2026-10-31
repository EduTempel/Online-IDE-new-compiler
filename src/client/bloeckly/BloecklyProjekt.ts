import { buehnenbildAus, Kostueme } from "../../compiler/java/runtime/graphics/GsgBuehnenLogik";
import { B, type BlockState } from "../blocks/BlockTypes";
import { JavaBlockGenerator } from "../blocks/JavaBlockGenerator";
import { JavaBlockParser } from "../blocks/JavaBlockParser";
import type { BloecklyContext } from "./BloecklySpec";

/**
 * Blöckly (Paket 18d): ein Projekt besteht aus Java-Dateien, die die Oberfläche anlegt und pflegt.
 *
 *  - je Figur eine Klasse (Datei mit ihrem Namen): Aussehen und Startposition im Konstruktor
 *        class Waschbär extends Figur {
 *            Waschbär() {
 *                super("Waschbaer", -100, 0);
 *            }
 *            @BeimStart void los() { … }
 *        }
 *  - die Bühne (Datei „Bühne“): class Spiel extends Buehne { Spiel() { super("Schulhof"); } … }
 *  - das Hauptprogramm (Datei „Hauptprogramm“, für Schüler/innen unsichtbar) erzeugt Bühne und Figuren;
 *    die Reihenfolge ist die der Figurenliste (spätere Figuren liegen vorne)
 *
 * Alles, was die Oberfläche wissen muss, steht in diesen Dateien – es gibt keine zweite Ablage. Die Funktionen
 * hier lesen und ändern die Texte (ohne Oberfläche, damit testbar).
 */
export const HAUPTPROGRAMM = "Hauptprogramm";
export const BUEHNEN_DATEI = "Bühne";
export const BUEHNEN_KLASSE = "Spiel";
const HINWEIS = "// Blöckly: Dieses Hauptprogramm entsteht von selbst aus der Bühne und den Figuren.";

export type FigurInfo = { klasse: string; figur: string; x: number; y: number };
export type BuehnenInfo = { klasse: string; bild: string };

const NAME = "[\\p{L}_$][\\p{L}\\p{N}_$]*";
const ZAHL = "(-?\\d+(?:\\.\\d+)?)";
const KLASSE_FIGUR = new RegExp(`\\bclass\\s+(${NAME})\\s+extends\\s+Figur\\b`, "u");
const KLASSE_BUEHNE = new RegExp(`\\bclass\\s+(${NAME})\\s+extends\\s+Buehne\\b`, "u");
const SUPER_FIGUR = new RegExp(`super\\(\\s*"([^"]*)"\\s*(?:,\\s*${ZAHL}\\s*,\\s*${ZAHL}\\s*)?\\)`);
const SUPER_BUEHNE = /super\(\s*"([^"]*)"\s*\)/;
const NEU = new RegExp(`^\\s*new\\s+(${NAME})\\s*\\(\\s*\\)\\s*;`, "gmu");

function zahl(v: number): string {
    return String(Math.round(v));
}

export function figurQuelltext(info: FigurInfo): string {
    return [
        `class ${info.klasse} extends Figur {`,
        "",
        `    ${info.klasse}() {`,
        `        super("${info.figur}", ${zahl(info.x)}, ${zahl(info.y)});`,
        "    }",
        "",
        "}",
        "",
    ].join("\n");
}

export function buehnenQuelltext(bild: string): string {
    return [
        `class ${BUEHNEN_KLASSE} extends Buehne {`,
        "",
        `    ${BUEHNEN_KLASSE}() {`,
        `        super("${bild}");`,
        "    }",
        "",
        "}",
        "",
    ].join("\n");
}

export function hauptprogrammQuelltext(buehne: string, figuren: string[]): string {
    return [HINWEIS, `new ${buehne}();`, ...figuren.map((f) => `new ${f}();`), ""].join("\n");
}

export function liesFigur(text: string): FigurInfo | undefined {
    const k = KLASSE_FIGUR.exec(text);
    if (!k) return undefined;
    const s = SUPER_FIGUR.exec(text);
    return {
        klasse: k[1],
        figur: s?.[1] || k[1],
        x: s?.[2] !== undefined ? Number(s[2]) : 0,
        y: s?.[3] !== undefined ? Number(s[3]) : 0,
    };
}

export function liesBuehne(text: string): BuehnenInfo | undefined {
    const k = KLASSE_BUEHNE.exec(text);
    if (!k) return undefined;
    return { klasse: k[1], bild: SUPER_BUEHNE.exec(text)?.[1] ?? "" };
}

/** Klassen, die das Hauptprogramm erzeugt (in dieser Reihenfolge) */
export function liesHauptprogramm(text: string): string[] {
    return [...text.matchAll(NEU)].map((m) => m[1]);
}

/** Startposition im Konstruktor ändern (ganze Zahlen) */
export function mitStart(text: string, x: number, y: number): string {
    return text.replace(SUPER_FIGUR, (_m, figur: string) => `super("${figur}", ${zahl(x)}, ${zahl(y)})`);
}

/** Aussehen (Bibliotheksfigur) im Konstruktor ändern */
export function mitFigur(text: string, figur: string): string {
    return text.replace(SUPER_FIGUR, (_m, _alt: string, x?: string, y?: string) =>
        x !== undefined ? `super("${figur}", ${x}, ${y})` : `super("${figur}")`);
}

export function mitBuehnenbild(text: string, bild: string): string {
    return text.replace(SUPER_BUEHNE, `super("${bild}")`);
}

/** Zeichen, die zu einem Namen gehören (Umlaute eingeschlossen) */
const ZEICHEN = "[\\p{L}\\p{N}_$]";

/**
 * Klasse umbenennen: der Name als Bezeichner (Klasse, Konstruktor, Variablen- und Parametertypen) und als
 * Zeichenkette "Name" (beruehrt("…"), erzeugeKlonVon("…")). Teile anderer Namen bleiben (Waschbär2 bei Waschbär).
 */
export function umbenannt(text: string, alt: string, neu: string): string {
    const name = new RegExp(`(?<!${ZEICHEN})${alt.replace(/[$]/g, "\\$")}(?!${ZEICHEN})`, "gu");
    // Texte, Zeichen und Kommentare überspringen; nur Programmtext ändern
    const teile = /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g;
    let ergebnis = "";
    let pos = 0;
    for (const m of text.matchAll(teile)) {
        ergebnis += text.slice(pos, m.index).replace(name, neu);
        // super("RoterPanda", …) ist das Aussehen (Bibliotheksfigur), nicht der Name der Klasse
        const aussehen = /\bsuper\s*\(\s*$/.test(ergebnis);
        ergebnis += m[0] === `"${alt}"` && !aussehen ? `"${neu}"` : m[0];
        pos = m.index! + m[0].length;
    }
    return ergebnis + text.slice(pos).replace(name, neu);
}

const SCHLUESSELWOERTER = new Set(("abstract assert boolean break byte case catch char class const continue default do double else enum " +
    "extends final finally float for goto if implements import instanceof int interface long native new package private " +
    "protected public return short static strictfp super switch synchronized this throw throws transient try void volatile " +
    "while true false null var record").split(" "));

/** Bibliotheksklassen, die keine Figur heißen darf */
const VERGEBEN = new Set(["Figur", "Buehne", "Nachricht", "Object", "String", "Math", "System", "Sprite", "World", "Color",
    HAUPTPROGRAMM, BUEHNEN_KLASSE]);

/** Ist der Name als Figurenname (Klassenname) brauchbar? undefined: ja, sonst die Meldung */
export function namensFehler(name: string, vorhanden: string[]): string | undefined {
    if (name.trim() === "") return "Bitte gib einen Namen ein.";
    if (!new RegExp(`^${NAME}$`, "u").test(name)) return "Ein Name besteht aus Buchstaben und Ziffern, beginnt mit einem Buchstaben und hat keine Leerzeichen.";
    if (SCHLUESSELWOERTER.has(name)) return `„${name}“ ist ein Wort von Java und kein Name.`;
    if (VERGEBEN.has(name)) return `„${name}“ ist schon vergeben.`;
    if (vorhanden.some((v) => v.toLowerCase() === name.toLowerCase())) return `Eine Figur „${name}“ gibt es schon.`;
    return undefined;
}

/** freier Name: Waschbär, Waschbär2, Waschbär3 … */
export function freierName(basis: string, vorhanden: string[]): string {
    const klein = new Set(vorhanden.map((v) => v.toLowerCase()));
    if (!klein.has(basis.toLowerCase()) && !VERGEBEN.has(basis)) return basis;
    for (let i = 2; ; i++) if (!klein.has(`${basis}${i}`.toLowerCase())) return `${basis}${i}`;
}

/** Klassenname für eine Bibliotheksfigur: „Roter Panda“ → „RoterPanda“, „Waschbär“ bleibt */
export function klassenname(titel: string): string {
    return titel.replace(/[^\p{L}\p{N}_$]/gu, "");
}

export type Datei = { name: string; getText(): string };

export type Projekt<D extends Datei> = {
    haupt?: D;
    buehne?: { datei: D; info: BuehnenInfo };
    /** in der Reihenfolge des Hauptprogramms; Figuren, die es (noch) nicht erzeugt, am Ende */
    figuren: { datei: D; info: FigurInfo }[];
};

/** Blöckly-Projekt aus den Dateien eines Workspace lesen */
export function liesProjekt<D extends Datei>(dateien: D[]): Projekt<D> {
    const haupt = dateien.find((d) => d.name === HAUPTPROGRAMM);
    let buehne: Projekt<D>["buehne"];
    const figuren: Projekt<D>["figuren"] = [];
    for (const datei of dateien) {
        if (datei === haupt || /\.[A-Za-z]+$/.test(datei.name)) continue;
        const text = datei.getText();
        const f = liesFigur(text);
        if (f) {
            figuren.push({ datei, info: f });
            continue;
        }
        const b = liesBuehne(text);
        if (b && !buehne) buehne = { datei, info: b };
    }
    const reihenfolge = haupt ? liesHauptprogramm(haupt.getText()) : [];
    const stelle = (k: string) => {
        const i = reihenfolge.indexOf(k);
        return i < 0 ? Number.MAX_SAFE_INTEGER : i;
    };
    figuren.sort((a, b) => stelle(a.info.klasse) - stelle(b.info.klasse));
    return { haupt, buehne, figuren };
}

/** Ist das ein Blöckly-Projekt (Hauptprogramm und Bühne)? */
export function istBloecklyProjekt(p: Projekt<Datei>): boolean {
    return !!p.haupt && !!p.buehne;
}

/** Bibliotheksfigur zum Namen im Konstruktor (für Bilder in der Oberfläche) */
export function bibliotheksfigur(figur: string): string | undefined {
    return Kostueme.fuer(figur)?.figur.name;
}

/** Bühnenbild zum Namen im Konstruktor; undefined: keins (weiß) */
export function bildnummer(bild: string): number | undefined {
    return bild ? buehnenbildAus(bild)?.index : undefined;
}

// —— Variablen (Paket 18e) ——

/** Variablen einer Figur bzw. der Bühne (dort: für alle Figuren) mit Datentyp */
export function variablenDerKlasse(text: string, ctx: BloecklyContext): Record<string, string> {
    const { state } = JavaBlockParser.parse(text, { bloeckly: ctx });
    const kopf = state.blocks.blocks.find((b) => b.type === B.blFigure);
    const result: Record<string, string> = {};
    for (let v = kopf?.inputs?.VARS?.block; v; v = v.next?.block) if (v.type === B.blVar && v.fields?.NAME) result[v.fields.NAME] = v.fields.TYPE ?? "int";
    return result;
}

/** Startwert einer neuen Variablen: 0, "", false */
export function startwert(typ: string): BlockState {
    if (typ === "String") return { type: B.text, fields: { TEXT: "" } };
    if (typ === "boolean") return { type: B.bool, fields: { VALUE: "false" } };
    return { type: B.number, fields: { NUM: "0" } };
}

/** Datei mit einer weiteren Variablen (am Ende der Variablen im Kopf); keine Figur bzw. Bühne: unverändert */
export function mitVariable(text: string, name: string, typ: string, ctx: BloecklyContext): string {
    const { state } = JavaBlockParser.parse(text, { bloeckly: ctx });
    const kopf = state.blocks.blocks.find((b) => b.type === B.blFigure);
    if (!kopf) return text;
    const neu: BlockState = { type: B.blVar, fields: { NAME: name, TYPE: typ }, inputs: { VALUE: { block: startwert(typ) } } };
    let letzte = kopf.inputs?.VARS?.block;
    while (letzte?.next) letzte = letzte.next.block;
    if (letzte) letzte.next = { block: neu };
    else kopf.inputs = { ...(kopf.inputs ?? {}), VARS: { block: neu } };
    return JavaBlockGenerator.generate(state, { bloeckly: ctx }).code;
}

// —— Variablen für alle Figuren umbenennen und löschen ——

/** f nur auf den Programmtext anwenden – Texte, Zeichen und Kommentare bleiben */
function imProgrammtext(text: string, f: (code: string) => string): string {
    const teile = /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g;
    let ergebnis = "";
    let pos = 0;
    for (const m of text.matchAll(teile)) {
        ergebnis += f(text.slice(pos, m.index)) + m[0];
        pos = m.index! + m[0].length;
    }
    return ergebnis + f(text.slice(pos));
}

const maskiert = (s: string) => s.replace(/[$]/g, "\\$");

/** Muster: Bühne.name und – in der Bühne – name ohne Punkt davor */
function globalMuster(stage: string, name: string, istBuehne: boolean): RegExp {
    const n = maskiert(name);
    const qualifiziert = `(?<!${ZEICHEN})${maskiert(stage)}\\s*\\.\\s*${n}(?!${ZEICHEN})`;
    const frei = `(?<!${ZEICHEN}|\\.\\s*)${n}(?!${ZEICHEN})`;
    return new RegExp(istBuehne ? `${qualifiziert}|${frei}` : qualifiziert, "gu");
}

/**
 * Variable für alle Figuren umbenennen: in der Bühne die Deklaration und alle Stellen, in den Figuren Spiel.alt.
 * Texte ("alt") und Attribute anderer Objekte (x.alt) bleiben.
 */
export function globaleUmbenannt(text: string, stage: string, alt: string, neu: string, istBuehne: boolean): string {
    const muster = globalMuster(stage, alt, istBuehne);
    return imProgrammtext(text, (code) => code.replace(muster, (m) => m.replace(new RegExp(`${maskiert(alt)}$`, "u"), neu)));
}

/** Wie oft die Variable im Programmtext vorkommt (in der Bühne zählt die Deklaration mit) */
export function globaleStellen(text: string, stage: string, name: string, istBuehne: boolean): number {
    let anzahl = 0;
    const muster = globalMuster(stage, name, istBuehne);
    imProgrammtext(text, (code) => {
        anzahl += [...code.matchAll(muster)].length;
        return code;
    });
    return anzahl;
}

/** Bühne ohne die Variable (aus dem unsichtbaren Kopf); keine Bühne oder unbekannte Variable: unverändert */
export function ohneVariable(text: string, name: string, ctx: BloecklyContext): string {
    const { state } = JavaBlockParser.parse(text, { bloeckly: ctx });
    const kopf = state.blocks.blocks.find((b) => b.type === B.blFigure);
    if (!kopf) return text;
    let vorher: BlockState | undefined;
    for (let v = kopf.inputs?.VARS?.block; v; vorher = v, v = v.next?.block) {
        if (v.type !== B.blVar || v.fields?.NAME !== name) continue;
        const rest = v.next?.block;
        if (vorher) vorher.next = rest ? { block: rest } : undefined;
        else if (rest) kopf.inputs!.VARS = { block: rest };
        else delete kopf.inputs!.VARS;
        if (vorher && !rest) delete vorher.next;
        return JavaBlockGenerator.generate(state, { bloeckly: ctx }).code;
    }
    return text;
}
