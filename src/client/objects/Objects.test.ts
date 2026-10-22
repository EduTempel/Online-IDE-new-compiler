import { afterEach, describe, expect, it } from "vitest";
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import { Thread } from "../../compiler/common/interpreter/Thread";
import { runJava } from "../blocks/RunJava";
import { buildSnapshot, levels, objectNames, type HeapSnapshot, type RootVariable } from "./HeapSnapshot";
import { renderObjectDiagram } from "./ObjectDiagram";

/** Laufzeitwerte an der Stelle von trace() (wie beim Anhalten im Debugger) */
async function rootsAt(code: string, libraries: string[] = []): Promise<RootVariable[]> {
    let roots: RootVariable[] = [];
    Thread.gsgTraceListener = (_t, _line, _c, names, values, self) => {
        roots = names.map((n, i) => ({ name: n, value: values[i] }));
        if (self) roots.push({ name: "this", value: self });
    };
    const r = await runJava(code, libraries);
    expect(r.errors).toEqual([]);
    return roots;
}

afterEach(() => { Thread.gsgTraceListener = undefined; });

const KONTO = `Konto k1 = new Konto("Ada", 60);
Konto k2 = new Konto("Bo", 10);
Konto k3 = k1;
k2.partner = k1;
k1.partner = k2;
int n = 3;
trace();
class Konto {
    String inhaber;
    int stand;
    Konto partner;
    Konto(String inhaber, int stand) { this.inhaber = inhaber; this.stand = stand; }
}`;

describe("Objektdiagramm (Paket 9)", () => {
    it("Objekte mit Identität, Attributen und Verweisen", async () => {
        const s = buildSnapshot(await rootsAt(KONTO));
        expect(s.vars.map((v) => v.name)).toEqual(["k1", "k2", "k3", "n"]);
        expect(s.nodes.length).toBe(2);   // k3 zeigt auf dasselbe Objekt wie k1
        const [a, b] = s.nodes;
        expect(s.vars[0].value).toEqual({ kind: "ref", id: a.id });
        expect(s.vars[2].value).toEqual({ kind: "ref", id: a.id });
        expect(s.vars[3].value).toEqual({ kind: "prim", text: "3" });
        expect(a.cls).toBe("Konto");
        expect(a.slots).toEqual([
            { name: "inhaber", value: { kind: "prim", text: "\"Ada\"" } },
            { name: "stand", value: { kind: "prim", text: "60" } },
            { name: "partner", value: { kind: "ref", id: b.id } },
        ]);
        expect(b.slots[2].value).toEqual({ kind: "ref", id: a.id });   // Zyklus
        expect(objectNames(s).get(a.id)).toBe("k1");
        expect(levels(s).get(b.id)).toBe(1);
    });

    it("Reihungen, Listen, null und Kommazahlen", async () => {
        const s = buildSnapshot(await rootsAt(`int[] zahlen = {3, 9, 2};
double[] werte = new double[2];
ArrayList<String> namen = new ArrayList<>();
namen.add("Ada");
String leer = null;
trace();`));
        const byName = (n: string) => s.nodes.find((x) => x.id === (s.vars.find((v) => v.name === n)!.value as { id: number }).id)!;
        expect(byName("zahlen").kind).toBe("array");
        expect(byName("zahlen").slots.map((x) => x.value)).toEqual([3, 9, 2].map((v) => ({ kind: "prim", text: String(v) })));
        expect(byName("werte").cls).toMatch(/\[\]$/);   // ohne Typangabe geraten; im Debugger kommt der Typ mit
        expect(byName("namen").kind).toBe("list");
        expect(byName("namen").slots[0].value).toEqual({ kind: "prim", text: "\"Ada\"" });
        expect(s.vars.find((v) => v.name === "leer")!.value).toEqual({ kind: "null" });
    });

    it("Kommazahlen mit Typangabe", () => {
        const s = buildSnapshot([{ name: "x", value: 3, type: "double" }, { name: "c", value: 65, type: "char" }, { name: "t", value: "A", type: "char" }]);
        expect(s.vars.map((v) => v.value)).toEqual([{ kind: "prim", text: "3.0" }, { kind: "prim", text: "'A'" }, { kind: "prim", text: "'A'" }]);
    });

    it("zeichnet ein SVG mit Kästen, Namen und Pfeilen", async () => {
        const s: HeapSnapshot = buildSnapshot(await rootsAt(KONTO));
        const { svg, width, height } = renderObjectDiagram(s, (t) => t.length * 8);
        expect(width).toBeGreaterThan(200);
        expect(height).toBeGreaterThan(50);
        expect(svg).toContain("k1 : Konto");
        expect(svg).toContain(" : Konto");
        expect(svg).toContain("n = 3");
        expect(svg).toContain("stand = 60");
        expect((svg.match(/class="gsg-od-arrow"/g) ?? []).length).toBe(5);   // k1, k2, k3, zwei partner
    });

    it("begrenzt große Datenmengen", async () => {
        const s = buildSnapshot(await rootsAt(`int[] viele = new int[100];
trace();`));
        expect(s.nodes[0].slots.length).toBe(12);
        expect(s.nodes[0].more).toBe(88);
    });
});
