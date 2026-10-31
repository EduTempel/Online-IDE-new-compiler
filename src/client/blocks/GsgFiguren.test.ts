import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { GSG_BUEHNENBILD_NAME, GSG_BUEHNENBILDER, GSG_FIGUREN, GSG_SPRITESHEET_NAMES } from "../../compiler/java/runtime/graphics/GsgFigurenLibrary";
import { SpriteLibraryEnum } from "../../compiler/java/runtime/graphics/SpriteLibraryEnum";

/** Paket 18b: Bildtafel der Blöckly-Figuren (erzeugt mit docs/entwurf-figuren/bildtafel.py) */
describe("Blöckly-Figuren und Bühnenbilder", () => {
    const sheet = JSON.parse(readFileSync("assets/graphics/gsg-figuren.json.txt", "utf-8")) as {
        frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
        meta: { size: { w: number; h: number }; scale: string };
    };

    it("jede Figur hat 17 Kostüme in vier Blickrichtungen, jedes mit Bild auf der Tafel", () => {
        expect(GSG_FIGUREN.map((f) => f.name)).toEqual(["Waschbaer", "RoterPanda", "Roboter", "Axolotl", "Pinguin"]);
        for (const f of GSG_FIGUREN) {
            expect(f.kostueme).toHaveLength(17);
            expect(new Set(f.kostueme.map((k) => k.id.split("-")[0]))).toEqual(new Set(["vorne", "rechts", "links", "hinten"]));
            f.kostueme.forEach((_, i) => expect(sheet.frames[`${f.name}#${i}`], `${f.name}#${i}`).toBeDefined());
            // alle Kostüme gleich groß: beim Wechseln springt die Figur nicht
            const sizes = new Set(f.kostueme.map((_, i) => `${sheet.frames[`${f.name}#${i}`].frame.w}x${sheet.frames[`${f.name}#${i}`].frame.h}`));
            expect(sizes.size).toBe(1);
        }
    });

    it("Bühnenbilder in Bühnengröße (480 × 360, doppelte Auflösung)", () => {
        expect(GSG_BUEHNENBILDER.map((b) => b.id)).toEqual(["wiese", "wald", "stadt", "schulhof", "weltraum", "unterwasser"]);
        expect(sheet.meta.scale).toBe("2");
        for (const b of GSG_BUEHNENBILDER) {
            expect(sheet.frames[`${GSG_BUEHNENBILD_NAME}#${b.index}`].frame).toMatchObject({ w: 960, h: 720 });
        }
    });

    it("Tafel bleibt unter 4096 Pixeln, Bilder überlappen nicht", () => {
        expect(sheet.meta.size.w).toBeLessThanOrEqual(4096);
        expect(sheet.meta.size.h).toBeLessThanOrEqual(4096);
        const frames = Object.values(sheet.frames).map((f) => f.frame);
        for (const a of frames) {
            expect(a.x + a.w).toBeLessThanOrEqual(sheet.meta.size.w);
            expect(a.y + a.h).toBeLessThanOrEqual(sheet.meta.size.h);
            for (const b of frames) {
                if (a === b) continue;
                const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
                expect(overlap).toBe(false);
            }
        }
    });

    it("stehen in SpriteLibrary (Java: SpriteLibrary.Waschbaer …) hinter den Bildern des Originals", () => {
        const names = SpriteLibraryEnum.values.map((v) => v.name);
        expect(names.slice(-GSG_SPRITESHEET_NAMES.length)).toEqual(GSG_SPRITESHEET_NAMES);
        expect(new Set(names).size).toBe(names.length);
        SpriteLibraryEnum.values.forEach((v, i) => expect(v.ordinal).toBe(i));
    });
});
