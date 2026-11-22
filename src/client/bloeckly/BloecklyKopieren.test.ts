import { describe, expect, test } from "vitest";
// Ladereihenfolge der Compiler-Module wie in der IDE (sonst zyklische Importe)
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import { B, type BlockState } from "../blocks/BlockTypes";
import { JavaBlockParser } from "../blocks/JavaBlockParser";
import { kopiere, type KopierQuelle } from "./BloecklyKopieren";
import { buehnenQuelltext, figurQuelltext, liesFigur, variablenDerKlasse } from "./BloecklyProjekt";
import { alleVariablenBloecke, defaultHatName, type BloecklyContext } from "./BloecklySpec";

/** Kopieren nach … (Figur, Bühne) */

const GLOBALS = { punkte: "int" };
const FIGUR: BloecklyContext = { stage: "Spiel", globals: GLOBALS };
const BUEHNE: BloecklyContext = { stage: "Spiel", globals: {} };

const WASCHBAER = [
    "class Waschbär extends Figur {",
    "",
    "    int leben = 3;",
    "",
    "    Waschbär() {",
    "        super(\"Waschbaer\", 0, 0);",
    "    }",
    "",
    "    @BeimStart",
    "    void beimStart() {",
    "        gehe(10);",
    "    }",
    "",
    "    @WennTaste(\"a\")",
    `    void ${defaultHatName(B.blKey, { KEY: "a" })}() {`,
    "        leben -= 1;",
    "        springe(10);",
    "        Spiel.punkte++;",
    "    }",
    "",
    "    @WennNachricht(\"Tor\")",
    "    void beiTor() {",
    "        Spiel.punkte++;",
    "    }",
    "",
    "    void springe(int h) {",
    "        aendereYUm(h);",
    "        hoch();",
    "    }",
    "",
    "    void hoch() {",
    "        aendereYUm(5);",
    "    }",
    "",
    "}",
    "",
].join("\n");

function quelle(typ: string, wo: (b: BlockState) => boolean = () => true): KopierQuelle {
    const oben = JavaBlockParser.parse(WASCHBAER, { bloeckly: FIGUR }).state.blocks.blocks;
    const kopf = oben.find((b) => b.type === B.blFigure)!;
    const vars: BlockState[] = [];
    for (let v = kopf.inputs?.VARS?.block; v; v = v.next?.block) vars.push(v);
    return {
        stapel: oben.find((b) => b.type === typ && wo(b))!,
        eigeneBloecke: oben.filter((b) => b.type === B.method),
        figurVariablen: vars,
    };
}

const pinguin = () => ({ name: "Pinguin", text: figurQuelltext({ klasse: "Pinguin", figur: "Pinguin", x: 50, y: 0 }), ctx: FIGUR, istBuehne: false });
const buehne = () => ({ name: "Bühne", text: buehnenQuelltext("Wald"), ctx: BUEHNE, istBuehne: true });

describe("Blocks: Kopieren nach …", () => {
    test("Skript in eine andere Figur: mit Variable der Figur und den aufgerufenen eigenen Blöcken", () => {
        const r = kopiere(quelle(B.blKey), pinguin());
        if (!("text" in r)) throw new Error(r.fehler);
        expect(r.text).toContain("int leben = 3;");
        expect(r.text).toContain("@WennTaste(\"a\")");
        expect(r.text).toContain("Spiel.punkte++;");
        expect(r.text).toContain("void springe(int h)");
        expect(r.text).toContain("void hoch()");
        expect(r.mit).toEqual(["eigener Block „springe“", "eigener Block „hoch“", "Variable „leben“"]);
        expect(liesFigur(r.text)).toMatchObject({ klasse: "Pinguin", figur: "Pinguin", x: 50 });
        expect(variablenDerKlasse(r.text, FIGUR)).toEqual({ leben: "int" });
        // noch einmal: Variable und eigene Blöcke gibt es schon, das Skript kommt ein zweites Mal
        const r2 = kopiere(quelle(B.blKey), { ...pinguin(), text: r.text });
        if (!("text" in r2)) throw new Error(r2.fehler);
        expect(r2.mit).toEqual([]);
        expect(r2.text.match(/int leben/g)).toHaveLength(1);
        expect(r2.text.match(/@WennTaste/g)).toHaveLength(2);
    });

    test("eigener Block allein; gibt es ihn schon, kommt ein Hinweis", () => {
        const r = kopiere(quelle(B.method, (b) => b.fields?.NAME === "springe"), pinguin());
        if (!("text" in r)) throw new Error(r.fehler);
        expect(r.text).toContain("void springe(int h)");
        expect(r.mit).toEqual(["eigener Block „hoch“"]);
        const r2 = kopiere(quelle(B.method, (b) => b.fields?.NAME === "springe"), { ...pinguin(), text: r.text });
        expect(r2).toEqual({ fehler: "Pinguin hat schon einen eigenen Block „springe“." });
    });

    test("auf die Bühne: Variablen für alle ohne Spiel., nichts, was es nur bei Figuren gibt", () => {
        const r = kopiere(quelle(B.blMsg), buehne());
        if (!("text" in r)) throw new Error(r.fehler);
        expect(r.text).toContain("@WennNachricht(\"Tor\")");
        expect(r.text).toMatch(/\n\s+punkte\+\+;/);
        const r2 = kopiere(quelle(B.blKey), buehne());
        expect("fehler" in r2 && r2.fehler).toMatch(/^Die Bühne kann das nicht: .*„.*“ gibt es nur bei Figuren\.$/);
    });

    test("Variablen oben im Skript kommen mit – außer das Ziel hat sie schon; mitgebrachte stehen oben im Skript", () => {
        const text = WASCHBAER.replace("    @WennNachricht(\"Tor\")\n    void beiTor() {\n", "    int tore = 0;\n    @WennNachricht(\"Tor\")\n    void beiTor() {\n        tore++;\n        leben++;\n");
        const oben = JavaBlockParser.parse(text, { bloeckly: FIGUR }).state.blocks.blocks;
        const q: KopierQuelle = { stapel: oben.find((b) => b.type === B.blMsg)!, eigeneBloecke: [], figurVariablen: alleVariablenBloecke(oben) };
        const r = kopiere(q, pinguin());
        if (!("text" in r)) throw new Error(r.fehler);
        expect(r.mit).toEqual(["Variable „leben“"]);
        expect(r.text).toContain("    int tore = 0;\n    int leben = 3;\n    @WennNachricht(\"Tor\")");
        // zweites Mal: beide gibt es schon
        const r2 = kopiere(q, { ...pinguin(), text: r.text });
        if (!("text" in r2)) throw new Error(r2.fehler);
        expect(r2.text.match(/int tore/g)).toHaveLength(1);
        expect(r2.text.match(/int leben/g)).toHaveLength(1);
        // auf die Bühne nicht: dort gälten sie für alle Figuren
        const r3 = kopiere(q, buehne());
        expect("fehler" in r3 && r3.fehler).toMatch(/Variablen nur für diese Figur \(„tore“, „leben“\)/);
    });

    test("„Wenn 🚩 angeklickt“ und lose Blöcke: als lose Blöcke (die Oberfläche öffnet die Figur)", () => {
        expect(kopiere(quelle(B.blFlag), pinguin())).toEqual({ fehler: "flagge", lose: true });
        const flagge = quelle(B.blFlag);
        expect(kopiere({ ...flagge, stapel: flagge.stapel.inputs!.BODY.block }, pinguin())).toEqual({ fehler: "lose", lose: true });
    });
});
