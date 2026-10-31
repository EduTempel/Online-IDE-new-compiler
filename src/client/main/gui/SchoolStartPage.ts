/**
 * Startseite des eigenen Backends (/start/) aus der IDE öffnen. Eigene Datei (statt SchoolBranding.ts),
 * weil SchoolBranding sehr früh geladen wird und keine Netzwerk-Module nach sich ziehen soll.
 */
import { ajaxAsync } from "../../communication/AjaxHelper.js";
import type { BaseResponse } from "../../communication/Data.js";
import { SCHOOL_START_URL } from "./SchoolBranding.js";

/**
 * Ist auf der Startseite schon jemand angemeldet (und ist die Anwendung freigegeben)? Dann gibt
 * das Backend ein Einmal-Token, mit dem sich die IDE ohne Passwort anmeldet.
 */
export async function portalSingleUseToken(app: "java" | "sql" | "bloecke" | "struktogramme" | "bloeckly"): Promise<string | null> {
    try {
        const response = await fetch("/api/start/ide-anmeldung", {
            method: "POST",
            headers: { "content-type": "application/json", "x-gsg-ide": "1" },
            body: JSON.stringify({ app }),
            credentials: "same-origin",
        });
        if (!response.ok) return null;
        const data = await response.json() as { ok?: boolean; singleUseToken?: string };
        return data.ok && data.singleUseToken ? data.singleUseToken : null;
    } catch {
        return null;
    }
}

/**
 * Öffnet die Startseite in einem neuen Tab und meldet dort mit einem Einmal-Token an.
 * Mit workspaceId ist dort gleich das Formular "Projekt per Link teilen" (bzw. "In die Galerie stellen",
 * Paket 17f) für dieses Projekt offen.
 * Der Tab wird sofort geöffnet (sonst blockiert der Browser ihn nach der Anfrage als Pop-up).
 */
export async function openSchoolStartPage(workspaceId?: number, target: "teilen" | "galerie" = "teilen") {
    await openSchoolStartPageAt(workspaceId != null ? `#${target}=` + workspaceId : "");
}

/** Startseite mit Sprungziel öffnen, z. B. #oeffnen=bloecke:12 (Paket 18g: kopiertes Projekt in Blöckva öffnen) */
export async function openSchoolStartPageAt(hash: string) {
    const tab = window.open("about:blank", "_blank");
    let url = SCHOOL_START_URL + hash;
    try {
        const response = await ajaxAsync("servlet/getSingleUseSessionToken", {}) as BaseResponse & { singleUseSessionToken?: string };
        if (response?.success && response.singleUseSessionToken) {
            url = SCHOOL_START_URL + "?singleUseToken=" + encodeURIComponent(response.singleUseSessionToken) + hash;
        }
    } catch { /* dann eben ohne automatische Anmeldung */ }
    if (tab) tab.location.href = url; else window.open(url, "_blank");
}
