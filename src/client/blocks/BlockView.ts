import { slowMotionButton } from "../objects/SlowMotion";
import { BLOCK_ZOOM_GROSS, BLOCK_ZOOM_NORMAL, istGrosseAnsicht } from "../main/gui/GrosseAnsicht.js";
import * as Blockly from "blockly/core";
import * as De from "blockly/msg/de";
import * as monaco from "monaco-editor";
import type { Main } from "../main/Main";
import type { GUIFile } from "../workspace/File";
import { defineBlocks, theme, toolbox, VARIABLES_CATEGORY, variablesFlyout } from "./BlockDefinitions";
import { handleRename, OPERATIONS_CATEGORY, operationsFlyout, syncCalls } from "./BlockOperations";
import { FIGURES_CATEGORY, figuresFlyout, INPUT_CATEGORY, inputFlyout, setSpriteSource } from "./BlockFigures";
import { createSpriteSource } from "./SpritePreview";
import { ADT_CATEGORY, adtFlyout, ARRAYS_CATEGORY, arraysFlyout, LISTS_CATEGORY, listsFlyout } from "./BlockCollections";
import { CLASSES_CATEGORY, classesFlyout, OBJECTS_CATEGORY, objectsFlyout } from "./BlockClasses";
import { classInfosFromState, type ClassInfo } from "./ClassModel";
import { registerRenderer } from "./BlockRenderer";
import { adaptDeclarationValue, applyTypes, collectVariables, isHat, setExternalClasses, setFixedVariables, type JType } from "./BlockTypeSystem";
import { B, isPartHat, type BlockState, type WorkspaceState } from "./BlockTypes";
import { JavaBlockGenerator } from "./JavaBlockGenerator";
import { JavaBlockParser, type LineRange } from "./JavaBlockParser";
import { Constants } from "../Constants";
import { registerBlockImageMenu } from "./BlockImage";
import { registerBlockHelpMenu } from "./BlockHelp";
import { ScopeHighlight } from "./BlockScope";
import { ValueBubble } from "./BlockValueBubble";
import { labelMode, setLabelMode, type LabelMode } from "./BlockLabels";
import { blockPermissions, type BlockPermissions } from "./BlockPermissions";
import { bloecklyPuzzleLine, checkPuzzle, puzzleMessage, puzzleSolution, scramble, setPuzzleSolution } from "./BlockPuzzle";
import { updateHelpHint } from "./BlockWarningHelp";
import { ensureLibraries } from "../structogram/ProjectFiles";
import { autoCollapseLeftPanel } from "../main/gui/LeftPanelToggle";
import { bloecklyToolbox, defineBloecklyBlocks, registerBloecklyToolbox, setBloecklyUi } from "../bloeckly/BloecklyBlocks";
import { BUEHNEN_KLASSE, globaleStellen, globaleUmbenannt, liesBuehne, liesFigur, liesProjekt, mitVariable, ohneVariable, startwert, variablenDerKlasse } from "../bloeckly/BloecklyProjekt";
import type { BloecklyContext } from "../bloeckly/BloecklySpec";
import { setProjectMessages } from "./BlockParts";

/**
 * Blockansicht einer Java-Datei: links die Blöcke (Blockly), rechts der daraus erzeugte
 * Java-Code (nur lesbar). Wird erst geladen, wenn jemand auf "Blöcke" umschaltet.
 *
 * - Öffnen: Java-Code -> Blöcke (der Code bleibt unverändert, solange niemand etwas ändert)
 * - Ändern: Blöcke -> Java-Code; der Code im Editor-Modell wird ersetzt (dadurch wie gewohnt
 *   übersetzt und gespeichert)
 * - Ändert sich der Code von außen (z. B. Korrektur der Lehrkraft), werden die Blöcke neu aufgebaut
 * - Fehlermeldungen des Compilers und die aktuelle Programmzeile erscheinen am Block
 */
/** Abstand zwischen Hauptprogramm und Operationen */
const HAT_GAP = 40;

export class BlockView {

    private ws?: Blockly.WorkspaceSvg;
    private scopeHighlight?: ScopeHighlight;
    private valueBubble?: ValueBubble;
    private wsReadOnly = false;
    private wsDark = true;
    private wsHidden = "";
    /** Puzzle (Paket 17e): ohne Werkzeugleiste, Blöcke nur verschiebbar */
    private wsPuzzle = false;

    private file?: GUIFile;
    private model?: monaco.editor.ITextModel;
    private modelListener?: monaco.IDisposable;

    /** zuletzt gelesener bzw. selbst geschriebener Code */
    private lastText = "";
    private ranges: LineRange[] = [];
    /**
     * Blöckly: Kopf der Klasse (Klassenname, Konstruktor, Variablen der Figur bzw. für alle Figuren). Er steht nicht
     * als Block in der Fläche, sondern läuft unsichtbar mit und kommt beim Zurückschreiben wieder dazu.
     */
    private blHeader?: BlockState;
    /** Blöckly: Name der Figur (oder „die Bühne“), die schon ein Skript „Wenn 🚩 angeklickt“ hat – nicht diese Datei */
    private flagElsewhere?: string;
    private loading = false;
    private writeTimer?: ReturnType<typeof setTimeout>;
    private highlighted: string | null = null;
    private selectedId: string | null = null;

    private blocklyDiv: HTMLDivElement;
    private toolboxButton: HTMLButtonElement;
    private resetButton: HTMLButtonElement;
    private toolboxVisible = true;
    /** Code beim Wechsel in die Blockansicht (für "Zurücksetzen") */
    private openedText = "";
    private notice: HTMLDivElement;
    private previewCode: HTMLDivElement;
    private previewBox: HTMLDivElement;

    /** „Große Ansicht“ (GrosseAnsicht.ts) */
    setZoom(scale: number) {
        this.ws?.setScale(scale);
    }

