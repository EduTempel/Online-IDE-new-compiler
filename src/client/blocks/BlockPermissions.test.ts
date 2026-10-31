import { describe, expect, it } from "vitest";
import { blockPermissions } from "./BlockPermissions";

describe("Freigaben der Lerngruppe für die Blöcke", () => {
    it("liest Java-Vorschau, Java-Beschriftung und Gültigkeitsbereich", () => {
        const user = { gsgFreigaben: { bloeckeVorschau: false, bloeckeBeschriftung: true, gueltigkeit: false } };
        expect(blockPermissions(user)).toEqual({ preview: false, javaLabels: true, scope: false });
    });

    it("ohne Angaben vom Server ist alles erlaubt", () => {
        expect(blockPermissions(undefined)).toEqual({ preview: true, javaLabels: true, scope: true });
        expect(blockPermissions({ gsgFreigaben: { bloeckeJava: false } })).toEqual({ preview: true, javaLabels: true, scope: true });
    });

    it("Blöckly: eine Freigabe für Java (Vorschau und Beschriftung), Blöckva-Schalter zählen dort nicht", () => {
        const user = { gsgFreigaben: { bloeckeVorschau: true, bloeckeBeschriftung: true, gueltigkeit: false, bloecklyJava: false } };
        expect(blockPermissions(user, true)).toEqual({ preview: false, javaLabels: false, scope: false });
        expect(blockPermissions({ gsgFreigaben: { bloeckeVorschau: false, bloecklyJava: true } }, true)).toEqual({ preview: true, javaLabels: true, scope: true });
        expect(blockPermissions(undefined, true)).toEqual({ preview: true, javaLabels: true, scope: true });
    });
});
