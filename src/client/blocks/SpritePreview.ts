import { gsgFigurenSheet } from "../../compiler/java/runtime/graphics/GsgFigurenSheet";
import * as PIXI from "pixi.js";
import type { Main } from "../main/Main";
import { SpriteLibraryEnum } from "../../compiler/java/runtime/graphics/SpriteLibraryEnum";
import type { SpriteSource } from "./BlockFigures";

/**
 * Bilder für den Sprite-Block (Paket 8): Namen der SpriteLibrary (eigene Bilder des Projekts zuerst)
 * und kleine Vorschaubilder – aus der Bildtafel der IDE bzw. der eigenen Bildtafel des Projekts.
 */

const SIZE = 32;

type Frame = { x: number; y: number; w: number; h: number };

/** Ausschnitt einer Bildquelle als kleines PNG (data-URL) */
function crop(source: CanvasImageSource, f: Frame): string | undefined {
    if (f.w <= 0 || f.h <= 0) return undefined;
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    const scale = Math.min(SIZE / f.w, SIZE / f.h);
    const w = f.w * scale, h = f.h * scale;
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.drawImage(source, f.x, f.y, f.w, f.h, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
    return canvas.toDataURL("image/png");
}

export function createSpriteSource(main: Main): SpriteSource {
    const cache = new Map<string, string | undefined>();
    let userCanvas: HTMLCanvasElement | undefined;
    let userData: unknown;

    const graphics = () => main.getInterpreter()?.graphicsManager;

    /** eigene Bilder: Namen aus der Bildtafel des Projekts */
    const ownNames = (): string[] => {
        const frames = graphics()?.pixiSpritesheetData?.frames ?? {};
        const names = new Set<string>();
        for (const id of Object.keys(frames)) names.add(id.includes("#") ? id.substring(0, id.indexOf("#")) : id);
        return [...names];
    };

    /** Bildtafel des Projekts als Leinwand (einmal je geladener Tafel) */
    const userSheet = (): HTMLCanvasElement | undefined => {
        const g = graphics();
        if (!g?.pixiSpritesheetData || !g.pngImageData) return undefined;
        if (userData === g.pngImageData && userCanvas) return userCanvas;
        const { w, h } = g.pixiSpritesheetData.meta.size;
        if (!w || !h || g.pngImageData.length < w * h * 4) return undefined;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return undefined;
        ctx.putImageData(new ImageData(new Uint8ClampedArray(g.pngImageData.buffer, g.pngImageData.byteOffset, w * h * 4), w, h), 0, 0);
        userCanvas = canvas;
        userData = g.pngImageData;
        cache.clear();
        return canvas;
    };

    return {
        names() {
            const own = ownNames();
            const builtIn = SpriteLibraryEnum.values.map((v) => v.name);
            return [...new Set([...own, ...builtIn])];
        },
        isOwn(name) {
            return ownNames().includes(name);
        },
        preview(name, index) {
            const key = `${name}#${index}`;
            userSheet();   // leert den Zwischenspeicher, wenn eine neue eigene Tafel geladen wurde
            if (cache.has(key)) return cache.get(key);
            let result: string | undefined;
            try {
                const ownFrame = graphics()?.pixiSpritesheetData?.frames?.[key]?.frame as Frame | undefined;
                const sheetCanvas = ownFrame ? userSheet() : undefined;
                if (ownFrame && sheetCanvas) {
                    result = crop(sheetCanvas, ownFrame);
                } else {
                    const sheet = PIXI.Assets.get("spritesheet") as PIXI.Spritesheet | undefined;
                    const texture = sheet?.textures?.[key] ?? gsgFigurenSheet()?.textures?.[key];   // GSG: Blöckly-Figuren
                    const resource = texture?.source?.resource as CanvasImageSource | undefined;
                    if (texture && resource) {
                        const fr = texture.frame;
                        const r = texture.source.resolution || 1;   // Blöckly-Tafel: doppelte Auflösung
                        result = crop(resource, { x: fr.x * r, y: fr.y * r, w: fr.width * r, h: fr.height * r });
                    }
                }
            } catch {
                result = undefined;
            }
            // erst merken, wenn es ein Bild gibt (die Bildtafeln laden beim Start nach)
            if (result) cache.set(key, result);
            return result;
        },
    };
}
