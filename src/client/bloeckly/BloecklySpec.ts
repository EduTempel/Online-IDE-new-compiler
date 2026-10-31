import { B } from "../blocks/BlockTypes";
import { keyPartName } from "../blocks/FigureSpec";
import {
    CLICK_PART_ANNOTATION, CLONE_PART_ANNOTATION, KEY_PART_ANNOTATION, MESSAGE_PART_ANNOTATION, START_PART_ANNOTATION,
} from "../../compiler/common/interpreter/GsgParts";

/**
 * Blöckly (Paket 18e): die Blöcke für Figuren und die Bühne – eine Tabelle für alles: Blockdefinitionen und
 * Werkzeugleiste (BloecklyBlocks), Java -> Blöcke (JavaBlockParser) und Blöcke -> Java (JavaBlockGenerator).
 * Ohne Abhängigkeit von Blockly.
 *
 * Jeder Block meint immer die Figur (bzw. Bühne), in deren Datei er steht – es gibt kein Feld „welche Figur?“.
 * Ein Block hat eine oder mehrere Java-Formen; welche gilt, entscheidet der Wert eines Auswahlfeldes (when):
 *
 *     „gehe zu [Mauszeiger ▾]“   geheZuMauszeiger();
 *     „gehe zu [Pinguin ▾]“      geheZu("Pinguin");
 *
 * In einer Form steht {NAME} für einen Eingang (Wert-Block) oder ein Auswahlfeld (dann als Text "…").
 */

export type BlCategory = "bewegung" | "aussehen" | "ereignisse" | "steuerung" | "fuehlen" | "operatoren" | "variablen" | "meine";

/** Kategorien der Werkzeugleiste: Kennung, Name, Farbe (eigene Farben, nicht die von Scratch) */
export const BL_CATEGORIES: { id: BlCategory; name: string; colour: string }[] = [
    { id: "bewegung", name: "Bewegung", colour: "#3567a8" },
    { id: "aussehen", name: "Aussehen", colour: "#9b4f96" },
    { id: "ereignisse", name: "Ereignisse", colour: "#c88330" },     // wie „sende Nachricht“
    { id: "steuerung", name: "Steuerung", colour: "#b07a00" },      // wie die Schleifen von Blöckva
    { id: "fuehlen", name: "Fühlen", colour: "#2d8aa8" },
    { id: "operatoren", name: "Operatoren", colour: "#3a9a27" },    // wie Rechnen & Werte
    { id: "variablen", name: "Variablen", colour: "#e07b00" },      // wie die Variablen-Blöcke
    { id: "meine", name: "Meine Blöcke", colour: "#c2477f" },       // wie Operationen
];

export function categoryColour(id: BlCategory): string {
    return BL_CATEGORIES.find((c) => c.id === id)!.colour;
}

/** Wo gibt es den Block? figur: nur bei Figuren, buehne: nur auf der Bühne, beide: überall */
export type BlOwner = "figur" | "buehne" | "beide";

/** Auswahl, deren Einträge von der Arbeitsfläche abhängen */
export type BlSource = "figuren" | "kostueme" | "buehnenbilder" | "tasten";

/** Eintrag einer Auswahl: Anzeige, Wert; „figur“: nur bei Figuren (nicht auf der Bühne) */
export type BlOption = [string, string] | [string, string, "figur"];

export type BlArg =
    | { name: string; kind: "num" | "text" | "any" | "bool"; def?: string }
    | { name: string; kind: "choice"; options?: BlOption[]; source?: BlSource; def?: string };

export type BlForm = { java: string; when?: Record<string, string> };

export type BlBlock = {
    type: string;
    cat: BlCategory;
    /** Text mit {NAME} für die Eingänge und Auswahlfelder */
    text: string;
    args: BlArg[];
    forms: BlForm[];
    /** Werte-Block: Datentyp des Ergebnisses */
    output?: "double" | "boolean" | "String";
    owner: BlOwner;
    tooltip: string;
};

/** besondere Werte der Auswahlfelder (keine Namen von Figuren) */
export const BL_MOUSE = "@maus";
export const BL_RANDOM = "@zufall";
export const BL_EDGE = "@rand";
export const BL_MYSELF = "@ich";

const DREHSTILE: BlOption[] = [["Blickrichtung", "Blickrichtung"], ["links-rechts", "links-rechts"], ["rundherum", "rundherum"], ["nicht drehen", "nicht drehen"]];

const num = (name: string, def: string): BlArg => ({ name, kind: "num", def });

