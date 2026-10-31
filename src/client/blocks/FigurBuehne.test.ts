import { describe, expect, test } from "vitest";
// Ladereihenfolge der Compiler-Module wie in der IDE (sonst zyklische Importe)
import { Interpreter } from "../../compiler/common/interpreter/Interpreter";
import { JavaCompiler } from "../../compiler/java/JavaCompiler";
import { JavaLibraryManager } from "../../compiler/java/runtime/JavaLibraryManager";
import { CompilerFile } from "../../compiler/common/module/CompilerFile";
import { StoreOutputPrintManager } from "../../test/StoreOutputPrintManager";
import { SchedulerState } from "../../compiler/common/interpreter/SchedulerState";
import {
    abgeprallt, ansichtZurRichtung, eingezaeunt, Kostueme, neuerZustand, richtungNormal, zurGrafik,
} from "../../compiler/java/runtime/graphics/GsgBuehnenLogik";

/** Paket 18c: Laufzeit von Blöckly – Klassen Figur und Buehne */

const NL = String.fromCharCode(10);
const lines = (...l: string[]) => l.join(NL) + NL;
const outputLines = (out: string) => out.split(NL).filter((l) => l !== "");

async function compile(code: string) {
    const file = new CompilerFile();
    file.setText(code);
    const compiler = new JavaCompiler();
    new JavaLibraryManager().addLibrariesToCompiler(compiler);
    compiler.setFiles([<any>file]);
    const executable = await compiler.compileIfDirty();
    const errors = executable!.getAllErrors().filter((e) => e.level == "error").map((e) => e.message);
    expect(errors).toEqual([]);
    const keyboard = new Proxy({}, { get: () => () => undefined });
    const printManager = new StoreOutputPrintManager();
    const interpreter = new Interpreter(printManager, undefined, undefined, keyboard as never);
    interpreter.setExecutable(executable);
    return { interpreter, printManager };
}

