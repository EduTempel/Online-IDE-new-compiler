import * as monaco from "monaco-editor";
import type { Main } from "../main/Main";
import type { GUIFile } from "../workspace/File";
import { JavaBlockParser } from "../blocks/JavaBlockParser";
import { classInfosFromState, type ClassInfo } from "../blocks/ClassModel";
import { diagramsFromJava } from "./StructogramModel";
import { renderSvg, STYLE, type Measure } from "./StructogramSvg";
import { docFromDiagram, emptyDoc, serializeDoc } from "./StructogramDoc";
import { createFile, freeName } from "./ProjectFiles";
import "/assets/css/gsg-structogram.css";

/**
 * Ansicht "Struktogramm" (Paket 7): zeigt die Struktogramme der Java-Datei im Stil der
 * Ergänzenden Hinweise (Abitur Niedersachsen), aktualisiert sich beim Bearbeiten und kann als
 * Bild (SVG, PNG) gespeichert oder gedruckt werden. Nur lesen – bearbeitet wird in Blöcken oder Java.
 */
export class StructogramView {

    private content: HTMLDivElement;
    private file?: GUIFile;
    private model?: monaco.editor.ITextModel;
    private listener?: monaco.IDisposable;
    private timer?: ReturnType<typeof setTimeout>;
    private svg = "";
    private takeButton: HTMLButtonElement;
    private diagrams: ReturnType<typeof diagramsFromJava> = [];
    private size = { width: 0, height: 0 };
    private measureCtx = document.createElement("canvas").getContext("2d")!;

    constructor(private main: Main, private host: HTMLElement) {
        host.innerHTML = "";
        host.classList.add("gsg-structogram");
        const bar = document.createElement("div");
        bar.className = "gsg-struct-bar";
        const title = document.createElement("span");
        title.className = "gsg-struct-title";
        title.innerHTML = `Struktogramm <span class="gsg-struct-sub">aus dem Programm erzeugt</span>`;
        const button = (label: string, tip: string, action: () => void) => {
            const b = document.createElement("button");
            b.type = "button";
            b.textContent = label;
            b.title = tip;
            b.addEventListener("click", action);
            return b;
        };
        this.takeButton = button("＋ Datei", "Als Struktogramm-Datei anlegen (zum Bearbeiten, Austeilen, Umwandeln in Java)", () => this.takeOver());
        bar.append(title, this.takeButton,
            button("⤓ SVG", "Als Vektorbild speichern (z. B. für Arbeitsblätter)", () => this.saveSvg()),
            button("⤓ PNG", "Als Bild speichern", () => this.savePng()),
            button("⎙ Drucken", "Struktogramme drucken", () => this.print()));
        this.content = document.createElement("div");
        this.content.className = "gsg-struct-content";
        host.append(bar, this.content);
    }

    show(file: GUIFile) {
        if (this.file !== file) {
            this.listener?.dispose();
            this.file = file;
            this.model = file.getMonacoModel();
            this.listener = this.model?.onDidChangeContent(() => {
                clearTimeout(this.timer);
                this.timer = setTimeout(() => this.render(), 300);
            });
        }
        this.render();
    }

    /** Hinweis statt Struktogramm (z. B. keine Java-Datei) */
    showMessage(message: string) {
        this.hide();
        this.svg = "";
        this.diagrams = [];
        this.content.innerHTML = "";
        const div = document.createElement("div");
        div.className = "gsg-struct-empty";
        div.textContent = message;
        this.content.append(div);
    }

    hide() {
        clearTimeout(this.timer);
        this.listener?.dispose();
        this.listener = undefined;
        this.file = undefined;
        this.model = undefined;
    }

    private measure: Measure = (text, bold) => {
        this.measureCtx.font = `${bold ? "bold " : ""}${STYLE.font}px Arial, Helvetica, sans-serif`;
        return this.measureCtx.measureText(text).width;
    };

    private render() {
        if (!this.model || this.model.isDisposed()) return;
        const code = this.model.getValue(monaco.editor.EndOfLinePreference.LF);
        try {
            const diagrams = diagramsFromJava(code, this.otherFilesClasses());
            this.diagrams = code.trim() ? diagrams : [];
            const { svg, width, height } = renderSvg(diagrams, this.measure);
            this.svg = svg;
            this.size = { width, height };
            this.content.innerHTML = code.trim() ? svg : `<div class="gsg-struct-empty">Das Programm ist noch leer.</div>`;
        } catch (e) {
            console.error(e);
            this.content.innerHTML = `<div class="gsg-struct-empty">Das Struktogramm konnte nicht erzeugt werden.</div>`;
        }
    }

    /** Klassen aus den anderen Dateien (für Objekte) */
    private otherFilesClasses(): ClassInfo[] {
        const result: ClassInfo[] = [];
        for (const f of this.main.getCurrentWorkspace()?.getFiles() ?? []) {
            if (f === this.file || f.isFolder) continue;
            try {
                const text = f.getText();
                if (/\bclass\b/.test(text)) result.push(...classInfosFromState(JavaBlockParser.parse(text).state));
            } catch {
                // Datei überspringen
            }
        }
        return result;
    }

    /**
     * Struktogramm-Dateien anlegen: aus jedem Struktogramm der Java-Datei eine (Name nach der
     * Operation bzw. der Datei); ohne Java-Datei ein leeres Struktogramm.
     */
    private async takeOver() {
        const folder = this.file?.parent_folder_id ?? null;
        if (!this.diagrams.length) {
            await createFile(this.main, freeName(this.main, "Struktogramm.struktogramm", folder), serializeDoc(emptyDoc()), folder);
            return;
        }
        if (this.diagrams.length > 1 && !confirm(`Für jedes der ${this.diagrams.length} Struktogramme eine Struktogramm-Datei anlegen?`)) return;
        const base = (this.file?.name ?? "Programm").replace(/\.java$/i, "");
        for (const d of this.diagrams) {
            const name = d.title === "Hauptprogramm" ? base : (/^(?:Konstruktor\s+)?([\p{L}_$][\p{L}\p{N}_$]*)/u.exec(d.title)?.[1] ?? base);
            await createFile(this.main, freeName(this.main, name + ".struktogramm", folder), serializeDoc(docFromDiagram(d)), folder);
        }
    }

    private baseName(): string {
        return (this.file?.name ?? "programm").replace(/\.java$/i, "") + "-struktogramm";
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

    private saveSvg() {
        if (!this.svg) return;
        this.download(new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${this.svg}`], { type: "image/svg+xml" }), this.baseName() + ".svg");
    }

    private savePng() {
        if (!this.svg) return;
        const img = new Image();
        img.onload = () => {
            const scale = 2;
            const canvas = document.createElement("canvas");
            canvas.width = this.size.width * scale;
            canvas.height = this.size.height * scale;
            const ctx = canvas.getContext("2d")!;
            ctx.scale(scale, scale);
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((blob) => { if (blob) this.download(blob, this.baseName() + ".png"); }, "image/png");
        };
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(this.svg);
    }

    private print() {
        if (!this.svg) return;
        const frame = document.createElement("iframe");
        frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
        document.body.append(frame);
        const doc = frame.contentDocument!;
        doc.open();
        doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${this.baseName()}</title>`
            + `<style>@page{margin:12mm}body{margin:0}svg{max-width:100%;height:auto}</style></head><body>${this.svg}</body></html>`);
        doc.close();
        setTimeout(() => {
            frame.contentWindow?.focus();
            frame.contentWindow?.print();
            setTimeout(() => frame.remove(), 1000);
        }, 100);
    }
}
