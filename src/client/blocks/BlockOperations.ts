import * as Blockly from "blockly/core";
import { B, COLLECTION_DECLARATIONS, COLLECTION_USES, VAR_TYPES, type Param } from "./BlockTypes";
import { FieldButton, hintLabel, mutate, type Mutable } from "./BlockMutators";
import { collectionsOf, defaultLiteral, isHat, methodParamsOf, methodSignatures, scopeVariables, TYPE_NAMES, type JType } from "./BlockTypeSystem";

/**
 * Operationen (Methoden im Hauptprogramm, Paket 4 des Blockmodus):
 *  - Hut-Block "Operation <name> liefert <Typ>" mit Parametern (+ Parameter / ✕)
 *  - "gib zurück <Wert>" und "beende die Operation"
 *  - "führe aus <Operation> mit …" (Anweisung) und "Ergebnis von <Operation> mit …" (Wert)
 * Aufrufe passen sich der Operation an: Anzahl und Namen der Parameter, Umbenennen.
 */

export const OPERATIONS_COLOUR = "#c2477f";
export const OPERATIONS_CATEGORY = "GSG_OPERATIONS";

const TYPE_OPTIONS: [string, string][] = VAR_TYPES.map((t) => [TYPE_NAMES[t], t]);
const RETURN_OPTIONS: [string, string][] = [["nichts (void)", "void"], ...TYPE_OPTIONS];
const PARAM_FIELD = /^P(NAME|TYPE)\d+$/;

/** Java-Bezeichner: nur Buchstaben, Ziffern, _ und $; nicht mit Ziffer beginnen */
function identifier(v: string): string | null {
    const cleaned = String(v).replace(/[^\p{L}\p{N}_$]/gu, "");
    return cleaned === "" || /^\p{N}/u.test(cleaned) ? null : cleaned;
}

// ------------------------------------------------------------------ Auswahl der Operation

type CallBlock = Mutable<CallState> & { updateLabels(): void };

/** Auswahl einer Operation der Arbeitsfläche; nimmt auch (noch) unbekannte Namen an */
export class FieldMethodName extends Blockly.FieldDropdown {
    constructor(value: string, private onlyResults: boolean) {
        super(function (this: FieldMethodName) { return this.methodOptions(); } as unknown as Blockly.MenuGenerator);
        this.setValue(value);
    }

    private methodOptions(): [string, string][] {
        const block = this.getSourceBlock();
        const names = new Set<string>();
        if (block) {
            for (const s of methodSignatures(block.workspace).values()) if (!this.onlyResults || s.ret !== "void") names.add(s.name);
        }
        const current = this.getValue();
        if (typeof current === "string" && current) names.add(current);
        if (names.size === 0) names.add("meineOperation");
        return [...names].sort((a, b) => a.localeCompare(b, "de")).map((n) => [n, n]);
    }

    protected override doClassValidation_(newValue?: unknown): string | null {
        return typeof newValue === "string" && /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(newValue) ? newValue : null;
    }

    protected override doValueUpdate_(newValue: string) {
        super.doValueUpdate_(newValue);
        this.getOptions(false);   // zwischengespeicherte Liste erneuern (sonst fehlt der neue Name)
        super.doValueUpdate_(newValue);
        (this.getSourceBlock() as CallBlock | null)?.updateLabels?.();
    }
}

// ------------------------------------------------------------------ Operation (Hut-Block)

type MethodState = { params: Param[] };

function unusedName(taken: Set<string>): string {
    for (let i = 1; ; i++) {
        const name = i === 1 ? "wert" : "wert" + i;
        if (!taken.has(name)) return name;
    }
}

function setParams(b: Mutable<MethodState>, params: Param[]) {
    mutate(b, { params }, (n) => n, true, (name) => !PARAM_FIELD.test(name));
}

