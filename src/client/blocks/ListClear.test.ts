import { describe, expect, test } from "vitest";
// Ladereihenfolge der Compiler-Module wie in der IDE (sonst zyklische Importe)
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import { JavaBlockParser } from "./JavaBlockParser";
import { JavaBlockGenerator } from "./JavaBlockGenerator";
import { B, type BlockState } from "./BlockTypes";
import { runJava } from "./RunJava";
import { diagramsFromJava } from "../structogram/StructogramModel";
import { docFromDiagram } from "../structogram/StructogramDoc";
import { docToJava } from "../structogram/PseudoJava";

const NL = String.fromCharCode(10);
const lines = (...l: string[]) => l.join(NL) + NL;

const CODE = lines(
    "ArrayList<Integer> zahlen = new ArrayList<Integer>();",
    "zahlen.add(7);",
    "zahlen.add(9);",
    "println(zahlen.size());",
    "zahlen.clear();",
    "println(zahlen.size());",
);

function types(code: string): string[] {
    const result: string[] = [];
    const visit = (b: BlockState | undefined) => {
        for (; b; b = b.next?.block) {
            result.push(b.type);
            for (const i of Object.values(b.inputs ?? {})) visit(i.block);
        }
    };
    for (const top of JavaBlockParser.parse(code).state.blocks.blocks) visit(top);
    return result;
}

describe("Block „entferne alle Elemente aus Liste“ (clear)", () => {
    test("Java -> Blöcke -> Java", async () => {
        expect(types(CODE)).toContain(B.listClear);
        expect(JSON.stringify(JavaBlockParser.parse(CODE).state)).not.toMatch(/j_java_(expr|stmt|raw)/);
        expect(JavaBlockGenerator.generate(JavaBlockParser.parse(CODE).state).code).toBe(CODE);
        expect((await runJava(CODE)).output).toBe("2\n0\n");
    });

    test("Struktogramm: „entferne alle Elemente aus …“ und zurück nach Java", async () => {
        const [main] = diagramsFromJava(CODE);
        const texts = main.body.map((n) => (n.kind === "stmt" ? n.text : ""));
        expect(texts).toContain("entferne alle Elemente aus zahlen");
        const back = docToJava(docFromDiagram(main)).code;
        expect(back).toContain("zahlen.clear();");
        expect((await runJava(back)).output).toBe("2\n0\n");
    });
});