    constructor(private main: Main, private host: HTMLElement) {
        Blockly.setLocale(De as unknown as { [key: string]: string });
        defineBlocks();
        defineBloecklyBlocks();
        registerRenderer();
        registerBlockImageMenu(() => this.file?.name);   // Rechtsklick: Blöcke als Bild speichern
        registerBlockHelpMenu();                         // Rechtsklick: Hilfe (Handbuch)

        host.innerHTML = "";
        const area = document.createElement("div");
        area.className = "gsg-blocks-area";
        this.blocklyDiv = document.createElement("div");
        this.blocklyDiv.className = "gsg-blockly";
        this.notice = document.createElement("div");
        this.notice.className = "gsg-blocks-notice";
        this.notice.hidden = true;
        this.notice.textContent = this.looseText;
        // Leiste über den Blöcken: Werkzeugleiste ein-/ausblenden, auf den Stand beim Öffnen zurücksetzen
        const bar = document.createElement("div");
        bar.className = "gsg-blocks-bar";
        this.toolboxButton = document.createElement("button");
        this.toolboxButton.type = "button";
        this.toolboxButton.textContent = "◧ Werkzeugleiste ausblenden";
        this.toolboxButton.title = "Mehr Platz für die Blöcke";
        this.toolboxButton.addEventListener("click", () => this.toggleToolbox());
        this.resetButton = document.createElement("button");
        this.resetButton.type = "button";
        this.resetButton.textContent = "↺ Zurücksetzen";
        this.resetButton.title = "Alle Änderungen seit dem Wechsel in die Blockansicht verwerfen";
        this.resetButton.addEventListener("click", () => this.resetToOpened());
        const keys = this.keysHint = document.createElement("span");
        keys.className = "gsg-blocks-keys";
        keys.textContent = "Strg+B: Blöcke ↔ Java";
        // Paket 17d: Beschriftung der Blöcke Deutsch oder Java (pro Gerät gemerkt)
        this.labelSwitch = document.createElement("span");
        this.labelSwitch.className = "gsg-label-switch";
        this.labelSwitch.title = "Beschriftung der Blöcke: Deutsch oder so, wie es in Java heißt";
        const caption = document.createElement("span");
        caption.textContent = "Beschriftung:";
        this.labelSwitch.append(caption);
        for (const [m, text] of [["de", "Deutsch"], ["java", "Java"]] as [LabelMode, string][]) {
            const b = document.createElement("button");
            b.type = "button";
            b.textContent = text;
            b.dataset.mode = m;
            b.addEventListener("click", () => this.switchLabels(m));
            this.labelSwitch.append(b);
        }
        this.updateLabelSwitch();
        // Paket 17e: Puzzle – Lehrkräfte machen eins daraus bzw. heben es auf, alle prüfen ihren Stand
        this.puzzleMakeButton = this.barButton("🧩 Als Puzzle", "Die Blöcke dieser Datei mischen: Schüler/innen bringen sie wieder in die richtige Reihenfolge", () => this.makePuzzle());
        this.puzzleEndButton = this.barButton("🧩 Puzzle aufheben", "Die Lösung wiederherstellen und das Puzzle beenden", () => this.endPuzzle());
        this.puzzleCheckButton = this.barButton("🧩 Prüfen", "Stehen alle Blöcke an der richtigen Stelle?", () => this.checkPuzzle());
        this.puzzleCheckButton.classList.add("gsg-puzzle-check");
        this.puzzleResult = document.createElement("span");
        this.puzzleResult.className = "gsg-puzzle-result";
        this.puzzleResult.setAttribute("role", "status");
        this.puzzleResult.hidden = true;
        this.puzzleResult.addEventListener("click", () => (this.puzzleResult.hidden = true));
        bar.append(this.toolboxButton, this.resetButton, this.puzzleCheckButton, this.puzzleMakeButton, this.puzzleEndButton,
            slowMotionButton(this.main, "gsg-blocks-slow"), this.labelSwitch, keys);
        area.append(bar, this.blocklyDiv, this.notice, this.puzzleResult);

        const preview = this.previewBox = document.createElement("div");
        preview.className = "gsg-blocks-preview";
        const head = document.createElement("div");
        head.className = "gsg-preview-head";
        head.innerHTML = `<span class="gsg-preview-title">Java</span><span class="gsg-preview-sub">aus den Blöcken erzeugt</span>`;
        const toggle = document.createElement("button");
        toggle.className = "gsg-preview-toggle";
        toggle.title = "Java-Vorschau ein-/ausblenden";
        toggle.textContent = "⟩";
        toggle.addEventListener("click", () => {
            const collapsed = preview.classList.toggle("collapsed");
            this.previewCollapsedByUser = collapsed;
            toggle.textContent = collapsed ? "⟨" : "⟩";
            this.resize();
        });
        head.prepend(toggle);
        this.previewCode = document.createElement("div");
        this.previewCode.className = "gsg-preview-code jo_editorFontSize";
        preview.append(head, this.previewCode);

        host.append(area, preview);

        new ResizeObserver(() => this.resize()).observe(host);

        // Fehlermeldungen des Compilers
        monaco.editor.onDidChangeMarkers((uris) => {
            if (this.model && uris.some((u) => u.toString() === this.model!.uri.toString())) this.updateErrors();
        });
        // aktuelle Programmzeile (Einzelschritt, Haltepunkt)
        main.getMainEditor().onDidChangeModelDecorations(() => this.updateProgramPointer());
    }

    // ------------------------------------------------------------------ Anzeigen / Verbergen

    show(file: GUIFile, readOnly: boolean) {
        const dark = this.main.themeManager?.currentTheme?.name !== "light";
        const perms = this.permissions();
        // ohne Freigabe „Beschriftung auf Java umschalten“ immer deutsch (die Wahl des Geräts bleibt gespeichert)
        if (!perms.javaLabels && labelMode() !== "de") setLabelMode("de", false);
        this.labelSwitch.hidden = !perms.javaLabels;
        // ohne Java-Ansicht (Freigabe oder Projekteinstellung) kein Hinweis auf Strg+B
        this.keysHint.hidden = !!(this.main as { blockModeController?: { isJavaLocked?(): boolean } }).blockModeController?.isJavaLocked?.();
        this.updateLabelSwitch();
        this.previewBox.style.display = perms.preview ? "" : "none";
        // neu aufbauen, wenn sich Ansicht, Thema, Beschriftung oder Freigaben (andere Anmeldung) geändert haben
        const puzzle = this.solutionOf(file) !== undefined;
        if (!this.ws || this.wsReadOnly !== readOnly || this.wsDark !== dark || this.wsHidden !== this.hiddenCategories().join(",")
            || this.wsPuzzle !== puzzle || this.wsLabels !== labelMode() || this.wsScope !== perms.scope) {
            this.createWorkspace(readOnly, dark, puzzle);
        }

        if (this.file !== file) {
            this.modelListener?.dispose();
            this.file = file;
            this.model = file.getMonacoModel();
            this.modelListener = this.model?.onDidChangeContent(() => this.onModelChanged());
        }
        this.load(false);
        this.openedText = this.lastText;
        this.resetButton.hidden = readOnly;
        this.toolboxButton.hidden = readOnly || puzzle;
        this.updatePuzzleBar();
        if (puzzle && !readOnly) {
            this.showPuzzleResult("🧩 Puzzle: Bring die Blöcke in die richtige Reihenfolge und prüfe mit „🧩 Prüfen“. "
                + "Du ziehst immer einen Block – mit gedrückter Strg-Taste kommen die Blöcke darunter mit.");
        }
        this.resize();
    }

    private barButton(text: string, title: string, click: () => void): HTMLButtonElement {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        b.title = title;
        b.addEventListener("click", click);
        return b;
    }

    // ------------------------------------------------------------------ Puzzle (Paket 17e)

    private puzzleMakeButton: HTMLButtonElement;
    private puzzleEndButton: HTMLButtonElement;
    private puzzleCheckButton: HTMLButtonElement;
    private puzzleResult: HTMLSpanElement;

    private isStaff(): boolean {
        const u = this.main.user;
        return !!u && (u.is_teacher || u.is_admin || u.is_schooladmin);
    }

    /** Lösung, wenn die Datei ein Puzzle ist */
    private solutionOf(file: GUIFile | undefined): string | undefined {
        return puzzleSolution(this.main.getCurrentWorkspace()?.settings, file?.name);
    }

    private updatePuzzleBar() {
        const puzzle = this.solutionOf(this.file) !== undefined;
        const staff = this.isStaff() && !this.wsReadOnly;
        this.puzzleCheckButton.hidden = !puzzle;
        this.puzzleMakeButton.hidden = !staff || puzzle;
        this.puzzleEndButton.hidden = !staff || !puzzle;
        if (!puzzle) this.showPuzzleResult("");
    }

    private puzzleTimer?: ReturnType<typeof setTimeout>;