export const BL_BLOCKS: BlBlock[] = [
    // —— Bewegung ——
    {
        type: "bl_gehe", cat: "bewegung", text: "gehe {N} Schritte", args: [num("N", "10")], owner: "figur",
        forms: [{ java: "gehe({N})" }], tooltip: "Geht so viele Schritte in die Richtung, in die die Figur zeigt.",
    },
    {
        type: "bl_drehe", cat: "bewegung", text: "drehe dich {DIR} um {GRAD} Grad", owner: "figur",
        args: [{ name: "DIR", kind: "choice", options: [["↻ rechts", "rechts"], ["↺ links", "links"]] }, num("GRAD", "15")],
        forms: [{ java: "dreheRechts({GRAD})", when: { DIR: "rechts" } }, { java: "dreheLinks({GRAD})", when: { DIR: "links" } }],
        tooltip: "Dreht die Richtung um so viele Grad: ↻ im Uhrzeigersinn, ↺ dagegen.",
    },
    {
        type: "bl_gehe_zu", cat: "bewegung", text: "gehe zu {ZIEL}", owner: "figur",
        args: [{ name: "ZIEL", kind: "choice", source: "figuren", options: [["zufälliger Position", BL_RANDOM], ["Mauszeiger", BL_MOUSE]] }],
        forms: [
            { java: "geheZuZufaelligerPosition()", when: { ZIEL: BL_RANDOM } },
            { java: "geheZuMauszeiger()", when: { ZIEL: BL_MOUSE } },
            { java: "geheZu({ZIEL})" },
        ],
        tooltip: "Springt an eine zufällige Stelle, zum Mauszeiger oder zu einer anderen Figur.",
    },
    {
        type: "bl_gehe_xy", cat: "bewegung", text: "gehe zu x: {X} y: {Y}", args: [num("X", "0"), num("Y", "0")], owner: "figur",
        forms: [{ java: "geheZu({X}, {Y})" }], tooltip: "Springt an diese Stelle. Die Bühne reicht von x = -240 bis 240 und von y = -180 bis 180.",
    },
    {
        type: "bl_gleite", cat: "bewegung", text: "gleite in {SEK} Sek. zu x: {X} y: {Y}", args: [num("SEK", "1"), num("X", "0"), num("Y", "0")],
        owner: "figur", forms: [{ java: "gleite({SEK}, {X}, {Y})" }], tooltip: "Gleitet in so vielen Sekunden gleichmäßig an diese Stelle.",
    },
    {
        type: "bl_richtung", cat: "bewegung", text: "zeige in Richtung {GRAD}", args: [num("GRAD", "90")], owner: "figur",
        forms: [{ java: "zeigeInRichtung({GRAD})" }], tooltip: "Setzt die Richtung: 90 = rechts, -90 = links, 0 = oben, 180 = unten.",
    },
    {
        type: "bl_zeige_auf", cat: "bewegung", text: "drehe dich zu {ZIEL}", owner: "figur",
        args: [{ name: "ZIEL", kind: "choice", source: "figuren", options: [["Mauszeiger", BL_MOUSE]] }],
        forms: [{ java: "zeigeAufMauszeiger()", when: { ZIEL: BL_MOUSE } }, { java: "zeigeAuf({ZIEL})" }],
        tooltip: "Dreht die Richtung zum Mauszeiger oder zu einer anderen Figur hin.",
    },
    {
        type: "bl_aendere_xy", cat: "bewegung", text: "ändere {ACHSE} um {W}", owner: "figur",
        args: [{ name: "ACHSE", kind: "choice", options: [["x", "x"], ["y", "y"]] }, num("W", "10")],
        forms: [{ java: "aendereXUm({W})", when: { ACHSE: "x" } }, { java: "aendereYUm({W})", when: { ACHSE: "y" } }],
        tooltip: "Verschiebt die Figur: x positiv nach rechts, y positiv nach oben.",
    },
    {
        type: "bl_setze_xy", cat: "bewegung", text: "setze {ACHSE} auf {W}", owner: "figur",
        args: [{ name: "ACHSE", kind: "choice", options: [["x", "x"], ["y", "y"]] }, num("W", "0")],
        forms: [{ java: "setzeX({W})", when: { ACHSE: "x" } }, { java: "setzeY({W})", when: { ACHSE: "y" } }],
        tooltip: "Setzt x (-240 bis 240) bzw. y (-180 bis 180).",
    },
    {
        type: "bl_abprallen", cat: "bewegung", text: "pralle vom Rand ab", args: [], owner: "figur",
        forms: [{ java: "pralleVomRandAb()" }], tooltip: "Berührt die Figur den Rand, dreht sie um und kommt ganz auf die Bühne zurück.",
    },
    {
        type: "bl_drehstil", cat: "bewegung", text: "setze Drehstil auf {STIL}", owner: "figur",
        args: [{ name: "STIL", kind: "choice", options: DREHSTILE }], forms: [{ java: "setzeDrehstil({STIL})" }],
        tooltip: "Wie die Richtung das Aussehen ändert: Blickrichtung (Kostüm nach vorne, rechts, links, hinten), links-rechts, rundherum (Bild dreht sich) oder nicht drehen.",
    },
    { type: "bl_x", cat: "bewegung", text: "x-Position", args: [], output: "double", owner: "figur", forms: [{ java: "xPosition()" }], tooltip: "x-Koordinate der Figur." },
    { type: "bl_y", cat: "bewegung", text: "y-Position", args: [], output: "double", owner: "figur", forms: [{ java: "yPosition()" }], tooltip: "y-Koordinate der Figur." },
    { type: "bl_dir", cat: "bewegung", text: "Richtung", args: [], output: "double", owner: "figur", forms: [{ java: "richtung()" }], tooltip: "Richtung der Figur in Grad (90 = rechts)." },

    // —— Aussehen ——
    {
        type: "bl_sage_sek", cat: "aussehen", text: "sage {TEXT} für {SEK} Sekunden", args: [{ name: "TEXT", kind: "any", def: "Hallo!" }, num("SEK", "2")],
        owner: "figur", forms: [{ java: "sage({TEXT}, {SEK})" }], tooltip: "Zeigt eine Sprechblase, wartet so viele Sekunden und entfernt sie wieder.",
    },
    {
        type: "bl_sage", cat: "aussehen", text: "sage {TEXT}", args: [{ name: "TEXT", kind: "any", def: "Hallo!" }], owner: "figur",
        forms: [{ java: "sage({TEXT})" }], tooltip: "Zeigt eine Sprechblase, bis die Figur etwas anderes sagt. Leerer Text: Sprechblase weg.",
    },
    {
        type: "bl_denke_sek", cat: "aussehen", text: "denke {TEXT} für {SEK} Sekunden", args: [{ name: "TEXT", kind: "any", def: "Hmm …" }, num("SEK", "2")],
        owner: "figur", forms: [{ java: "denke({TEXT}, {SEK})" }], tooltip: "Zeigt eine Denkblase, wartet so viele Sekunden und entfernt sie wieder.",
    },
    {
        type: "bl_denke", cat: "aussehen", text: "denke {TEXT}", args: [{ name: "TEXT", kind: "any", def: "Hmm …" }], owner: "figur",
        forms: [{ java: "denke({TEXT})" }], tooltip: "Zeigt eine Denkblase. Leerer Text: Denkblase weg.",
    },
    {
        type: "bl_kostuem", cat: "aussehen", text: "wechsle zu Kostüm {K}", owner: "figur",
        args: [{ name: "K", kind: "choice", source: "kostueme", def: "stehen" }], forms: [{ java: "wechsleZuKostuem({K})" }],
        tooltip: "Wechselt das Kostüm. Die Ansicht (vorne, rechts, links, hinten) folgt der Richtung.",
    },
    {
        type: "bl_naechstes_kostuem", cat: "aussehen", text: "wechsle zum nächsten Kostüm", args: [], owner: "figur",
        forms: [{ java: "naechstesKostuem()" }], tooltip: "Nächstes Kostüm – beim Laufen das nächste Laufbild. Gut für Laufanimationen.",
    },
    {
        type: "bl_buehnenbild", cat: "aussehen", text: "wechsle zu Bühnenbild {BILD}", owner: "beide",
        args: [{ name: "BILD", kind: "choice", source: "buehnenbilder", def: "Wiese" }], forms: [{ java: "wechsleZuBuehnenbild({BILD})" }],
        tooltip: "Zeigt dieses Bühnenbild.",
    },
    {
        type: "bl_naechstes_bild", cat: "aussehen", text: "wechsle zum nächsten Bühnenbild", args: [], owner: "beide",
        forms: [{ java: "naechstesBuehnenbild()" }], tooltip: "Zeigt das nächste Bühnenbild.",
    },
    {
        type: "bl_groesse_um", cat: "aussehen", text: "ändere Größe um {P}", args: [num("P", "10")], owner: "figur",
        forms: [{ java: "aendereGroesseUm({P})" }], tooltip: "Macht die Figur um so viele Prozentpunkte größer (negativ: kleiner).",
    },
    {
        type: "bl_groesse_auf", cat: "aussehen", text: "setze Größe auf {P} %", args: [num("P", "100")], owner: "figur",
        forms: [{ java: "setzeGroesse({P})" }], tooltip: "Setzt die Größe in Prozent (100 = normal).",
    },
    { type: "bl_zeige", cat: "aussehen", text: "zeige dich", args: [], owner: "figur", forms: [{ java: "zeige()" }], tooltip: "Zeigt die Figur." },
    {
        type: "bl_verstecke", cat: "aussehen", text: "verstecke dich", args: [], owner: "figur", forms: [{ java: "verstecke()" }],
        tooltip: "Versteckt die Figur. Versteckte Figuren berühren nichts und lassen sich nicht anklicken.",
    },
    {
        type: "bl_ebene", cat: "aussehen", text: "gehe ganz nach {WO}", owner: "figur",
        args: [{ name: "WO", kind: "choice", options: [["vorne", "vorne"], ["hinten", "hinten"]] }],
        forms: [{ java: "geheGanzNachVorne()", when: { WO: "vorne" } }, { java: "geheGanzNachHinten()", when: { WO: "hinten" } }],
        tooltip: "Legt die Figur vor bzw. hinter alle anderen.",
    },
    { type: "bl_kostuem_name", cat: "aussehen", text: "Kostüm", args: [], output: "String", owner: "figur", forms: [{ java: "kostuemName()" }], tooltip: "Name des Kostüms, z. B. „laufen 1“." },
    { type: "bl_groesse", cat: "aussehen", text: "Größe", args: [], output: "double", owner: "figur", forms: [{ java: "groesse()" }], tooltip: "Größe der Figur in Prozent." },

    // —— Steuerung ——
    {
        type: "bl_warte", cat: "steuerung", text: "warte {SEK} Sekunden", args: [num("SEK", "1")], owner: "beide",
        forms: [{ java: "warte({SEK})" }], tooltip: "Wartet so viele Sekunden (auch Kommazahlen wie 0.5).",
    },
    { type: "bl_stoppe_alles", cat: "steuerung", text: "stoppe alles", args: [], owner: "beide", forms: [{ java: "stoppeAlles()" }], tooltip: "Beendet das ganze Programm (wie der Stopp-Knopf)." },
    {
        type: "bl_stoppe_andere", cat: "steuerung", text: "stoppe andere Skripte der Figur", args: [], owner: "figur",
        forms: [{ java: "stoppeAndereSkripteDieserFigur()" }], tooltip: "Beendet die anderen laufenden Skripte dieser Figur; dieses läuft weiter.",
    },
    {
        type: "bl_klon", cat: "steuerung", text: "erzeuge Klon von {WER}", owner: "beide",
        args: [{ name: "WER", kind: "choice", source: "figuren", options: [["mir selbst", BL_MYSELF, "figur"]] }],
        forms: [{ java: "erzeugeKlon()", when: { WER: BL_MYSELF } }, { java: "erzeugeKlonVon({WER})" }],
        tooltip: "Erzeugt eine Kopie der Figur an derselben Stelle. Im Klon startet „Wenn ich als Klon entstehe“.",
    },
    {
        type: "bl_loesche_klon", cat: "steuerung", text: "lösche diesen Klon", args: [], owner: "figur",
        forms: [{ java: "loescheDiesenKlon()" }], tooltip: "Entfernt diesen Klon. Beim Original geschieht nichts.",
    },

    // —— Fühlen ——
    {
        type: "bl_beruehrt", cat: "fuehlen", text: "berührt {WAS} ?", output: "boolean", owner: "figur",
        args: [{ name: "WAS", kind: "choice", source: "figuren", options: [["Mauszeiger", BL_MOUSE], ["Rand", BL_EDGE]] }],
        forms: [
            { java: "beruehrtMauszeiger()", when: { WAS: BL_MOUSE } },
            { java: "beruehrtRand()", when: { WAS: BL_EDGE } },
            { java: "beruehrt({WAS})" },
        ],
        tooltip: "Wahr, wenn die Figur den Mauszeiger, den Rand oder eine andere Figur (auch einen ihrer Klone) berührt.",
    },
    {
        type: "bl_abstand", cat: "fuehlen", text: "Entfernung von {ZIEL}", output: "double", owner: "figur",
        args: [{ name: "ZIEL", kind: "choice", source: "figuren", options: [["Mauszeiger", BL_MOUSE]] }],
        forms: [{ java: "abstandZuMauszeiger()", when: { ZIEL: BL_MOUSE } }, { java: "abstandZu({ZIEL})" }],
        tooltip: "Abstand zum Mauszeiger bzw. zur anderen Figur (von Mitte zu Mitte).",
    },
    {
        type: "bl_taste", cat: "fuehlen", text: "Taste {KEY} gedrückt?", output: "boolean", owner: "beide",
        args: [{ name: "KEY", kind: "choice", source: "tasten", def: " " }], forms: [{ java: "tasteGedrueckt({KEY})" }],
        tooltip: "Wahr, solange diese Taste gedrückt ist.",
    },
    { type: "bl_maus_gedrueckt", cat: "fuehlen", text: "Maustaste gedrückt?", args: [], output: "boolean", owner: "beide", forms: [{ java: "mausGedrueckt()" }], tooltip: "Wahr, solange die Maustaste über der Bühne gedrückt ist." },
    { type: "bl_maus_x", cat: "fuehlen", text: "Maus x", args: [], output: "double", owner: "beide", forms: [{ java: "mausX()" }], tooltip: "x-Koordinate des Mauszeigers." },
    { type: "bl_maus_y", cat: "fuehlen", text: "Maus y", args: [], output: "double", owner: "beide", forms: [{ java: "mausY()" }], tooltip: "y-Koordinate des Mauszeigers." },
    { type: "bl_stoppuhr", cat: "fuehlen", text: "Stoppuhr", args: [], output: "double", owner: "beide", forms: [{ java: "stoppuhr()" }], tooltip: "Sekunden seit dem Start oder seit „setze Stoppuhr zurück“." },
    { type: "bl_stoppuhr_null", cat: "fuehlen", text: "setze Stoppuhr zurück", args: [], owner: "beide", forms: [{ java: "setzeStoppuhrZurueck()" }], tooltip: "Setzt die Stoppuhr auf 0." },

    // Bühne
    { type: "bl_bild_name", cat: "aussehen", text: "Bühnenbild", args: [], output: "String", owner: "buehne", forms: [{ java: "buehnenbildName()" }], tooltip: "Name des Bühnenbildes, z. B. „Schulhof“." },
];

