import * as Blockly from "blockly/core";
import { B } from "./BlockTypes";
import { ADT_CALLS } from "./AdtSpec";
import { FIGURE_ACTIONS, FIGURE_CALLS, FIGURE_CREATIONS, FIGURE_PROPS } from "./FigureSpec";

/**
 * Paket 17d: Beschriftung der Blöcke umschaltbar – „Deutsch“ (Standard) oder „Java“. Mit „Java“ zeigen die
 * wichtigsten Blöcke ihren Java-Code („x = 5;“, „while (…)“, „liste.add(…)“) – als Brücke von den Blöcken
 * zum Java-Editor. Blöcke ohne Java-Beschriftung bleiben deutsch. Die Wahl gilt pro Gerät (localStorage).
 *
 * Java-Beschriftungen nennen die Felder und Eingänge beim Namen ({NAME}, {VALUE}); jeder muss genau einmal
 * vorkommen (BlockLabels.test.ts prüft das für alle Blöcke).
 */

export type LabelMode = "de" | "java";

const STORAGE_KEY = "gsg.blockLabels";

function stored(): LabelMode {
    try {
        return globalThis.localStorage?.getItem(STORAGE_KEY) === "java" ? "java" : "de";
    } catch {
        return "de";
    }
}

let mode: LabelMode = stored();

export function labelMode(): LabelMode {
    return mode;
}

/** deutsche bzw. Java-Beschriftung (für Blöcke, die in JavaScript aufgebaut werden) */
export function L(de: string, java: string): string {
    return mode === "java" ? java : de;
}

type Options = [string, string][];
export type JavaLabel = { message0?: string; message1?: string; options?: Record<string, Options>; extensions?: string[] };

const S = (message0: string, options?: Record<string, Options>): JavaLabel => ({ message0, options });

/** Vergleich der Zählschleife: aufwärts <= bzw. <, abwärts >= bzw. > */
const FOR_CMP: Record<"up" | "down", Options> = { up: [["<=", "incl"], ["<", "excl"]], down: [[">=", "incl"], [">", "excl"]] };

/**
 * Zählschleife mit Java-Beschriftung: Name der Zählvariablen auch vor dem Vergleich und vor der Schrittweite
 * (for (int i = 1 ; i <= 10 ; i += 1)), Vergleich passend zur Richtung.
 */
function registerForExtension() {
    if (Blockly.Extensions.isRegistered("gsg_for_java")) return;
    Blockly.Extensions.register("gsg_for_java", function (this: Blockly.Block) {
        const cmp = this.getField("CMP") as Blockly.FieldDropdown | null;
        const dir = this.getField("DIR");
        if (!cmp || !dir) return;
        const labels = [new Blockly.FieldLabel("i"), new Blockly.FieldLabel("i")];
        for (const [field, label] of [[cmp, labels[0]], [dir, labels[1]]] as const) {
            const input = field.getParentInput();
            input.insertFieldAt(input.fieldRow.indexOf(field), label);
        }
        const block = this;
        // Richtung schon beim Ändern (Prüffunktion), damit der Vergleich sofort passt
        let down = block.getFieldValue("DIR") === "down";
        (cmp as unknown as { menuGenerator_: () => Options }).menuGenerator_ = () => FOR_CMP[down ? "down" : "up"];
        dir.setValidator((v: string) => {
            down = v === "down";
            refresh();
            return v;
        });
        const refresh = () => {
            const name = String(block.getFieldValue("VAR") ?? "i");
            for (const l of labels) if (l.getValue() !== name) l.setValue(name);
            cmp.getOptions(false);
            (cmp as unknown as { doValueUpdate_(v: unknown): void }).doValueUpdate_(cmp.getValue());
            cmp.forceRerender();
        };
        this.setOnChange((e: Blockly.Events.Abstract) => {
            if (e.type === Blockly.Events.BLOCK_CHANGE && (e as Blockly.Events.BlockChange).blockId === block.id) refresh();
            else if (e.type === Blockly.Events.BLOCK_CREATE) refresh();
        });
        refresh();
    });
}

