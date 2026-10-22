import * as monaco from "monaco-editor";
import type { Main } from "../main/Main";
import type { GUIFile } from "../workspace/File";
import {
    addCase, diagramOfDoc, findNode, insertNode, moveNode, newNode, parseDoc, removeCase, removeNode, serializeDoc,
    setCaseLabel, setText, setTitle, textOf, toggleOther, withNewIds, type ENode, type NewKind, type Place, type Slot, type StructogramDoc,
} from "./StructogramDoc";
import { docToJava, isRecognized, parseSignature } from "./PseudoJava";
import { renderSvg, STYLE, type Measure } from "./StructogramSvg";
import { createFile, findFile, replaceText } from "./ProjectFiles";
import { Constants } from "../Constants";
import "/assets/css/gsg-structogram.css";

/**
 * Editor für Struktogramm-Dateien (*.struktogramm, Paket 7b). Darstellung wie in den Ergänzenden
 * Hinweisen; Element anklicken, Text in der Leiste bearbeiten, Elemente einfügen (nach dem
 * ausgewählten Element bzw. in einen leeren Zweig), verschieben, ausschneiden/einfügen, löschen.
 * Der Inhalt steht als JSON im Text der Datei; Rückgängig/Wiederholen nutzt den Verlauf der Datei.
 */

const INSERT: [NewKind, string, string][] = [
    ["stmt", "Anweisung", "x ← 0"],
    ["if", "Verzweigung", "wahr / falsch"],
    ["switch", "Auswahl", "… ist gleich: mehrere Fälle"],
    ["while", "solange", "Schleife: solange Bedingung"],
    ["for", "für … bis", "Zählschleife: für i von 1 bis 10"],
    ["foreach", "für alle", "für alle Elemente e aus liste"],
    ["repeat", "n-mal", "wiederhole 10-mal"],
    ["footloop", "wiederhole bis", "fußgesteuerte Schleife"],
    ["return", "gib zurück", "Ergebnis zurückgeben"],
    ["comment", "Kommentar", "// Kommentar"],
];

const LABELS: Record<ENode["kind"], string> = { stmt: "Anweisung", if: "Bedingung", switch: "Auswahl", loop: "Schleife", footloop: "Schleife (unten)" };

export class StructogramEditor {

    private file?: GUIFile;
    private model?: monaco.editor.ITextModel;
    private listener?: monaco.IDisposable;
    private doc: StructogramDoc = parseDoc("");
    private lastText = "";
    private selected: string | undefined;
    private clipboard?: ENode;
    private readOnly = false;

    private canvas: HTMLDivElement;
    private insertBar: HTMLDivElement;
    private editRow: HTMLDivElement;
    private textLabel: HTMLSpanElement;
    private textInput: HTMLInputElement;
    private extras: HTMLSpanElement;
    private hint: HTMLSpanElement;
    private buttons = new Map<string, HTMLButtonElement>();
    private measureCtx = document.createElement("canvas").getContext("2d")!;

