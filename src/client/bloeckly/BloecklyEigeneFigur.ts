import {
    bildgroesse, EIGENE_FIGUR_MAX_BILDER, EIGENE_FIGUR_MAX_BYTES, EIGENE_FIGUREN_MAX, eigeneFiguren, eigeneFigurenAus,
    eigenerFigurnameFehler, figurNameFuer, kostuemeAus, type Ansichtsname, type EigeneFigurDaten,
} from "../../compiler/java/runtime/graphics/GsgEigeneFiguren";
import { GSG_FIGUR_GROESSE } from "../../compiler/java/runtime/graphics/GsgFigurenLibrary";
import type { Main } from "../main/Main";
import { EditableSpritesheet } from "../spritemanager/EditableSpritesheet";
import type { SpriteData } from "../spritemanager/ImageFile";
import { SpriteManager } from "../spritemanager/SpriteManager";
import { SpritesheetData } from "../spritemanager/SpritesheetData";
import { dialog, el, knopf } from "./BloecklyDialog";

/**
 * Blöckly (Paket 18i): „＋ Eigene Figur hochladen“. Bis zu 8 Bilder (PNG, JPG, SVG, je höchstens 1 MB) werden
 * Kostüme einer neuen Figur – mit Namen und, wenn man will, Blickrichtung. Die Bilder kommen verkleinert auf
 * Bibliotheksgröße in die Bildtafel des Projekts, Name und Kostüme in deren Metadaten.
 */

const ANSICHTEN: [Ansichtsname, string][] = [["vorne", "von vorne"], ["rechts", "nach rechts"], ["links", "nach links"], ["hinten", "von hinten"]];
const TYPEN = ["image/png", "image/jpeg", "image/svg+xml"];

type Bild = { datei: File; vorschau: string; name: HTMLInputElement; ansicht: HTMLSelectElement };