/** Java-Beschriftungen (Platzhalter: Namen der Felder und Eingänge) */
export const JAVA_LABELS: Record<string, JavaLabel> = {
    [B.start]: S("// Hauptprogramm {NAME}"),
    // Variablen
    [B.varDeclare]: S("{TYPE} {NAME} = {VALUE} ;"),
    [B.varSet]: S("{NAME} = {VALUE} ;"),
    [B.varChange]: S("{NAME} {OP} {VALUE} ;", { OP: [["+=", "+"], ["-=", "-"]] }),
    [B.varSub]: S("{NAME} -= {VALUE} ;"),
    [B.varInc]: S("{NAME} ++ ;"),
    [B.varDec]: S("{NAME} -- ;"),
    // Ein- und Ausgabe
    [B.input]: S("Input. {METHOD} ( {PROMPT} )", {
        METHOD: [["readInt", "readInt"], ["readDouble", "readDouble"], ["readString", "readString"],
            ["readBoolean", "readBoolean"], ["readChar", "readChar"]],
    }),
    [B.trace]: S("trace( {TEXT} ) ;"),
    // Steuerung
    [B.while]: S("{MODE} ( {COND} )", { MODE: [["while", "while"], ["while !", "until"]] }),
    [B.forever]: S("while (true)"),
    [B.repeat]: S("for (int durchlauf = 1; durchlauf <= {TIMES} ; durchlauf++)"),
    // „i <= 10 ; i += 1“: den Namen der Zählvariablen vor CMP und DIR setzt die Erweiterung gsg_for_java ein
    [B.for]: {
        ...S("for (int {VAR} = {FROM} ; {CMP} {TO} ; {DIR} {STEP} )", { CMP: FOR_CMP.up, DIR: [["+=", "up"], ["-=", "down"]] }),
        extensions: ["gsg_for_java"],
    },
    [B.wait]: S("Thread.sleep( {MS} ) ;"),
    [B.return]: S("return {VALUE} ;"),
    [B.returnVoid]: S("return ;"),
    // Bedingungen und Rechnen
    [B.compare]: S("{A} {OP} {B}", { OP: [["==", "=="], ["!=", "!="], ["<", "<"], ["<=", "<="], [">", ">"], [">=", ">="]] }),
    [B.logic]: S("{A} {OP} {B}", { OP: [["&&", "&&"], ["||", "||"]] }),
    [B.not]: S("! {VALUE}"),
    [B.bool]: S("{VALUE}", { VALUE: [["true", "true"], ["false", "false"]] }),
    [B.arith]: S("{A} {OP} {B}", { OP: [["+", "+"], ["-", "-"], ["*", "*"], ["/", "/"], ["%", "%"]] }),
    [B.random]: S("Random.randint( {FROM} , {TO} )"),
    [B.randomDouble]: S("Math.random()"),
    [B.math]: S("Math. {FUNC} ( {VALUE} )", { FUNC: [["round", "round"], ["sqrt", "sqrt"], ["abs", "abs"]] }),
    [B.minMax]: S("Math. {FUNC} ( {A} , {B} )", { FUNC: [["min", "min"], ["max", "max"]] }),
    [B.cast]: S("( {TYPE} ) {VALUE}", { TYPE: [["int", "int"], ["double", "double"], ["char", "char"]] }),
    // Texte
    [B.text]: S("\"{TEXT}\""),
    [B.char]: S("'{CHAR}'"),
    [B.concat]: S("{A} + {B}"),
    [B.strLength]: S("{TEXT} .length()"),
    [B.strCharAt]: S("{TEXT} .charAt( {INDEX} )"),
    [B.strSubstring]: S("{TEXT} .substring( {FROM} , {TO} )"),
    [B.strEquals]: S("{A} .equals( {B} )"),
    [B.strContains]: S("{A} .contains( {B} )"),
    [B.strCompare]: S("{A} .compareTo( {B} )"),
    [B.strCase]: S("{TEXT} . {CASE}", { CASE: [["toUpperCase()", "upper"], ["toLowerCase()", "lower"]] }),
    [B.comment]: S("// {TEXT}"),
    [B.thisValue]: S("this"),
    // Reihungen und Listen
    [B.arrayGet]: S("{NAME} [ {I} ]"),
    [B.arraySet]: S("{NAME} [ {I} ] = {V} ;"),
    [B.arrayLength]: S("{NAME} .length"),
    [B.array2dGet]: S("{NAME} [ {R} ] [ {C} ]"),
    [B.array2dSet]: S("{NAME} [ {R} ] [ {C} ] = {V} ;"),
    [B.array2dSize]: S("{NAME} {DIM}", { DIM: [[".length (Zeilen)", "rows"], ["[0].length (Spalten)", "cols"]] }),
    [B.forEach]: S("for ( {VAR} : {LIST} )"),
    [B.listAdd]: S("{NAME} .add( {V} ) ;"),
    [B.listInsert]: S("{NAME} .add( {I} , {V} ) ;"),
    [B.listRemove]: S("{NAME} .remove( {I} ) ;"),
    [B.listClear]: S("{NAME} .clear() ;"),
    [B.listGet]: S("{NAME} .get( {I} )"),
    [B.listSet]: S("{NAME} .set( {I} , {V} ) ;"),
    [B.listSize]: S("{NAME} .size()"),
    [B.listContains]: S("{NAME} .contains( {V} )"),
    [B.collIsEmpty]: S("{NAME} .isEmpty()"),
    [B.dynNew]: S("DynArray {NAME} = new DynArray() ;"),
    [B.dynAppend]: S("{NAME} .append( {V} ) ;"),
    [B.dynInsert]: S("{NAME} .insertAt( {I} , {V} ) ;"),
    [B.dynSet]: S("{NAME} .setItem( {I} , {V} ) ;"),
    [B.dynDelete]: S("{NAME} .delete( {I} ) ;"),
    [B.dynLength]: S("{NAME} .getLength()"),
    [B.dynIsEmpty]: S("{NAME} .isEmpty()"),
    [B.stackNew]: S("Stack {NAME} = new Stack() ;"),
    [B.queueNew]: S("Queue {NAME} = new Queue() ;"),
    [B.adtIsEmpty]: S("{NAME} .isEmpty()"),
    [B.treeTest]: S("{NAME} .isLeaf()"),
    // Figuren
    [B.worldNew]: S("new World( {W} , {H} ).setBackgroundColor( {COLOR} ) ;"),
    [B.figColor]: S("{NAME} .setFillColor( {COLOR} ) ;"),
    [B.figTurnTo]: S("{NAME} .turnTowards( {OTHER} ) ;"),
    [B.figAction]: S("{NAME} . {ACTION} ;", { ACTION: FIGURE_ACTIONS.map(([, v, java]) => [java, v]) }),
    [B.figProp]: S("{NAME} . {PROP} ()", { PROP: FIGURE_PROPS.map(([, v, java]) => [java, v]) }),
    [B.figTouchesColor]: S("{NAME} .collidesWithFillColor( {COLOR} )"),
    [B.figTouchesList]: S("{NAME} .collidesWithAnyOf( {LIST} )"),
    [B.figOutside]: S("{NAME} .isOutsideView()"),
    [B.figDistance]: S("{NAME} .distanceTo( {OTHER} )"),
    [B.keyDown]: S("Input.isKeyDown( {KEY} )"),
    [B.mouseXY]: S("Mouse. {AXIS} ()", { AXIS: [["getX", "x"], ["getY", "y"]] }),
};