function defineMethodBlock() {
    Blockly.Blocks[B.method] = {
        state: { params: [] } as MethodState,

        init(this: Mutable<MethodState>) {
            this.state = { params: [] };
            this.hat = "cap";
            this.setColour(OPERATIONS_COLOUR);
            this.setTooltip("Eine eigene Operation (in Java: Methode). Sie läuft, wenn sie mit „führe aus“ "
                + "oder „Ergebnis von“ aufgerufen wird. Parameter sind Werte, die sie beim Aufruf bekommt.");
            this.build();
        },

        build(this: Mutable<MethodState>) {
            this.appendDummyInput("HEAD").appendField("Operation")
                .appendField(new Blockly.FieldTextInput("meineOperation", identifier), "NAME")
                .appendField("liefert")
                .appendField(new Blockly.FieldDropdown(RETURN_OPTIONS), "RETURN")
                .appendField(hintLabel("Methode"));
            this.state.params.forEach((p, i) => {
                const type = new Blockly.FieldDropdown(TYPE_OPTIONS);
                if (TYPE_OPTIONS.some(([, v]) => v === p.type)) type.setValue(p.type);
                this.appendDummyInput("P" + i)
                    .appendField(new FieldButton("✕", (b) => removeParam(b as Mutable<MethodState>, i), "Diesen Parameter entfernen"))
                    .appendField("Parameter")
                    .appendField(new Blockly.FieldTextInput(p.name, identifier), "PNAME" + i)
                    .appendField("vom Datentyp")
                    .appendField(type, "PTYPE" + i);
            });
            this.appendDummyInput("ADD").appendField(new FieldButton("+ Parameter", (b) => addParam(b as Mutable<MethodState>),
                "Einen Wert hinzufügen, den die Operation beim Aufruf bekommt"));
            this.appendStatementInput("BODY");
        },

        saveExtraState(this: Mutable<MethodState>): MethodState | null {
            const params = methodParamsOf(this);
            return params.length ? { params } : null;
        },

        loadExtraState(this: Mutable<MethodState>, state: Partial<MethodState>) {
            const params = Array.isArray(state?.params)
                ? state.params.map((p) => ({ name: String(p?.name ?? "wert"), type: String(p?.type ?? "int") }))
                : [];
            mutate(this, { params }, (n) => n, false, (name) => !PARAM_FIELD.test(name));
        },
    };

    function addParam(b: Mutable<MethodState>) {
        const params = methodParamsOf(b);
        const taken = new Set([...params.map((p) => p.name), ...scopeVariables(b).keys()]);
        setParams(b, [...params, { name: unusedName(taken), type: "int" }]);
    }
    function removeParam(b: Mutable<MethodState>, index: number) {
        const params = methodParamsOf(b);
        params.splice(index, 1);
        setParams(b, params);
    }
}

// ------------------------------------------------------------------ Aufrufe

type CallState = { args: number };

function defineCallBlock(type: string, asValue: boolean) {
    Blockly.Blocks[type] = {
        state: { args: 0 } as CallState,

        init(this: CallBlock) {
            this.state = { args: 0 };
            if (asValue) this.setOutput(true);
            else {
                this.setPreviousStatement(true);
                this.setNextStatement(true);
            }
            this.setColour(OPERATIONS_COLOUR);
            this.setInputsInline(true);
            this.setTooltip(asValue
                ? "Führt die Operation aus und liefert ihr Ergebnis, z. B. quadrat(5)."
                : "Führt die Operation aus, z. B. begruesse(\"Ada\");");
            this.build();
        },

        build(this: CallBlock) {
            this.appendDummyInput("HEAD").appendField(asValue ? "Ergebnis von" : "führe aus")
                .appendField(new FieldMethodName("meineOperation", asValue), "NAME");
            for (let i = 0; i < this.state.args; i++) {
                const input = this.appendValueInput("ARG" + i);
                if (i === 0) input.appendField("mit");
                input.appendField(new Blockly.FieldLabel("", "gsg-param-label"), "L" + i);
            }
            this.appendDummyInput("TAIL").appendField(hintLabel("( )"));
            this.updateLabels();
        },

        /** Beschriftung der Werte: Namen der Parameter */
        updateLabels(this: CallBlock) {
            if (!this.workspace) return;
            const sig = methodSignatures(this.workspace).get(String(this.getFieldValue("NAME") ?? ""));
            Blockly.Events.disable();
            try {
                for (let i = 0; i < this.state.args; i++) {
                    const field = this.getField("L" + i);
                    const text = (sig?.params[i]?.name ?? "Wert " + (i + 1)) + ":";
                    if (field && field.getValue() !== text) field.setValue(text);
                }
            } finally {
                Blockly.Events.enable();
            }
        },

        saveExtraState(this: CallBlock): CallState | null {
            return this.state.args ? { args: this.state.args } : null;
        },

        loadExtraState(this: CallBlock, state: Partial<CallState>) {
            mutate(this, { args: Math.max(0, Number(state?.args ?? 0)) }, (n) => n, false);
        },
    };
}

