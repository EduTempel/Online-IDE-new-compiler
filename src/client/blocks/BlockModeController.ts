import jQuery from "jquery";
import type { Main } from "../main/Main";
import type { GUIFile } from "../workspace/File";
import type { Workspace } from "../workspace/Workspace";
import type { BlockView } from "./BlockView";
import { Constants } from "../Constants";
import "/assets/css/gsg-blocks.css";

/**
 * Umschalter "Blöcke | Java" über dem Editor (eigene Erweiterung des GSG).
 *
 * - gilt für Java-Dateien; die gewählte Ansicht merkt sich die IDE je Datei (bis zum Neuladen)
 * - Projekteinstellung "startet in der Blockansicht" (settings.blocks.start)
 * - Projekteinstellung "Java-Ansicht gesperrt" (settings.blocks.javaLocked): Schüler/innen sehen
 *   nur Blöcke (und die Java-Vorschau); Lehrkräfte können immer umschalten
 * - die Blockansicht (mit Blockly) wird erst beim ersten Umschalten nachgeladen
 */

type Mode = "java" | "blocks";

export type BlockSettings = { start?: boolean; javaLocked?: boolean };

export function blockSettingsOf(w: Workspace | undefined): BlockSettings {
    return (w?.settings as { blocks?: BlockSettings } | undefined)?.blocks ?? {};
}

export class BlockModeController {

    private mode: Mode = "java";
    private file?: GUIFile;
    private chosenMode = new WeakMap<GUIFile, Mode>();
    private view?: BlockView;
    private viewPromise?: Promise<BlockView>;

    private $toggle: JQuery<HTMLElement>;
    private $blocksButton: JQuery<HTMLElement>;
    private $javaButton: JQuery<HTMLElement>;
    private host: HTMLElement;

