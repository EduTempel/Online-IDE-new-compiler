import { slowMotionButton } from "../objects/SlowMotion";
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
import { adaptDeclarationValue, applyTypes, collectVariables, isHat, setExternalClasses, type JType } from "./BlockTypeSystem";
import { B, type WorkspaceState } from "./BlockTypes";
import { JavaBlockGenerator } from "./JavaBlockGenerator";
import { JavaBlockParser, type LineRange } from "./JavaBlockParser";
import { Constants } from "../Constants";
import { registerBlockImageMenu } from "./BlockImage";
import { registerBlockHelpMenu } from "./BlockHelp";
import { ensureLibraries } from "../structogram/ProjectFiles";

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
    private wsReadOnly = false;
    private wsDark = true;
    private wsHidden = "";

    private file?: GUIFile;
    private model?: monaco.editor.ITextModel;
    private modelListener?: monaco.IDisposable;

    /** zuletzt gelesener bzw. selbst geschriebener Code */
    private lastText = "";
    private ranges: LineRange[] = [];
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

    constructor(private main: Main, private host: HTMLElement) {
        Blockly.setLocale(De as unknown as { [key: string]: string });
        defineBlocks();
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
        this.notice.textContent = "Graue Blöcke hängen nicht am Hauptprogramm oder an einer Operation und werden nicht ausgeführt. "
            + "Beim Wechsel in die Java-Ansicht gehen sie verloren.";
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
        const keys = document.createElement("span");
        keys.className = "gsg-blocks-keys";
        keys.textContent = "Strg+B: Blöcke ↔ Java";
        bar.append(this.toolboxButton, this.resetButton, slowMotionButton(this.main, "gsg-blocks-slow"), keys);
        area.append(bar, this.blocklyDiv, this.notice);

        const preview = document.createElement("div");
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
        // neu aufbauen, wenn sich Ansicht, Thema oder die ausgeblendeten Kategorien (andere Anmeldung) geändert haben
        if (!this.ws || this.wsReadOnly !== readOnly || this.wsDark !== dark || this.wsHidden !== this.hiddenCategories().join(",")) {
            this.createWorkspace(readOnly, dark);
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
        this.toolboxButton.hidden = readOnly;
        this.resize();
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
    hasLooseBlocks(): boolean {
        return !!this.ws && this.ws.getTopBlocks(false).some((b) => !isHat(b));
    }

    /** In der Anwendung "Blöcke": Kategorien, die die Lerngruppe ausgeblendet hat (Verwaltung → Freigaben) */
    private hiddenCategories(): string[] {
        if (!Constants.isBlocksApp) return [];
        const hidden = (this.main.user as { gsgFreigaben?: { bloeckeAusgeblendet?: unknown } } | undefined)?.gsgFreigaben?.bloeckeAusgeblendet;
        return Array.isArray(hidden) ? hidden.filter((h): h is string => typeof h === "string") : [];
    }

    private createWorkspace(readOnly: boolean, dark: boolean) {
        this.ws?.dispose();
        this.wsReadOnly = readOnly;
        this.wsDark = dark;
        this.wsHidden = this.hiddenCategories().join(",");
        // Rechtsklick-Menüs, Auswahllisten und Tooltips bleiben in der Blockfläche (Blockly-Standard): Blockly 13
        // schließt eine Auswahlliste sofort wieder, wenn sie außerhalb der Fläche hängt (Fokus verlässt die Fläche),
        // und der Block klebt dann am Mauszeiger. Damit nichts abgeschnitten wird, gilt overflow: visible (gsg-blocks.css).
        this.ws = Blockly.inject(this.blocklyDiv, {
            toolbox: readOnly ? undefined : toolbox(this.hiddenCategories()),
            readOnly,
            theme: theme(dark),
            renderer: "gsg",
            trashcan: !readOnly,
            sounds: false,
            zoom: { controls: true, wheel: true, startScale: 0.75, maxScale: 2, minScale: 0.3, scaleSpeed: 1.15 },
            move: { scrollbars: true, drag: true, wheel: true },
        });
        this.ws.addChangeListener(Blockly.Events.disableOrphans);
        this.ws.addChangeListener((e) => this.onBlocklyEvent(e));
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
        const { state, ranges } = JavaBlockParser.parse(text, { classes });
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
        this.notice.hidden = !this.hasLooseBlocks();
    }

    private classCache = new Map<string, ClassInfo[]>();

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
        if (!ws || !start) return;
        const methods = ws.getTopBlocks(false).filter((b) => b.type === B.method || b.type === B.class)
            .sort((a, b) => a.getRelativeToSurfaceXY().y - b.getRelativeToSurfaceXY().y);
        if (methods.length === 0) return;
        Blockly.renderManagement.triggerQueuedRenders(ws);
        const s = start.getRelativeToSurfaceXY();
        let y = s.y + start.getHeightWidth().height + HAT_GAP;
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
        const start = ws?.getBlockById("start") as Blockly.BlockSvg | null;
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
        if (e.type === Blockly.Events.SELECTED) {
            this.selectedId = (e as Blockly.Events.Selected).newElementId ?? null;
            this.markPreviewLines();
            return;
        }
        if (e.type === Blockly.Events.TOOLBOX_ITEM_SELECT) {
            // Blöcke in der Werkzeugleiste: Formen passend zu den Variablen der Arbeitsfläche
            setTimeout(() => this.typeFlyout(), 0);
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
        this.notice.hidden = !this.hasLooseBlocks();
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
        const { code, ranges } = JavaBlockGenerator.generate(state);
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
            block.setWarningText(list ? [...new Set(list)].join("\n") : null);
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
