import { afterAll, expect, test } from "vitest";
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import * as Blockly from "blockly/core";
import { defineBlocks } from "./BlockDefinitions";
import { JAVA_LABELS, labelMode, recordedDefinitions, setLabelMode, toMessage, withLabels } from "./BlockLabels";
import { JavaBlockParser } from "./JavaBlockParser";
import { JavaBlockGenerator } from "./JavaBlockGenerator";
import type { WorkspaceState } from "./BlockTypes";

defineBlocks();
afterAll(() => setLabelMode("de"));

type Arg = { name?: string };

test("jede Java-Beschriftung nennt alle Felder und Eingänge ihres Blocks genau einmal", () => {
    const defs = new Map(recordedDefinitions().map((d) => [d.type, d]));
    for (const [type, label] of Object.entries(JAVA_LABELS)) {
        const def = defs.get(type);
        expect(def, type).toBeDefined();
        for (const i of [0, 1] as const) {
            const template = i === 0 ? label.message0 : label.message1;
            if (template === undefined) continue;
            const args = (def![`args${i}`] as Arg[] | undefined) ?? [];
            expect(toMessage(template, args), `${type}: ${template} / ${args.map((a) => a.name).join(",")}`).toBeDefined();
        }
        for (const field of Object.keys(label.options ?? {})) {
            const args = [...((def!.args0 as Arg[] | undefined) ?? []), ...((def!.args1 as Arg[] | undefined) ?? [])];
            expect(args.some((a) => a.name === field), `${type}.${field}`).toBe(true);
        }
    }
});

test("Auswahllisten behalten ihre Werte (nur die Anzeige ist Java)", () => {
    const defs = recordedDefinitions();
    const java = withLabels([...defs], "java");
    defs.forEach((d, i) => {
        for (const key of ["args0", "args1"]) {
            const before = (d[key] as { name?: string; options?: [string, string][] }[] | undefined) ?? [];
            const after = (java[i][key] as typeof before | undefined) ?? [];
            before.forEach((a, j) => {
                if (Array.isArray(a.options)) expect(after[j].options!.map((o) => o[1]), `${d.type}.${a.name}`).toEqual(a.options.map((o) => o[1]));
            });
        }
    });
});

const PROGRAM = [
    "// Hauptprogramm „Test“",
    "int summe = 0;",
    "for (int i = 1; i <= 3; i++) {",
    "    int wurf = Random.randint(1, 6);",
    "    summe += wurf;",
    "    if (wurf == 6 || !(summe < 10)) {",
    "        println(\"Glück!\", summe);",
    "    } else if (wurf == 1) {",
    "        print(wurf + \" \");",
    "    } else {",
    "        summe--;",
    "    }",
    "}",
    "ArrayList<String> namen = new ArrayList<String>();",
    "namen.add(\"Ada\");",
    "println(namen.get(0).toUpperCase(), quadrat(summe));",
    "begruesse();",
    "",
    "int quadrat(int x) {",
    "    return x * x;",
    "}",
    "",
    "void begruesse() {",
    "    println(\"Hallo\");",
    "}",
    "",
    "class Tier {",
    "    private String name = \"Bello\";",
    "",
    "    public Tier(String name) {",
    "        this.name = name;",
    "    }",
    "",
    "    public String gibName() {",
    "        return name;",
    "    }",
    "}",
    "",
].join("\n");

function roundTrip(code: string): string {
    const ws = new Blockly.Workspace();
    try {
        Blockly.serialization.workspaces.load(JavaBlockParser.parse(code).state, ws);
        return JavaBlockGenerator.generate(Blockly.serialization.workspaces.save(ws) as WorkspaceState).code;
    } finally {
        ws.dispose();
    }
}

test("mit Java-Beschriftung bleibt der Code beim Laden und Speichern gleich", () => {
    const de = roundTrip(PROGRAM);
    setLabelMode("java");
    expect(labelMode()).toBe("java");
    expect(roundTrip(PROGRAM)).toBe(de);
    setLabelMode("de");
    expect(roundTrip(PROGRAM)).toBe(de);
});

test("Java-Beschriftung: Blöcke zeigen Java", () => {
    setLabelMode("java");
    const ws = new Blockly.Workspace();
    try {
        Blockly.serialization.workspaces.load(JavaBlockParser.parse(PROGRAM).state, ws);
        const text = (type: string) => ws.getAllBlocks(false).filter((b) => b.type === type).map((b) => b.toString());
        expect(text("j_var_declare")).toContain("int summe = 0 ;");
        expect(text("j_var_change")[0]).toBe("summe += wurf ;");
        expect(text("j_list_add")[0]).toMatch(/^namen \.add\(.*Ada.*\) ;$/);
        expect(text("j_if")[0]).toMatch(/^if /);
        expect(text("j_print").some((t) => /^print \(wurf \+ /.test(t))).toBe(true);
        expect(text("j_call")[0]).toMatch(/^begruesse .*\( \) ;$/);
        expect(text("j_method").some((t) => /^int quadrat \(.*int x/.test(t))).toBe(true);
        expect(text("j_for")[0]).toMatch(/^for \(int i = 1 ; i <= 3 ; i \+= 1\)/);
        expect(text("j_attribute")[0]).toMatch(/^private String name = /);
        // abwärts zählen: Vergleich >=
        const loop = ws.getAllBlocks(false).find((b) => b.type === "j_for")!;
        loop.setFieldValue("down", "DIR");
        expect(loop.toString()).toMatch(/^for \(int i = 1 ; i >= 3 ; i -= 1\)/);
    } finally {
        ws.dispose();
        setLabelMode("de");
    }
    const ws2 = new Blockly.Workspace();
    try {
        Blockly.serialization.workspaces.load(JavaBlockParser.parse("int a = 1;\n").state, ws2);
        expect(ws2.getAllBlocks(false).find((b) => b.type === "j_var_declare")!.toString()).toBe("erstelle neue Variable a vom Datentyp Ganzzahl mit Wert 1");
    } finally {
        ws2.dispose();
    }
});
