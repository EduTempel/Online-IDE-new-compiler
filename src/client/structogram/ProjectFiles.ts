import type { Main } from "../main/Main";
import { GUIFile } from "../workspace/File";
import { FileTypeManager } from "../../compiler/common/module/FileTypeManager";

/**
 * Dateien im aktuellen Projekt anlegen bzw. ändern – wie der Projekt-Explorer es tut (Paket 7b:
 * "In Java umwandeln", "Als Struktogramm-Datei übernehmen").
 */

/** Dateiname, der im Projekt (im selben Ordner) noch frei ist: "Name.ext", "Name (2).ext" … */
export function freeName(main: Main, wanted: string, folderId: number | null = null): string {
    const files = main.getCurrentWorkspace()?.getFiles() ?? [];
    const taken = new Set(files.filter((f) => (f.parent_folder_id ?? null) === folderId).map((f) => f.name.toLowerCase()));
    if (!taken.has(wanted.toLowerCase())) return wanted;
    const dot = wanted.lastIndexOf(".");
    const base = dot > 0 ? wanted.slice(0, dot) : wanted, ext = dot > 0 ? wanted.slice(dot) : "";
    for (let i = 2; ; i++) {
        const name = `${base} (${i})${ext}`;
        if (!taken.has(name.toLowerCase())) return name;
    }
}

export function findFile(main: Main, name: string, folderId: number | null = null): GUIFile | undefined {
    return main.getCurrentWorkspace()?.getFiles().find((f) => !f.isFolder && (f.parent_folder_id ?? null) === folderId && f.name.toLowerCase() === name.toLowerCase());
}

/** neue Datei anlegen, im Projekt-Explorer zeigen und öffnen */
export async function createFile(main: Main, name: string, text: string, folderId: number | null = null): Promise<GUIFile | undefined> {
    const workspace = main.getCurrentWorkspace();
    if (!workspace) {
        alert("Bitte zuerst ein Projekt (Workspace) auswählen.");
        return undefined;
    }
    const file = new GUIFile(main, name, text);
    file.parent_folder_id = folderId;
    workspace.addFile(file);
    const ok = main.user?.is_testuser || await main.networkManager.sendCreateFile(file, workspace, main.workspacesOwnerId);
    if (!ok) {
        workspace.removeFile(file);
        alert("Die Datei konnte nicht angelegt werden.");
        return undefined;
    }
    const icon = FileTypeManager.filenameToFileType(name, main.getCurrentProgrammingLanguage()).iconclass;
    main.projectExplorer.fileTreeview.addNode(false, name, icon, file, folderId ?? undefined);
    main.projectExplorer.setFileActive(file);
    return file;
}

/** Text einer vorhandenen Datei ersetzen (wird gespeichert) */
export function replaceText(main: Main, file: GUIFile, text: string) {
    file.setText(text);
    file.setSaved(false);
    main.networkManager.sendUpdatesAsync(true);
}