export function defineOperationBlocks(defineJson: (json: object[]) => void) {
    defineMethodBlock();
    defineCallBlock(B.call, false);
    defineCallBlock(B.callExpr, true);
    defineJson([
        {
            type: B.return, message0: "gib zurück %1 %2", args0: [{ type: "input_value", name: "VALUE" }, { type: "field_label", text: "return", class: "gsg-java-hint" }],
            inputsInline: true, previousStatement: null, nextStatement: null, colour: OPERATIONS_COLOUR,
            tooltip: "Beendet die Operation und liefert den Wert als ihr Ergebnis.",
        },
        {
            type: B.returnVoid, message0: "beende die Operation %1", args0: [{ type: "field_label", text: "return;", class: "gsg-java-hint" }],
            previousStatement: null, nextStatement: null, colour: OPERATIONS_COLOUR,
            tooltip: "Beendet die Operation sofort (ohne Ergebnis). Im Hauptprogramm: beendet das Programm.",
        },
    ]);
}

// ------------------------------------------------------------------ Abgleich nach Änderungen

const isCall = (b: Blockly.Block) => b.type === B.call || b.type === B.callExpr;

/**
 * Aufrufe an ihre Operation anpassen: so viele Werte wie Parameter (überzählige Werte werden
 * abgenommen, nicht gelöscht) und die Parameternamen als Beschriftung.
 */
export function syncCalls(ws: Blockly.Workspace) {
    const sigs = methodSignatures(ws);
    for (const b of ws.getAllBlocks(false)) {
        if (!isCall(b)) continue;
        const call = b as CallBlock;
        const sig = sigs.get(String(b.getFieldValue("NAME") ?? ""));
        if (sig && sig.params.length !== call.state.args) {
            const n = sig.params.length, before = call.state.args;
            mutate(call, { args: n }, (name) => {
                const m = /^ARG(\d+)$/.exec(name);
                return m && Number(m[1]) >= n ? null : name;
            }, true);
            // neue Werte mit einem passenden Startwert füllen (0, "", false …)
            for (let i = before; i < n; i++) fillArgument(call, i, sig.params[i].type);
        }
        call.updateLabels();
    }
}

function fillArgument(call: Blockly.Block, index: number, type: JType) {
    const connection = call.getInput("ARG" + index)?.connection;
    if (!connection || connection.targetBlock()) return;
    const literal = defaultLiteral(type);
    const ws = call.workspace;
    const block = ws.newBlock(literal.type);
    for (const [k, v] of Object.entries(literal.fields)) block.setFieldValue(v, k);
    const svg = block as Blockly.BlockSvg;
    if (ws.rendered && typeof svg.initSvg === "function") {
        svg.initSvg();
        svg.render();
    }
    connection.setCheck(null);   // Typen setzt applyTypes danach neu
    connection.connect(block.outputConnection!);
}

/**
 * Umbenennen mitnehmen:
 *  - Variable (neue Variable, Zählschleife, Parameter): alle Verwendungen im selben Hauptprogramm
 *    bzw. in derselben Operation – sofern der alte Name dort nicht noch anders deklariert ist
 *  - Operation: alle Aufrufe
 */