    /** Ergebnis über den Blöcken (verschwindet nach einigen Sekunden, ein Klick schließt es) */
    private showPuzzleResult(text: string, correct = false) {
        clearTimeout(this.puzzleTimer);
        this.puzzleResult.textContent = text;
        this.puzzleResult.classList.toggle("correct", correct);
        this.puzzleResult.hidden = text === "";
        if (text) this.puzzleTimer = setTimeout(() => (this.puzzleResult.hidden = true), correct ? 10000 : 6000);
    }

    /** Im Puzzle: Blöcke nur verschieben – nicht löschen, ändern oder hinzufügen (auch nicht kopieren) */
    private applyPuzzleLocks() {
        if (!this.ws || !this.wsPuzzle) return;
        for (const b of this.ws.getAllBlocks(false)) {
            b.setDeletable(false);
            b.setEditable(false);
            // einzelne Blöcke ziehen (Blockly nimmt sonst alle darunter mit); Strg + Ziehen nimmt sie mit
            const strategy = (b as unknown as { dragStrategy?: { shouldHealStack?: (e?: Event) => boolean } }).dragStrategy;
            if (strategy?.shouldHealStack) {
                strategy.shouldHealStack = (e?: Event) => !(e instanceof PointerEvent && (e.ctrlKey || e.metaKey));
            }
        }
        this.ws.options.maxBlocks = this.ws.getAllBlocks(false).length;
    }

    /** Text der Datei ersetzen (im Editor rückgängig machbar) */
    private replaceText(text: string) {
        if (!this.model || this.model.isDisposed()) return;
        this.model.pushStackElement();
        this.model.pushEditOperations([], [{ range: this.model.getFullModelRange(), text }], () => null);
        this.model.pushStackElement();
    }

    private saveSettings() {
        const w = this.main.getCurrentWorkspace();
        if (!w) return;
        w.saved = false;
        this.main.networkManager.sendUpdatesAsync(false);   // Text und Einstellungen; nichts vom Server zurückholen
    }

    /**
     * Dateien, die zum Puzzle gehören: in Blöckly die Bühne und alle Figuren (Paket 18f), sonst nur diese Datei.
     */
    private puzzleFiles(): GUIFile[] {
        if (!this.file) return [];
        if (!Constants.isBloecklyApp) return [this.file];
        const p = liesProjekt((this.main.getCurrentWorkspace()?.getFiles() ?? []).filter((f) => !f.isFolder));
        const list = [...(p.buehne ? [p.buehne.datei] : []), ...p.figuren.map((f) => f.datei)];
        return list.includes(this.file) ? list : [this.file, ...list];
    }

    /** aktueller Text einer Datei (die offene aus dem Editor) */
    private textOf(file: GUIFile): string {
        return file === this.file && this.model ? this.model.getValue(monaco.editor.EndOfLinePreference.LF) : file.getText().replace(/\r/g, "");
    }

    /** Text einer anderen Datei ersetzen (die offene im Editor, rückgängig machbar) */
    private setFileText(file: GUIFile, text: string) {
        if (file === this.file) {
            this.replaceText(text);
            return;
        }
        file.getMonacoModel();
        file.setText(text);
        file.setSaved(false);
    }

    private makePuzzle() {
        const file = this.file;
        const w = this.main.getCurrentWorkspace();
        if (!file || !w || !this.model) return;
        this.flushWrite();
        const classes = this.otherFilesClasses();
        const plans = this.puzzleFiles().map((f) => {
            const bloeckly = this.bloecklyFileContext(f);
            const opts = bloeckly ? { bloeckly } : {};
            const parsed = JavaBlockParser.parse(this.textOf(f), { classes, ...opts }).state;
            return { f, solution: JavaBlockGenerator.generate(parsed, opts).code, mixed: JavaBlockGenerator.generate(scramble(parsed), opts).code };
        }).filter((p) => p.mixed !== p.solution);
        if (plans.length === 0) {
            alert(Constants.isBloecklyApp
                ? "Für ein Puzzle braucht ein Skript mindestens zwei Blöcke."
                : "Für ein Puzzle braucht das Programm mindestens zwei Anweisungen.");
            return;
        }
        const what = Constants.isBloecklyApp
            ? "Die Blöcke in den Skripten " + (plans.length > 1 ? `von ${plans.length} Figuren bzw. der Bühne` : "") + " werden gemischt"
            : "Die Blöcke werden gemischt";
        if (!confirm((Constants.isBloecklyApp ? "Aus den Skripten ein Puzzle machen?\n\n" : "Aus diesem Programm ein Puzzle machen?\n\n")
            + what.replace("  ", " ") + "; Schleifen und Verzweigungen werden geleert. Schüler/innen sehen keine Werkzeugleiste, "
            + "können die Blöcke nur verschieben und mit „🧩 Prüfen“ kontrollieren. Die Lösung wird im Projekt gespeichert "
            + "und geht beim Austeilen mit; „Puzzle aufheben“ stellt sie wieder her.\n\n"
            + "Tipp: Gibt es mehrere richtige Reihenfolgen, zählt nur die des Originals.")) return;
        // erst den Text ändern, dann speichern (sonst überschreibt die Antwort des Servers den neuen Text)
        for (const p of plans) {
            this.setFileText(p.f, p.mixed);
            setPuzzleSolution(w.settings, p.f.name, p.solution);
        }
        this.show(file, this.wsReadOnly);
        this.saveSettings();
    }

    private endPuzzle() {
        const file = this.file;
        const w = this.main.getCurrentWorkspace();
        if (!file || !w || this.solutionOf(file) === undefined) return;
        if (!confirm("Puzzle aufheben? Die Blöcke werden in die Reihenfolge der Lösung gebracht.")) return;
        this.flushWrite();
        for (const f of this.puzzleFiles()) {
            const solution = this.solutionOf(f);
            if (solution === undefined) continue;
            this.setFileText(f, solution);
            setPuzzleSolution(w.settings, f.name, undefined);
        }
        this.show(file, this.wsReadOnly);
        this.saveSettings();
    }

    private checkPuzzle() {
        if (this.solutionOf(this.file) === undefined || !this.model) return;
        this.flushWrite();
        if (this.hasLooseBlocks()) {
            this.showPuzzleResult("Einige Blöcke hängen noch nicht im Programm – häng alle an.");
            return;
        }
        // in Blöckly zählen alle Figuren und die Bühne zusammen
        const total = { correct: true, right: 0, total: 0 };
        const open: string[] = [];
        for (const f of this.puzzleFiles()) {
            const solution = this.solutionOf(f);
            if (solution === undefined) continue;
            const r = Constants.isBloecklyApp ? checkPuzzle(this.textOf(f), solution, bloecklyPuzzleLine) : checkPuzzle(this.textOf(f), solution);
            total.correct &&= r.correct;
            total.right += r.right;
            total.total += r.total;
            if (!r.correct && f !== this.file) open.push(liesFigur(f.getText())?.klasse ?? (liesBuehne(f.getText()) ? "Bühne" : f.name));
        }
        const hint = open.length && !total.correct ? ` Noch nicht fertig: ${open.join(", ")}.` : "";
        this.showPuzzleResult(puzzleMessage(total) + hint, total.correct);
    }

