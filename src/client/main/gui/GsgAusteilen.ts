import "/assets/css/gsg-austeilen.css";
import { Constants } from "../../Constants.js";
import { dialog, el, knopf } from "../../bloeckly/BloecklyDialog.js";
import { BUEHNEN_DATEI, HAUPTPROGRAMM } from "../../bloeckly/BloecklyProjekt.js";
import type { ClassData, DistributeWorkspaceResponse } from "../../communication/Data.js";
import type { Workspace } from "../../workspace/Workspace.js";
import type { Main } from "../Main.js";

/**
 * GSG: Austeilen einzelner Dateien. Vor dem Austeilen wählt die Lehrkraft, welche Dateien mitgehen (alle sind
 * angehakt). Wurde das Projekt schon ausgeteilt, kommen nur die fehlenden Dateien dazu – im selben Projekt der
 * Schüler/innen; was sie schon haben, bleibt unverändert. Der Server meldet zurück, was passiert ist.
 */

/** Zusammenfassung vom Server (distributeWorkspace, gsgResult) */
export type AusteilErgebnis = NonNullable<DistributeWorkspaceResponse["gsgResult"]>;

type Datei = { id: number; pfad: string; noetig: boolean };

/** Dateien zum Auswählen (ohne Ordner), mit Ordnerpfad; Blöckly: Bühne und Hauptprogramm gehen immer mit */
function dateienDes(workspace: Workspace): Datei[] {
    return workspace.getFiles()
        .filter((f) => !f.isFolder)
        .map((f) => ({
            id: f.id,
            pfad: [...workspace.getPath(f), f.name].join("/"),
            noetig: Constants.isBloecklyApp && f.parent_folder_id == null && (f.name === BUEHNEN_DATEI || f.name === HAUPTPROGRAMM),
        }))
        .sort((a, b) => Number(b.noetig) - Number(a.noetig) || a.pfad.localeCompare(b.pfad, "de"));
}

/**
 * Welche Dateien sollen mit? null: alle (ganzes Projekt), Liste: nur diese, undefined: abgebrochen.
 * Bei höchstens einer Datei gibt es nichts zu wählen.
 */
export function dateienWaehlen(workspace: Workspace, ziel: string): Promise<number[] | null | undefined> {
    const dateien = dateienDes(workspace);
    if (dateien.filter((d) => !d.noetig).length <= 1) return Promise.resolve(null);
    return new Promise((fertig) => {
        const form = el("form", "gsg-bl-frage gsg-austeilen");
        form.append(el("p", undefined, `Welche Dateien sollen an ${ziel} gehen?`));
        const aktionen = el("div", "gsg-austeilen-aktionen");
        const alle = knopf("alle", "Alle Dateien anhaken");
        const keine = knopf("keine", "Alle Haken entfernen");
        const zaehler = el("span", "gsg-austeilen-zaehler");
        aktionen.append(alle, keine, zaehler);
        const liste = el("div", "gsg-austeilen-liste");
        const boxen: [Datei, HTMLInputElement][] = [];
        for (const d of dateien) {
            const zeile = el("label", "gsg-austeilen-datei");
            const c = el("input");
            c.type = "checkbox";
            c.checked = true;
            c.disabled = d.noetig;
            zeile.append(c, el("span", undefined, d.pfad));
            if (d.noetig) zeile.append(el("span", "gsg-austeilen-noetig", "geht immer mit"));
            liste.append(zeile);
            boxen.push([d, c]);
        }
        const hinweis = el("p", "gsg-austeilen-hinweis",
            "Haben Schüler/innen das Projekt schon, kommen nur die Dateien dazu, die dort noch fehlen – im selben Projekt. "
            + "Dateien, die sie schon haben, bleiben unverändert.");
        const fehler = el("div", "gsg-bl-fehler");
        fehler.setAttribute("role", "alert");
        const ok = knopf("Austeilen", "Die angehakten Dateien austeilen", "gsg-bl-knopf gsg-bl-start");
        ok.type = "submit";
        const abbrechen = knopf("Abbrechen", "Nichts austeilen");
        const knoepfe = el("div", "gsg-bl-knoepfe");
        knoepfe.append(abbrechen, ok);
        form.append(aktionen, liste, hinweis, fehler, knoepfe);

        const gewaehlt = () => boxen.filter(([d, c]) => c.checked && !d.noetig);
        const zeige = () => {
            const n = boxen.filter(([, c]) => c.checked).length;
            zaehler.textContent = `${n} von ${boxen.length} Dateien`;
            const leer = gewaehlt().length === 0;
            fehler.textContent = leer ? "Hake mindestens eine Datei an." : "";
            ok.disabled = leer;
        };
        for (const [, c] of boxen) c.addEventListener("change", zeige);
        alle.addEventListener("click", () => { for (const [d, c] of boxen) if (!d.noetig) c.checked = true; zeige(); });
        keine.addEventListener("click", () => { for (const [d, c] of boxen) if (!d.noetig) c.checked = false; zeige(); });
        zeige();

        let ergebnis: number[] | null | undefined;
        const schliessen = dialog(`„${workspace.name}“ austeilen`, form, () => fertig(ergebnis));
        abbrechen.addEventListener("click", schliessen);
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            if (gewaehlt().length === 0) return;
            ergebnis = boxen.every(([, c]) => c.checked) ? null : boxen.filter(([, c]) => c.checked).map(([d]) => d.id);
            schliessen();
        });
        setTimeout(() => ok.focus(), 0);
    });
}

