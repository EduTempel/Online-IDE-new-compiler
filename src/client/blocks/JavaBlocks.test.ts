import { describe, expect, test } from "vitest";
// Ladereihenfolge der Compiler-Module wie in der IDE (sonst zyklische Importe)
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import { JavaBlockParser } from "./JavaBlockParser";
import { JavaBlockGenerator } from "./JavaBlockGenerator";
import { B, type BlockState } from "./BlockTypes";

const toBlocks = (code: string) => JavaBlockParser.parse(code);
const roundTrip = (code: string) => JavaBlockGenerator.generate(toBlocks(code).state).code;

/** Kette der Anweisungen am Programmstart als Liste */
function body(code: string): BlockState[] {
    const start = toBlocks(code).state.blocks.blocks[0];
    const list: BlockState[] = [];
    for (let b = start.inputs?.BODY?.block; b; b = b.next?.block) list.push(b);
    return list;
}

describe("Java -> Blöcke -> Java", () => {

    test("Grundlagen werden zu Blöcken und unverändert zurückgeschrieben", () => {
        const code = [
            "// Countdown",
            "int zahl = Input.readInt(\"Startwert?\");",
            "String name = \"Welt\";",
            "while (zahl > 0) {",
            "    println(zahl + \" \" + name);",
            "    zahl = zahl - 1;",
            "}",
            "for (int i = 0; i < 10; i++) {",
            "    if (i % 2 == 0 && !(i > 3)) {",
            "        print(\"x\");",
            "    } else if (i == 3) {",
            "        println();",
            "    } else {",
            "        zahl += Random.randint(1, 6);",
            "    }",
            "}",
            "double d = Math.sqrt(2.0) * -3;",
            "boolean fertig = true;",
            "zahl++;",
            "zahl--;",
            "",
        ].join("\n");
        expect(roundTrip(code)).toBe(code);
        expect(body(code).map((b) => b.type)).toEqual([
            B.comment, B.varDeclare, B.varDeclare, B.while, B.for, B.varDeclare, B.varDeclare, B.varInc, B.varDec,
        ]);
        // keine Java-Text-Blöcke nötig
        expect(JSON.stringify(toBlocks(code).state)).not.toContain(B.javaExpression);
    });

    test("Nicht darstellbares bleibt als unveränderter Java-Text erhalten", () => {
        const code = [
            "System.out.println(\"Hallo\");",
            "int[] feld = {1, 2, 3};",
            "double z = Math.random() * 6;",
            "char c = 'a';",
            "x = y > 0 ? 1 : 2;",
            "/* mehrzeiliger",
            "   Kommentar */",
            "class Kreis {",
            "    double r;",
            "    double flaeche() {",
            "        return Math.PI * r * r;",
            "    }",
            "}",
            "do {",
            "    x--;",
            "} while (x > 0);",
            "",
        ].join("\n");
        expect(roundTrip(code)).toBe(code);
        const types = body(code).map((b) => b.type);
        expect(types).toEqual([B.javaStatement, B.javaStatement, B.varDeclare, B.varDeclare, B.varSet, B.javaRaw, B.javaRaw, B.javaRaw]);
        const z = body(code)[2];
        expect(z.inputs!.VALUE.block.type).toBe(B.arith);
        expect(z.inputs!.VALUE.block.inputs!.A.block).toMatchObject({ type: B.randomDouble });
    });

    test("Klammern nur wo nötig; Formatierung wird vereinheitlicht", () => {
        expect(roundTrip("int a = (1 + 2) * 3;\n")).toBe("int a = (1 + 2) * 3;\n");
        expect(roundTrip("int a = 1 - (2 - 3);\n")).toBe("int a = 1 - (2 - 3);\n");
        expect(roundTrip("int a = (1 - 2) - 3;\n")).toBe("int a = 1 - 2 - 3;\n");
        expect(roundTrip("String s = \"a\" + (1 + 2);\n")).toBe("String s = \"a\" + (1 + 2);\n");
        expect(roundTrip("int a=1+2;\nif(a>2)println(a);\n")).toBe("int a = 1 + 2;\nif (a > 2) {\n    println(a);\n}\n");
        expect(roundTrip("boolean b = !(a && c) || d;\n")).toBe("boolean b = !(a && c) || d;\n");
    });

    test("Zeichenketten mit Sonderzeichen", () => {
        const code = "println(\"Sie sagte \\\"Hallo\\\"\\n\\tund ging.\\\\\");\n";
        expect(roundTrip(code)).toBe(code);
        expect(body(code)[0].inputs!.VALUE.block.fields!.TEXT).toBe("Sie sagte \"Hallo\"\n\tund ging.\\");
    });

    test("Zeichen (char)", () => {
        const code = [String.raw`char a = 'x';`, String.raw`char b = '\'';`, String.raw`char c = '\n';`, String.raw`char d = '\\';`, ""].join("\n");
        expect(roundTrip(code)).toBe(code);
        expect(body(code).map((b) => b.inputs!.VALUE.block.type)).toEqual([B.char, B.char, B.char, B.char]);
        expect(body(code).map((b) => b.inputs!.VALUE.block.fields!.CHAR)).toEqual(["x", "'", "\n", "\\"]);
    });

    test("Kommentare in Ausdrücken: ganze Anweisung bleibt Text", () => {
        const code = "int x = 5 /* fünf */ + 1;\nif (x > 1 /* groß */) {\n    println(x);\n}\n";
        expect(roundTrip(code)).toBe(code);
        expect(body(code).map((b) => b.type)).toEqual([B.javaStatement, B.javaRaw]);
    });

    test("Fehlerhafter Code geht nicht verloren", () => {
        for (const code of ["while (x > 0 {\n    x--;\n}\n", "if (a) {\n    println(1);\n", "println(\"offen);\n", "}\nint x = 1;\n", "int = 5;\n"]) {
            const out = roundTrip(code);
            expect(out.replace(/\s+/g, "")).toBe(code.replace(/\s+/g, ""));
        }
    });

    test("Erzeugter Code ist stabil (nochmals umwandeln ändert nichts)", () => {
        const samples = [
            "int a=1;while(a<10){a=a*2;if(a==4)println(a);else{print(a);}}\n",
            "for (int k = 1; k <= 5; k++) println(k * k);\n",
            "String s = Input.readString(\"Name\");\nprintln(\"Hallo \" + s + \"!\");\n",
        ];
        for (const s of samples) {
            const once = roundTrip(s);
            expect(roundTrip(once)).toBe(once);
        }
    });

    test("Zeilen der Blöcke (für Fehler und Programmzeiger)", () => {
        const code = "int a = 1;\nwhile (a < 5) {\n    a++;\n}\n";
        const { ranges } = toBlocks(code);
        const gen = JavaBlockGenerator.generate(toBlocks(code).state);
        const lines = (r: { startLine: number; endLine: number }[]) => r.map((x) => [x.startLine, x.endLine]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
        expect(lines(ranges)).toEqual([[1, 1], [2, 4], [3, 3]]);
        expect(lines(gen.ranges)).toEqual([[1, 1], [2, 4], [3, 3]]);
    });
});