    /** Werkzeugleiste (Kategorien) aus- und wieder einblenden */
    private toggleToolbox() {
        const toolbox = this.ws?.getToolbox() as (Blockly.IToolbox & { setVisible?(v: boolean): void }) | null | undefined;
        if (!toolbox?.setVisible) return;
        this.toolboxVisible = !this.toolboxVisible;
        toolbox.setVisible(this.toolboxVisible);
        this.ws?.getFlyout()?.hide();
        this.toolboxButton.textContent = this.toolboxVisible ? "◧ Werkzeugleiste ausblenden" : "◨ Werkzeugleiste einblenden";
        this.resize();
    }

    private labelSwitch: HTMLSpanElement;
    private keysHint: HTMLSpanElement;

    private updateLabelSwitch() {
        for (const b of Array.from(this.labelSwitch.querySelectorAll<HTMLButtonElement>("button"))) {
            const active = b.dataset.mode === labelMode();
            b.classList.toggle("active", active);
            b.setAttribute("aria-pressed", String(active));
        }
    }

    /**
     * Beschriftung umschalten (Paket 17d): Blöcke neu definieren und die Fläche neu aufbauen. Der Stand der
     * Fläche bleibt erhalten – auch lose Blöcke, Zoom und Lage.
     */
    private switchLabels(m: LabelMode) {
        if (m === labelMode()) return;
        setLabelMode(m);
        this.updateLabelSwitch();
        if (!this.ws) return;
        this.flushWrite();
        const state = Blockly.serialization.workspaces.save(this.ws);
        const scale = this.ws.scale;
        const toolboxVisible = this.toolboxVisible;
        this.createWorkspace(this.wsReadOnly, this.wsDark);
        this.loading = true;
        Blockly.Events.disable();
        try {
            Blockly.serialization.workspaces.load(state, this.ws, { recordUndo: false });
            this.layoutOperations();
        } finally {
            Blockly.Events.enable();
            this.loading = false;
        }
        applyTypes(this.ws);
        this.applyPuzzleLocks();
        this.ws.clearUndo();
        this.ws.setScale(scale);
        this.scrollToStart();
        this.highlighted = null;
        this.updateErrors();
        if (!toolboxVisible) {
            this.toolboxVisible = true;
            this.toggleToolbox();
        }
        this.resize();
    }

    /** Auf den Stand beim Wechsel in die Blockansicht zurücksetzen (im Editor rückgängig machbar) */
    private resetToOpened() {
        if (!this.model || this.model.isDisposed()) return;
        this.flushWrite();
        const current = this.model.getValue(monaco.editor.EndOfLinePreference.LF);
        if (current === this.openedText) return;
        if (!confirm("Alle Änderungen seit dem Wechsel in die Blockansicht verwerfen?")) return;
        this.model.pushStackElement();
        this.model.pushEditOperations([], [{ range: this.model.getFullModelRange(), text: this.openedText }], () => null);
        this.model.pushStackElement();
        // onModelChanged baut die Blöcke neu auf
    }

    hide() {
        this.flushWrite();
        this.modelListener?.dispose();
        this.modelListener = undefined;
        this.file = undefined;
        this.model = undefined;
    }

    /** Gibt es Blöcke, die nicht am Hauptprogramm oder an einer Operation hängen (gehen beim Umschalten verloren)? */
    /**
     * Hinweis unter den Blöcken: in Blöckly zuerst, wenn es „Wenn 🚩 angeklickt“ mehr als einmal im Projekt gibt;
     * sonst bei losen (grauen) Blöcken.
     */
    private updateNotice() {
        const flags = Constants.isBloecklyApp && this.ws ? this.ws.getTopBlocks(false).filter((b) => b.type === B.blFlag).length : 0;
        let text = "";
        if (flags > 1) text = "„Wenn 🚩 angeklickt“ darf es im ganzen Projekt nur einmal geben – hier steht es " + flags + "-mal. Lösche die überzähligen.";
        else if (flags === 1 && this.flagElsewhere) text = "„Wenn 🚩 angeklickt“ darf es im ganzen Projekt nur einmal geben – es steht auch bei " + this.flagElsewhere + ". Lösche eins davon.";
        else if (this.hasLooseBlocks()) text = this.looseText;
        this.notice.textContent = text;
        this.notice.hidden = text === "";
    }

    private readonly looseText = (Constants.isBloecklyApp
        ? "Graue Blöcke hängen an keinem Startblock (z. B. „Wenn 🚩 angeklickt“) und werden nicht ausgeführt. "
        : "Graue Blöcke hängen nicht am Hauptprogramm oder an einer Operation und werden nicht ausgeführt. ")
        + "Beim Wechsel in die Java-Ansicht gehen sie verloren.";

    hasLooseBlocks(): boolean {
        return !!this.ws && this.ws.getTopBlocks(false).some((b) => !isHat(b));
    }

    /**
     * Freigaben der Lerngruppe (Verwaltung → Freigaben). Java-Vorschau und Java-Beschriftung schränkt sie nur in den
     * Anwendungen „Blöckva“ und „Blöckly“ ein (in der Java-IDE sehen alle ohnehin Java), den Gültigkeitsbereich überall.
     */
    private permissions(): BlockPermissions {
        const p = blockPermissions(this.main.user, Constants.isBloecklyApp);
        return Constants.isBlocksApp ? p : { preview: true, javaLabels: true, scope: p.scope };
    }

    private wsLabels?: LabelMode;
    private wsScope?: boolean;

    /** In Blöckva und Blöckly: Kategorien, die die Lerngruppe ausgeblendet hat (Verwaltung → Freigaben) */
    private hiddenCategories(): string[] {
        if (!Constants.isBlocksApp) return [];
        const f = (this.main.user as { gsgFreigaben?: { bloeckeAusgeblendet?: unknown; bloecklyAusgeblendet?: unknown } } | undefined)?.gsgFreigaben;
        const hidden = Constants.isBloecklyApp ? f?.bloecklyAusgeblendet : f?.bloeckeAusgeblendet;
        return Array.isArray(hidden) ? hidden.filter((h): h is string => typeof h === "string") : [];
    }