/** Dialog zeigen; fertig bekommt den Namen der neuen Figur (für figurHinzufuegen) */
export function eigeneFigurDialog(main: Main, fertig: (figur: string, titel: string) => void) {
    const ws = main.getCurrentWorkspace();
    if (!ws) return;
    if (main.user?.is_testuser) {
        alert("Eigene Figuren lassen sich nur mit einem Konto hochladen.");
        return;
    }
    if (eigeneFiguren().length >= EIGENE_FIGUREN_MAX) {
        alert(`In einem Projekt gibt es höchstens ${EIGENE_FIGUREN_MAX} eigene Figuren. Entferne zuerst eine in „Figur wählen“.`);
        return;
    }

    const form = el("form", "gsg-bl-frage gsg-bl-hochladen");
    const name = el("input", "gsg-bl-feld");
    name.placeholder = "Name der Figur, z. B. Robo";
    name.setAttribute("aria-label", "Name der Figur");
    name.maxLength = 30;
    const wahl = el("input");
    wahl.type = "file";
    wahl.multiple = true;
    wahl.accept = ".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml";
    wahl.className = "gsg-bl-dateiwahl";
    wahl.setAttribute("aria-label", "Bilder wählen");
    const waehlen = knopf("🖼 Bilder wählen …", `PNG, JPG oder SVG; bis zu ${EIGENE_FIGUR_MAX_BILDER} Bilder, je höchstens 1 MB`);
    waehlen.addEventListener("click", () => wahl.click());
    const liste = el("div", "gsg-bl-hochladeliste");
    const tipp = el("p", "gsg-bl-tipp",
        `Jedes Bild wird ein Kostüm (höchstens ${EIGENE_FIGUR_MAX_BILDER}, je bis 1 MB). Gib ihm einen Namen, z. B. „laufen 1“. ` +
        "Die Blickrichtung brauchst du nur, wenn die Figur je nach Richtung anders aussehen soll. " +
        "Lade nur Bilder hoch, die du selbst gemacht hast oder verwenden darfst – keine Fotos von Personen.");
    const fehler = el("div", "gsg-bl-fehler");
    fehler.setAttribute("role", "alert");
    const ok = knopf("Hochladen", "Figur anlegen", "gsg-bl-knopf gsg-bl-start");
    ok.type = "submit";
    const abbrechen = knopf("Abbrechen", "Keine Figur anlegen");
    const knoepfe = el("div", "gsg-bl-knoepfe");
    knoepfe.append(abbrechen, ok);
    form.append(name, waehlen, wahl, liste, tipp, fehler, knoepfe);

    let bilder: Bild[] = [];
    let beruehrt = false;
    let laeuft = false;
    const pruefe = (): string | undefined => {
        let f = eigenerFigurnameFehler(name.value, eigeneFiguren());
        if (!f && bilder.length === 0) f = "Wähle mindestens ein Bild.";
        fehler.textContent = beruehrt ? f ?? "" : "";
        ok.disabled = !!f || laeuft;
        return f;
    };
    const zeigeBilder = () => {
        liste.replaceChildren();
        bilder.forEach((b, i) => {
            const zeile = el("div", "gsg-bl-hochladezeile");
            const img = el("img");
            img.src = b.vorschau;
            img.alt = "";
            const weg = knopf("✕", "Bild entfernen", "gsg-bl-mini");
            weg.addEventListener("click", () => {
                URL.revokeObjectURL(b.vorschau);
                bilder.splice(i, 1);
                zeigeBilder();
                pruefe();
            });
            zeile.append(img, b.name, b.ansicht, weg);
            liste.append(zeile);
        });
    };
    wahl.addEventListener("change", () => {
        beruehrt = true;
        const meldungen: string[] = [];
        for (const datei of Array.from(wahl.files ?? [])) {
            if (bilder.length >= EIGENE_FIGUR_MAX_BILDER) { meldungen.push(`Höchstens ${EIGENE_FIGUR_MAX_BILDER} Bilder.`); break; }
            if (!TYPEN.includes(datei.type) && !/\.(png|jpe?g|svg)$/i.test(datei.name)) { meldungen.push(`„${datei.name}“ ist kein PNG-, JPG- oder SVG-Bild.`); continue; }
            if (datei.size > EIGENE_FIGUR_MAX_BYTES) { meldungen.push(`„${datei.name}“ ist größer als 1 MB.`); continue; }
            const n = el("input", "gsg-bl-feld");
            n.value = datei.name.replace(/\.[^.]*$/, "").replace(/[_-]+/g, " ").slice(0, 30);
            n.maxLength = 30;
            n.setAttribute("aria-label", "Name des Kostüms");
            const a = el("select", "gsg-bl-feld");
            a.setAttribute("aria-label", "Blickrichtung");
            for (const [wert, text] of ANSICHTEN) {
                const o = el("option", undefined, text);
                o.value = wert;
                a.append(o);
            }
            bilder.push({ datei, vorschau: URL.createObjectURL(datei), name: n, ansicht: a });
        }
        wahl.value = "";
        zeigeBilder();
        pruefe();
        if (meldungen.length) fehler.textContent = meldungen.join(" ");
    });
    name.addEventListener("input", () => { beruehrt = true; pruefe(); });
    pruefe();

    const schliessen = dialog("Eigene Figur hochladen", form, () => bilder.forEach((b) => URL.revokeObjectURL(b.vorschau)));
    abbrechen.addEventListener("click", schliessen);
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        beruehrt = true;
        if (pruefe() || laeuft) return;
        laeuft = true;
        ok.textContent = "Lädt hoch …";
        pruefe();
        const titel = name.value.trim().replace(/\s+/g, " ");
        try {
            const pixel = await Promise.all(bilder.map((b) => bildPixel(b.datei)));
            const kostueme = kostuemeAus(bilder.map((b) => ({ ansicht: b.ansicht.value as Ansichtsname, name: b.name.value })));
            const figur: EigeneFigurDaten = { name: figurNameFuer(titel), titel, kostueme };
            await speichern(main, (alt) => [...alt.filter((f) => f.name !== figur.name), figur], figur.name, pixel);
            schliessen();
            fertig(figur.name, titel);
        } catch (err) {
            fehler.textContent = "Das Hochladen hat nicht geklappt: " + (err instanceof Error ? err.message : String(err ?? ""));
        } finally {
            laeuft = false;
            ok.textContent = "Hochladen";
            pruefe();
        }
    });
    setTimeout(() => name.focus(), 0);
}

