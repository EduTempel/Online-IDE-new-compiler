import { describe, expect, test } from "vitest";
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import { BLOCK_CATEGORY_IDS, toolbox } from "./BlockDefinitions";

const ids = (t: ReturnType<typeof toolbox>) => (t as { contents: { toolboxitemid?: string }[] }).contents.map((c) => c.toolboxitemid);

describe("Werkzeugleiste: Kategorien je Lerngruppe ausblenden", () => {
    test("jede Kategorie hat eine Kennung; Liste und Reihenfolge stimmen mit BLOCK_CATEGORY_IDS überein", () => {
        expect(ids(toolbox())).toEqual([...BLOCK_CATEGORY_IDS]);
    });

    test("ausgeblendete Kategorien fehlen, unbekannte Kennungen werden ignoriert", () => {
        expect(ids(toolbox(["klassen", "objekte", "gibt-es-nicht"]))).toEqual(BLOCK_CATEGORY_IDS.filter((id) => id !== "klassen" && id !== "objekte"));
    });

    test("alles ausgeblendet: die volle Werkzeugleiste bleibt (der Server verhindert das ohnehin)", () => {
        expect(ids(toolbox([...BLOCK_CATEGORY_IDS]))).toEqual([...BLOCK_CATEGORY_IDS]);
    });
});
