import { describe, expect, test } from "vitest";
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import { BLOCK_CATEGORY_IDS, categoryIds, toolbox } from "./BlockDefinitions";

const ids = (t: ReturnType<typeof toolbox>) => categoryIds(t);

describe("Werkzeugleiste: Kategorien je Lerngruppe ausblenden", () => {
    test("jede Kategorie hat eine Kennung; Liste und Reihenfolge stimmen mit BLOCK_CATEGORY_IDS überein", () => {
        expect(ids(toolbox())).toEqual([...BLOCK_CATEGORY_IDS]);
    });

    test("ausgeblendete Kategorien fehlen, unbekannte Kennungen werden ignoriert", () => {
        expect(ids(toolbox(["klassen", "objekte", "gibt-es-nicht"]))).toEqual(BLOCK_CATEGORY_IDS.filter((id) => id !== "klassen" && id !== "objekte"));
    });

    test("Reihungen, Listen und ADT stehen unter Variablen; Variablen ausblenden lässt sie als Ordner stehen", () => {
        const top = (t: ReturnType<typeof toolbox>) => (t as { contents: { kind: string; toolboxitemid?: string; contents?: { kind: string; toolboxitemid?: string }[] }[] }).contents;
        const vars = top(toolbox()).find((c) => c.toolboxitemid === "variablen")!;
        expect(vars.contents!.filter((c) => c.kind === "category").map((c) => c.toolboxitemid)).toEqual(["reihungen", "listen", "adt"]);
        expect(top(toolbox()).map((c) => c.toolboxitemid)).not.toContain("listen");

        const folder = top(toolbox(["variablen"])).find((c) => c.toolboxitemid === "variablen")!;
        expect(folder.contents!.every((c) => c.kind === "category")).toBe(true);   // keine eigenen Blöcke mehr
        expect(top(toolbox(["variablen", "reihungen", "listen", "adt"])).map((c) => c.toolboxitemid)).not.toContain("variablen");
        expect(ids(toolbox(["listen"]))).not.toContain("listen");
    });

    test("alles ausgeblendet: die volle Werkzeugleiste bleibt (der Server verhindert das ohnehin)", () => {
        expect(ids(toolbox([...BLOCK_CATEGORY_IDS]))).toEqual([...BLOCK_CATEGORY_IDS]);
    });
});
