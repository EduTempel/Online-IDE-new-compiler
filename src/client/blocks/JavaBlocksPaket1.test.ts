import { describe, expect, test } from "vitest";
// Ladereihenfolge der Compiler-Module wie in der IDE (sonst zyklische Importe)
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import { JavaBlockParser } from "./JavaBlockParser";
import { JavaBlockGenerator } from "./JavaBlockGenerator";
import { B, type BlockState } from "./BlockTypes";

const NL = String.fromCharCode(10);
const lines = (...l: string[]) => l.join(NL) + NL;
const roundTrip = (code: string) => JavaBlockGenerator.generate(JavaBlockParser.parse(code).state).code;
const body = (code: string): BlockState[] => {
    const list: BlockState[] = [];
    for (let b = JavaBlockParser.parse(code).state.blocks.blocks[0].inputs?.BODY?.block; b; b = b.next?.block) list.push(b);
    return list;
};
const valueOf = (code: string) => body(code)[0].inputs!.VALUE.block;
const noJavaText = (code: string) => expect(JSON.stringify(JavaBlockParser.parse(code).state)).not.toMatch(/j_java_(expr|stmt|raw)/);

describe("Paket 1: Steuerung", () => {

    test("falls … sonst falls … sonst als ein Block", () => {
        const code = lines(
            "if (x > 10) {",
            "    println(\"groß\");",
            "} else if (x > 5) {",
            "    println(\"mittel\");",
            "} else if (x > 0) {",
            "    println(\"klein\");",
            "} else {",
            "    println(\"null\");",
            "}",
        );
        expect(roundTrip(code)).toBe(code);
        const [b] = body(code);
        expect(b.type).toBe(B.if);
        expect(b.extraState).toEqual({ elseIfs: 2, hasElse: true });
        expect(Object.keys(b.inputs!).sort()).toEqual(["COND", "COND1", "COND2", "DO", "DO1", "DO2", "ELSE"]);
        const simple = lines("if (a) {", "    println(1);", "}");
        expect(roundTrip(simple)).toBe(simple);
        expect(body(simple)[0].extraState).toBeUndefined();
    });

    test("Schleifen: fortlaufend, n-mal (auch geschachtelt), zählen auf- und absteigend", () => {
        const code = lines(
            "while (true) {",
            "    println(1);",
            "}",
            "for (int durchlauf = 1; durchlauf <= 3; durchlauf++) {",
            "    for (int durchlauf2 = 1; durchlauf2 <= 2; durchlauf2++) {",
            "        print(\"*\");",
            "    }",
            "}",
            "for (int i = 1; i <= 10; i++) {",
            "    println(i);",
            "}",
            "for (int i = 0; i < n; i += 2) {",
            "    println(i);",
            "}",
            "for (int k = 10; k >= 0; k--) {",
            "    println(k);",
            "}",
            "for (int k = 100; k > 0; k -= 5) {",
            "    println(k);",
            "}",
        );
        expect(roundTrip(code)).toBe(code);
        noJavaText(code);
        expect(body(code).map((b) => b.type)).toEqual([B.forever, B.repeat, B.for, B.for, B.for, B.for]);
        expect(body(code).slice(2).map((b) => [b.fields!.DIR, b.fields!.CMP])).toEqual([["up", "incl"], ["up", "excl"], ["down", "incl"], ["down", "excl"]]);
        // nicht passende Zählschleifen bleiben Java-Text
        const odd = lines("for (int i = 0; i <= 10; i--) {", "    println(i);", "}");
        expect(roundTrip(odd)).toBe(odd);
        expect(body(odd)[0].type).toBe(B.javaRaw);
    });

    test("warte", () => {
        const code = lines("Thread.sleep(500);", "Thread.sleep(sekunden * 1000);");
        expect(roundTrip(code)).toBe(code);
        expect(body(code).map((b) => b.type)).toEqual([B.wait, B.wait]);
    });
});

describe("Paket 1: Ausgabe und Variablen", () => {

    test("gib aus mit mehreren Werten", () => {
        const code = lines("println(name + \" \" + zahl + \" \" + (a + b));", "println(\"x\" + y);", "print(1 + 2 + \" \" + 3);");
        expect(roundTrip(code)).toBe(code);
        const [three, one, two] = body(code);
        expect(three.extraState).toEqual({ items: 3 });
        expect(Object.keys(three.inputs!)).toEqual(["VALUE", "VALUE1", "VALUE2"]);
        expect(three.inputs!.VALUE2.block.type).toBe(B.arith);
        expect(one.extraState).toBeUndefined();
        expect(two.extraState).toEqual({ items: 2 });
        expect(two.inputs!.VALUE.block.type).toBe(B.arith);
    });

    test("erhöhe/verringere", () => {
        const code = lines("x++;", "x--;", "x += 3;", "x -= 3;");
        expect(roundTrip(code)).toBe(code);
        expect(body(code).map((b) => b.type)).toEqual([B.varInc, B.varDec, B.varChange, B.varSub]);
    });
});

describe("Paket 1: Rechnen (Abitur)", () => {

    test("ganzzahlige Division, Rest, Zufall, Runden, min/max, Typumwandlung", () => {
        const code = lines(
            "int q = a / b;",
            "int r = a % b;",
            "int w = Random.randint(1, 6);",
            "int g = Math.round(x);",
            "double z = Math.random();",
            "int m = Math.max(a, Math.min(b, c));",
            "int i = (int) (Math.random() * 6) + 1;",
            "double d = (double) a / b;",
        );
        expect(roundTrip(code)).toBe(code);
        noJavaText(code);
        expect(valueOf("int i = (int) (Math.random() * 6) + 1;").type).toBe(B.arith);
        expect(valueOf("int i = (int) (Math.random() * 6) + 1;").inputs!.A.block.type).toBe(B.cast);
    });
});

describe("Paket 1: Zeichenketten (Abitur)", () => {

    test("alle geforderten Operationen werden Blöcke", () => {
        const code = lines(
            "int n = s.length();",
            "char c = s.charAt(0);",
            "String t = s.substring(1, 4);",
            "String u = \"Hallo \" + name;",
            "boolean g = a.equals(b);",
            "boolean e = s.contains(\"ab\");",
            "int v = a.compareTo(b);",
            "int code = (int) 'A';",
            "char z = (char) 65;",
            "String gross = s.toUpperCase();",
            "String klein = s.toLowerCase();",
        );
        expect(roundTrip(code)).toBe(code);
        noJavaText(code);
        expect(body(code).map((b) => b.inputs!.VALUE.block.type)).toEqual([
            B.strLength, B.strCharAt, B.strSubstring, B.concat, B.strEquals, B.strContains, B.strCompare,
            B.cast, B.cast, B.strCase, B.strCase,
        ]);
    });

    test("verkettet und mit Klammern", () => {
        const code = lines(
            "int n = (a + b).length();",
            "char c = s.substring(2, 5).charAt(0);",
            "boolean g = s.toUpperCase().equals(\"JA\");",
            "String w = \"Wert: \" + (x + y);",
        );
        expect(roundTrip(code)).toBe(code);
        noJavaText(code);
    });

    test("Unbekanntes bleibt Java-Text", () => {
        const code = lines("int n = s.indexOf(\"x\");", "String t = s.trim();", "int a = feld[3];", "int l = p.x;");
        expect(roundTrip(code)).toBe(code);
        expect(body(code).map((b) => b.inputs!.VALUE.block.type)).toEqual([B.javaExpression, B.javaExpression, B.javaExpression, B.javaExpression]);
    });
});