// figur.methode(…); und Figur erzeugen, Stapel/Schlange/Binärbaum x.methode(…);
for (const c of FIGURE_CALLS) JAVA_LABELS[c.block] = S(`{NAME} .${c.method}( ${c.inputs.map((i) => `{${i}}`).join(" , ")} ) ;`);
for (const c of FIGURE_CREATIONS) {
    const params = c.inputs.map((i) => i === "IMG" ? "SpriteLibrary. {IMG}" : `{${i}}`).join(" , ");
    JAVA_LABELS[c.block] = S(`${c.cls} {NAME} = new ${c.cls}( ${params} ) ;${c.block === B.figSprite ? " {PREVIEW}" : ""}`);
}
for (const c of ADT_CALLS) JAVA_LABELS[c.block] = S(`{NAME} .${c.method}( ${c.inputs.map((i) => `{${i}}`).join(" , ")} ) ;`);

type Arg = { name?: string; type?: string; options?: unknown };
type Def = Record<string, unknown> & { type?: string };

/** "{NAME} = {VALUE}" -> "%1 = %2" (Reihenfolge der Argumente wie in der deutschen Definition) */
export function toMessage(template: string, args: Arg[]): string | undefined {
    const used = new Set<number>();
    let ok = true;
    const message = template.replace(/\{(\w+)\}/g, (_, name: string) => {
        const i = args.findIndex((a) => a?.name === name);
        if (i < 0 || used.has(i)) ok = false;
        used.add(i);
        return `%${i + 1}`;
    });
    return ok && used.size === args.length ? message : undefined;
}

