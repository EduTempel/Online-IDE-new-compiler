import { BUEHNE_BREITE, BUEHNE_HOEHE } from "../../compiler/java/runtime/graphics/GsgBuehnenLogik";
import { GSG_FIGUR_GROESSE, GSG_FIGUREN } from "../../compiler/java/runtime/graphics/GsgFigurenLibrary";
import type { Main } from "../main/Main";
import { taskOf } from "../task/TaskTab";
import type { Workspace } from "../workspace/Workspace";
import { bildtafel, buehnenbildName, zeichne } from "./BloecklyBilder";
import { dialog, el, knopf, nameFragen } from "./BloecklyDialog";
import { bibliotheksfigur, bildnummer, liesProjekt } from "./BloecklyProjekt";

/**
 * Blöckly „Modern“: Übersicht „Meine Projekte“ über der ganzen Oberfläche (statt der Projektliste links).
 *  - links: Alle Projekte, Von deiner Lehrkraft (Projekte mit Aufgabe), die eigenen Ordner
 *  - rechts: Suche, „Neues Projekt“, Aufgaben der Lehrkraft als breite Karten, alle Projekte als Kacheln mit
 *    kleinem Bild der Bühne (Startbild: Bühnenbild und Figuren an ihrer Startposition)
 * Ein Klick öffnet das Projekt; Esc oder „Zurück zum Projekt“ schließt die Übersicht. Auf jeder Kachel: Umbenennen
 * und Löschen (wie im Kontextmenü der Projektliste, die Modern nicht zeigt).
 */

type Filter = { art: "alle" } | { art: "lehrkraft" } | { art: "ordner"; id: number };

const VORSCHAU_B = 240, VORSCHAU_H = 180;

/** schließt die offene Übersicht (falls eine offen ist) */
let schliesseOffene: (() => void) | undefined;

