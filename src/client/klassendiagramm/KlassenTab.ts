import type { MainBase } from "../main/MainBase";
import type { Main } from "../main/Main";
import type { Tab } from "../../tools/TabManager";
import { Constants } from "../Constants";

/**
 * Reiter „Klassen“ (Paket 20e): Knopf „＋ Als Datei“ legt aus den Klassen des Projekts eine Klassendiagramm-Datei
 * an, die sich bearbeiten, austeilen und drucken lässt (ohne Klassen: ein leeres Diagramm).
 */
export function addKlassendiagrammKnopf(base: MainBase, tab: Tab | undefined) {
    const main = base as Main;
    if (!tab || Constants.isBloecklyApp || typeof main.getMainEditor !== "function") return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "gsg-kd-alsdatei";
    b.textContent = "＋ Als Datei";
    b.title = "Klassendiagramm als Datei anlegen – zum Bearbeiten (Schreibweise wie im Abitur), Austeilen, Drucken und Umwandeln in Code";
    b.addEventListener("click", async () => {
        if (main.getCurrentWorkspace()?.readonly && !main.user?.is_teacher) return;
        const [{ docAusKlassen, klassenAusJava }, { emptyDoc, serializeDoc }, { STIL }, { createFile, freeName }] = await Promise.all([
            import("./KlassenJava"), import("./KlassenDoc"), import("./KlassenSvg"), import("../structogram/ProjectFiles")]);
        const ctx = document.createElement("canvas").getContext("2d")!;
        const measure = (text: string, bold: boolean) => {
            ctx.font = `${bold ? "bold " : ""}${STIL.font}px Arial, Helvetica, sans-serif`;
            return ctx.measureText(text).width;
        };
        const texte = (main.getCurrentWorkspace()?.getFiles() ?? []).filter((f) => !f.isFolder && /\.java$/i.test(f.name)).map((f) => f.getText());
        const klassen = klassenAusJava(texte);
        const doc = klassen.length ? docAusKlassen(klassen, measure) : emptyDoc();
        await createFile(main, freeName(main, "Klassendiagramm.klassendiagramm"), serializeDoc(doc));
    });
    tab.bodyDiv.append(b);
}
