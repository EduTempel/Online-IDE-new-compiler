import { describe, expect, it } from "vitest";
import { JavaBlockParser } from "../blocks/JavaBlockParser";
import { JavaBlockGenerator } from "../blocks/JavaBlockGenerator";
import { B, type BlockState } from "../blocks/BlockTypes";

/** Paket 18g: Ein Blöckly-Projekt in Blöckva – Figuren sind Klassen, Skripte Operationen mit Annotation */
const FIGUR = [
    "class Waschbär extends Figur {",
    "",
    "    Waschbär() {",
    "        super(\"Waschbaer\", -100, 0);",
    "    }",
    "",
    "    @BeimStart",
    "    void beimStart() {",
    "        while (true) {",
    "            gehe(10);",
    "            pralleVomRandAb();",
    "        }",
    "    }",
    "",
    "    @WennTaste(\"Leertaste\")",
    "    void wennLeertaste() {",
    "        naechstesKostuem();",
    "    }",
    "",
    "    @WennNachricht(\"los geht's\")",
    "    void wennNachricht() {",
    "        sage(\"Los!\", 2);",
    "    }",
    "",
    "}",
    "",
].join("\n");

function alle(b: BlockState | undefined, out: BlockState[] = []): BlockState[] {
    if (!b) return out;
    out.push(b);
    for (const i of Object.values(b.inputs ?? {})) alle(i.block, out);
    if (b.next) alle(b.next.block, out);
    return out;
}

describe("Brücke Blöckly → Blöckva (Paket 18g)", () => {
    it("Figur als Klasse mit Oberklasse Figur, Skripte als Operationen mit Annotation", () => {
        const { state } = JavaBlockParser.parse(FIGUR);
        const blocks = state.blocks.blocks.flatMap((b) => alle(b));
        const klasse = blocks.find((b) => b.type === B.class)!;
        expect(klasse.fields).toMatchObject({ NAME: "Waschbär", SUPER: "Figur" });
        const ops = blocks.filter((b) => b.type === B.classMethod);
        expect(ops.map((b) => b.extraState?.annotation)).toEqual(["BeimStart", 'WennTaste("Leertaste")', `WennNachricht("los geht's")`]);
        expect(blocks.some((b) => b.type === B.javaRaw)).toBe(false);   // nichts bleibt als Java-Text stehen
        expect(blocks.filter((b) => b.type === B.call).map((b) => b.fields?.NAME)).toEqual(["gehe", "pralleVomRandAb", "naechstesKostuem", "sage"]);
    });

    it("Rückweg: derselbe Java-Text (bis auf Leerzeilen)", () => {
        const ohneLeerzeilen = (t: string) => t.split("\n").filter((z) => z.trim()).join("\n");
        const { state } = JavaBlockParser.parse(FIGUR);
        expect(ohneLeerzeilen(JavaBlockGenerator.generate(state).code)).toBe(ohneLeerzeilen(FIGUR));
    });
});
