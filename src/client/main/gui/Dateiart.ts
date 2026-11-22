/**
 * GSG: Art einer Datei im Projekt – Klassendiagramm, Struktogramm oder Code (Texva/Java und alles andere).
 * Gebraucht vom Explorer (Bereiche mit Trennstrich), vom Handbuch (folgt der offenen Datei) und von der
 * Kennzeichnung über dem Editor.
 */
/** Ereignis an document: andere Datei im Editor bzw. Ansicht Blöcke/Texva gewechselt (BlockModeController) */
export const DATEI_GEWECHSELT = "gsg-datei-gewechselt";

export type Dateiart = "klassendiagramm" | "struktogramm" | "code";

export function dateiartVon(name: string | undefined): Dateiart {
    const n = (name ?? "").replace(/ \(\d+\)$/, "");
    if (/\.klassendiagramm$/i.test(n)) return "klassendiagramm";
    if (/\.struktogramm$/i.test(n)) return "struktogramm";
    return "code";
}

/** Reihenfolge der Bereiche im Explorer: Ordner, Klassendiagramme, Struktogramme, Code */
export function explorerGruppe(f: { name: string; isFolder?: boolean }): number {
    if (f.isFolder) return 0;
    return { klassendiagramm: 1, struktogramm: 2, code: 3 }[dateiartVon(f.name)];
}

/** Schild in der Kopfzeile vor „Projekt / Datei“: in welchem Editor die offene Datei gerade bearbeitet wird */
const MARKE: Record<Dateiart | "bloecke", { symbol: string; text: string; tipp: string }> = {
    klassendiagramm: { symbol: "⊞", text: "Klassendiagramm", tipp: "Diese Datei ist ein Klassendiagramm – sie wird im Klassendiagramm-Editor bearbeitet." },
    struktogramm: { symbol: "⊟", text: "Struktogramm", tipp: "Diese Datei ist ein Struktogramm – sie wird im Struktogramm-Editor bearbeitet." },
    code: { symbol: "{ }", text: "Code", tipp: "Diese Datei ist Programmcode – sie wird im Code-Editor bearbeitet." },
    bloecke: { symbol: "▦", text: "Blöcke", tipp: "Diese Datei ist Programmcode – sie wird gerade mit Blöcken bearbeitet." },
};

export function zeigeDateiart(marke: HTMLElement, dateiname: string | undefined, modus: "blocks" | "java" | undefined) {
    const art = dateiname === undefined ? undefined : dateiartVon(dateiname);
    // bei Code zeigt der Umschalter „Blöcke │ Texva“ daneben schon, wie bearbeitet wird
    const umschalter = document.querySelector<HTMLElement>(".gsg-kopf .gsg-viewtoggle");
    const zeigen = art && !(art === "code" && umschalter && umschalter.style.display !== "none");
    marke.hidden = !zeigen;
    if (!zeigen) return;
    const schluessel = art === "code" && modus === "blocks" ? "bloecke" : art;
    const m = MARKE[schluessel];
    marke.className = "gsg-kopf-art gsg-kopf-art-" + schluessel;
    marke.textContent = "";
    const s = document.createElement("span");
    s.className = "gsg-kopf-art-symbol";
    s.setAttribute("aria-hidden", "true");
    s.textContent = m.symbol;
    marke.append(s, m.text);
    marke.title = m.tipp;
}
