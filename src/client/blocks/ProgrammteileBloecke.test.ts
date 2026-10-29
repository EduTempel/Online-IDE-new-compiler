import { describe, expect, test } from "vitest";
// Ladereihenfolge der Compiler-Module wie in der IDE (sonst zyklische Importe)
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import { JavaBlockParser } from "./JavaBlockParser";
import { JavaBlockGenerator } from "./JavaBlockGenerator";
import { B, type BlockState } from "./BlockTypes";
import { compileJava } from "./RunJava";
import { diagramsFromJava } from "../structogram/StructogramModel";
import { docToJava } from "../structogram/PseudoJava";

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
    "Circle ball = new Circle(400, 300, 30);",
    "Text anzeige = new Text(20, 20, 30, \"0\");",
    "int tore = 0;",
    "Nachricht.sendeUndWarte(\"Anpfiff\");",
    "",
    "@WennAngeklickt(\"ball\")",
    "void ballAngeklickt() {",
    "    tore++;",
    "    Nachricht.sende(\"Tor!\");",
    "}",
    "",
    "@WennNachricht(\"Tor!\")",
    "void beiTor() {",
    "    anzeige.setText(\"\" + tore);",
    "}",
    "",
    "@WennNachricht(\"Anpfiff\")",
    "void beiAnpfiff() {",
    "    println(\"Los geht's\");",
    "}",
    "",
    "@BeimStart",
    "void blinken() {",
    "    while (true) {",
    "        ball.setVisible(false);",
    "        Thread.sleep(300);",
    "        ball.setVisible(true);",
    "        Thread.sleep(300);",
    "    }",
    "}",
);

describe("Paket 15c/15d: Nachrichten, wenn angeklickt, wenn das Programm startet", () => {
    test("Java -> Blöcke -> Java ohne Verlust, alles als echte Blöcke", async () => {
        const all = blocks(CODE);
        expect(JSON.stringify(all)).not.toMatch(/j_java_(expr|stmt|raw)/);
        const top = JavaBlockParser.parse(CODE).state.blocks.blocks;
        expect(top.map((b) => b.type)).toEqual([B.start, B.clickStart, B.msgStart, B.msgStart, B.progStart]);
        expect(top[1].fields).toEqual({ FIG: "ball", NAME: "ballAngeklickt" });
        expect(top[2].fields).toEqual({ MSG: "Tor!", NAME: "beiTor" });
        expect(top[4].fields).toEqual({ NAME: "blinken" });
        expect(all.filter((b) => b.type === B.msgSend).map((b) => b.fields?.MSG)).toEqual(["Tor!"]);
        expect(all.filter((b) => b.type === B.msgSendWait).map((b) => b.fields?.MSG)).toEqual(["Anpfiff"]);
        expect(roundTrip(CODE)).toBe(CODE);
        expect(await compileJava(CODE)).toEqual([]);
    });

    test("Struktogramm: je Programmteil ein Diagramm, Nachrichten als Anweisung (auch zurück nach Java)", () => {
        const diagrams = diagramsFromJava(CODE);
        expect(diagrams.map((d) => d.title)).toEqual([
            "Hauptprogramm",
            "wenn ball angeklickt wird: ballAngeklickt",
            "wenn ich Nachricht „Tor!“ empfange: beiTor",
            "wenn ich Nachricht „Anpfiff“ empfange: beiAnpfiff",
            "wenn das Programm startet: blinken",
        ]);
        expect(JSON.stringify(diagrams[0].body)).toContain("sende Nachricht „Anpfiff“ und warte");
        expect(JSON.stringify(diagrams[1].body)).toContain("sende Nachricht „Tor!“");
        const doc = { title: "Hauptprogramm", body: [
            { id: "a", kind: "stmt", text: "sende Nachricht „Tor!“" },
            { id: "b", kind: "stmt", text: "sende Nachricht „los“ und warte" },
        ] };
        expect(docToJava(doc as never).code).toBe(lines("Nachricht.sende(\"Tor!\");", "Nachricht.sendeUndWarte(\"los\");"));
    });

    test("ungewöhnliche Programmteile werden keine Hut-Blöcke", () => {
        // Parameter oder Ergebnis: kein Programmteil; Klick auf etwas, das kein Name ist
        const code = lines(
            "@WennNachricht(\"x\")",
            "int zahl() {",
            "    return 1;",
            "}",
            "",
            "@WennAngeklickt(\"kein Name\")",
            "void klick() {",
            "}",
        );
        const types = JavaBlockParser.parse(code).state.blocks.blocks.map((b) => b.type);
        expect(types).not.toContain(B.msgStart);
        expect(types).not.toContain(B.clickStart);
    });
});
