/**
 * Startseite des eigenen Backends (/start/) aus der IDE öffnen. Eigene Datei (statt SchoolBranding.ts),
 * weil SchoolBranding sehr früh geladen wird und keine Netzwerk-Module nach sich ziehen soll.
 */
import { ajaxAsync } from "../../communication/AjaxHelper.js";
import type { BaseResponse } from "../../communication/Data.js";
import { SCHOOL_START_URL } from "./SchoolBranding.js";

/**
 * Öffnet die Startseite in einem neuen Tab und meldet dort mit einem Einmal-Token an.
 * Mit workspaceId ist dort gleich das Formular "Projekt per Link teilen" für dieses Projekt offen.
 * Der Tab wird sofort geöffnet (sonst blockiert der Browser ihn nach der Anfrage als Pop-up).
 */
export async function openSchoolStartPage(workspaceId?: number) {
    const hash = workspaceId != null ? "#teilen=" + workspaceId : "";
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
