import { afterEach, describe, expect, it } from "vitest";
// Ladereihenfolge der Compiler-Module wie in der IDE (sonst zyklische Importe)
import { Interpreter } from "../../compiler/common/interpreter/Interpreter";
import { JavaCompiler } from "../../compiler/java/JavaCompiler";
import { JavaLibraryManager } from "../../compiler/java/runtime/JavaLibraryManager";
import { CompilerFile } from "../../compiler/common/module/CompilerFile";
import { StoreOutputPrintManager } from "../../test/StoreOutputPrintManager";
import { SchedulerState } from "../../compiler/common/interpreter/SchedulerState";
import { Kostueme } from "../../compiler/java/runtime/graphics/GsgBuehnenLogik";
import {
    bildgroesse, eigeneFiguren, eigeneFigurenAus, eigeneFigurenSetzen, eigenerFigurnameFehler, figurNameFuer, kostuemeAus,
} from "../../compiler/java/runtime/graphics/GsgEigeneFiguren";

/** Paket 18i: eigene Figuren aus hochgeladenen Bildern */

const NL = String.fromCharCode(10);
const rahmen = { frame: { x: 0, y: 0, w: 10, h: 10 } };

function tafel(figuren: unknown, frames: string[]) {
    return {
        frames: Object.fromEntries(frames.map((f) => [f, rahmen])),
        meta: { size: { w: 64, h: 64 }, gsgFiguren: figuren as never },
    };
}

const ROBO = {
    name: "EigenRobo", titel: "Robo", kostueme: kostuemeAus([
        { ansicht: "vorne", name: "stehen" },
        { ansicht: "vorne", name: "Springen" },
        { ansicht: "rechts", name: "laufen 1" },
        { ansicht: "rechts", name: "laufen 2" },
    ]),
};

afterEach(() => eigeneFigurenSetzen(undefined));

describe("Eigene Figuren: Namen und Kostüme", () => {
    it("Name der Bildreihe ohne Umlaute und Leerzeichen", () => {
        expect(figurNameFuer("Robo")).toBe("EigenRobo");
        expect(figurNameFuer("große Möwe 2")).toBe("EigenGrosseMoewe2");
    });

    it("Namensfehler: leer, Zeichen, Bibliothek, doppelt", () => {
        expect(eigenerFigurnameFehler("", [])).toMatch(/Namen/);
        expect(eigenerFigurnameFehler("Robo-2", [])).toMatch(/Buchstaben/);
        expect(eigenerFigurnameFehler("Waschbär", [])).toMatch(/Bibliothek/);
        expect(eigenerFigurnameFehler("roter panda", [])).toMatch(/Bibliothek/);
        eigeneFigurenSetzen(tafel([ROBO], ["EigenRobo#0", "EigenRobo#1", "EigenRobo#2", "EigenRobo#3"]));
        expect(eigenerFigurnameFehler("robo", eigeneFiguren())).toMatch(/gibt es schon/);
        expect(eigenerFigurnameFehler("Robo 2", eigeneFiguren())).toBeUndefined();
    });

    it("Kostüme: Pose aus dem Namen, doppelte und leere Namen nummeriert", () => {
        expect(ROBO.kostueme).toEqual([
            { id: "vorne-stehen", titel: "vorne stehen" },
            { id: "vorne-springen", titel: "vorne springen" },
            { id: "rechts-laufen1", titel: "rechts laufen 1" },
            { id: "rechts-laufen2", titel: "rechts laufen 2" },
        ]);
        expect(kostuemeAus([{ ansicht: "vorne", name: "a" }, { ansicht: "vorne", name: "A" }, { ansicht: "links", name: " " }]).map((k) => k.id))
            .toEqual(["vorne-a", "vorne-a_2", "links-kostuem3"]);
    });

    it("Bilder auf Bibliotheksgröße (Seitenverhältnis bleibt)", () => {
        expect(bildgroesse(1100, 1210)).toEqual({ breite: 110, hoehe: 121 });
        expect(bildgroesse(400, 200)).toEqual({ breite: 110, hoehe: 55 });
        expect(bildgroesse(10, 20)).toEqual({ breite: 61, hoehe: 121 });
        expect(bildgroesse(0, 0)).toEqual({ breite: 110, hoehe: 121 });
    });

    it("nur gültige Einträge mit Bildern; Bibliotheksnamen sind tabu", () => {
        const figuren = eigeneFigurenAus(tafel([
            ROBO,
            { name: "Waschbaer", titel: "Waschbär", kostueme: [{ id: "vorne-stehen", titel: "x" }] },
            { name: "Ohne Bild", titel: "x", kostueme: [] },
            { name: "EigenKurz", titel: "Kurz", kostueme: [{ id: "vorne-a", titel: "a" }, { id: "vorne-b", titel: "b" }] },
        ], ["EigenRobo#0", "EigenRobo#1", "EigenRobo#2", "EigenRobo#3", "Waschbaer#0", "EigenKurz#0"]));
        expect(figuren.map((f) => [f.name, f.kostueme.length])).toEqual([["EigenRobo", 4], ["EigenKurz", 1]]);
        expect(eigeneFigurenAus(undefined)).toEqual([]);
    });

    it("Kostueme.fuer findet eigene Figuren; fehlende Ansichten zeigen die Bilder von vorne", () => {
        expect(Kostueme.fuer("Robo")).toBeUndefined();
        eigeneFigurenSetzen(tafel([ROBO], ["EigenRobo#0", "EigenRobo#1", "EigenRobo#2", "EigenRobo#3"]), new Uint8Array(64 * 64 * 4));
        const k = Kostueme.fuer("Robo")!;
        expect(k.figur.name).toBe("EigenRobo");
        expect(Kostueme.fuer("EigenRobo")?.figur.titel).toBe("Robo");
        expect(k.alleTitel()).toEqual(["stehen", "laufen 1", "laufen 2", "springen"]);
        expect(k.bildnummer("vorne", "springen")).toBe(1);
        expect(k.bildnummer("rechts", "laufen2")).toBe(3);
        // von links und hinten gibt es keine Bilder: die von vorne
        expect(k.posenFuer("links")).toEqual(["stehen", "springen"]);
        expect(k.bildnummer("links", "springen")).toBe(1);
        expect(k.naechste("hinten", "springen")).toBe("stehen");
        expect(Kostueme.alleFiguren().map((f) => f.name)).toContain("EigenRobo");
    });
});