    private createWorkspace(readOnly: boolean, dark: boolean, puzzle = this.wsPuzzle) {
        this.ws?.dispose();
        this.wsReadOnly = readOnly;
        this.wsDark = dark;
        this.wsPuzzle = puzzle;
        this.wsHidden = this.hiddenCategories().join(",");
        this.wsLabels = labelMode();
        this.wsScope = this.permissions().scope;
        // Rechtsklick-Menüs, Auswahllisten und Tooltips bleiben in der Blockfläche (Blockly-Standard): Blockly 13
        // schließt eine Auswahlliste sofort wieder, wenn sie außerhalb der Fläche hängt (Fokus verlässt die Fläche),
        // und der Block klebt dann am Mauszeiger. Damit nichts abgeschnitten wird, gilt overflow: visible (gsg-blocks.css).
        this.ws = Blockly.inject(this.blocklyDiv, {
            toolbox: readOnly || puzzle ? undefined : Constants.isBloecklyApp ? bloecklyToolbox(this.hiddenCategories()) : toolbox(this.hiddenCategories()),
            readOnly,
            theme: theme(dark),
            renderer: "gsg",
            trashcan: !readOnly && !puzzle,
            sounds: false,
            zoom: { controls: true, wheel: true, startScale: istGrosseAnsicht() ? BLOCK_ZOOM_GROSS : BLOCK_ZOOM_NORMAL, maxScale: 2, minScale: 0.3, scaleSpeed: 1.15 },
            move: { scrollbars: true, drag: true, wheel: true },
            // Blöckly: „Wenn 🚩 angeklickt“ nur einmal im ganzen Projekt
            ...(Constants.isBloecklyApp ? { maxInstances: { [B.blFlag]: this.flagElsewhere ? 0 : 1 } } : {}),
        });
        this.ws.addChangeListener(Blockly.Events.disableOrphans);
        this.ws.addChangeListener((e) => this.onBlocklyEvent(e));
        this.scopeHighlight = new ScopeHighlight(this.ws, this.wsScope);   // Gültigkeitsbereich der ausgewählten Variablen (Paket 16c)
        // Paket 17a: Klick auf einen Werte-Block zeigt seinen Wert – auch in der Werkzeugleiste
        const bubble = this.valueBubble = new ValueBubble(this.main, this.ws);
        const flyoutWs = this.ws.getToolbox()?.getFlyout()?.getWorkspace();
        flyoutWs?.addChangeListener((e) => {
            if (e.type === Blockly.Events.CLICK && (e as Blockly.Events.Click).targetType === "block") {
                const b = flyoutWs.getBlockById((e as Blockly.Events.Click).blockId ?? "") as Blockly.BlockSvg | null;
                if (b) bubble.clicked(b);
            }
        });
        this.ws.registerToolboxCategoryCallback(VARIABLES_CATEGORY, (w) => variablesFlyout(w));
        this.ws.registerToolboxCategoryCallback(OPERATIONS_CATEGORY, (w) => operationsFlyout(w));
        this.ws.registerToolboxCategoryCallback(ARRAYS_CATEGORY, (w) => arraysFlyout(w));
        this.ws.registerToolboxCategoryCallback(LISTS_CATEGORY, (w) => listsFlyout(w));
        this.ws.registerToolboxCategoryCallback(ADT_CATEGORY, (w) => adtFlyout(w));
        this.ws.registerToolboxCategoryCallback(FIGURES_CATEGORY, (w) => figuresFlyout(w));
        this.ws.registerToolboxCategoryCallback(INPUT_CATEGORY, (w) => inputFlyout(w));
        setSpriteSource(createSpriteSource(this.main));   // Bilder für den Sprite-Block
        this.ws.registerToolboxCategoryCallback(CLASSES_CATEGORY, (w) => classesFlyout(w));
        this.ws.registerToolboxCategoryCallback(OBJECTS_CATEGORY, (w) => objectsFlyout(w));
        if (Constants.isBloecklyApp) registerBloecklyToolbox(this.ws);

        // Geöffnete Kategorie bleibt offen, bis man sie (oder eine andere) noch einmal anklickt – Blockly schließt sie
        // sonst bei jedem Klick oder Ziehen auf der Fläche. Die Fläche rückt dafür neben die Kategorie (nichts verdeckt).
        const toolboxObject = this.ws.getToolbox() as Blockly.Toolbox | null;
        const toolboxFlyout = toolboxObject?.getFlyout();
        if (toolboxObject && toolboxFlyout) {
            toolboxObject.autoHide = () => { /* nur per Klick auf die Kategorie schließen */ };
            // Platz neben der Kategorie hält Blockly nur bei autoClose = false frei – und zwar auch, wenn sie zu ist.
            // Deshalb nur, solange sie offen ist (sonst bliebe links eine leere Lücke).
            const show = toolboxFlyout.show.bind(toolboxFlyout);
            const hide = toolboxFlyout.hide.bind(toolboxFlyout);
            // die Blöcke rücken neben die Kategorie (und beim Schließen zurück), damit nichts unter ihr verschwindet
            let showing = false;   // show() ruft intern zuerst hide() auf
            toolboxFlyout.show = (contents) => {
                showing = true;
                try {
                    toolboxFlyout.autoClose = false;
                    show(contents);
                } finally {
                    showing = false;
                }
                toolboxObject.handleToolboxItemResize();
            };
            toolboxFlyout.hide = () => {
                hide();
                if (showing) return;
                toolboxFlyout.autoClose = true;
                toolboxObject.handleToolboxItemResize();
            };
            // Blockly passt die Breite oft erst nach dem Zeichnen an (z. B. Formen nach den Variablen): mitrücken
            const flyoutSvg = this.ws.getInjectionDiv().querySelector<SVGElement>("svg.blocklyToolboxFlyout");
            this.flyoutObserver?.disconnect();
            if (flyoutSvg) {
                this.flyoutObserver = new ResizeObserver(() => {
                    if (toolboxFlyout.isVisible() && !toolboxFlyout.autoClose) toolboxObject.handleToolboxItemResize();
                });
                this.flyoutObserver.observe(flyoutSvg);
            }
        }

        // „Variablen“ hat Unterkategorien (Reihungen, Listen, ADT) und kann deshalb keine dynamische Kategorie sein:
        // die eigenen Variablen werden beim Öffnen eingesetzt (nur wenn die Kategorie eigene Blöcke zeigt)
        const variables = (this.ws.getToolbox() as Blockly.Toolbox | null)?.getToolboxItemById("variablen") as unknown as { getContents(): unknown[] } | null;
        if (variables && Array.isArray(variables.getContents()) && variables.getContents().length > 0) {
            const ws = this.ws;
            variables.getContents = () => variablesFlyout(ws) as unknown[];
        }

        // Breite der Werkzeugleiste für gsg-blocks.css: die aufgeklappte Leiste endet am Rand der Blockfläche
        // (die Fläche selbst schneidet nichts ab, damit Menüs über den Rand hinausragen dürfen)
        this.toolboxObserver?.disconnect();
        const injection = this.ws.getInjectionDiv();
        const toolboxDiv = injection.querySelector<HTMLElement>(".blocklyToolbox");
        if (toolboxDiv) {
            this.toolboxObserver = new ResizeObserver(() => injection.style.setProperty("--gsg-toolbox-width", toolboxDiv.offsetWidth + "px"));
            this.toolboxObserver.observe(toolboxDiv);
        }
    }

    private toolboxObserver?: ResizeObserver;
    private flyoutObserver?: ResizeObserver;

    private previewCollapsedByUser: boolean | null = null;

    private resize() {
        // wenig Platz: Vorschau einklappen (außer man hat sie selbst geöffnet bzw. geschlossen)
        const preview = this.host.querySelector<HTMLElement>(".gsg-blocks-preview");
        if (preview && this.previewCollapsedByUser === null) {
            const narrow = this.host.clientWidth > 0 && this.host.clientWidth < 620;
            preview.classList.toggle("collapsed", narrow);
            preview.querySelector(".gsg-preview-toggle")!.textContent = narrow ? "⟨" : "⟩";
        }
        if (this.ws && this.host.offsetParent !== null) Blockly.svgResize(this.ws);
    }

    // ------------------------------------------------------------------ Java -> Blöcke