export function zeigeProjekte(main: Main) {
    const hauptDiv = document.getElementById("main");
    if (schliesseOffene) { schliesseOffene(); return; }
    if (!hauptDiv) return;

    let filter: Filter = { art: "alle" };
    let suche = "";

    const huelle = el("div", "gsg-projekte");
    huelle.setAttribute("role", "dialog");
    huelle.setAttribute("aria-label", "Meine Projekte");
    const nav = el("nav", "gsg-projekte-nav");
    nav.setAttribute("aria-label", "Ordner");
    const inhalt = el("div", "gsg-projekte-inhalt");

    const kopf = el("div", "gsg-projekte-kopf");
    const titel = el("h1", undefined, "Meine Projekte");
    const sucheFeld = el("input", "gsg-projekte-suche");
    sucheFeld.type = "search";
    sucheFeld.placeholder = "Projekt suchen";
    sucheFeld.setAttribute("aria-label", "Projekt suchen");
    sucheFeld.addEventListener("input", () => { suche = sucheFeld.value.trim().toLowerCase(); zeigeInhalt(); });
    const zurueck = knopf("Zurück zum Projekt", "Übersicht schließen (Esc)", "gsg-projekte-zurueck");
    zurueck.addEventListener("click", () => schliessen());
    const neu = knopf("＋ Neues Projekt", "Neues Blocks-Projekt anlegen", "gsg-projekte-neu");
    neu.addEventListener("click", () => neuesProjekt(main));
    kopf.append(titel, el("span", "gsg-kopf-luecke"), sucheFeld, neu, zurueck);
    const liste = el("div", "gsg-projekte-liste");
    inhalt.append(kopf, liste);
    huelle.append(nav, inhalt);
    hauptDiv.append(huelle);
    setTimeout(() => sucheFeld.focus(), 0);

    const beiTaste = (e: KeyboardEvent) => {
        // Esc im Dialog „Neues Projekt“ schließt nur den Dialog
        if (e.key === "Escape" && !document.querySelector(".gsg-bl-dialoghuelle")) schliessen();
    };
    document.addEventListener("keydown", beiTaste);
    function schliessen() {
        document.removeEventListener("keydown", beiTaste);
        huelle.remove();
        schliesseOffene = undefined;
    }
    schliesseOffene = schliessen;

    const alle = () => main.workspaceList.filter((w) => !w.isFolder);
    const ordner = () => main.workspaceList.filter((w) => w.isFolder).sort((a, b) => a.name.localeCompare(b.name, "de"));

    function zeigeNav() {
        nav.replaceChildren();
        const eintrag = (text: string, f: Filter, anzahl: number, klasse = "") => {
            const b = el("button", "gsg-projekte-ordner " + klasse);
            b.type = "button";
            const aktiv = JSON.stringify(f) === JSON.stringify(filter);
            b.classList.toggle("gsg-aktiv", aktiv);
            b.setAttribute("aria-pressed", String(aktiv));
            b.append(el("span", "gsg-projekte-ordnername", text), el("span", "gsg-projekte-anzahl", String(anzahl)));
            b.addEventListener("click", () => { filter = f; zeigeNav(); zeigeInhalt(); });
            nav.append(b);
        };
        eintrag("Alle Projekte", { art: "alle" }, alle().length);
        const mitAufgabe = alle().filter((w) => taskOf(w)).length;
        if (mitAufgabe) eintrag("Von deiner Lehrkraft", { art: "lehrkraft" }, mitAufgabe);
        const o = ordner();
        if (o.length) nav.append(el("div", "gsg-projekte-navtitel", "Meine Ordner"));
        for (const f of o) eintrag(f.name, { art: "ordner", id: f.id }, alle().filter((w) => w.parent_folder_id === f.id).length);
    }

    function passt(w: Workspace): boolean {
        if (suche && !w.name.toLowerCase().includes(suche)) return false;
        if (filter.art === "lehrkraft") return !!taskOf(w);
        if (filter.art === "ordner") return w.parent_folder_id === filter.id;
        return true;
    }

    function zeigeInhalt() {
        liste.replaceChildren();
        titel.textContent = filter.art === "alle" ? "Meine Projekte" : filter.art === "lehrkraft" ? "Von deiner Lehrkraft"
            : ordner().find((o) => filter.art === "ordner" && o.id === filter.id)?.name ?? "Ordner";
        const projekte = alle().filter(passt).sort((a, b) => a.name.localeCompare(b.name, "de"));
        const aktuell = main.getCurrentWorkspace?.();

        // Aufgaben der Lehrkraft zuerst (nur in „Alle Projekte“)
        const aufgaben = filter.art === "alle" ? projekte.filter((w) => taskOf(w)) : [];
        if (aufgaben.length) {
            liste.append(el("h2", undefined, "Von deiner Lehrkraft"));
            const reihe = el("div", "gsg-projekte-aufgaben");
            for (const w of aufgaben) reihe.append(aufgabenKarte(w, w === aktuell));
            liste.append(reihe);
            liste.append(el("h2", undefined, "Alle Projekte"));
        }

        const raster = el("div", "gsg-projekte-raster");
        if (filter.art !== "lehrkraft") {
            const neuKachel = el("button", "gsg-projekte-kachel gsg-projekte-neukachel");
            neuKachel.type = "button";
            neuKachel.append(el("span", "gsg-projekte-plus", "＋"), el("strong", undefined, "Neues Projekt"));
            neuKachel.addEventListener("click", () => neuesProjekt(main));
            raster.append(neuKachel);
        }
        for (const w of projekte) raster.append(kachel(w, w === aktuell));
        liste.append(raster);
        if (!projekte.length) liste.append(el("p", "gsg-projekte-leer", suche ? "Kein Projekt mit diesem Namen." : "Hier ist noch kein Projekt."));
    }

    function oeffne(w: Workspace) {
        main.projectExplorer.setWorkspaceActive(w, true);
        schliessen();
    }

    function infoText(w: Workspace): string {
        const p = liesProjekt(w.getFiles().filter((f) => !f.isFolder));
        if (!p.buehne) return "kein Blocks-Projekt";
        const n = p.figuren.length;
        return n === 1 ? "1 Figur" : `${n} Figuren`;
    }

    function kachel(w: Workspace, geoeffnet: boolean): HTMLElement {
        const huelleK = el("div", "gsg-projekte-kachel");
        huelleK.classList.toggle("gsg-projekte-geoeffnet", geoeffnet);
        const b = el("button", "gsg-projekte-oeffnen");
        b.type = "button";
        b.title = `${w.name} öffnen`;
        const kopfzeile = el("span", "gsg-projekte-kachelname");
        kopfzeile.append(el("strong", undefined, w.name));
        if (geoeffnet) kopfzeile.append(el("span", "gsg-projekte-marke", "geöffnet"));
        b.append(vorschau(w), kopfzeile, el("span", "gsg-projekte-info", infoText(w)));
        b.addEventListener("click", () => oeffne(w));
        huelleK.append(b);
        if (!w.readonly) {
            const aktionen = el("span", "gsg-projekte-aktionen");
            const umbenennen = knopf("✎", `${w.name} umbenennen`, "gsg-projekte-aktion");
            umbenennen.setAttribute("aria-label", `${w.name} umbenennen`);
            umbenennen.addEventListener("click", () => projektUmbenennen(w));
            const loeschen = knopf("🗑", `${w.name} löschen`, "gsg-projekte-aktion gsg-projekte-loeschen");
            loeschen.setAttribute("aria-label", `${w.name} löschen`);
            loeschen.addEventListener("click", () => projektLoeschen(w));
            aktionen.append(umbenennen, loeschen);
            huelleK.append(aktionen);
        }
        return huelleK;
    }

    async function projektUmbenennen(w: Workspace) {
        const tv = main.projectExplorer.workspaceTreeview;
        const node = tv.findNodeByElement(w);
        if (!node || !tv.renameCallback) return;
        const neu = await nameFragen("Projekt umbenennen", w.name, (n) => n ? undefined : "Gib dem Projekt einen Namen.");
        if (!neu) return;
        const antwort = await tv.renameCallback(w, neu, node);
        if (antwort.success) {
            node.caption = antwort.correctedName;
            if (tv.config.comparator && tv.config.orderBy == "comparator") node.getParent()?.sort();
        }
        zeigeInhalt();
    }

    async function projektLoeschen(w: Workspace) {
        const tv = main.projectExplorer.workspaceTreeview;
        const node = tv.findNodeByElement(w);
        if (!node || !tv.deleteCallback) return;
        if (!await jaNein("Projekt löschen", `Soll das Projekt „${w.name}“ mit allen Figuren und Blöcken gelöscht werden? Das lässt sich nicht rückgängig machen.`, "Löschen")) return;
        if (await tv.deleteCallback(w, node)) tv.removeNodeAndItsFolderContents(node);
        zeigeNav();
        zeigeInhalt();
    }

    function aufgabenKarte(w: Workspace, geoeffnet: boolean): HTMLElement {
        const t = taskOf(w)!;
        const karte = el("div", "gsg-projekte-aufgabe");
        const text = el("div", "gsg-projekte-aufgabentext");
        const zeile = el("span", "gsg-projekte-kachelname");
        zeile.append(el("strong", undefined, t.title.trim() || w.name));
        if (geoeffnet) zeile.append(el("span", "gsg-projekte-marke", "geöffnet"));
        text.append(zeile, el("span", "gsg-projekte-info", `Projekt „${w.name}“ · ${infoText(w)}`));
        const los = knopf(geoeffnet ? "Weiter" : "Öffnen", `${w.name} öffnen`, "gsg-projekte-los");
        los.addEventListener("click", () => oeffne(w));
        karte.append(vorschau(w), text, los);
        return karte;
    }

    zeigeNav();
    zeigeInhalt();
}