    constructor(private main: Main, private host: HTMLElement) {
        host.innerHTML = "";
        host.classList.add("gsg-sedit");
        host.tabIndex = -1;

        const bar = this.div("gsg-struct-bar");
        const title = document.createElement("span");
        title.className = "gsg-struct-title";
        title.innerHTML = `Struktogramm <span class="gsg-struct-sub">bearbeiten</span>`;
        bar.append(title,
            this.button("java", "⇢ In Java umwandeln", "Java-Datei mit gleichem Namen anlegen bzw. aktualisieren", () => this.toJava()),
            this.button("svg", "⤓ SVG", "Als Vektorbild speichern", () => this.save("svg")),
            this.button("png", "⤓ PNG", "Als Bild speichern", () => this.save("png")),
            this.button("print", "⎙ Drucken", "Struktogramm drucken", () => this.print()));

        this.insertBar = this.div("gsg-sedit-insert");
        const label = document.createElement("span");
        label.className = "gsg-sedit-label";
        label.textContent = "Einfügen:";
        this.insertBar.append(label);
        for (const [kind, text, tip] of INSERT) {
            this.insertBar.append(this.button("ins-" + kind, text, `${tip} – nach dem ausgewählten Element bzw. in den ausgewählten leeren Zweig`, () => this.insert(kind)));
        }
        const sep = () => { const s = document.createElement("span"); s.className = "gsg-sedit-sep"; return s; };
        this.insertBar.append(sep(),
            this.button("up", "↑", "nach oben schieben (Alt+↑)", () => this.move(-1)),
            this.button("down", "↓", "nach unten schieben (Alt+↓)", () => this.move(1)),
            this.button("cut", "✂", "ausschneiden (Strg+X)", () => this.cut()),
            this.button("paste", "⎘", "einfügen (Strg+V)", () => this.paste()),
            this.button("delete", "🗑", "löschen (Entf)", () => this.remove()),
            sep(),
            this.button("undo", "↶", "rückgängig (Strg+Z)", () => this.model?.undo()),
            this.button("redo", "↷", "wiederholen (Strg+Y)", () => this.model?.redo()));

        this.editRow = this.div("gsg-sedit-edit");
        this.textLabel = document.createElement("span");
        this.textLabel.className = "gsg-sedit-label";
        this.textInput = document.createElement("input");
        this.textInput.type = "text";
        this.textInput.spellcheck = false;
        this.textInput.addEventListener("focus", () => this.model?.pushStackElement());
        this.textInput.addEventListener("blur", () => this.model?.pushStackElement());
        this.textInput.addEventListener("input", () => this.editText(this.textInput.value));
        this.textInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === "Escape") {
                e.preventDefault();
                this.textInput.blur();
                this.host.focus();
            }
            if (e.key === "←" || (e.altKey && e.key === "-")) {
                // Alt+- schreibt ← (Zuweisung)
                e.preventDefault();
                this.typeArrow();
            }
        });
        const arrow = this.button("arrow", "←", "Zuweisungspfeil einfügen (Alt+-)", () => this.typeArrow());
        this.extras = document.createElement("span");
        this.extras.className = "gsg-sedit-extras";
        this.hint = document.createElement("span");
        this.hint.className = "gsg-sedit-hint";
        this.editRow.append(this.textLabel, this.textInput, arrow, this.extras, this.hint);

        this.canvas = this.div("gsg-struct-content gsg-sedit-canvas");
        this.canvas.addEventListener("click", (e) => this.onClick(e));
        this.canvas.addEventListener("dblclick", () => this.textInput.focus());
        host.addEventListener("keydown", (e) => this.onKey(e));
        host.append(bar, this.insertBar, this.editRow, this.canvas);
    }

    private div(cls: string): HTMLDivElement {
        const d = document.createElement("div");
        d.className = cls;
        return d;
    }

    private button(key: string, text: string, tip: string, action: () => void): HTMLButtonElement {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        b.title = tip;
        b.addEventListener("mousedown", (e) => e.preventDefault());   // Auswahl/Fokus behalten
        b.addEventListener("click", action);
        this.buttons.set(key, b);
        return b;
    }

    // ------------------------------------------------------------------ Datei

    /** In der Anwendung "Struktogramme" nur mit Java-Freigabe der Lerngruppe (Lehrkräfte immer) */
    private javaAllowed(): boolean {
        const u = this.main.user as { is_teacher?: boolean; is_admin?: boolean; is_schooladmin?: boolean; gsgFreigaben?: { java?: boolean; bloeckeJava?: boolean } } | undefined;
        if (!Constants.isStructogramApp || !u || u.is_teacher || u.is_admin || u.is_schooladmin) return true;
        return !!u.gsgFreigaben?.java;
    }

    show(file: GUIFile, readOnly: boolean) {
        this.readOnly = readOnly;
        this.buttons.get("java")!.hidden = !this.javaAllowed();
        if (this.file !== file) {
            this.listener?.dispose();
            this.file = file;
            this.model = file.getMonacoModel();
            this.selected = undefined;
            this.listener = this.model?.onDidChangeContent(() => this.onModelChanged());
        }
        this.host.classList.toggle("readonly", readOnly);
        this.load();
    }

    hide() {
        this.listener?.dispose();
        this.listener = undefined;
        this.file = undefined;
        this.model = undefined;
    }

    private load() {
        if (!this.model || this.model.isDisposed()) return;
        this.lastText = this.model.getValue(monaco.editor.EndOfLinePreference.LF);
        this.doc = parseDoc(this.lastText);
        if (this.selected && this.selected !== "title" && !this.selected.startsWith("slot:") && !findNode(this.doc, this.selected)) this.selected = undefined;
        this.render();
    }

    private onModelChanged() {
        if (!this.model) return;
        const text = this.model.getValue(monaco.editor.EndOfLinePreference.LF);
        if (text !== this.lastText) this.load();   // Rückgängig, Korrektur der Lehrkraft …
    }

    /** neuen Stand speichern (merge: Tippen im Textfeld als ein Rückgängig-Schritt) */
    private apply(doc: StructogramDoc, merge = false) {
        if (this.readOnly || !this.model || this.model.isDisposed()) return;
        this.doc = doc;
        const text = serializeDoc(doc);
        this.lastText = text;
        if (!merge) this.model.pushStackElement();
        this.model.pushEditOperations([], [{ range: this.model.getFullModelRange(), text }], () => null);
        if (!merge) this.model.pushStackElement();
        this.render(!merge);
    }

    // ------------------------------------------------------------------ Darstellung

    private measure: Measure = (text, bold) => {
        this.measureCtx.font = `${bold ? "bold " : ""}${STYLE.font}px Arial, Helvetica, sans-serif`;
        return this.measureCtx.measureText(text).width;
    };

    private render(updateText = true) {
        const sig = parseSignature(this.doc.title);
        const vars = new Map(sig.kind === "main" ? [] : sig.params.map((p) => [p.name, p.type] as [string, string]));
        const { svg } = renderSvg([diagramOfDoc(this.doc)], this.measure, {
            interactive: !this.readOnly,
            selected: this.selected,
            unrecognized: (kind, text) => !isRecognized(kind, text, vars),
        });
        this.canvas.innerHTML = svg;
        this.updateBars(updateText);
    }

    private selectedNode(): ENode | undefined {
        return this.selected && this.selected !== "title" && !this.selected.startsWith("slot:") ? findNode(this.doc, this.selected)?.node : undefined;
    }

    private updateBars(updateText: boolean) {
        const node = this.selectedNode();
        const isTitle = this.selected === "title";
        const isSlot = !!this.selected?.startsWith("slot:");
        this.textLabel.textContent = isTitle ? "Titel:" : node ? LABELS[node.kind] + ":" : isSlot ? "Leerer Zweig:" : "Text:";
        this.textInput.disabled = this.readOnly || !(isTitle || node);
        if (updateText) {
            this.textInput.value = isTitle ? this.doc.title : node ? textOf(node) : "";
            this.textInput.placeholder = isSlot ? "Element einfügen – Knopf oben" : "Element anklicken";
        }
        for (const k of ["up", "down", "cut", "delete"]) this.buttons.get(k)!.disabled = this.readOnly || !node;
        this.buttons.get("paste")!.disabled = this.readOnly || !this.clipboard;
        for (const [kind] of INSERT) this.buttons.get("ins-" + kind)!.disabled = this.readOnly;
        // Zusatz: Fälle der mehrseitigen Auswahl
        this.extras.innerHTML = "";
        if (node?.kind === "switch" && !this.readOnly) {
            const lbl = document.createElement("span");
            lbl.className = "gsg-sedit-label";
            lbl.textContent = "Fälle:";
            this.extras.append(lbl);
            node.cases.forEach((c, i) => {
                const inp = document.createElement("input");
                inp.className = "gsg-sedit-case";
                inp.value = c.label;
                inp.size = Math.max(3, c.label.length + 1);
                inp.addEventListener("focus", () => this.model?.pushStackElement());
                inp.addEventListener("input", () => this.apply(setCaseLabel(this.doc, node.id, i, inp.value), true));
                this.extras.append(inp);
            });
            this.extras.append(
                this.button("case+", "+ Fall", "weiteren Fall hinzufügen", () => this.apply(addCase(this.doc, node.id))),
                this.button("case-", "− Fall", "letzten Fall entfernen", () => this.apply(removeCase(this.doc, node.id))),
                this.button("other", node.other ? "ohne sonst" : "+ sonst", "Zweig „sonst“ an/aus", () => this.apply(toggleOther(this.doc, node.id))));
        }
        // Hinweis, ob der Text in Java umgewandelt werden kann
        const sig = parseSignature(this.doc.title);
        if (isTitle) {
            this.hint.textContent = sig.kind === "main" ? "Hauptprogramm – oder Signatur wie istGerade(x: Ganzzahl): Wahrheitswert" : "";
        } else if (node) {
            const vars = new Map(sig.kind === "main" ? [] : sig.params.map((p) => [p.name, p.type] as [string, string]));
            this.hint.textContent = isRecognized(node.kind, textOf(node), vars) ? "" : "wird in Java ein TODO (Formulierung nicht erkannt)";
        } else {
            this.hint.textContent = "";
        }
    }

    // ------------------------------------------------------------------ Bedienung

    private onClick(e: MouseEvent) {
        const el = (e.target as Element).closest("[data-sel],[data-slot]");
        if (!el) return;
        const sel = el.getAttribute("data-sel");
        const slot = el.getAttribute("data-slot");
        this.selected = sel ? sel : slot ? "slot:" + slot : undefined;
        this.render();
        this.host.focus();
    }

    private onKey(e: KeyboardEvent) {
        if (e.target === this.textInput || (e.target as HTMLElement).tagName === "INPUT") return;
        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && e.key.toLowerCase() === "z") this.model?.undo();
        else if (ctrl && e.key.toLowerCase() === "y") this.model?.redo();
        else if (ctrl && e.key.toLowerCase() === "x") this.cut();
        else if (ctrl && e.key.toLowerCase() === "v") this.paste();
        else if (e.key === "Delete") this.remove();
        else if (e.altKey && e.key === "ArrowUp") this.move(-1);
        else if (e.altKey && e.key === "ArrowDown") this.move(1);
        else if (e.key === "Enter" || e.key === "F2") this.textInput.focus();
        else return;
        e.preventDefault();
        e.stopPropagation();
    }

    /** Einfügestelle: nach dem ausgewählten Element, in den ausgewählten leeren Zweig, sonst ans Ende */
    private place(): Place {
        if (this.selected?.startsWith("slot:")) {
            const [owner, part] = this.selected.slice(5).split(":");
            return { slot: { owner, part } as Slot };
        }
        const node = this.selectedNode();
        if (node) return { after: node.id };
        const last = this.doc.body[this.doc.body.length - 1];
        return last ? { after: last.id } : { slot: { owner: "root", part: "body" } };
    }

    private insert(kind: NewKind) {
        const node = newNode(kind);
        this.apply(insertNode(this.doc, this.place(), node));
        this.selected = node.id;
        this.render();
        this.textInput.focus();
        this.textInput.select();
    }

    private move(delta: -1 | 1) {
        const node = this.selectedNode();
        if (node) this.apply(moveNode(this.doc, node.id, delta));
    }

    private remove() {
        const node = this.selectedNode();
        if (!node) return;
        const found = findNode(this.doc, node.id)!;
        const next = found.seq[found.index + 1] ?? found.seq[found.index - 1];
        this.selected = next?.id;
        this.apply(removeNode(this.doc, node.id));
    }

    private cut() {
        const node = this.selectedNode();
        if (!node) return;
        this.clipboard = node;
        this.remove();
    }

    private paste() {
        if (!this.clipboard) return;
        const node = withNewIds(this.clipboard);
        this.apply(insertNode(this.doc, this.place(), node));
        this.selected = node.id;
        this.render();
    }

    private editText(value: string) {
        if (this.selected === "title") this.apply(setTitle(this.doc, value), true);
        else if (this.selectedNode()) this.apply(setText(this.doc, this.selected!, value), true);
    }

    private typeArrow() {
        const inp = this.textInput;
        if (inp.disabled) return;
        const s = inp.selectionStart ?? inp.value.length, e = inp.selectionEnd ?? s;
        inp.value = inp.value.slice(0, s) + "← " + inp.value.slice(e);
        inp.setSelectionRange(s + 2, s + 2);
        inp.focus();
        this.editText(inp.value);
    }

    // ------------------------------------------------------------------ Java, Bild, Druck

    private baseName(): string {
        return (this.file?.name ?? "struktogramm").replace(/\.struktogramm$/i, "");
    }

    private async toJava() {
        if (!this.file) return;
        const { code, todos } = docToJava(this.doc);
        const name = this.baseName() + ".java";
        const folder = this.file.parent_folder_id ?? null;
        const header = `// erzeugt aus dem Struktogramm „${this.file.name}“${todos ? ` – ${todos} Stelle(n) mit TODO zum Ausprogrammieren` : ""}\n`;
        const existing = findFile(this.main, name, folder);
        if (existing) {
            if (!confirm(`Die Datei „${name}“ gibt es schon. Ihren Inhalt durch den Code aus dem Struktogramm ersetzen?`)) return;
            replaceText(this.main, existing, header + code);
            this.main.projectExplorer.setFileActive(existing);
        } else {
            await createFile(this.main, name, header + code, folder);
        }
    }

    private plainSvg(): { svg: string; width: number; height: number } {
        return renderSvg([diagramOfDoc(this.doc)], this.measure);
    }

    private download(blob: Blob, name: string) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    private save(kind: "svg" | "png") {
        const { svg, width, height } = this.plainSvg();
        if (kind === "svg") {
            this.download(new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`], { type: "image/svg+xml" }), this.baseName() + ".svg");
            return;
        }
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = width * 2;
            canvas.height = height * 2;
            const ctx = canvas.getContext("2d")!;
            ctx.scale(2, 2);
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((b) => { if (b) this.download(b, this.baseName() + ".png"); }, "image/png");
        };
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    }

    private print() {
        const { svg } = this.plainSvg();
        const frame = document.createElement("iframe");
        frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
        document.body.append(frame);
        const doc = frame.contentDocument!;
        doc.open();
        doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${this.baseName()}</title>`
            + `<style>@page{margin:12mm}body{margin:0}svg{max-width:100%;height:auto}</style></head><body>${svg}</body></html>`);
        doc.close();
        setTimeout(() => {
            frame.contentWindow?.focus();
            frame.contentWindow?.print();
            setTimeout(() => frame.remove(), 1000);
        }, 100);
    }
}