const BY_TYPE = new Map(BL_BLOCKS.map((b) => [b.type, b]));

export function blBlock(type: string | undefined): BlBlock | undefined {
    return type ? BY_TYPE.get(type) : undefined;
}

/** gibt es den Block hier (Figur bzw. Bühne)? */
export function availableFor(b: { owner: BlOwner }, stage: boolean): boolean {
    return stage ? b.owner !== "figur" : b.owner !== "buehne";
}

/** gibt es die Form hier? (auf der Bühne nicht „erzeuge Klon von mir selbst“) */
export function formAvailable(b: BlBlock, f: BlForm, stage: boolean): boolean {
    if (!stage) return true;
    return Object.entries(f.when ?? {}).every(([name, value]) => {
        const a = b.args.find((x) => x.name === name);
        return !(a?.kind === "choice" && a.options?.some((o) => o[1] === value && o[2] === "figur"));
    });
}

/** Ergebnistypen der Werte-Blöcke (für das Typsystem) */
export const BL_OUTPUT_TYPES: Record<string, string> = Object.fromEntries(BL_BLOCKS.filter((b) => b.output).map((b) => [b.type, b.output!]));

/** Was passt in den Eingang? undefined: kein Blöckly-Block */
export function blInputTypes(type: string, input: string): string[] | null | undefined {
    const b = BY_TYPE.get(type);
    if (!b) return undefined;
    const a = b.args.find((x) => x.name === input);
    if (!a || a.kind === "choice") return null;
    if (a.kind === "num") return ["int", "double"];
    if (a.kind === "text") return ["String"];
    if (a.kind === "bool") return ["boolean"];
    return ["String", "int", "double", "char", "boolean"];
}