/** Definitionen mit Java-Beschriftung (Blöcke ohne passende Java-Beschriftung bleiben unverändert) */
export function withLabels<T extends Def>(json: T[], m: LabelMode = mode): T[] {
    if (m === "de") return json;
    return json.map((def) => {
        const label = def.type ? JAVA_LABELS[def.type] : undefined;
        if (!label) return def;
        const d: Record<string, unknown> = { ...def };
        for (const i of [0, 1]) {
            const template = i === 0 ? label.message0 : label.message1;
            if (template === undefined) continue;
            const args = (d[`args${i}`] as Arg[] | undefined) ?? [];
            const message = toMessage(template, args);
            if (message === undefined) return def;
            d[`message${i}`] = message;
        }
        if (label.extensions) d.extensions = [...((d.extensions as string[] | undefined) ?? []), ...label.extensions];
        if (label.options) {
            for (let i = 0; Array.isArray(d[`args${i}`]); i++) {
                d[`args${i}`] = (d[`args${i}`] as Arg[]).map((a) => a?.name && label.options![a.name] ? { ...a, options: label.options![a.name] } : a);
            }
        }
        return d as T;
    });
}

// ------------------------------------------------------------------ Definieren und Umschalten

const recorded: Def[] = [];

/** Blöcke aus JSON definieren und für das Umschalten merken (Definitionen schon ohne Java-Schnipsel) */
export function defineLabelled(json: Def[]) {
    registerForExtension();
    recorded.push(...json);
    Blockly.common.defineBlocksWithJsonArray(withLabels(json));
}

/**
 * Beschriftung umschalten: Blöcke neu definieren (danach die Blockfläche neu aufbauen).
 * remember = false: nur jetzt (z. B. von der Lerngruppe vorgegeben), die gespeicherte Wahl des Geräts bleibt.
 */
export function setLabelMode(m: LabelMode, remember = true) {
    if (m === mode) return;
    mode = m;
    if (remember) {
        try {
            globalThis.localStorage?.setItem(STORAGE_KEY, m);
        } catch { /* ohne Speicher: gilt bis zum Neuladen */ }
    }
    const defs = withLabels(recorded);
    for (const d of defs) if (d.type) delete Blockly.Blocks[d.type];   // sonst warnt Blockly bei jeder Definition
    Blockly.common.defineBlocksWithJsonArray(defs);
}

/** alle gemerkten JSON-Definitionen (für Tests) */
export function recordedDefinitions(): readonly Def[] {
    return recorded;
}
