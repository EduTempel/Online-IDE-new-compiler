import { expect, test } from "vitest";
import { ohneGesperrte, sperrenAus, sperrenToolbox } from "./BlockFreigaben";

const blk = (type: string, fields?: Record<string, unknown>) => ({ kind: "block", type, ...(fields ? { fields } : {}) });
const label = (text: string) => ({ kind: "label", text });

test("gesperrte Blöcke fehlen; Beschriftungen ohne Blöcke danach auch", () => {
    const items = [label("Schleifen"), blk("j_while"), blk("j_for"), label("Warten"), blk("j_wait"), label("Hinweis")];
    expect(ohneGesperrte(items, ["j_wait"])).toEqual([label("Schleifen"), blk("j_while"), blk("j_for"), label("Hinweis")]);
    expect(ohneGesperrte(items, undefined)).toBe(items);
    // Zeichen gehören zum Schlüssel: nur „*“ gesperrt
    expect(ohneGesperrte([blk("j_arith", { OP: "+" }), blk("j_arith", { OP: "*" })], ["j_arith:*"])).toEqual([blk("j_arith", { OP: "+" })]);
});

test("Werkzeugleiste: Kategorie ohne Blöcke fällt weg, Oberkategorie mit Unterkategorien bleibt, Reihenfolge bleibt", () => {
    const def = {
        kind: "categoryToolbox",
        contents: [
            { kind: "category", toolboxitemid: "steuerung", contents: [blk("j_while"), blk("j_for")] },
            { kind: "category", toolboxitemid: "text", contents: [label("Text"), blk("j_text")] },
            { kind: "category", toolboxitemid: "variablen", contents: [label("Variablen"), { kind: "category", toolboxitemid: "listen", custom: "X" }] },
            { kind: "category", toolboxitemid: "figuren", custom: "GSG_FIGURES" },
        ],
    };
    const r = sperrenToolbox(def, { steuerung: ["j_for"], text: ["j_text"], variablen: ["egal"] });
    expect(r.contents.map((c) => c.toolboxitemid)).toEqual(["steuerung", "variablen", "figuren"]);
    expect(r.contents[0].contents).toEqual([blk("j_while")]);
    expect(r.contents[1]).toEqual(def.contents[2]);
    expect(sperrenToolbox(def, undefined)).toBe(def);
    expect(sperrenAus({ steuerung: ["j_for", 3, ""], leer: [] })).toEqual({ steuerung: ["j_for"] });
    expect(sperrenAus({})).toBeUndefined();
});