/** Form zerlegt: Methode und Platzhalter in der Reihenfolge der Argumente */
export type ParsedForm = { method: string; params: string[]; when: Record<string, string> };

const formCache = new Map<BlForm, ParsedForm>();

export function parsedForm(f: BlForm): ParsedForm {
    let p = formCache.get(f);
    if (!p) {
        const m = /^(\w+)\((.*)\)$/u.exec(f.java)!;
        const params = m[2].trim() === "" ? [] : m[2].split(",").map((s) => s.trim().replace(/^\{(\w+)\}$/, "$1"));
        p = { method: m[1], params, when: f.when ?? {} };
        formCache.set(f, p);
    }
    return p;
}

/** passende Java-Form zu den Feldern eines Blocks (die erste, deren Bedingungen alle stimmen) */
export function formFor(b: BlBlock, fields: Record<string, string | undefined>): ParsedForm {
    for (const f of b.forms) {
        const p = parsedForm(f);
        if (Object.entries(p.when).every(([k, v]) => fields[k] === v)) return p;
    }
    return parsedForm(b.forms[b.forms.length - 1]);
}

/** Werte eines Auswahlfeldes, die eine eigene Java-Form haben (dürfen nicht als Text "…" vorkommen) */
export function specialValues(b: BlBlock, field: string): Set<string> {
    return new Set(b.forms.map((f) => f.when?.[field]).filter((v): v is string => !!v));
}

