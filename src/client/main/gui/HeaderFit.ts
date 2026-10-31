/**
 * GSG: Die Leiste über dem Editor (Blöcke | Java, Start, Stopp, Geschwindigkeit, Benutzer) liegt rechts in derselben
 * Zeile wie das Hauptmenü. Bei schmalen Fenstern schob sie sich über „Handbuch“ und „Hilfe“. Jetzt wird sie
 * stufenweise knapper, bis sie neben das Menü passt:
 *   gsg-knapp         – Benutzername und seltene Einzelschritt-Knöpfe ausgeblendet
 *   gsg-mittel        – zusätzlich Ansichts-Knöpfe (Vollbild, Präsentation) ausgeblendet
 *   gsg-sehr-knapp    – zusätzlich Start/Pause/Stopp nur mit Symbol
 *   gsg-winzig        – zusätzlich Geschwindigkeitsregler und Einzelschritt-Knöpfe ausgeblendet
 * Neben dem Menü gelten nur die ersten beiden Stufen. Reicht das nicht, rutscht sie in eine eigene Zeile über dem
 * Editor (gsg-eigene-zeile) und wird dort nur so knapp, wie die Breite des Editors verlangt.
 */
const STUFEN = ["gsg-knapp", "gsg-mittel", "gsg-sehr-knapp", "gsg-winzig"];
/** neben dem Menü höchstens so knapp – lieber eine eigene Zeile, als „Start“ und „Stopp“ ohne Beschriftung */
const STUFEN_NEBEN_MENUE = 2;
const EIGENE_ZEILE = "gsg-eigene-zeile";
const ABSTAND = 8;

export function initHeaderFit(relayout: () => void) {
    const leiste = document.getElementById("debugpanel");
    const menue = document.getElementById("mainmenu");
    const bereich = leiste?.parentElement;
    if (!leiste || !menue || !bereich) return;

    const passtNebenMenue = () => {
        const menueEnde = Math.max(0, ...Array.from(menue.children).map((c) => c.getBoundingClientRect().right));
        return leiste.getBoundingClientRect().left >= menueEnde + ABSTAND;
    };
    const passtInZeile = () => leiste.scrollWidth <= bereich.clientWidth;

    let geplant = false;
    const anpassen = () => {
        geplant = false;
        const vorher = leiste.classList.contains(EIGENE_ZEILE);
        leiste.classList.remove(EIGENE_ZEILE, ...STUFEN);
        let passt = passtNebenMenue();
        for (const stufe of STUFEN.slice(0, STUFEN_NEBEN_MENUE)) {
            if (passt) break;
            leiste.classList.add(stufe);
            passt = passtNebenMenue();
        }
        if (!passt) {
            leiste.classList.remove(...STUFEN);
            leiste.classList.add(EIGENE_ZEILE);
            for (const stufe of STUFEN) {
                if (passtInZeile()) break;
                leiste.classList.add(stufe);
            }
        }
        // eigene Zeile an/aus: der Editor wird niedriger bzw. höher
        if (vorher !== leiste.classList.contains(EIGENE_ZEILE)) relayout();
    };
    const planen = () => {
        if (geplant) return;
        geplant = true;
        setTimeout(anpassen, 0);
    };

    window.addEventListener("resize", planen);
    // Breite des Editors ändert sich auch beim Ziehen der Trenner und beim Ein-/Ausklappen der linken Spalte
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(planen).observe(bereich);
    // Inhalt der Leiste ändert sich (Start ↔ Pause, Umschalter Blöcke | Java)
    new MutationObserver(planen).observe(leiste, { subtree: true, childList: true, attributes: true, attributeFilter: ["style"] });
    planen();
}
