import { describe, expect, it } from "vitest";
import { dateiartVon, explorerGruppe } from "./Dateiart";
import { mitGruppen } from "../../../tools/components/treeview/TreeviewGruppen";

describe("Dateiart (Explorer-Bereiche, Handbuch, Schild im Kopf)", () => {
    it("erkennt Klassendiagramme, Struktogramme und Code", () => {
        expect(dateiartVon("Schule.klassendiagramm")).toBe("klassendiagramm");
        expect(dateiartVon("/Sortieren.Struktogramm")).toBe("struktogramm");
        expect(dateiartVon("Sortieren.struktogramm (2)")).toBe("struktogramm");   // Monaco-Pfad bei gleichem Namen
        expect(dateiartVon("Person.java")).toBe("code");
        expect(dateiartVon("Notizen.txt")).toBe("code");
        expect(dateiartVon(undefined)).toBe("code");
    });

    it("sortiert im Explorer Ordner, Klassendiagramme, Struktogramme, Code – innerhalb wie bisher", () => {
        const dateien = [
            { name: "Aaa.java" }, { name: "Z.klassendiagramm" }, { name: "Ordner", isFolder: true },
            { name: "B.struktogramm" }, { name: "A.klassendiagramm" }, { name: "Zzz.java" },
        ];
        const alphabetisch = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
        const sortiert = [...dateien].sort(mitGruppen(explorerGruppe, alphabetisch)).map((d) => d.name);
        expect(sortiert).toEqual(["Ordner", "A.klassendiagramm", "Z.klassendiagramm", "B.struktogramm", "Aaa.java", "Zzz.java"]);
        // ohne Gruppen bleibt der Vergleich unverändert
        expect(mitGruppen(undefined, alphabetisch)).toBe(alphabetisch);
    });
});