/** Methoden, die Blöckly-Blöcke sind (eigene Operationen mit diesen Namen verdecken sie) */
export const BL_METHODS = new Set(BL_BLOCKS.flatMap((b) => b.forms.map((f) => parsedForm(f).method)));

// ------------------------------------------------------------------ Hüte (Skripte)

export type BlHat = { type: string; annotation: string; trigger?: "KEY" | "MSG"; owner: BlOwner };

export const BL_HATS: BlHat[] = [
    { type: B.blFlag, annotation: START_PART_ANNOTATION, owner: "beide" },
    { type: B.blKey, annotation: KEY_PART_ANNOTATION, trigger: "KEY", owner: "beide" },
    { type: B.blClick, annotation: CLICK_PART_ANNOTATION, owner: "beide" },
    { type: B.blMsg, annotation: MESSAGE_PART_ANNOTATION, trigger: "MSG", owner: "beide" },
    { type: B.blClone, annotation: CLONE_PART_ANNOTATION, owner: "figur" },
];

export function blHat(type: string | undefined): BlHat | undefined {
    return BL_HATS.find((h) => h.type === type);
}

/** Vorschlag für den Namen eines Programmteils zu einer Nachricht: „Tor!“ → beiTor */
export function messageMethodName(message: string): string {
    const words = message.replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter((w) => w);
    const camel = words.map((w) => w[0].toUpperCase() + w.slice(1)).join("");
    return camel && !/^\p{N}/u.test(camel) ? "bei" + camel : "nachricht";
}

