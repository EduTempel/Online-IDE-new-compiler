import { describe, expect, test } from "vitest";
// Ladereihenfolge der Compiler-Module wie in der IDE (sonst zyklische Importe)
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import { JavaBlockParser } from "./JavaBlockParser";
import { JavaBlockGenerator } from "./JavaBlockGenerator";
import { B, type BlockState } from "./BlockTypes";
import { classInfosFromState } from "./ClassModel";
import { runJava } from "./RunJava";

const NL = String.fromCharCode(10);
const lines = (...l: string[]) => l.join(NL) + NL;
const roundTrip = (code: string) => JavaBlockGenerator.generate(JavaBlockParser.parse(code).state).code;
const rawParts = (code: string) => {
    const result: string[] = [];
    const visit = (b: BlockState | undefined) => {
        for (; b; b = b.next?.block) {
            if (b.type.startsWith("j_java")) result.push(b.fields?.CODE ?? b.extraState?.code ?? "");
            for (const i of Object.values(b.inputs ?? {})) visit(i.block);
        }
    };
    for (const top of JavaBlockParser.parse(code).state.blocks.blocks) visit(top);
    return result;
};
const types = (code: string) => {
    const result = new Set<string>();
    const visit = (b: BlockState | undefined) => {
        for (; b; b = b.next?.block) {
            result.add(b.type);
            for (const i of Object.values(b.inputs ?? {})) visit(i.block);
        }
    };
    for (const top of JavaBlockParser.parse(code).state.blocks.blocks) visit(top);
    return result;
};

export const ZOO = lines(
    "Hund bello = new Hund(\"Bello\", 3);",
    "bello.bellen();",
    "bello.setAlter(bello.getAlter() + 1);",
    "println(bello.getAlter());",
    "ArrayList<Tier> tiere = new ArrayList<Tier>();",
    "tiere.add(bello);",
    "tiere.add(new Tier(\"Katze\"));",
    "for (Tier t : tiere) {",
    "    println(t.beschreibung());",
    "}",
    "tiere.get(0).setName(\"Rex\");",
    "println(tiere.get(0).getName());",
    "Hund[] hunde = new Hund[2];",
    "hunde[0] = bello;",
    "println(hunde[0].getName());",
    "println(summe(new int[]{1, 2, 3}));",
    "",
    "int summe(int[] werte) {",
    "    int s = 0;",
    "    for (int w : werte) {",
    "        s += w;",
    "    }",
    "    return s;",
    "}",
    "",
    "class Tier {",
    "    protected String name;",
    "",
    "    public Tier(String name) {",
    "        this.name = name;",
    "    }",
    "",
    "    public String getName() {",
    "        return name;",
    "    }",
    "",
    "    public void setName(String name) {",
    "        this.name = name;",
    "    }",
    "",
    "    public String beschreibung() {",
    "        return \"Tier \" + name;",
    "    }",
    "}",
    "",
    "class Hund extends Tier {",
    "    private int alter = 0;",
    "",
    "    public Hund(String name, int alter) {",
    "        super(name);",
    "        this.alter = alter;",
    "    }",
    "",
    "    public int getAlter() {",
    "        return alter;",
    "    }",
    "",
    "    public void setAlter(int alter) {",
    "        this.alter = alter;",
    "    }",
    "",
    "    public void bellen() {",
    "        println(name + \" bellt\");",
    "    }",
    "",
    "    // überschreibt die Beschreibung der Oberklasse",
    "    @Override",
    "    public String beschreibung() {",
    "        return \"Hund \" + super.beschreibung();",
    "    }",
    "}",
);

describe("Paket 6: Klassen und Objekte", () => {

    test("Klassen, Objekte, Vererbung: Blöcke, unverändert zurück, läuft", async () => {
        expect(roundTrip(ZOO)).toBe(ZOO);
        expect(rawParts(ZOO)).toEqual(["new int[]{1, 2, 3}"]);   // nur das Reihungs-Literal als Argument bleibt Text
        const t = types(ZOO);
        for (const b of [B.class, B.attribute, B.ctor, B.classMethod, B.superCall, B.superMethodCallExpr, B.thisAttrSet,
            B.objNew, B.objCall, B.objCallExpr, B.method, B.forEach, B.listGet, B.arrayGet]) {
            expect(t.has(b), b).toBe(true);
        }
        const r = await runJava(ZOO);
        expect(r.errors).toEqual([]);
        expect(r.output).toBe(lines("Bello bellt", "4", "Hund Tier Bello", "Tier Katze", "Rex", "Rex", "6"));
    });

    test("Beschreibung der Klassen (für Aufrufe, Typen, andere Dateien)", () => {
        const classes = classInfosFromState(JavaBlockParser.parse(ZOO).state);
        expect(classes.map((c) => c.name)).toEqual(["Tier", "Hund"]);
        const hund = classes[1];
        expect(hund.superName).toBe("Tier");
        expect(hund.attributes).toEqual([{ name: "alter", type: "int", vis: "private" }]);
        expect(hund.constructors).toEqual([{ params: [{ name: "name", type: "String" }, { name: "alter", type: "int" }], vis: "public" }]);
        expect(hund.methods.map((m) => `${m.vis} ${m.ret} ${m.name}(${m.params.length})`))
            .toEqual(["public int getAlter(0)", "public void setAlter(1)", "public void bellen(0)", "public String beschreibung(0)"]);
    });

    test("Klassen aus anderen Dateien: Objekte werden erkannt", () => {
        const other = classInfosFromState(JavaBlockParser.parse(ZOO).state);
        const code = lines("Hund h = new Hund(\"Rex\", 2);", "h.bellen();", "println(h.getName().length());");
        expect(roundTrip(code)).toBe(code);
        const withClasses = JavaBlockGenerator.generate(JavaBlockParser.parse(code, { classes: other }).state).code;
        expect(withClasses).toBe(code);
        const main = JavaBlockParser.parse(code, { classes: other }).state.blocks.blocks[0].inputs!.BODY.block;
        const print = main.next!.block.next!.block;
        expect(print.inputs!.VALUE.block.type).toBe(B.strLength);   // getName() liefert String: .length() wird Textblock
    });

    test("Attribute von Objekten, this, Klasse ohne Sichtbarkeit, öffentliche Klasse", () => {
        const code = lines(
            "Punkt p = new Punkt();",
            "p.x = 3;",
            "println(p.x + p.summe());",
            "",
            "public class Punkt {",
            "    int x;",
            "    int y = 2;",
            "",
            "    int summe() {",
            "        return this.x + y;",
            "    }",
            "",
            "    Punkt selbst() {",
            "        return this;",
            "    }",
            "}",
        );
        expect(roundTrip(code)).toBe(code);
        expect(rawParts(code)).toEqual([]);
        const t = types(code);
        for (const b of [B.objAttrSet, B.objAttrGet, B.thisAttrGet, B.thisValue]) expect(t.has(b), b).toBe(true);
    });

    test("Nicht darstellbares in Klassen bleibt Java-Text", () => {
        const code = lines(
            "class Zaehler implements Comparable<Zaehler> {",
            "    int stand;",
            "}",
            "",
            "class Konto {",
            "    static int anzahl = 0;",
            "    private double stand;",
            "",
            "    public static void info() {",
            "        println(anzahl);",
            "    }",
            "}",
        );
        expect(roundTrip(code)).toBe(code);
        expect(rawParts(code).map((r) => r.split(NL)[0])).toEqual([
            "class Zaehler implements Comparable<Zaehler> {", "static int anzahl = 0;", "public static void info() {",
        ]);
    });
});