async function run(code: string) {
    const file = new CompilerFile();
    file.setText(code);
    const compiler = new JavaCompiler();
    new JavaLibraryManager().addLibrariesToCompiler(compiler);
    compiler.setFiles([<any>file]);
    const executable = await compiler.compileIfDirty();
    expect(executable!.getAllErrors().filter((e) => e.level == "error").map((e) => e.message)).toEqual([]);
    const keyboard = new Proxy({}, { get: () => () => undefined });
    const printManager = new StoreOutputPrintManager();
    const interpreter = new Interpreter(printManager, undefined, undefined, keyboard as never);
    interpreter.setExecutable(executable);
    interpreter.start();
    const ende = Date.now() + 2000;
    while (Date.now() < ende && interpreter.scheduler.state === SchedulerState.running) {
        interpreter.scheduler.runsSynchronously = true;
        try { interpreter.scheduler.run(100); } finally { interpreter.scheduler.runsSynchronously = false; }
        await new Promise((r) => setTimeout(r, 2));
    }
    return printManager.output.split(NL).filter((l) => l !== "");
}

describe("Eigene Figuren im Interpreter", () => {
    it("Figur mit eigenen Kostümen: Kostüm wechseln, Ansicht ohne Bilder", async () => {
        eigeneFigurenSetzen(tafel([ROBO], ["EigenRobo#0", "EigenRobo#1", "EigenRobo#2", "EigenRobo#3"]), new Uint8Array(64 * 64 * 4));
        const out = await run([
            "Robo r = new Robo();",
            "println(r.kostuemName());",
            "r.wechsleZuKostuem(\"springen\");",
            "println(r.kostuemName());",
            "r.gehe(5);",                         // Richtung 90: Ansicht rechts – dort gibt es laufen 1 und 2
            "r.wechsleZuKostuem(\"laufen 1\");",
            "r.naechstesKostuem();",
            "println(r.kostuemName());",
            "class Robo extends Figur {",
            "    Robo() { super(\"Robo\", 0, 0); }",
            "}",
        ].join(NL) + NL);
        expect(out).toEqual(["stehen", "springen", "laufen 2"]);
    });

    it("ohne Bildtafel: verständliche Meldung", async () => {
        const out = await run("try { Figur f = new Figur(\"Robo\"); } catch (Exception e) { println(e.getMessage()); }" + NL);
        expect(out.join(" ")).toMatch(/Eine Figur „Robo“ gibt es nicht/);
    });
});
