import type { Main } from "../main/Main.js";
import { Workspace } from "../workspace/Workspace.js";
import { GUIFile } from "../workspace/File.js";

/**
 * Handbuch Blöckly (Paket 18h): „▶ Ausprobieren“ legt das Beispiel als eigenes Projekt an („Beispiel: …“) und öffnet
 * es. Gibt es das Projekt schon, wird es nur geöffnet – Änderungen daran bleiben erhalten.
 */
export async function beispielProjektOeffnen(main: Main, titel: string, dateien: { name: string; text: string }[], zeige?: string) {
    if (main.workspacesOwnerId != null && main.workspacesOwnerId !== main.user?.id) {
        alert("Du siehst gerade die Projekte einer anderen Person. Wechsle zuerst zurück zu deinen eigenen Projekten.");
        return;
    }
    const name = ("Beispiel: " + titel).slice(0, 80);
    const vorhanden = main.workspaceList.find((w) => !w.isFolder && w.name === name);
    if (vorhanden) {
        oeffnen(main, vorhanden, zeige);
        return;
    }

    const w = new Workspace(name, main, main.user.id);
    w.settings.language = "Java";
    // ganz oben in der Liste
    w.sorting_order = Math.min(0, ...main.workspaceList.map((x) => x.sorting_order ?? 0)) - 1;
    main.workspaceList.push(w);
    const ok = main.user.is_testuser || await main.networkManager.sendCreateWorkspace(w, main.workspacesOwnerId);
    if (!ok) {
        main.workspaceList.splice(main.workspaceList.indexOf(w), 1);
        alert("Das Beispielprojekt konnte nicht angelegt werden.");
        return;
    }
    // Dateien vor dem Öffnen anlegen: Ein leeres Blöckly-Projekt würde sonst Bühne und Waschbär von selbst bekommen
    for (const d of dateien) {
        const f = new GUIFile(main, d.name, d.text);
        w.addFile(f);
        if (!main.user.is_testuser) await main.networkManager.sendCreateFile(f, w, main.workspacesOwnerId);
    }
    const explorer = main.projectExplorer;
    explorer.workspaceTreeview.addNode(false, w.name, explorer.getIconClassForWorkspace(w), w, null);
    oeffnen(main, w, zeige);
}

function oeffnen(main: Main, w: Workspace, zeige?: string) {
    main.projectExplorer.setWorkspaceActive(w, true);
    const datei = w.getFiles().find((f) => f.name === zeige);
    if (datei) main.projectExplorer.setFileActive(datei);
}
