import type { Main } from "../Main.js";

/**
 * GSG: „Große Ansicht“ (Menü Ansicht) – für den Beamer und jüngere Schüler/innen größere Schrift, Zeilen und Knöpfe:
 *  - Menü, Listen, Reiter, Knöpfe: Klasse gsg-gross am <html> (Regeln in gsg-branding.css)
 *  - Code: Schriftgröße im Editor mindestens 20 (beim Ausschalten wieder die vorherige)
 *  - Blöcke: Zoom 1 statt 0,75 (BlockView liest istGrosseAnsicht() auch beim Anlegen des Arbeitsbereichs)
 * Gemerkt wird die Einstellung je Rechner (localStorage), z. B. am Beamer-PC.
 */
const KEY = "gsg-grosse-ansicht";
const SCHRIFT_VORHER = "gsg-grosse-ansicht-schrift";
const SCHRIFT_GROSS = 20;
export const BLOCK_ZOOM_NORMAL = 0.75;
export const BLOCK_ZOOM_GROSS = 1;

function lesen(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
}
function schreiben(key: string, wert: string | null) {
    try {
        if (wert === null) localStorage.removeItem(key);
        else localStorage.setItem(key, wert);
    } catch { /* ohne Speicher gilt es nur bis zum Neuladen */ }
}

export function istGrosseAnsicht(): boolean {
    return lesen(KEY) === "1";
}

/** beim Start: nur die Klasse setzen (Schriftgröße und Zoom sind gespeichert bzw. werden beim Anlegen gelesen) */
export function initGrosseAnsicht() {
    document.documentElement.classList.toggle("gsg-gross", istGrosseAnsicht());
}

export function toggleGrosseAnsicht(main: Main) {
    const an = !istGrosseAnsicht();
    schreiben(KEY, an ? "1" : null);
    document.documentElement.classList.toggle("gsg-gross", an);

    try {
        const aktuell = main.viewModeController.getChosenViewMode()?.fontSize ?? 14;
        if (an) {
            if (aktuell < SCHRIFT_GROSS) {
                schreiben(SCHRIFT_VORHER, String(aktuell));
                main.editor.setFontSize(SCHRIFT_GROSS);
            }
        } else {
            const vorher = Number(lesen(SCHRIFT_VORHER));
            schreiben(SCHRIFT_VORHER, null);
            if (vorher > 0 && aktuell === SCHRIFT_GROSS) main.editor.setFontSize(vorher);
        }
    } catch (e) {
        console.error(e);
    }

    try {
        main.blockModeController?.setBlockZoom(an ? BLOCK_ZOOM_GROSS : BLOCK_ZOOM_NORMAL);
    } catch (e) {
        console.error(e);
    }

    // Höhen von Menü und Reitern haben sich geändert: Editor, Blöcke und Leiste neu einpassen
    window.dispatchEvent(new Event("resize"));
}
