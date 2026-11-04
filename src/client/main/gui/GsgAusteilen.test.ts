import { afterEach, describe, expect, it } from "vitest";
import { dateienWaehlen, ergebnisText, neueDateienText } from "./GsgAusteilen.js";
import type { Workspace } from "../../workspace/Workspace.js";

/** GSG: Austeilen einzelner Dateien – Auswahl und Meldungen */

type F = { id: number; name: string; isFolder: boolean; parent_folder_id: number | null };
function projekt(dateien: F[]): Workspace {
    const byId = new Map(dateien.map((f) => [f.id, f]));
    return {
        name: "Stufen",
        getFiles: () => dateien,
        getPath: (f: F) => {
            const pfad: string[] = [];
            for (let p = f.parent_folder_id != null ? byId.get(f.parent_folder_id) : undefined; p; p = p.parent_folder_id != null ? byId.get(p.parent_folder_id) : undefined) pfad.unshift(p.name);
            return pfad;
        },
    } as unknown as Workspace;
}
const datei = (id: number, name: string, parent: number | null = null): F => ({ id, name, isFolder: false, parent_folder_id: parent });

afterEach(() => document.body.replaceChildren());

describe("Dateiauswahl", () => {
    it("bei einer Datei gibt es nichts zu wählen", async () => {
        expect(await dateienWaehlen(projekt([datei(1, "A.java")]), "die Klasse")).toBeNull();
    });

    it("listet Dateien mit Ordnerpfad; alle angehakt heißt ganzes Projekt", async () => {
        const ws = projekt([{ id: 1, name: "material", isFolder: true, parent_folder_id: null }, datei(2, "Hilfe.java", 1), datei(3, "A.java")]);
        const wahl = dateienWaehlen(ws, "die Klasse „10b“");
        const zeilen = Array.from(document.querySelectorAll(".gsg-austeilen-datei")).map((z) => z.textContent);
        expect(zeilen).toEqual(["A.java", "material/Hilfe.java"]);
        document.querySelector<HTMLFormElement>("form.gsg-austeilen")!.requestSubmit();
        expect(await wahl).toBeNull();
    });

    it("nur die angehakten Dateien; keine angehakt sperrt Austeilen; Abbrechen liefert undefined", async () => {
        let wahl = dateienWaehlen(projekt([datei(1, "A.java"), datei(2, "B.java")]), "2 Schüler/innen");
        const boxen = Array.from(document.querySelectorAll<HTMLInputElement>(".gsg-austeilen-datei input"));
        const ok = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === "Austeilen")!;
        for (const b of boxen) { b.checked = false; b.dispatchEvent(new Event("change")); }
        expect(ok.disabled).toBe(true);
        boxen[1].checked = true;
        boxen[1].dispatchEvent(new Event("change"));
        expect(ok.disabled).toBe(false);
        document.querySelector<HTMLFormElement>("form.gsg-austeilen")!.requestSubmit();
        expect(await wahl).toEqual([2]);

        wahl = dateienWaehlen(projekt([datei(1, "A.java"), datei(2, "B.java")]), "2 Schüler/innen");
        Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === "Abbrechen")!.click();
        expect(await wahl).toBeUndefined();
    });
});

describe("Meldungen", () => {
    it("fasst das Ergebnis zusammen", () => {
        const t = ergebnisText("Stufen", "die Klasse „10b“", { created: 1, extended: 3, unchanged: 0, kept: { "Stufe1.java": 3 } })!;
        expect(t).toContain("„Stufen“ wurde an die Klasse „10b“ ausgeteilt: 1 Schüler/in hat das Projekt neu bekommen, bei 3 Schüler/innen kamen Dateien dazu.");
        expect(t).toContain("• Stufe1.java (bei 3 Schüler/innen)");
        expect(ergebnisText("Stufen", "x", undefined)).toBeUndefined();
    });

    it("Hinweis für Schüler/innen", () => {
        expect(neueDateienText(new Map([["Stufen", ["Stufe2.java", "Stufe3.java"]]]))).toBe("Neu in Deinem Workspace „Stufen“: Stufe2.java, Stufe3.java");
        expect(neueDateienText(new Map([["A", ["x.java"]], ["B", ["y.java"]]]))).toBe("Neu in Deinen Workspaces:\n• „A“: x.java\n• „B“: y.java");
    });
});
