import * as PIXI from 'pixi.js';

/**
 * Bildtafel der Blöckly-Figuren und Bühnenbilder (Paket 18b, eigene Erweiterung des GSG).
 *
 * Eigene Tafel neben der Bildtafel des Originals (assets/graphics/spritesheet.png), damit diese unverändert bleibt
 * und keine Tafel über 4096 Pixel wächst. Die Bilder liegen in doppelter Auflösung vor (meta.scale = 2): Sie
 * erscheinen in einfacher Größe und bleiben beim Vergrößern scharf. Weiches Skalieren (linear), weil es
 * Vektorzeichnungen sind und keine Pixelgrafik.
 *
 * Erzeugt mit docs/entwurf-figuren/bildtafel.py (Namen und Kostüme: GsgFigurenLibrary.ts).
 */
export const GSG_FIGUREN_SHEET_KEY = "gsg-figuren";

type SheetData = ConstructorParameters<typeof PIXI.Spritesheet>[1];

/** Lädt die Tafel (beim Start der IDE, ohne zu warten) */
export function loadGsgFigurenSheet(jsonUrl: string, pngUrl: string): Promise<void> {
    return fetch(jsonUrl)
        .then((response) => response.json())
        .then((data: SheetData) => PIXI.Assets.load(pngUrl).then((texture: PIXI.Texture) => {
            texture.source.minFilter = "linear";
            texture.source.magFilter = "linear";
            const sheet = new PIXI.Spritesheet(texture, data);
            return sheet.parse().then(() => {
                PIXI.Assets.cache.set(GSG_FIGUREN_SHEET_KEY, sheet);
            });
        }))
        .catch((e) => console.warn("Bildtafel der Blöckly-Figuren nicht geladen:", e));
}

/** die geladene Tafel (oder undefined, solange sie lädt) */
export function gsgFigurenSheet(): PIXI.Spritesheet | undefined {
    return PIXI.Assets.cache.has(GSG_FIGUREN_SHEET_KEY) ? PIXI.Assets.get(GSG_FIGUREN_SHEET_KEY) as PIXI.Spritesheet : undefined;
}