    constructor(private main: Main) {
        this.$toggle = jQuery(`<div class="gsg-viewtoggle" role="group" aria-label="Ansicht" style="display:none">
            <button type="button" data-mode="blocks" title="Programm mit Blöcken bauen (Strg+B)">Blöcke</button>
            <button type="button" data-mode="java" title="Programm als Java-Text bearbeiten (Strg+B)">Java</button>
        </div>`);
        this.$blocksButton = this.$toggle.find('[data-mode="blocks"]');
        this.$javaButton = this.$toggle.find('[data-mode="java"]');
        this.$blocksButton.on("click", () => this.choose("blocks"));
        this.$javaButton.on("click", () => this.choose("java"));
        jQuery("#debugpanel").prepend(this.$toggle);

        this.host = document.createElement("div");
        this.host.id = "gsg-blocks";
        this.host.style.display = "none";
        jQuery("#editor").after(this.host);

        main.getMainEditor().onDidChangeModel(() => this.refresh());

        // Strg+B: zwischen Blöcken und Java umschalten
        document.addEventListener("keydown", (e) => {
            if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "b" || !this.file) return;
            e.preventDefault();
            e.stopPropagation();
            this.choose(this.mode === "blocks" ? "java" : "blocks");
        }, true);
    }

    /** Lehrkraft (oder Admin)? Die dürfen immer auf Java umschalten. */
    private isStaff(): boolean {
        const u = this.main.user;
        return !!u && (u.is_teacher || u.is_admin || u.is_schooladmin);
    }

    /**
     * Java-Ansicht gesperrt? Lehrkräfte dürfen immer. In der Anwendung "Blöcke" nur, wenn die
     * Lerngruppe es erlaubt (Freigabe "Java-Ansicht in Blöcke"); sonst nach Projekteinstellung.
     */
    private javaLocked(): boolean {
        if (this.isStaff()) return false;
        if (Constants.isBlocksApp && !(this.main.user as { gsgFreigaben?: { bloeckeJava?: boolean } } | undefined)?.gsgFreigaben?.bloeckeJava) return true;
        return !!blockSettingsOf(this.main.getCurrentWorkspace()).javaLocked;
    }

    private currentFile(): GUIFile | undefined {
        const model = this.main.getMainEditor().getModel();
        if (!model || model.getLanguageId() !== "myJava") return undefined;
        return this.main.getCurrentWorkspace()?.getFiles().find((f) => f.hasMonacoModel() && f.getMonacoModel() === model);
    }

    /** Neue Datei im Editor (oder Einstellungen geändert): passende Ansicht wählen */
    refresh() {
        const file = this.currentFile();
        if (this.file && this.file !== file && this.mode === "blocks") this.view?.hide();
        this.file = file;
        this.$toggle.css("display", file ? "" : "none");
        if (!file) {
            this.apply("java");
            return;
        }
        const startInBlocks = Constants.isBlocksApp || !!blockSettingsOf(this.main.getCurrentWorkspace()).start;
        let mode: Mode = this.chosenMode.get(file) ?? (startInBlocks ? "blocks" : "java");
        if (this.javaLocked()) mode = "blocks";
        this.apply(mode);
    }

    private choose(mode: Mode) {
        if (!this.file || mode === this.mode) return;
        if (mode === "java" && this.javaLocked()) return;
        if (mode === "java" && this.view?.hasLooseBlocks()
            && !confirm("Einige Blöcke hängen nicht am Programmstart. Sie gehören nicht zum Programm und gehen beim Wechsel in die Java-Ansicht verloren. Trotzdem wechseln?")) {
            return;
        }
        this.chosenMode.set(this.file, mode);
        this.apply(mode);
    }

    private async apply(mode: Mode) {
        this.mode = mode;
        this.$blocksButton.toggleClass("active", mode === "blocks").attr("aria-pressed", String(mode === "blocks"));
        this.$javaButton.toggleClass("active", mode === "java").attr("aria-pressed", String(mode === "java"));
        const locked = this.javaLocked();
        this.$javaButton.prop("disabled", locked).attr("title", locked
            ? (Constants.isBlocksApp ? "Die Java-Ansicht ist für deine Lerngruppe (noch) nicht freigegeben."
                : "Die Java-Ansicht ist für dieses Projekt von der Lehrkraft gesperrt.")
            : "Programm als Java-Text bearbeiten");

        const editorDiv = document.getElementById("editor")!;
        if (mode === "java") {
            this.view?.hide();
            this.host.style.display = "none";
            editorDiv.style.display = "";
            this.main.getMainEditor().layout();
            return;
        }

        editorDiv.style.display = "none";
        this.host.style.display = "";
        const file = this.file!;
        const view = await this.loadView();
        if (this.mode !== "blocks" || this.file !== file) return;   // inzwischen umgeschaltet
        const workspace = this.main.getCurrentWorkspace();
        const readOnly = !!workspace?.readonly && !this.main.user?.is_teacher;
        view.show(file, readOnly);
    }

    private loadView(): Promise<BlockView> {
        if (!this.viewPromise) {
            this.host.innerHTML = `<div class="gsg-blocks-loading">Blöcke werden geladen …</div>`;
            this.viewPromise = import("./BlockView").then(({ BlockView }) => {
                this.view = new BlockView(this.main, this.host);
                return this.view;
            });
        }
        return this.viewPromise;
    }
}

/**
 * Teil des Dialogs "Einstellungen" eines Workspaces: Blockmodus. Liefert eine Funktion, die die
 * Auswahl übernimmt (true, wenn sich etwas geändert hat).
 */
export function addBlockSettings(container: HTMLElement, workspace: Workspace, main: Main): () => boolean {
    const current = blockSettingsOf(workspace);
    const u = main.user;
    const staff = !!u && (u.is_teacher || u.is_admin || u.is_schooladmin);
    const div = document.createElement("div");
    div.className = "gsg-block-settings";
    div.innerHTML = `<div class="gsg-block-settings-title">Blockmodus</div>
        <label><input type="checkbox" class="gsg-bs-start"> Java-Dateien starten in der Blockansicht</label>
        <label><input type="checkbox" class="gsg-bs-locked"> Java-Ansicht für Schüler/innen sperren (nur Blöcke)</label>`;
    const start = div.querySelector<HTMLInputElement>(".gsg-bs-start")!;
    const locked = div.querySelector<HTMLInputElement>(".gsg-bs-locked")!;
    start.checked = !!current.start;
    locked.checked = !!current.javaLocked;
    if (!staff) {
        locked.disabled = true;
        locked.parentElement!.title = "Kann nur eine Lehrkraft ändern.";
    }
    locked.addEventListener("change", () => { if (locked.checked) start.checked = true; });
    container.append(div);

    return () => {
        const next: BlockSettings = { start: start.checked, javaLocked: locked.checked };
        if (!!current.start === next.start && !!current.javaLocked === next.javaLocked) return false;
        (workspace.settings as { blocks?: BlockSettings }).blocks = next;
        main.blockModeController?.refresh();
        return true;
    };
}