const anzahl = (n: number, eins: string, mehr: string) => `${n} ${n === 1 ? eins : mehr}`;

/** Meldung nach dem Austeilen (ohne Ergebnis vom Server: undefined) */
export function ergebnisText(name: string, ziel: string, r: AusteilErgebnis | undefined): string | undefined {
    if (!r) return undefined;
    const teile: string[] = [];
    if (r.created) teile.push(`${anzahl(r.created, "Schüler/in hat", "Schüler/innen haben")} das Projekt neu bekommen`);
    if (r.extended) teile.push(`bei ${anzahl(r.extended, "Schüler/in", "Schüler/innen")} kamen Dateien dazu`);
    if (r.unchanged) teile.push(`${anzahl(r.unchanged, "Schüler/in hatte", "Schüler/innen hatten")} schon alles`);
    let text = `„${name}“ wurde an ${ziel} ausgeteilt: ${teile.join(", ")}.`;
    const vorhanden = Object.entries(r.kept).sort((a, b) => a[0].localeCompare(b[0], "de"));
    if (vorhanden.length) {
        text += "\n\nSchon vorhanden und unverändert gelassen:\n"
            + vorhanden.map(([datei, n]) => `• ${datei} (bei ${anzahl(n, "Schüler/in", "Schüler/innen")})`).join("\n");
    }
    return text + "\n\nDie Schüler/innen sehen es sofort; falls nicht, hilft kurz ab- und wieder anmelden.";
}

/**
 * Austeilen mit Dateiauswahl: an eine Klasse (klasse) oder an Einzelne (studentIds). standard: die bisherige
 * Meldung, falls der Server keine Zusammenfassung schickt.
 */
export function austeilen(main: Main, workspace: Workspace, klasse: ClassData | null, studentIds: number[] | null,
    ziel: string, standard: () => string) {
    dateienWaehlen(workspace, ziel).then((fileIds) => {
        if (fileIds === undefined) return;
        main.networkManager.sendDistributeWorkspace(workspace, klasse, studentIds, (error, ergebnis) => {
            if (error != null) alert(error);
            else alert(ergebnisText(workspace.name, ziel, ergebnis) ?? standard());
        }, fileIds);
    });
}

/**
 * Schülerseite: Hinweis, wenn in einen vorhandenen Workspace neue Dateien gekommen sind (neu: [Workspace, Datei]).
 * Neue Workspaces meldet die IDE schon selbst.
 */
export function hinweisNeueDateien(neu: [string, string][]) {
    if (neu.length === 0) return;
    const proWorkspace = new Map<string, string[]>();
    for (const [ws, datei] of neu) proWorkspace.set(ws, [...(proWorkspace.get(ws) ?? []), datei]);
    alert(neueDateienText(proWorkspace));
}

export function neueDateienText(proWorkspace: Map<string, string[]>): string {
    const [[ws, dateien]] = proWorkspace;
    if (proWorkspace.size === 1) return `Neu in Deinem Workspace „${ws}“: ${dateien.join(", ")}`;
    return "Neu in Deinen Workspaces:\n" + [...proWorkspace].map(([w, d]) => `• „${w}“: ${d.join(", ")}`).join("\n");
}