/** Name der Methode eines Skripts, wenn niemand einen eigenen vergeben hat */
export function defaultHatName(type: string, fields: Record<string, string | undefined>): string {
    switch (type) {
        case B.blKey: {
            const k = keyPartName(String(fields.KEY ?? " "));
            return "wenn" + k[0].toUpperCase() + k.slice(1);
        }
        case B.blClick: return "wennAngeklickt";
        case B.blMsg: return messageMethodName(String(fields.MSG ?? "los"));
        case B.blClone: return "alsKlon";
        default: return "beimStart";
    }
}

/** Ist der Name der vorgeschlagene (auch mit Nummer: beimStart2)? Dann wird er nicht gespeichert. */
export function isDefaultHatName(name: string, type: string, fields: Record<string, string | undefined>): boolean {
    const base = defaultHatName(type, fields);
    return name === base || new RegExp(`^${base}\\d+$`).test(name);
}

// ------------------------------------------------------------------ Datei

/** Was Parser und Generator über das Projekt wissen müssen */
export type BloecklyContext = {
    /** Name der Bühnenklasse (Spiel) – Variablen für alle Figuren heißen in Figuren Spiel.name */
    stage: string;
    /** Variablen für alle Figuren (static in der Bühne) mit Datentyp */
    globals: Record<string, string>;
};

/** Kopf einer Blöckly-Datei (extraState des Blocks bl_figure) */
export type HeaderState = {
    klasse: string;
    /** Figur oder Buehne */
    oberklasse: string;
    /** Konstruktor als Text (Aussehen und Startposition pflegt die Figurenliste) */
    ctor: string;
    /** Text vor bzw. nach der Klasse (Kommentare) */
    prefix: string;
    suffix: string;
};

export const STAGE_SUPER = "Buehne";
export const FIGURE_SUPER = "Figur";