export function handleRename(ws: Blockly.Workspace, e: Blockly.Events.BlockChange) {
    if (e.element !== "field" || !e.blockId || !e.name) return;
    const block = ws.getBlockById(e.blockId);
    if (!block) return;
    const oldName = String(e.oldValue ?? ""), newName = String(e.newValue ?? "");
    if (!oldName || !newName || oldName === newName) return;

    if (block.type === B.method && e.name === "NAME") {
        if (methodSignatures(ws).has(oldName)) return;   // gibt es noch einmal
        withGroup(e, () => {
            for (const b of ws.getAllBlocks(false)) if (isCall(b) && b.getFieldValue("NAME") === oldName) b.setFieldValue(newName, "NAME");
        });
        return;
    }

    // Variable: neue Variable, Zählschleife, Parameter, für jedes Element
    const isVariable = (block.type === B.varDeclare && e.name === "NAME") || (block.type === B.for && e.name === "VAR")
        || (block.type === B.method && /^PNAME\d+$/.test(e.name)) || (block.type === B.forEach && e.name === "VAR");
    // Reihung oder Liste (auch die Zeile einer zweidimensionalen Reihung in "für jedes Element")
    const isCollection = (!!COLLECTION_DECLARATIONS[block.type] && e.name === "NAME") || (block.type === B.forEach && e.name === "VAR");
    if (!isVariable && !isCollection) return;
    const root = block.getRootBlock();
    const scope = isHat(root) ? root.getDescendants(false) : ws.getAllBlocks(false);
    if (scopeVariables(root).has(oldName) || collectionsOf(scope).has(oldName)) return;   // noch anderswo deklariert
    withGroup(e, () => {
        for (const b of scope) {
            if (isVariable && [B.varGet, B.varSet, B.varChange, B.varSub, B.varInc, B.varDec].includes(b.type as never) && b.getFieldValue("NAME") === oldName) {
                b.setFieldValue(newName, "NAME");
            }
            if (isCollection && COLLECTION_USES.includes(b.type) && b.getFieldValue("NAME") === oldName) b.setFieldValue(newName, "NAME");
            if (isCollection && b.type === B.forEach && b.getFieldValue("LIST") === oldName) b.setFieldValue(newName, "LIST");
        }
    });
}

function withGroup(e: Blockly.Events.Abstract, action: () => void) {
    const had = Blockly.Events.getGroup();
    if (!had) Blockly.Events.setGroup(e.group || true);
    try {
        action();
    } finally {
        if (!had) Blockly.Events.setGroup(false);
    }
}

// ------------------------------------------------------------------ Werkzeugleiste

/** Inhalt der Kategorie "Operationen": neue Operation, gib zurück, Aufrufe der vorhandenen Operationen */
export function operationsFlyout(ws: Blockly.WorkspaceSvg): Blockly.utils.toolbox.FlyoutItemInfoArray {
    const num = (n: string) => ({ block: { type: B.number, fields: { NUM: n } } });
    const v = (name: string) => ({ block: { type: B.varGet, fields: { NAME: name } } });
    const items: object[] = [
        { kind: "label", text: "Neue Operation – „+ Parameter“ fügt Werte hinzu, die sie beim Aufruf bekommt." },
        { kind: "block", type: B.method, fields: { NAME: "meineOperation", RETURN: "void" } },
        {
            kind: "block", type: B.method, extraState: { params: [{ name: "x", type: "int" }] },
            fields: { NAME: "quadrat", RETURN: "int", PNAME0: "x", PTYPE0: "int" },
            inputs: { BODY: { block: { type: B.return, inputs: { VALUE: { block: { type: B.arith, fields: { OP: "*" }, inputs: { A: v("x"), B: v("x") } } } } } } },
        },
        { kind: "label", text: "In einer Operation" },
        { kind: "block", type: B.return, inputs: { VALUE: num("0") } },
        { kind: "block", type: B.returnVoid },
    ];
    const sigs = [...methodSignatures(ws).values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
    if (sigs.length === 0) {
        items.push({ kind: "label", text: "Lege zuerst eine Operation an – dann erscheinen hier Blöcke, um sie aufzurufen." });
    } else {
        items.push({ kind: "label", text: "Deine Operationen aufrufen" });
        for (const sig of sigs) {
            const inputs: { [name: string]: object } = {};
            sig.params.forEach((p, i) => { inputs["ARG" + i] = { block: defaultLiteral(p.type as JType) }; });
            items.push({
                kind: "block", type: sig.ret === "void" ? B.call : B.callExpr, fields: { NAME: sig.name },
                ...(sig.params.length ? { extraState: { args: sig.params.length }, inputs } : {}),
            });
        }
    }
    return items as Blockly.utils.toolbox.FlyoutItemInfoArray;
}