    private load(keepScroll: boolean) {
        if (!this.ws || !this.model) return;
        const text = this.model.getValue(monaco.editor.EndOfLinePreference.LF);
        const classes = this.otherFilesClasses();
        setExternalClasses(classes);
        const bloeckly = this.bloecklyContext(text);
        const { state, ranges } = JavaBlockParser.parse(text, { classes, ...(bloeckly ? { bloeckly } : {}) });
        // Blöckly: Kopf der Klasse unsichtbar mitführen, in der Fläche nur die Skripte
        this.blHeader = undefined;
        if (bloeckly) {
            const blocks = state.blocks?.blocks ?? [];
            this.blHeader = blocks.find((b) => b.type === B.blFigure);
            if (this.blHeader) state.blocks.blocks = blocks.filter((b) => b !== this.blHeader);
        }
        const scroll = keepScroll ? { x: this.ws.scrollX, y: this.ws.scrollY } : null;

        this.loading = true;
        Blockly.Events.disable();
        try {
            this.ws.clear();
            Blockly.serialization.workspaces.load(state, this.ws, { recordUndo: false });
            this.layoutOperations();
        } finally {
            Blockly.Events.enable();
            this.loading = false;
        }
        applyTypes(this.ws);
        this.ws.clearUndo();
        if (scroll) this.ws.scroll(scroll.x, scroll.y);
        else this.scrollToStart();

        this.ranges = ranges;
        this.lastText = text;
        this.highlighted = null;
        this.renderPreview(text);
        this.updateErrors();
        this.updateProgramPointer();
        this.updateNotice();
        this.applyPuzzleLocks();
    }

    private classCache = new Map<string, ClassInfo[]>();

    // ------------------------------------------------------------------ Blöckly (Paket 18e)

    /**
     * Blöckly: was Parser, Generator und Blöcke über das Projekt wissen müssen – Name der Bühne, Variablen für alle
     * Figuren, andere Figuren, Kostüme, Nachrichten. Sonst undefined.
     */
    /** Blöckly: Name der Bühne und Variablen für alle Figuren – für Parser und Generator einer beliebigen Datei */
    private bloecklyFileContext(file: GUIFile): BloecklyContext | undefined {
        if (!Constants.isBloecklyApp) return undefined;
        const p = liesProjekt((this.main.getCurrentWorkspace()?.getFiles() ?? []).filter((f) => !f.isFolder));
        const stageClass = p.buehne?.info.klasse ?? BUEHNEN_KLASSE;
        const isStage = !!p.buehne && p.buehne.datei === file;
        const globals = p.buehne && !isStage ? variablenDerKlasse(p.buehne.datei.getText(), { stage: stageClass, globals: {} }) : {};
        return { stage: stageClass, globals };
    }

    private bloecklyContext(text: string): BloecklyContext | undefined {
        if (!Constants.isBloecklyApp) return undefined;
        const files = (this.main.getCurrentWorkspace()?.getFiles() ?? []).filter((f) => !f.isFolder);
        const p = liesProjekt(files);
        const stageClass = p.buehne?.info.klasse ?? BUEHNEN_KLASSE;
        const isStage = !!p.buehne && p.buehne.datei === this.file;
        const globals = p.buehne ? variablenDerKlasse(p.buehne.datei.getText(), { stage: stageClass, globals: {} }) : {};
        // Variablen für alle Figuren und (aus älteren Projekten) die der Figur: Der Kopf steht nicht in der Fläche
        const own = liesFigur(text);
        const ownVars = isStage || !own ? {} : variablenDerKlasse(text, { stage: stageClass, globals });
        setFixedVariables(new Map(Object.entries({ ...globals, ...ownVars })));
        // „Wenn 🚩 angeklickt“ gibt es nur einmal im ganzen Projekt
        this.flagElsewhere = undefined;
        for (const f of [...(p.buehne ? [p.buehne] : []), ...p.figuren]) {
            if (f.datei === this.file || !/@BeimStart\b/.test(f.datei.getText())) continue;
            this.flagElsewhere = f === p.buehne ? "der Bühne" : f.info.klasse;
            break;
        }
        if (this.ws) this.ws.options.maxInstances = { [B.blFlag]: this.flagElsewhere ? 0 : 1 };
        setBloecklyUi({
            stage: isStage,
            klasse: own?.klasse ?? liesBuehne(text)?.klasse ?? "",
            aussehen: own?.figur ?? "",
            figuren: p.figuren.map((f) => f.info.klasse),
            globals,
            addGlobal: (name, typ) => this.addGlobal(name, typ),
            globaleUmbenennen: (alt, neu) => this.renameGlobal(alt, neu),
            globaleLoeschen: (name) => this.deleteGlobal(name),
            flagge: this.flagElsewhere,
        });
        // Nachrichten aller Figuren und der Bühne (zur Auswahl in „sende …“ und „Wenn ich … empfange“)
        const messages = new Set<string>();
        for (const f of files) {
            if (f === this.file) continue;
            for (const m of f.getText().matchAll(/@WennNachricht\(\s*"([^"\\]*)"\s*\)|Nachricht\.sende(?:UndWarte)?\(\s*"([^"\\]*)"\s*\)/g)) {
                const name = m[1] ?? m[2];
                if (name) messages.add(name);
            }
        }
        setProjectMessages([...messages]);
        return { stage: stageClass, globals: isStage ? {} : globals };
    }

    /** neue Variable für alle Figuren: in der Bühne anlegen (static), dann gilt sie hier sofort */
    private addGlobal(name: string, typ: string) {
        const files = (this.main.getCurrentWorkspace()?.getFiles() ?? []).filter((f) => !f.isFolder);
        const stage = liesProjekt(files).buehne;
        if (!stage) return;
        if (stage.datei === this.file && this.blHeader) {
            // gerade offen ist die Bühne: Variable im unsichtbaren Kopf ergänzen und zurückschreiben
            const neu: BlockState = { type: B.blVar, fields: { NAME: name, TYPE: typ }, inputs: { VALUE: { block: startwert(typ) } } };
            let last = this.blHeader.inputs?.VARS?.block;
            while (last?.next) last = last.next.block;
            if (last) last.next = { block: neu };
            else this.blHeader.inputs = { ...(this.blHeader.inputs ?? {}), VARS: { block: neu } };
            this.write();
            this.bloecklyContext(this.lastText);
            if (this.ws) applyTypes(this.ws);
            return;
        }
        const text = stage.datei.getText();
        const neu = mitVariable(text, name, typ, { stage: stage.info.klasse, globals: {} });
        if (neu === text) return;
        stage.datei.getMonacoModel();
        stage.datei.setText(neu);
        stage.datei.setSaved(false);
        this.bloecklyContext(this.lastText);
        if (this.ws) applyTypes(this.ws);
        this.main.getCompiler()?.triggerCompile();
    }

    /** Java-Dateien eines Blöckly-Projekts (ohne Ordner, Struktogramme …) */
    private bloecklyJavaFiles(): GUIFile[] {
        return (this.main.getCurrentWorkspace()?.getFiles() ?? []).filter((f) => !f.isFolder && !/\.[A-Za-z]+$/.test(f.name));
    }

    /** Text einer Datei ersetzen (offene Datei: die Blöcke laden ihn über das Modell neu) */
    private replaceFileText(f: GUIFile, text: string) {
        if (f.getText() === text) return;
        f.getMonacoModel();
        f.setText(text);
        f.setSaved(false);
    }

    /** Variable für alle Figuren umbenennen: Bühne (Deklaration und Stellen) und Spiel.alt in allen Figuren */
    private renameGlobal(alt: string, neu: string) {
        this.flushWrite();
        const files = this.bloecklyJavaFiles();
        const stage = liesProjekt(files).buehne;
        if (!stage) return;
        for (const f of files) this.replaceFileText(f, globaleUmbenannt(f.getText(), stage.info.klasse, alt, neu, f === stage.datei));
        this.bloecklyContext(this.lastText);
        if (this.ws) applyTypes(this.ws);
        this.main.getCompiler()?.triggerCompile();
    }