/** Programm laufen lassen, bis es fertig ist (oder bis zur Frist) – mit echter Zeit für „warte“ und Klicks */
async function run(code: string, options: { ms?: number; until?: (out: string[]) => boolean; dann?: (i: Interpreter) => void } = {}) {
    const { interpreter, printManager } = await compile(code);
    interpreter.start();
    const scheduler = interpreter.scheduler;
    const ende = Date.now() + (options.ms ?? 2000);
    let dannErledigt = false;
    while (Date.now() < ende && scheduler.state === SchedulerState.running) {
        scheduler.runsSynchronously = true;
        try {
            // „nichts zu tun“ heißt auch: alle Threads warten gerade – weiter, bis das Programm gestoppt ist
            scheduler.run(100);
        } finally {
            scheduler.runsSynchronously = false;
        }
        const out = outputLines(printManager.output);
        if (options.dann && !dannErledigt && options.until?.(out)) {
            dannErledigt = true;
            options.dann(interpreter);
            continue;
        }
        if (!options.dann && options.until?.(out)) break;
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    return { interpreter, out: outputLines(printManager.output) };
}

describe("Rechnungen der Bühne (ohne Grafik)", () => {
    test("Ansicht zur Richtung je Drehstil", () => {
        expect([90, -90, 0, 180, 45, 135, -45, 44, 136].map((d) => ansichtZurRichtung(d, "blickrichtung")))
            .toEqual(["rechts", "links", "hinten", "vorne", "rechts", "rechts", "links", "hinten", "vorne"]);
        expect([0, 90, -1, 180].map((d) => ansichtZurRichtung(d, "links-rechts"))).toEqual(["rechts", "rechts", "links", "rechts"]);
        expect(ansichtZurRichtung(-90, "rundherum")).toBe("rechts");
        expect(ansichtZurRichtung(-90, "nicht drehen")).toBeUndefined();
        expect([270, -270, 540, -180, 180].map(richtungNormal)).toEqual([-90, 90, 180, 180, 180]);
    });

    test("Kostüme: Pose je Ansicht, nächstes Laufbild, Namen", () => {
        const k = Kostueme.fuer("Roter Panda")!;
        expect(k.figur.name).toBe("RoterPanda");
        expect(k.posenFuer("rechts")).toEqual(["stehen", "laufen1", "laufen2", "laufen3", "laufen4"]);
        expect(k.gezeigtePose("vorne", "laufen3")).toBe("laufen1");
        expect(k.gezeigtePose("hinten", "winken")).toBe("stehen");
        expect(k.naechste("rechts", "laufen4")).toBe("laufen1");
        expect(k.naechste("rechts", "stehen")).toBe("laufen1");
        expect(k.naechste("vorne", "winken")).toBe("stehen");
        expect(k.lese("Laufen 2")).toEqual({ pose: "laufen2" });
        expect(k.lese("links laufen 4")).toEqual({ ansicht: "links", pose: "laufen4" });
        expect(k.lese("schwimmen")).toBeUndefined();
        expect(k.alleTitel()).toEqual(["stehen", "laufen 1", "laufen 2", "laufen 3", "laufen 4", "winken"]);
        // Bildnummer = Stelle auf der Bildtafel (0–3 vorne, 4–8 rechts, 9–13 links, 14–16 hinten)
        expect(k.bildnummer("vorne", "stehen")).toBe(0);
        expect(k.bildnummer("rechts", "laufen2")).toBe(6);
        expect(k.bildnummer("hinten", "laufen4")).toBe(16);
    });

    test("Zaun, Abprallen und Umrechnung in die Grafik", () => {
        const z = neuerZustand();
        // höchstens bis auf 15 Punkte aus der Bühne heraus (Figur 110 breit: Mitte bei 240 + 55 - 15)
        expect(eingezaeunt(z, 1000, 0)).toEqual({ x: 280, y: 0 });
        expect(eingezaeunt(z, 0, -1000).y).toBeCloseTo(-180 - 60.5 + 15);
        const amRand = { ...z, x: 230, richtung: 60 };
        const neu = abgeprallt(amRand)!;
        expect(neu.richtung).toBeCloseTo(-60);
        expect(neu.x).toBeCloseTo(240 - 55);
        expect(abgeprallt(z)).toBeUndefined();
        expect(zurGrafik(0, 0)).toEqual({ x: 240, y: 180 });
        expect(zurGrafik(-240, 180)).toEqual({ x: 0, y: 0 });
    });
});

describe("Figur und Bühne im Interpreter", () => {
    test("Bewegung in Scratch-Koordinaten, Kostüm folgt der Blickrichtung", async () => {
        const { out } = await run(lines(
            "Pinguin p = new Pinguin();",
            "println(p.kostuemName() + \" \" + p.richtung());",
            "p.gehe(10);",
            "println(p.xPosition() + \" \" + p.yPosition());",
            "p.zeigeInRichtung(0);",
            "p.gehe(20);",
            "println(p.xPosition() + \" \" + p.yPosition());",
            "p.dreheRechts(270);",
            "println(p.richtung());",
            "p.geheZu(1000, 0);",
            "println(p.xPosition());",
            "p.setzeGroesse(50);",
            "p.aendereGroesseUm(-10);",
            "println(p.groesse());",
            "",
            "class Pinguin extends Figur { }",
        ));
        expect(out).toEqual(["stehen 90", "10 0", "10 20", "-90", "280", "40"]);
    });

    test("Kostüme wechseln: laufen 1 … 4, Ansicht nach Richtung oder selbst gewählt", async () => {
        const { out } = await run(lines(
            "Figur f = new Figur(\"Axolotl\", -100, 50);",
            "f.wechsleZuKostuem(\"laufen 3\");",
            "println(f.kostuemName());",          // vorne gibt es nur laufen 1 und 2
            "f.gehe(1);",                           // Richtung 90: Ansicht rechts
            "println(f.kostuemName());",
            "f.naechstesKostuem();",
            "println(f.kostuemName());",
            "f.naechstesKostuem();",
            "println(f.kostuemName());",
            "f.wechsleZuKostuem(\"vorne winken\");",
            "println(f.kostuemName());",
            "f.naechstesKostuem();",
            "println(f.kostuemName() + \" \" + f.xPosition() + \" \" + f.yPosition());",
        ));
        expect(out).toEqual(["laufen 1", "laufen 3", "laufen 4", "laufen 1", "winken", "stehen -99 50"]);
    });

    test("unbekannte Figur, Kostüm oder Bühnenbild: verständliche Fehlermeldung", async () => {
        const a = await run(lines("Figur f = new Figur(\"Katze\");"));
        expect(a.interpreter.scheduler.state).toBe(SchedulerState.error);
        const b = await run(lines("Figur f = new Figur(\"Roboter\");", "f.wechsleZuKostuem(\"fliegen\");"));
        expect(b.interpreter.scheduler.state).toBe(SchedulerState.error);
        const c = await run(lines("Buehne b = new Buehne(\"Mond\");"));
        expect(c.interpreter.scheduler.state).toBe(SchedulerState.error);
    });

    test("Bühnenbild wechseln, auch von einer Figur aus; nur eine Bühne", async () => {
        const { out, interpreter } = await run(lines(
            "Buehne b = new Buehne(\"Schulhof\");",
            "println(b.buehnenbildName());",
            "b.naechstesBuehnenbild();",
            "println(b.buehnenbildName());",
            "Figur f = new Figur(\"Roboter\");",
            "f.wechsleZuBuehnenbild(\"unterwasser\");",
            "println(b.buehnenbildName());",
            "b.naechstesBuehnenbild();",
            "println(b.buehnenbildName());",
            "Buehne zweite = new Buehne();",
        ));
        expect(out.slice(0, 4)).toEqual(["Schulhof", "Weltraum", "Unterwasser", "Wiese"]);
        expect(interpreter.scheduler.state).toBe(SchedulerState.error);
    });

    test("Programmteile gehören der Figur: @BeimStart in jeder Figur, Attribute je Objekt", async () => {
        const { out } = await run(lines(
            "new Buehne(\"Wiese\");",
            "new Waschbaer();",
            "new Pinguin();",
            "",
            "class Waschbaer extends Figur {",
            "    int schritte = 3;",
            "    @BeimStart",
            "    void los() {",
            "        gehe(schritte);",
            "        println(\"Waschbär bei \" + xPosition());",
            "    }",
            "}",
            "",
            "class Pinguin extends Figur {",
            "    @BeimStart",
            "    void los() {",
            "        zeigeInRichtung(-90);",
            "        gehe(5);",
            "        println(\"Pinguin bei \" + xPosition() + \" schaut \" + kostuemName());",
            "    }",
            "}",
        ));
        expect(out.sort()).toEqual(["Pinguin bei -5 schaut stehen", "Waschbär bei 3"]);
    });

    test("Klone: eigene Kopie der Attribute, @WennIchAlsKlonEntstehe, Nachrichten an alle, lösche diesen Klon", async () => {
        const { out } = await run(lines(
            "new Axolotl();",
            "",
            "class Axolotl extends Figur {",
            "    int nummer = 0;",
            "    @BeimStart",
            "    void los() {",
            "        for (int i = 1; i <= 3; i++) {",
            "            nummer = i;",
            "            erzeugeKlon();",
            "        }",
            "        nummer = 0;",
            "        warte(0.05);",
            "        Nachricht.sendeUndWarte(\"zaehlen\");",
            "        Nachricht.sendeUndWarte(\"weg\");",
            "        println(\"Original fertig\");",
            "    }",
            "    @WennIchAlsKlonEntstehe",
            "    void neu() {",
            "        aendereXUm(nummer * 10);",
            "        println(\"Klon \" + nummer + \" bei \" + xPosition());",
            "    }",
            "    @WennNachricht(\"zaehlen\")",
            "    void zaehlen() {",
            "        println(\"Nummer \" + nummer);",
            "    }",
            "    @WennNachricht(\"weg\")",
            "    void weg() {",
            "        loescheDiesenKlon();",
            "        println(\"bleibt: \" + nummer);",
            "    }",
            "}",
        ), { until: (o) => o.includes("Original fertig") });
        const klone = out.filter((l) => l.startsWith("Klon")).sort();
        expect(klone).toEqual(["Klon 1 bei 10", "Klon 2 bei 20", "Klon 3 bei 30"]);
        expect(out.filter((l) => l.startsWith("Nummer")).sort()).toEqual(["Nummer 0", "Nummer 1", "Nummer 2", "Nummer 3"]);
        // nur das Original überlebt „lösche diesen Klon“
        expect(out.filter((l) => l.startsWith("bleibt"))).toEqual(["bleibt: 0"]);
        expect(out.at(-1)).toBe("Original fertig");
    });

    test("berührt: andere Figur (auch über den Namen der Klasse), Rand; versteckte Figuren berühren nichts", async () => {
        const { out } = await run(lines(
            "Katze k = new Katze();",
            "Figur maus = new Figur(\"Pinguin\", 80, 0);",
            "println(k.beruehrt(maus) + \" \" + k.beruehrt(\"Pinguin\") + \" \" + k.beruehrtRand());",
            "maus.setzeX(200);",
            "println(k.beruehrt(maus) + \" \" + maus.beruehrtRand() + \" \" + k.abstandZu(maus));",
            "maus.setzeX(50);",
            "maus.verstecke();",
            "println(k.beruehrt(maus));",
            "",
            "class Katze extends Figur {",
            "    Katze() {",
            "        super(\"RoterPanda\");",
            "    }",
            "}",
        ));
        expect(out).toEqual(["true true false", "false true 200", "false"]);
    });

    test("pralle vom Rand ab: Figur läuft hin und her und bleibt auf der Bühne", async () => {
        const { out } = await run(lines(
            "Figur f = new Figur(\"Roboter\");",
            "int wenden = 0;",
            "double alt = f.richtung();",
            "for (int i = 0; i < 100; i++) {",
            "    f.gehe(10);",
            "    f.pralleVomRandAb();",
            "    if (f.richtung() != alt) {",
            "        wenden++;",
            "        alt = f.richtung();",
            "    }",
            "}",
            "println(wenden + \" \" + (f.xPosition() >= -185 && f.xPosition() <= 185) + \" \" + f.kostuemName());",
        ));
        const [wenden, aufDerBuehne] = out[0].split(" ");
        expect(Number(wenden)).toBeGreaterThanOrEqual(2);
        expect(aufDerBuehne).toBe("true");
    });

    test("Klick trifft nur die vorderste Figur, sonst die Bühne", async () => {
        const code = lines(
            "new Spiel();",
            "new Waschbaer();",
            "new Pinguin();",       // liegt vor dem Waschbären
            "println(\"bereit\");",
            "",
            "class Spiel extends Buehne {",
            "    @WennAngeklickt",
            "    void klick() { println(\"Bühne\"); }",
            "}",
            "class Waschbaer extends Figur {",
            "    @WennAngeklickt",
            "    void klick() { println(\"Waschbär\"); }",
            "}",
            "class Pinguin extends Figur {",
            "    @WennAngeklickt",
            "    void klick() { println(\"Pinguin\"); }",
            "    @WennTaste(\"ArrowLeft\")",
            "    void links() { gehe(-100); println(\"Pinguin weg\"); }",
            "}",
        );
        const mitte = zurGrafik(0, 0);
        const { out } = await run(code, {
            ms: 1500,
            until: (o) => o.includes("bereit"),
            dann: (i) => {
                i.parts.onClick(mitte.x, mitte.y);        // beide liegen hier: der Pinguin ist vorne
                i.parts.onClick(mitte.x + 200, mitte.y);  // keine Figur: die Bühne
                i.parts.onKey("ArrowLeft");
                setTimeout(() => i.parts.onClick(mitte.x, mitte.y), 100);   // jetzt der Waschbär
            },
        });
        // die drei Skripte laufen gleichzeitig: Reihenfolge der Ausgaben offen
        expect(out[0]).toBe("bereit");
        expect(out.slice(1, 4).sort()).toEqual(["Bühne", "Pinguin", "Pinguin weg"]);
        expect(out.slice(4)).toEqual(["Waschbär"]);
    });

    test("stoppe andere Skripte dieser Figur und stoppe alles", async () => {
        const { out, interpreter } = await run(lines(
            "new Roboter();",
            "",
            "class Roboter extends Figur {",
            "    @BeimStart",
            "    void endlos() {",
            "        while (true) {",
            "            warte(0.01);",
            "        }",
            "    }",
            "    @BeimStart",
            "    void chef() {",
            "        warte(0.05);",
            "        stoppeAndereSkripteDieserFigur();",
            "        println(\"allein\");",
            "        warte(0.05);",
            "        stoppeAlles();",
            "        println(\"nie\");",
            "    }",
            "}",
        ), { ms: 2000 });
        expect(out).toEqual(["allein"]);
        expect(interpreter.parts.runningThreads()).toEqual([]);
    });
});

describe("Bildtakt wie Scratch: Schleifen in Figuren laufen eine Runde je Bild", () => {
    test("wiederhole fortlaufend mit gehe: etwa 30 Runden je Sekunde, nicht millionenfach", async () => {
        const { out } = await run(lines(
            "new Kim();",
            "",
            "class Kim extends Figur {",
            "    int runden = 0;",
            "    @BeimStart",
            "    void laufen() {",
            "        while (true) {",
            "            gehe(1);",
            "            runden++;",
            "        }",
            "    }",
            "    @BeimStart",
            "    void messen() {",
            "        warte(0.5);",
            "        println(runden);",
            "        stoppeAlles();",
            "    }",
            "}",
        ), { ms: 3000 });
        const runden = Number(out[0]);
        expect(runden).toBeGreaterThanOrEqual(5);
        expect(runden).toBeLessThanOrEqual(30);
    });

    test("wiederhole 10 mal (for) und do-while warten ebenso aufs Bild", async () => {
        const start = Date.now();
        const { out } = await run(lines(
            "new Kim();",
            "",
            "class Kim extends Figur {",
            "    @BeimStart",
            "    void los() {",
            "        for (int i = 1; i <= 6; i++) {",
            "            dreheRechts(15);",
            "        }",
            "        int n = 0;",
            "        do {",
            "            gehe(2);",
            "            n++;",
            "        } while (n < 6);",
            "        println(\"fertig\");",
            "    }",
            "}",
        ), { ms: 3000, until: (o) => o.includes("fertig") });
        expect(out).toEqual(["fertig"]);
        // 12 Runden mit Bewegung: mindestens etwa 11 Bilder à 33 ms
        expect(Date.now() - start).toBeGreaterThanOrEqual(300);
    });

    test("Rechenschleifen ohne Sichtbares bleiben schnell – auch nach einer Bewegung", async () => {
        const start = Date.now();
        const { out } = await run(lines(
            "new Kim();",
            "",
            "class Kim extends Figur {",
            "    @BeimStart",
            "    void los() {",
            "        gehe(10);",
            "        long summe = 0;",
            "        for (int i = 0; i < 100000; i++) {",
            "            summe += i;",
            "        }",
            "        println(summe);",
            "    }",
            "}",
        ), { ms: 3000, until: (o) => o.length > 0 });
        expect(out).toEqual(["4999950000"]);
        expect(Date.now() - start).toBeLessThan(1500);
    });

    test("versteckte Figuren brauchen kein Bild – andere Klassen bekommen keinen Takt", async () => {
        const start = Date.now();
        const { out } = await run(lines(
            "new Kim();",
            "",
            "class Kim extends Figur {",
            "    @BeimStart",
            "    void los() {",
            "        verstecke();",
            "        int n = 0;",
            "        while (n < 5000) {",
            "            gehe(1);",
            "            n++;",
            "        }",
            "        println(new Zaehler().zaehle());",
            "    }",
            "}",
            "",
            "class Zaehler {",
            "    int zaehle() {",
            "        int n = 0;",
            "        while (n < 5000) n++;",
            "        return n;",
            "    }",
            "}",
        ), { ms: 3000, until: (o) => o.length > 0 });
        expect(out).toEqual(["5000"]);
        expect(Date.now() - start).toBeLessThan(1500);
    });
});