/** kleines Startbild der Bühne: Bühnenbild und Figuren an ihrer Startposition */
function vorschau(w: Workspace): HTMLCanvasElement {
    const c = el("canvas", "gsg-projekte-bild");
    c.width = VORSCHAU_B;
    c.height = VORSCHAU_H;
    c.setAttribute("aria-hidden", "true");
    const ctx = c.getContext("2d");
    if (!ctx) return c;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, VORSCHAU_B, VORSCHAU_H);
    const p = liesProjekt(w.getFiles().filter((f) => !f.isFolder));
    if (!p.buehne) {
        c.classList.add("gsg-projekte-bild-leer");
        return c;
    }
    const s = VORSCHAU_B / BUEHNE_BREITE;
    bildtafel().then((tafel) => {
        const nummer = bildnummer(p.buehne?.info.bild ?? "");
        if (nummer !== undefined) zeichne(ctx, tafel, buehnenbildName(nummer), 0, 0, VORSCHAU_B, VORSCHAU_H);
        for (const fig of p.figuren) {
            const b = GSG_FIGUR_GROESSE.breite * s, h = GSG_FIGUR_GROESSE.hoehe * s;
            const x = (fig.info.x + BUEHNE_BREITE / 2) * s - b / 2;
            const y = (BUEHNE_HOEHE / 2 - fig.info.y) * s - h / 2;
            zeichne(ctx, tafel, `${bibliotheksfigur(fig.info.figur) ?? GSG_FIGUREN[0].name}#0`, x, y, b, h);
        }
    }).catch(() => { /* ohne Bilder */ });
    return c;
}