    /**
     * Variable für alle Figuren löschen. Wird sie noch benutzt, bleibt sie: Rückgabe sind die Figuren (bzw. „Bühne“),
     * in denen sie vorkommt; sonst eine leere Liste.
     */
    private deleteGlobal(name: string): string[] {
        this.flushWrite();
        const files = this.bloecklyJavaFiles();
        const p = liesProjekt(files);
        const stage = p.buehne;
        if (!stage) return [];
        const used: string[] = [];
        if (globaleStellen(stage.datei.getText(), stage.info.klasse, name, true) > 1) used.push("Bühne");
        for (const f of p.figuren) if (globaleStellen(f.datei.getText(), stage.info.klasse, name, false) > 0) used.push(f.info.klasse);
        if (used.length) return used;
        this.replaceFileText(stage.datei, ohneVariable(stage.datei.getText(), name, { stage: stage.info.klasse, globals: {} }));
        this.bloecklyContext(this.lastText);
        if (this.ws) applyTypes(this.ws);
        this.main.getCompiler()?.triggerCompile();
        return [];
    }

    /** Klassen aus den anderen Dateien des Projekts (für Objekte dieser Klassen) */
    private otherFilesClasses(): ClassInfo[] {
        const result: ClassInfo[] = [];
        const files = this.main.getCurrentWorkspace()?.getFiles() ?? [];
        const used = new Set<string>();
        for (const f of files) {
            if (f === this.file || f.isFolder) continue;
            let text: string;
            try {
                text = f.getText();
            } catch {
                continue;
            }
            if (!/\bclass\b/.test(text)) continue;
            used.add(text);
            let infos = this.classCache.get(text);
            if (!infos) {
                try {
                    infos = classInfosFromState(JavaBlockParser.parse(text).state);
                } catch {
                    infos = [];
                }
                this.classCache.set(text, infos);
            }
            result.push(...infos);
        }
        for (const key of [...this.classCache.keys()]) if (!used.has(key)) this.classCache.delete(key);
        return result;
    }

    /** Operationen und Klassen unter dem Hauptprogramm anordnen (Reihenfolge wie im Code) */
    private layoutOperations() {
        const ws = this.ws;
        const start = ws?.getBlockById("start") as Blockly.BlockSvg | null;
        // Blöckly: kein sichtbarer Kopf – die Skripte stehen von oben an untereinander
        if (!ws || (!start && !this.blHeader)) return;
        const methods = ws.getTopBlocks(false).filter((b) => b.type === B.method || b.type === B.class || isPartHat(b.type))
            .sort((a, b) => a.getRelativeToSurfaceXY().y - b.getRelativeToSurfaceXY().y);
        if (methods.length === 0) return;
        Blockly.renderManagement.triggerQueuedRenders(ws);
        const s = start ? start.getRelativeToSurfaceXY() : new Blockly.utils.Coordinate(20, 20);
        let y = start ? s.y + start.getHeightWidth().height + HAT_GAP : s.y;
        for (const m of methods) {
            const xy = m.getRelativeToSurfaceXY();
            m.moveBy(s.x - xy.x, y - xy.y);
            y += m.getHeightWidth().height + HAT_GAP;
        }
    }

    /**
     * Hauptprogramm und Operationen überlappen nicht: wächst ein Hut-Block in den darunter
     * liegenden hinein, rutscht dieser (und alles darunter) nach unten.
     */
    private keepHatsApart() {
        const ws = this.ws;
        if (!ws || ws.isDragging()) return;
        const hats = ws.getTopBlocks(false).filter((b) => isHat(b)) as Blockly.BlockSvg[];
        if (hats.length < 2) return;
        Blockly.renderManagement.triggerQueuedRenders(ws);
        const boxes = hats.map((b) => ({ b, r: b.getBoundingRectangle() })).sort((a, c) => a.r.top - c.r.top);
        for (let i = 1; i < boxes.length; i++) {
            const cur = boxes[i];
            let minTop = -Infinity;
            for (let k = 0; k < i; k++) {
                const above = boxes[k].r;
                const sideBySide = above.right + 10 < cur.r.left || cur.r.right + 10 < above.left;
                if (!sideBySide) minTop = Math.max(minTop, above.bottom + HAT_GAP);
            }
            if (cur.r.top < minTop) {
                const dy = minTop - cur.r.top;
                cur.b.moveBy(0, dy);
                cur.r = cur.b.getBoundingRectangle();
            }
        }
    }

    /** Hauptprogramm oben links in den sichtbaren Bereich holen */
    private scrollToStart() {
        const ws = this.ws;
        // Blöckly: oberstes Skript (der Kopf ist unsichtbar)
        const start = (ws?.getBlockById("start") ?? ws?.getTopBlocks(true)[0] ?? null) as Blockly.BlockSvg | null;
        if (!ws || !start) return;
        const rect = start.getBoundingRectangle();
        const scale = ws.scale;
        ws.scroll(-(rect.left - 16) * scale, -(rect.top - 16) * scale);
    }

    /** Code wurde außerhalb der Blöcke geändert (Korrektur, Abgleich, Rückgängig im Editor) */
    private onModelChanged() {
        if (!this.model || this.loading) return;
        const text = this.model.getValue(monaco.editor.EndOfLinePreference.LF);
        if (text !== this.lastText) {
            clearTimeout(this.writeTimer);
            this.writeTimer = undefined;
            this.load(true);
        }
    }

    // ------------------------------------------------------------------ Blöcke -> Java

    private onBlocklyEvent(e: Blockly.Events.Abstract) {
        if (this.loading || !this.ws) return;
        if (e.type === Blockly.Events.CLICK) {
            const click = e as Blockly.Events.Click;
            if (click.workspaceId !== this.ws.id) return;   // Klick in der Werkzeugleiste (eigener Listener)
            const b = click.targetType === "block" && click.blockId ? this.ws.getBlockById(click.blockId) as Blockly.BlockSvg | null : null;
            if (b) this.valueBubble?.clicked(b);
            else this.valueBubble?.hide();
            return;
        }
        if (e.type === Blockly.Events.BLOCK_DRAG || e.type === Blockly.Events.VIEWPORT_CHANGE) this.valueBubble?.hide();
        if (e.type === Blockly.Events.SELECTED) {
            this.selectedId = (e as Blockly.Events.Selected).newElementId ?? null;
            this.markPreviewLines();
            return;
        }
        if (e.type === Blockly.Events.TOOLBOX_ITEM_SELECT) {
            // Blöcke in der Werkzeugleiste: Formen passend zu den Variablen der Arbeitsfläche
            setTimeout(() => this.typeFlyout(), 0);
            // Platz für die geöffnete Kategorie: Dateiliste links einklappen (Symbol am Rand klappt sie wieder aus)
            if ((e as Blockly.Events.ToolboxItemSelect).newItem) autoCollapseLeftPanel();
            return;
        }
        if (e.isUiEvent || e.type === Blockly.Events.FINISHED_LOADING) return;
        if (e.type === Blockly.Events.BLOCK_CHANGE) {
            handleRename(this.ws, e as Blockly.Events.BlockChange);
            this.typeChanged(e as Blockly.Events.BlockChange);
        }
        // Aufrufe an geänderte Operationen anpassen, Hut-Blöcke auseinanderhalten (im selben Rückgängig-Schritt)
        const hadGroup = Blockly.Events.getGroup();
        if (!hadGroup) Blockly.Events.setGroup(e.group || true);
        try {
            syncCalls(this.ws);
            if (e.type !== Blockly.Events.BLOCK_MOVE || !(e as Blockly.Events.BlockMove).reason?.includes("bump")) this.keepHatsApart();
        } finally {
            if (!hadGroup) Blockly.Events.setGroup(false);
        }
        applyTypes(this.ws);
        this.updateNotice();
        if (this.wsReadOnly) return;
        clearTimeout(this.writeTimer);
        this.writeTimer = setTimeout(() => this.write(), 250);
    }

