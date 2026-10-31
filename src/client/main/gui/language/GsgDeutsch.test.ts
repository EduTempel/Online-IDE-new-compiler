import { describe, expect, it } from "vitest";
import { gsgDeutsch } from "./GsgDeutsch";

describe("GSG: deutsche Oberflächentexte", () => {
    it("ersetzt englische Begriffe nur als ganze Texte", () => {
        expect(gsgDeutsch("Theme")).toBe("Farbschema");
        expect(gsgDeutsch("Dark")).toBe("Dunkel");
        expect(gsgDeutsch("Light")).toBe("Hell");
        expect(gsgDeutsch("Testrunner")).toBe("Tests");
        expect(gsgDeutsch("Console")).toBe("Konsole");
        expect(gsgDeutsch("Light mode")).toBe("Light mode");
    });

    it("„Workspace“ wird „Projekt“ – mit passendem Artikel und passender Endung", () => {
        const faelle: [string, string][] = [
            ["WORKSPACES", "PROJEKTE"],
            ["Meine WORKSPACES", "Meine PROJEKTE"],
            ["Kein Workspace vorhanden", "Kein Projekt vorhanden"],
            ["Neuer Workspace", "Neues Projekt"],
            ["Neuen Workspace erstellen", "Neues Projekt erstellen"],
            ["Aktuellen Workspace exportieren", "Aktuelles Projekt exportieren"],
            ["Bitte wählen Sie zuerst einen Workspace aus.", "Bitte wählen Sie zuerst ein Projekt aus."],
            ["Es gibt noch keinen Workspace.", "Es gibt noch kein Projekt."],
            ["Zeige eigenen Workspace", "Zeige eigenes Projekt"],
            ["Diesen Workspace mit dem Repository verbinden:", "Dieses Projekt mit dem Repository verbinden:"],
            ["Der neue Workspace Test wurde erfolgreich angelegt.", "Das neue Projekt Test wurde erfolgreich angelegt."],
            ["Der Workspace Test wurde an die Klasse 10b ausgeteilt. Er wird sofort sichtbar.", "Das Projekt Test wurde an die Klasse 10b ausgeteilt. Es wird sofort sichtbar."],
            ["Austeilen eines Workspace an einzelne Schüler/-innen", "Austeilen eines Projekts an einzelne Schüler/-innen"],
            ["Ausgabe nach Wechsel des Workspaces löschen", "Ausgabe nach Wechsel des Projekts löschen"],
            ["Der Fehlermeldung eine Kopie des aktuell offenen Workspaces beifügen", "Der Fehlermeldung eine Kopie des aktuell offenen Projekts beifügen"],
            ["Alle Workspaces als ZIP-Datei exportieren", "Alle Projekte als ZIP-Datei exportieren"],
            ["können Sie wieder zu Ihren eigenen Workspaces wechseln.", "können Sie wieder zu Ihren eigenen Projekten wechseln."],
            ["indem Sie in der Workspaceliste auf einen Workspace rechtsklicken, der mit dem Repository verbunden ist", "indem Sie in der Projektliste auf ein Projekt rechtsklicken, das mit dem Repository verbunden ist"],
            ["Einstellungen zum Workspace Test", "Einstellungen zum Projekt Test"],
            ["Führt alle im aktuellen Workspace enthaltenen JUnit-Tests aus.", "Führt alle im aktuellen Projekt enthaltenen JUnit-Tests aus."],
            ["Dateien können nicht in einen Workspace-Ordner verschoben/kopiert werden.", "Dateien können nicht in einen Projekt-Ordner verschoben/kopiert werden."],
            ["Sortierung des Workspacebaums", "Sortierung des Projektbaums"],
            ["Einstellungen für den Datei- und Workspaceexplorer", "Einstellungen für den Datei- und Projektexplorer"],
        ];
        for (const [vorher, nachher] of faelle) expect(gsgDeutsch(vorher)).toBe(nachher);
    });

    it("lässt Bezeichner in HTML und andere Texte unverändert", () => {
        const html = `Führe alle Tests des Workspaces <span class="jo_junitWorkspaceIdentifier">Test</span> aus`;
        expect(gsgDeutsch(html)).toBe(`Führe alle Tests des Projekts <span class="jo_junitWorkspaceIdentifier">Test</span> aus`);
        expect(gsgDeutsch("Programm starten")).toBe("Programm starten");
    });
});
