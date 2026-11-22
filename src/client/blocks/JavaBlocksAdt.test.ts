import { describe, expect, test } from "vitest";
// Ladereihenfolge der Compiler-Module wie in der IDE (sonst zyklische Importe)
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import { JavaBlockParser } from "./JavaBlockParser";
import { JavaBlockGenerator } from "./JavaBlockGenerator";
import { B, type BlockState } from "./BlockTypes";
import { runJava } from "./RunJava";

const NL = String.fromCharCode(10);
const lines = (...l: string[]) => l.join(NL) + NL;
const roundTrip = (code: string) => JavaBlockGenerator.generate(JavaBlockParser.parse(code).state).code;
// new BinTree(3) als Wert ist der allgemeine Block "neues Objekt" – sonst kein Java-Text und keine Objekt-Aufrufe
const noJavaText = (code: string) => expect(JSON.stringify(JavaBlockParser.parse(code).state)).not.toMatch(/j_java_(expr|stmt|raw)|j_obj_(call|attr)/);
const types = (code: string) => {
    const result: string[] = [];
    const visit = (b: BlockState | undefined) => {
        for (; b; b = b.next?.block) {
            result.push(b.type);
            for (const i of Object.values(b.inputs ?? {})) visit(i.block);
        }
    };
    for (const top of JavaBlockParser.parse(code).state.blocks.blocks) visit(top);
    return new Set(result);
};

export const ADT = lines(
    "Stack<Integer> stapel = new Stack<>();",
    "stapel.push(3);",
    "stapel.push(7);",
    "int oben = stapel.top();",
    "stapel.pop();",
    "Queue<String> schlange = new Queue<>();",
    "schlange.enqueue(\"Ada\");",
    "schlange.enqueue(\"Bo\");",
    "while (!schlange.isEmpty()) {",
    "    println(schlange.dequeue());",
    "}",
    "BinTree<Integer> baum = new BinTree<>(5);",
    "baum.setLeft(new BinTree<>(3));",
    "baum.setRight(new BinTree<>());",
    "BinTree<Integer> links = baum.getLeft();",
    "if (links.isLeaf() && !baum.isEmpty()) {",
    "    links.setItem(baum.getItem() + oben);",
    "    baum.setEmpty();",
    "}",
    "println(links.getItem());",
    "println(stapel.isEmpty());",
    "println(stapel.top());",
);

/** ältere Programme ohne Inhaltstyp (bis 21.11.2026) */
const ADT_ALT = lines(
    "Stack stapel = new Stack();",
    "stapel.push(3);",
    "stapel.push(7);",
    "int oben = (int) stapel.top();",
    "stapel.pop();",
    "Queue schlange = new Queue();",
    "schlange.enqueue(\"Ada\");",
    "schlange.enqueue(\"Bo\");",
    "while (!schlange.isEmpty()) {",
    "    println((String) schlange.dequeue());",
    "}",
    "BinTree baum = new BinTree(5);",
    "baum.setLeft(new BinTree(3));",
    "baum.setRight(new BinTree());",
    "BinTree links = baum.getLeft();",
    "if (links.isLeaf() && !baum.isEmpty()) {",
    "    links.setItem((int) baum.getItem() + oben);",
    "    baum.setEmpty();",
    "}",
    "println((int) links.getItem());",
    "println(stapel.isEmpty());",
    "println(stapel.top());",
);

describe("ADT: Stapel, Schlange, Binärbaum", () => {
    test("werden Blöcke und wieder dasselbe Java", () => {
        noJavaText(ADT);
        expect(roundTrip(ADT)).toBe(ADT);
        const t = types(ADT);
        for (const b of [B.stackNew, B.stackPush, B.stackGet, B.stackPop, B.queueNew, B.queueEnqueue, B.adtIsEmpty, B.queueGet,
            B.treeNew, B.treeSetChild, B.treeChild, B.treeTest, B.treeSetItem, B.treeItem, B.treeDelete]) {
            expect(t.has(b), b).toBe(true);
        }
    });

    test("ältere Programme ohne Inhaltstyp: die Blöcke ergänzen ihn (aus den Typumwandlungen)", () => {
        expect(roundTrip(ADT_ALT)).toBe(ADT);
        const dyn = lines("DynArray d = new DynArray();", "d.append(\"x\");", "println((String) d.getItem(0));");
        expect(roundTrip(dyn)).toBe(lines("DynArray<String> d = new DynArray<>();", "d.append(\"x\");", "println(d.getItem(0));"));
    });

    test("ohne Inhaltstyp meldet der Compiler einen Fehler", async () => {
        const r = await runJava(ADT_ALT, ["niedersachsen"]);
        expect(r.errors.join(" ")).toContain("Gib den Inhaltstyp an");
        const grundtyp = await runJava("Stack<int> s = new Stack<>();", ["niedersachsen"]);
        expect(grundtyp.errors.join(" ")).toContain("Stack<Integer>");
    });

    test("läuft mit den Abiturklassen", async () => {
        const r = await runJava(ADT, ["niedersachsen"]);
        expect(r.errors).toEqual([]);
        expect(r.output.replace(/\r/g, "").trim().split(NL)).toEqual(["Ada", "Bo", "12", "false", "3"]);
    });

    test("Rekursion mit Binärbaum-Parameter", () => {
        const code = lines(
            "BinTree<Integer> b = new BinTree<>(1);",
            "println(summe(b));",
            "",
            "int summe(BinTree<Integer> t) {",
            "    if (t.isEmpty()) {",
            "        return 0;",
            "    }",
            "    return t.getItem() + summe(t.getLeft()) + summe(t.getRight());",
            "}",
        );
        expect(roundTrip(code)).toBe(code);
        expect(types(code).has(B.treeChild)).toBe(true);
    });
});

describe("ADT im Struktogramm", () => {
    test("Formulierungen der Hinweise, und zurück zu lauffähigem Java", async () => {
        const { diagramsFromJava } = await import("../structogram/StructogramModel");
        const { docFromDiagram } = await import("../structogram/StructogramDoc");
        const { docToJava } = await import("../structogram/PseudoJava");
        const text = JSON.stringify(diagramsFromJava(ADT));
        for (const phrase of ["stapel ← leerer Stapel", "lege 3 auf stapel", "oberstes Element von stapel", "entnimm oberstes Element von stapel",
            "schlange ← leere Schlange", "füge \\\"Ada\\\" zu schlange hinzu", "entnimm erstes Element von schlange",
            "baum ← neuer Binärbaum mit Inhalt 5", "linker Teilbaum von baum", "links ist ein Blatt", "setze Inhalt von links auf",
            "mache baum leer", "stapel ist leer"]) {
            expect(text, phrase).toContain(phrase);
        }
        const tree = lines(
            "BinTree<Integer> baum = new BinTree<>(5);",
            "baum.setLeft(new BinTree<>(3));",
            "BinTree<Integer> links = baum.getLeft();",
            "if (links.isLeaf()) {",
            "    links.setItem(4);",
            "}",
            "baum.setEmpty();",
            "println(baum.isEmpty());",
        );
        const back = docToJava(docFromDiagram(diagramsFromJava(tree)[0]));
        expect(back.code).toBe(tree);
        const r = await runJava(back.code, ["niedersachsen"]);
        expect(r.errors).toEqual([]);
        expect(r.output.trim()).toBe("true");
    });
});
