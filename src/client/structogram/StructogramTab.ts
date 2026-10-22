import type { MainBase } from "../main/MainBase";
import type { Main } from "../main/Main";
import type { GUIFile } from "../workspace/File";
import { Tab, type TabManager } from "../../tools/TabManager";
import type { StructogramView } from "./StructogramView";

/**
 * Reiter "Struktogramm" neben "Ausgabe" und "Klassendiagramm" (GSG, Paket 7): zeigt das
 * Struktogramm der Datei im Editor und aktualisiert sich beim Bearbeiten – in Blöcken wie in
 * Java. Die Ansicht wird erst beim ersten Öffnen des Reiters geladen.
 */
export function addStructogramTab(base: MainBase, tabManager: TabManager) {
    const main = base as Main;
    if (typeof main.getMainEditor !== "function") return;
    const tab = new Tab("Structogram", "Struktogramm", ["gsg-structogram-tab"]);
    tabManager.addTab(tab);

    let loading: Promise<StructogramView> | undefined;
    let subscribed = false;
    const currentFile = (): GUIFile | undefined => {
        const model = main.getMainEditor().getModel();
        if (!model || model.getLanguageId() !== "myJava") return undefined;
        return main.getCurrentWorkspace()?.getFiles().find((f) => f.hasMonacoModel() && f.getMonacoModel() === model);
    };
    const update = async () => {
        if (!tab.isActive()) return;
        // erst jetzt: beim Aufbau des Reiters gibt es den Editor noch nicht
        if (!subscribed) {
            subscribed = true;
            main.getMainEditor().onDidChangeModel(() => { update(); });
        }
        loading ??= import("./StructogramView").then(({ StructogramView }) => new StructogramView(main, tab.bodyDiv));
        const view = await loading;
        if (!tab.isActive()) return;
        const file = currentFile();
        const model = main.getMainEditor().getModel();
        if (file) view.show(file);
        else if (model && /\.struktogramm$/i.test(model.uri.path.replace(/ \(\d+\)$/, ""))) view.showMessage("Diese Datei ist ein Struktogramm – sie wird links bearbeitet.");
        else view.showMessage("Struktogramme werden aus Java-Dateien erzeugt. „＋ Datei“ legt ein neues, leeres Struktogramm an.");
    };
    tab.onShow = () => { update(); };
    tab.onHide = () => { loading?.then((v) => v.hide()); };
}
