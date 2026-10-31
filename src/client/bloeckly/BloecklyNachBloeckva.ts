import type { Main } from "../main/Main.js";
import type { Workspace } from "../workspace/Workspace.js";
import type { TreeviewContextMenuItem } from "../../tools/components/treeview/Treeview.js";
import { ajaxAsync } from "../communication/AjaxHelper.js";
import { Constants } from "../Constants.js";
import { openSchoolStartPageAt } from "../main/gui/SchoolStartPage.js";
import { dialog, el, knopf } from "./BloecklyDialog.js";

/**
 * Paket 18g: Brücke zu Blöckva. „Als Blöckva-Projekt kopieren“ (Rechtsklick auf ein Projekt in Blöckly) legt eine
 * Kopie in die Projektliste von Blöckva. Dort sind die Figuren als Klassen zu sehen (class Waschbär extends Figur)
 * und die Skripte als Operationen mit @BeimStart, @WennTaste … – das Programm läuft dort genauso.
 */
export function bloeckvaMenuItems(main: Main, workspace: Workspace): TreeviewContextMenuItem<Workspace, number>[] {
    if (!Constants.isBloecklyApp || workspace.isFolder) return [];
    const u = main.user as { is_teacher?: boolean; is_admin?: boolean; is_schooladmin?: boolean; gsgFreigaben?: { bloecke?: boolean } } | undefined;
    const darf = !!u && (u.is_teacher || u.is_admin || u.is_schooladmin || u.gsgFreigaben?.bloecke !== false);
    if (!darf) return [];
    return [{
        caption: "Als Blöckva-Projekt kopieren ...",
        callback: () => { void kopieren(main, workspace); },
    }];
}

async function kopieren(main: Main, workspace: Workspace) {
    await main.networkManager.sendUpdatesAsync(true);   // aktuellen Stand speichern
    let antwort: { success?: boolean; message?: string | null; workspace?: { id: number; name: string } };
    try {
        antwort = await ajaxAsync("/servlet/copyWorkspaceToBloeckva", { workspace_id: workspace.id }) as typeof antwort;
    } catch (e) {
        antwort = { success: false, message: String((e as Error)?.message ?? e) };
    }
    if (!antwort?.success || !antwort.workspace) {
        alert(antwort?.message || "Das Projekt konnte nicht kopiert werden.");
        return;
    }
    const kopie = antwort.workspace;
    const inhalt = el("div", "gsg-bl-bloeckva");
    inhalt.append(
        el("p", undefined, `„${kopie.name}“ liegt jetzt als Kopie ganz oben in deinen Projekten in Blöckva. Das Original bleibt hier.`),
        el("p", undefined, "In Blöckva siehst du, was die ganze Zeit dahintersteckte: Jede Figur ist eine Klasse, jedes Skript eine Operation dieser Klasse."));
    const zeile = el("div", "gsg-bl-knoepfe");
    const oeffnen = knopf("Blöckva öffnen", "Die Kopie in Blöckva öffnen (neuer Tab)", "gsg-bl-knopf gsg-bl-start");
    const fertig = knopf("Schließen", "Hier in Blöckly bleiben");
    zeile.append(oeffnen, fertig);
    inhalt.append(zeile);
    const schliessen = dialog("Kopie in Blöckva", inhalt);
    oeffnen.addEventListener("click", () => { schliessen(); void openSchoolStartPageAt(`#oeffnen=bloecke:${kopie.id}`); });
    fertig.addEventListener("click", schliessen);
    oeffnen.focus();
}