    private typeFlyout() {
        const flyoutWs = this.ws?.getToolbox()?.getFlyout()?.getWorkspace();
        if (this.ws && flyoutWs) applyTypes(flyoutWs, collectVariables(this.ws));
    }

    /** Datentyp in "erstelle neue Variable" gewechselt: Startwert passend umstellen */
    private typeChanged(e: Blockly.Events.BlockChange) {
        if (!this.ws || e.element !== "field" || e.name !== "TYPE" || !e.blockId) return;
        const block = this.ws.getBlockById(e.blockId);
        if (!block || block.type !== B.varDeclare) return;
        Blockly.Events.setGroup(e.group || true);
        try {
            adaptDeclarationValue(block, String(e.newValue) as JType);
        } finally {
            Blockly.Events.setGroup(false);
        }
    }

    private flushWrite() {
        if (this.writeTimer !== undefined) {
            clearTimeout(this.writeTimer);
            this.write();
        }
    }

    private write() {
        this.writeTimer = undefined;
        if (!this.ws || !this.model || this.model.isDisposed()) return;
        const state = Blockly.serialization.workspaces.save(this.ws) as unknown as WorkspaceState;
        if (this.blHeader) state.blocks = { languageVersion: 0, blocks: [this.blHeader, ...(state.blocks?.blocks ?? [])] };
        const bloeckly = this.bloecklyContext(this.lastText);
        const { code, ranges } = JavaBlockGenerator.generate(state, bloeckly ? { bloeckly } : {});
        this.ranges = ranges;
        const current = this.model.getValue(monaco.editor.EndOfLinePreference.LF);
        this.lastText = code;
        if (code !== current) {
            this.model.pushStackElement();
            this.model.pushEditOperations([], [{ range: this.model.getFullModelRange(), text: code }], () => null);
            this.model.pushStackElement();
        }
        this.renderPreview(code);
        if (/\bDynArray\b/.test(code)) this.ensureLibrary("niedersachsen");
    }

    /**
     * Bibliothek im Projekt einschalten (wie im Dialog "Einstellungen"), z. B. "Abiturklassen
     * Niedersachsen" für die dynamische Reihung (DynArray).
     */
    private ensureLibrary(id: string) {
        ensureLibraries(this.main, [id]);
    }

    // ------------------------------------------------------------------ Java-Vorschau

    private previewToken = 0;

    private async renderPreview(code: string) {
        const token = ++this.previewToken;
        const language = this.model?.getLanguageId() ?? "myJava";
        let html: string;
        try {
            html = await monaco.editor.colorize(code, language, { tabSize: 4 });
        } catch {
            html = code.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!)).replace(/\n/g, "<br/>");
        }
        if (token !== this.previewToken) return;
        const lines = html.split(/<br\s*\/?>/);
        while (lines.length > 1 && lines[lines.length - 1].replace(/<[^>]*>/g, "").trim() === "") lines.pop();
        this.previewCode.innerHTML = lines.map((l, i) =>
            `<div class="gsg-pl" data-line="${i + 1}"><span class="gsg-ln">${i + 1}</span><span class="gsg-lc">${l || " "}</span></div>`).join("");
        this.markPreviewLines();
    }

    /** Zeilen des ausgewählten Blocks in der Vorschau hervorheben */
    private markPreviewLines() {
        const range = this.selectedId ? this.ranges.find((r) => r.id === this.selectedId) : undefined;
        this.previewCode.querySelectorAll<HTMLElement>(".gsg-pl").forEach((el) => {
            const line = Number(el.dataset.line);
            el.classList.toggle("selected", !!range && line >= range.startLine && line <= range.endLine);
        });
        if (range) {
            this.previewCode.querySelector<HTMLElement>(`.gsg-pl[data-line="${range.startLine}"]`)?.scrollIntoView({ block: "nearest" });
        }
    }

    // ------------------------------------------------------------------ Fehler und Programmzeiger

    /**
     * Paket 16: Bereich eines Kastens im Reiter „Variablen“ zeigen – der Block, der in der Zeile beginnt
     * (Schleife, Operation …), wird mit Schild umrahmt und in die Mitte geholt. false: kein Block gefunden.
     */
    showLines(fromLine: number, title: string): boolean {
        if (!this.ws) return false;
        let best: LineRange | undefined;
        for (const r of this.ranges) {
            if (fromLine < r.startLine || fromLine > r.endLine) continue;
            // der äußerste Block, der in dieser Zeile beginnt (Schleife statt ihres ersten Blocks), sonst der innerste
            if (!best || (r.startLine === fromLine && (best.startLine !== fromLine || r.endLine > best.endLine))
                || (best.startLine !== fromLine && r.endLine - r.startLine < best.endLine - best.startLine)) best = r;
        }
        const block = best && this.ws.getBlockById(best.id);
        if (!block) return false;
        this.ws.centerOnBlock(block.id);
        this.scopeHighlight?.flash(block, title);
        return true;
    }

    /** innerster Anweisungsblock, zu dem die Zeile gehört */
    private blockAtLine(line: number): string | null {
        let best: LineRange | undefined;
        for (const r of this.ranges) {
            if (line < r.startLine || line > r.endLine) continue;
            if (!best || r.endLine - r.startLine < best.endLine - best.startLine) best = r;
        }
        return best && this.ws?.getBlockById(best.id) ? best.id : null;
    }

    private updateErrors() {
        if (!this.ws || !this.model) return;
        const messages = new Map<string, string[]>();
        for (const m of monaco.editor.getModelMarkers({ resource: this.model.uri })) {
            if (m.severity !== monaco.MarkerSeverity.Error) continue;
            const id = this.blockAtLine(m.startLineNumber);
            if (!id) continue;
            if (!messages.has(id)) messages.set(id, []);
            messages.get(id)!.push(m.message);
        }
        for (const block of this.ws.getAllBlocks(false)) {
            const list = messages.get(block.id);
            // eigene Kennung: ohne sie entfernt Blockly auch die Warnungen der Typprüfung (Kennung "typ")
            block.setWarningText(list ? [...new Set(list)].join("\n") : null, "java");
            updateHelpHint(block);   // Paket 17b: Hinweis auf das Handbuch
        }
    }

    private updateProgramPointer() {
        if (!this.ws || !this.model || this.model.isDisposed()) return;
        // Rückblick im Reiter "Objekte" (orange) hat Vorrang vor dem aktuellen Programmzeiger
        const decorations = this.model.getAllDecorations();
        const pointer = decorations.find((d) => d.options.className === "gsg-history-pointer")
            ?? decorations.find((d) => d.options.className === "jo_revealProgramPointer");
        const id = pointer ? this.blockAtLine(pointer.range.startLineNumber) : null;
        if (id === this.highlighted) return;
        this.highlighted = id;
        this.ws.highlightBlock(id);
        if (id) {
            const block = this.ws.getBlockById(id);
            if (block) this.ws.scrollBoundsIntoView((block as Blockly.BlockSvg).getBoundingRectangle());
        }
    }
}