/** eigene Figur aus der Bildtafel entfernen (Bilder und Eintrag) */
export async function eigeneFigurEntfernen(main: Main, figur: string) {
    await speichern(main, (alt) => alt.filter((f) => f.name !== figur), figur, []);
}

/** Bild laden und auf Bibliotheksgröße bringen (auch SVG und JPG): RGBA-Pixel */
async function bildPixel(datei: File): Promise<SpriteData> {
    const url = URL.createObjectURL(datei);
    try {
        const img = new Image();
        img.decoding = "async";
        await new Promise<void>((ok, fehler) => {
            img.onload = () => ok();
            img.onerror = () => fehler(new Error(`„${datei.name}“ lässt sich nicht als Bild lesen.`));
            img.src = url;
        });
        const g = bildgroesse(img.naturalWidth, img.naturalHeight, GSG_FIGUR_GROESSE);
        const canvas = document.createElement("canvas");
        canvas.width = g.breite;
        canvas.height = g.hoehe;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("Der Browser kann das Bild nicht umrechnen.");
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, g.breite, g.hoehe);
        const daten = ctx.getImageData(0, 0, g.breite, g.hoehe);
        return { image: new Uint8Array(daten.data.buffer), width: g.breite, height: g.hoehe, filename: datei.name };
    } finally {
        URL.revokeObjectURL(url);
    }
}

/**
 * Bildtafel des Projekts laden, die Bilder der Figur ersetzen, Metadaten anpassen, hochladen und neu einlesen.
 * Die übrigen eigenen Sprites des Projekts bleiben erhalten.
 */
async function speichern(main: Main, eintraege: (alt: EigeneFigurDaten[]) => EigeneFigurDaten[], reihe: string, bilder: SpriteData[]) {
    const ws = main.getCurrentWorkspace();
    if (!ws) throw new Error("Kein Projekt geöffnet.");
    await main.networkManager.sendUpdatesAsync(true);
    const tafel = new SpritesheetData();
    if (ws.spritesheetId != null) await tafel.load(ws.spritesheetId);
    const editierbar = new EditableSpritesheet(tafel.pixiSpritesheetData ? tafel : null);
    const alteDaten = editierbar.spritesheet.pixiSpritesheetData;
    // nur Einträge behalten, deren Bilder es noch gibt
    const alt: EigeneFigurDaten[] = alteDaten ? eigeneFigurenAus(alteDaten).map(({ name, titel, kostueme }) => ({ name, titel, kostueme })) : [];
    editierbar.spriteDataList = editierbar.spriteDataList.filter((s) => s.series !== reihe);
    bilder.forEach((b, i) => editierbar.addSprite(b, 1, 1, 0, 0, reihe, i));
    const neu = eintraege(alt);
    // Metadaten vor dem Erzeugen setzen: generateAndZipSpritesheet übernimmt meta.gsgFiguren
    editierbar.spritesheet.pixiSpritesheetData ??= { frames: {}, meta: { app: "", version: "1.0", image: "dummy.png", format: "RGBA8888", size: { w: 0, h: 0 }, scale: "1" } };
    editierbar.spritesheet.pixiSpritesheetData.meta.gsgFiguren = neu;
    const leer = editierbar.spriteDataList.length === 0;
    if (!leer) await editierbar.generateAndZipSpritesheet();
    const id = await SpriteManager.uploadSpritesheet(leer ? new Uint8Array(0) : editierbar.spritesheet.zipFile, ws.id, leer);
    ws.spritesheetId = leer ? null : id;
    await new SpritesheetData().initializeSpritesheetForWorkspace(ws, main, null);
    for (const f of ws.getFiles()) main.getCompiler().setFileDirty(f);
    main.getCompiler().triggerCompile();
}
