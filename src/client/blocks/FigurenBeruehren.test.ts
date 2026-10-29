import { describe, expect, test } from "vitest";
// Ladereihenfolge der Compiler-Module wie in der IDE (sonst zyklische Importe)
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import { JavaBlockParser } from "./JavaBlockParser";
import { JavaBlockGenerator } from "./JavaBlockGenerator";
import { B, type BlockState } from "./BlockTypes";
import { ANY_TARGET, EDGE_TARGET } from "./FigureSpec";
import { compileJava } from "./RunJava";
import { diagramsFromJava } from "../structogram/StructogramModel";

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
    "Circle ball = new Circle(400, 300, 20);",
    "Rectangle tor = new Rectangle(760, 0, 40, 600);",
    "tor.setFillColor(\"green\");",
    "int abpraller = 0;",
    "while (!ball.collidesWithFillColor(\"green\")) {",
    "    ball.forward(6);",
    "    if (ball.touchesEdge()) {",
    "        abpraller++;",
    "    }",
    "    if (ball.collidesWithAnyShape() || ball.collidesWith(tor)) {",
    "        ball.setFillColor(\"red\");",
    "    }",
    "    ball.bounceOffEdge();",
    "    Thread.sleep(20);",
    "}",
);

describe("Paket 15b: berührt Rand / irgendeine Figur / Farbe, pralle vom Rand ab", () => {
    test("Java -> Blöcke -> Java ohne Verlust, alles als echte Blöcke", async () => {
        const all = blocks(CODE);
        expect(JSON.stringify(all)).not.toMatch(/j_java_(expr|stmt|raw)/);
        const touches = all.filter((b) => b.type === B.figTouches).map((b) => b.fields?.OTHER);
        expect(touches).toEqual([EDGE_TARGET, ANY_TARGET, "tor"]);
        expect(all.find((b) => b.type === B.figTouchesColor)?.fields).toEqual({ NAME: "ball", COLOR: "green" });
        expect(all.some((b) => b.type === B.figBounce && b.fields?.NAME === "ball")).toBe(true);
        expect(roundTrip(CODE)).toBe(CODE);
        expect(await compileJava(CODE)).toEqual([]);
    });

    test("Struktogramm-Texte", () => {
        const [main] = diagramsFromJava(CODE);
        const text = JSON.stringify(main.body);
        expect(text).toContain("ball berührt Farbe grün");
        expect(text).toContain("ball berührt den Rand");
        expect(text).toContain("ball berührt irgendeine Figur");
        expect(text).toContain("pralle mit ball vom Rand ab");
    });

    test("zufällige Farbe ist bei „berührt Farbe“ kein Block", () => {
        const code = lines(
            "Circle ball = new Circle(400, 300, 20);",
            "boolean b = ball.collidesWithFillColor(Color.randomColor());",
        );
        expect(blocks(code).some((b) => b.type === B.figTouchesColor)).toBe(false);
    });
});
