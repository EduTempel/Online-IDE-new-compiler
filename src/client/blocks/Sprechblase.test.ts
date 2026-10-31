import { describe, expect, test } from "vitest";
// Ladereihenfolge der Compiler-Module wie in der IDE (sonst zyklische Importe)
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import { JavaBlockParser } from "./JavaBlockParser";
import { JavaBlockGenerator } from "./JavaBlockGenerator";
import { B, type BlockState } from "./BlockTypes";
import { compileJava } from "./RunJava";
import { diagramsFromJava } from "../structogram/StructogramModel";

/** Paket 17c: Sprechblase „sage …“ */

const NL = String.fromCharCode(10);
const lines = (...l: string[]) => l.join(NL) + NL;
const roundTrip = (code: string) => JavaBlockGenerator.generate(JavaBlockParser.parse(code).state).code;

function blocks(code: string): BlockState[] {
    const result: BlockState[] = [];
    const visit = (b: BlockState | undefined) => {
        for (; b; b = b.next?.block) {
            result.push(b);
            for (const i of Object.values(b.inputs ?? {})) visit(i.block);
        }
    };
    for (const top of JavaBlockParser.parse(code).state.blocks.blocks) visit(top);
    return result;
}

const CODE = lines(
    "Sprite katze = new Sprite(200, 200, SpriteLibrary.Ship_1, 0);",
    "int punkte = 3;",
    "katze.say(\"Hallo!\");",
    "katze.say(\"Ich habe \" + punkte + \" Punkte.\", 2);",
    "katze.say(punkte);",
    "katze.say(\"\");",
);

describe("Paket 17c: sage …", () => {
    test("Java -> Blöcke -> Java ohne Verlust, als echte Blöcke", async () => {
        const all = blocks(CODE);
        expect(JSON.stringify(all)).not.toMatch(/j_java_(expr|stmt|raw)/);
        expect(all.filter((b) => b.type === B.figSay).length).toBe(3);
        expect(all.filter((b) => b.type === B.figSayFor).length).toBe(1);
        expect(roundTrip(CODE)).toBe(CODE);
        expect(await compileJava(CODE)).toEqual([]);
    });

    test("Struktogramm-Texte", () => {
        const [main] = diagramsFromJava(CODE);
        const text = JSON.stringify(main.body);
        expect(text).toContain("katze sagt \\\"Hallo!\\\"");
        expect(text).toContain("für 2 Sekunden");
    });
});
