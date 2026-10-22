import { describe, expect, test } from "vitest";
// Ladereihenfolge der Compiler-Module wie in der IDE (sonst zyklische Importe)
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import { JavaBlockParser } from "./JavaBlockParser";
import { JavaBlockGenerator } from "./JavaBlockGenerator";
import { B } from "./BlockTypes";
import { runJava } from "./RunJava";

const NL = String.fromCharCode(10);
const lines = (...l: string[]) => l.join(NL) + NL;
const roundTrip = (code: string) => JavaBlockGenerator.generate(JavaBlockParser.parse(code).state).code;
const tops = (code: string) => JavaBlockParser.parse(code).state.blocks.blocks;
const noJavaText = (code: string) => expect(JSON.stringify(JavaBlockParser.parse(code).state)).not.toMatch(/j_java_(expr|stmt|raw)/);

const PROGRAM = lines(
    "int n = quadrat(4);",
    "println(n);",
    "begruesse(\"Ada\", 2);",
    "println(istGerade(n) + \" \" + mittelwert(3, 4.5));",
    "",
    "int quadrat(int x) {",
    "    return x * x;",
    "}",
    "",
    "void begruesse(String name, int anzahl) {",
    "    for (int durchlauf = 1; durchlauf <= anzahl; durchlauf++) {",
    "        println(\"Hallo \" + name);",
    "    }",
    "}",
    "",
    "boolean istGerade(int zahl) {",
    "    if (zahl % 2 == 0) {",
    "        return true;",
    "    }",
    "    return false;",
    "}",
    "",
    "double mittelwert(double a, double b) {",
    "    return (a + b) / 2;",
    "}",
);

describe("Paket 4: Operationen", () => {

    test("Operationen, Aufrufe und gib zurück werden Blöcke und unverändert zurückgeschrieben", () => {
        expect(roundTrip(PROGRAM)).toBe(PROGRAM);
        noJavaText(PROGRAM);
        const blocks = tops(PROGRAM);
        expect(blocks.map((b) => b.type)).toEqual([B.start, B.method, B.method, B.method, B.method]);
        const begruesse = blocks[2];
        expect(begruesse.fields).toMatchObject({ NAME: "begruesse", RETURN: "void", PNAME0: "name", PTYPE0: "String", PNAME1: "anzahl", PTYPE1: "int" });
        expect(begruesse.extraState).toEqual({ params: [{ name: "name", type: "String" }, { name: "anzahl", type: "int" }] });
        const main = blocks[0].inputs!.BODY.block;
        expect(main.inputs!.VALUE.block.type).toBe(B.callExpr);
        const call = main.next!.block.next!.block;
        expect(call.type).toBe(B.call);
        expect(call.extraState).toEqual({ args: 2 });
        expect(blocks[1].inputs!.BODY.block.type).toBe(B.return);
    });

    test("der erzeugte Code läuft", async () => {
        const result = await runJava(roundTrip(PROGRAM));
        expect(result.errors).toEqual([]);
        expect(result.output).toBe(lines("16", "Hallo Ada", "Hallo Ada", "true 3.75"));
    });

    test("Operationen vor dem Hauptprogramm: danach steht das Hauptprogramm oben, Ergebnis gleich", async () => {
        const code = lines(
            "void linie(int laenge) {",
            "    for (int durchlauf = 1; durchlauf <= laenge; durchlauf++) {",
            "        print(\"-\");",
            "    }",
            "    println(\"|\");",
            "    return;",
            "}",
            "linie(3);",
            "linie(5);",
        );
        const generated = roundTrip(code);
        expect(generated).toBe(lines(
            "linie(3);",
            "linie(5);",
            "",
            "void linie(int laenge) {",
            "    for (int durchlauf = 1; durchlauf <= laenge; durchlauf++) {",
            "        print(\"-\");",
            "    }",
            "    println(\"|\");",
            "    return;",
            "}",
        ));
        expect(roundTrip(generated)).toBe(generated);
        const before = await runJava(code), after = await runJava(generated);
        expect(after.errors).toEqual([]);
        expect(after.output).toBe(before.output);
        expect(after.output).toBe(lines("---|", "-----|"));
    });

    test("Operation ohne Parameter, leeres Hauptprogramm, Aufruf ohne Werte", () => {
        const code = lines("void hallo() {", "    println(\"Hallo\");", "}");
        expect(roundTrip(code)).toBe(code);
        expect(tops(code)[1].extraState).toBeUndefined();
        const calls = lines("hallo();", "int z = zufall();");
        expect(roundTrip(calls)).toBe(calls);
        noJavaText(calls);
    });

    test("Nicht darstellbares bleibt Java-Text", () => {
        const code = lines(
            "summe(new int[]{1, 2});",
            "",
            "public static int summe(int[] werte) {",
            "    return werte.length;",
            "}",
            "interface Form {",
            "    double flaeche();",
            "}",
        );
        expect(roundTrip(code).replace(/\n\n/g, NL)).toBe(code.replace(/\n\n/g, NL));
        expect(tops(code).map((b) => b.type)).toEqual([B.start]);   // alles im Hauptprogramm als Java-Text
    });

    test("Zeilen der Operationen und ihrer Blöcke", () => {
        const { ranges, state } = JavaBlockParser.parse(PROGRAM);
        const quadrat = state.blocks.blocks[1];
        expect(ranges.find((r) => r.id === quadrat.id)).toMatchObject({ startLine: 6, endLine: 8 });
        const generated = JavaBlockGenerator.generate(state);
        expect(generated.ranges.find((r) => r.id === quadrat.id)).toMatchObject({ startLine: 6, endLine: 8 });
        expect(generated.ranges.find((r) => r.id === quadrat.inputs!.BODY.block.id)).toMatchObject({ startLine: 7, endLine: 7 });
    });
});