/** Rückfrage mit Abbrechen und einem (roten) Knopf; Ergebnis true, wenn bestätigt */
function jaNein(titel: string, text: string, okText: string): Promise<boolean> {
    return new Promise((fertig) => {
        let ergebnis = false;
        const inhalt = el("div", "gsg-bl-frage");
        const abbrechen = knopf("Abbrechen", "Nichts ändern");
        const ok = knopf(okText, okText, "gsg-bl-knopf gsg-projekte-gefahr");
        const knoepfe = el("div", "gsg-bl-knoepfe");
        knoepfe.append(abbrechen, ok);
        inhalt.append(el("p", undefined, text), knoepfe);
        const schliessen = dialog(titel, inhalt, () => fertig(ergebnis));
        abbrechen.addEventListener("click", schliessen);
        ok.addEventListener("click", () => { ergebnis = true; schliessen(); });
        setTimeout(() => abbrechen.focus(), 0);
    });
}

/** Name erfragen und ein neues Projekt anlegen (wie „Neues Projekt …“ in der Projektliste); Blöckly richtet es ein */
export function neuesProjekt(main: Main) {
    const form = el("form", "gsg-bl-frage");
    const feld = el("input", "gsg-bl-feld");
    feld.value = "Neues Projekt";
    feld.setAttribute("aria-label", "Name des Projekts");
    const fehler = el("div", "gsg-bl-fehler");
    fehler.setAttribute("role", "alert");
    const knoepfe = el("div", "gsg-bl-knoepfe");
    const abbrechen = knopf("Abbrechen", "Kein Projekt anlegen");
    const ok = knopf("Anlegen", "Projekt anlegen und öffnen", "gsg-bl-knopf gsg-bl-start");
    ok.type = "submit";
    knoepfe.append(abbrechen, ok);
    form.append(feld, fehler, knoepfe);
    const zu = dialog("Neues Projekt", form);
    abbrechen.addEventListener("click", zu);
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = feld.value.trim().substring(0, 80);
        if (!name) { fehler.textContent = "Gib dem Projekt einen Namen."; return; }
        ok.disabled = true;
        const tv = main.projectExplorer.workspaceTreeview;
        const node = tv.addNode(false, name, "img_workspace-dark", null as unknown as Workspace);
        const w = await tv.newNodeCallback?.(name, node, undefined);
        if (!w) {
            tv.removeNodeAndItsFolderContents(node);
            ok.disabled = false;
            fehler.textContent = "Das Projekt konnte nicht angelegt werden.";
            return;
        }
        node.externalObject = w;
        zu();
        schliesseOffene?.();
    });
    setTimeout(() => { feld.focus(); feld.select(); }, 0);
}
