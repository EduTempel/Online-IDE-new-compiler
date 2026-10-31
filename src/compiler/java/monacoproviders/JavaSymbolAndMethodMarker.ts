import { IMain } from "../../common/IMain.ts";
import { Range } from "../../common/range/Range.ts";
import { JavaCompiledModule } from "../module/JavaCompiledModule.ts";
import { BaseSymbol, BaseSymbolTable } from "../../common/BaseSymbolTable.ts";
import { Position } from "../../common/range/Position.ts";
import { JavaLocalVariable } from "../codegenerator/JavaLocalVariable.ts";
import { JavaParameter } from "../types/JavaParameter.ts";
import { JavaField } from "../types/JavaField.ts";
import { mainVariableScopeRanges } from "./GsgScopeRanges.ts";
import * as monaco from 'monaco-editor'

export class JavaSymbolAndMethodMarker {

    /** GSG: Gültigkeitsbereich am Rand zeigen? (Freigabe „Gültigkeitsbereich“ der Lerngruppe, beim Anmelden gesetzt) */
    static gsgShowScope = true;

    decorations?: monaco.editor.IEditorDecorationsCollection;

    constructor(private main: IMain) {
        if (!main.getMainEditor()) {
            console.error("Call of construction of JavaSymbolMarker after creation of monaco editor.");
            return;
        }

        main.getMainEditor().onDidChangeCursorPosition((event) => {
            this.onDidChangeCursorPosition(event);
        })

    }

    onDidChangeCursorPosition(event: monaco.editor.ICursorPositionChangedEvent) {
        let editor = this.main.getMainEditor();
        if (!editor) return;

        if (editor.getModel()?.getLanguageId() != 'myJava') return;

        this.clearDecorations();

        let module = <JavaCompiledModule>this.main.getCurrentWorkspace()?.getModuleForMonacoModel(editor.getModel());
        if (!module) return;

        let decorations: monaco.editor.IModelDeltaDecoration[] = [];
        this.markSymbolUnderCursor(editor, module, event.position, decorations);
        this.markMethodUnderCursor(editor, module, event.position, decorations);

        this.decorations = editor.createDecorationsCollection(decorations);

    }

    private markSymbolUnderCursor(editor: monaco.editor.IStandaloneCodeEditor,
        module: JavaCompiledModule, position: monaco.Position, decorations: monaco.editor.IModelDeltaDecoration[]) {

        if (!module) return;

        let usagePosition = module.findSymbolAtPosition(position);

        if (usagePosition == null) {
            return;
        }

        let usagePositions = module.getUsagePositionsForSymbol(usagePosition?.symbol);

        this.markScopeOfSymbol(module, usagePosition.symbol, position, decorations);

        if (!usagePositions) return;

        for (let up of usagePositions) {
            decorations.push({
                range: up.range,
                options: {
                    inlineClassName: 'jo_revealSyntaxElement', isWholeLine: false, overviewRuler: {
                        color: { id: "editorIndentGuide.background" },
                        darkColor: { id: "editorIndentGuide.activeBackground" },
                        position: monaco.editor.OverviewRulerLane.Left
                    }
                }
            })
        }

    }

    /**
     * GSG (Paket 16d): Gültigkeitsbereich einer lokalen Variablen bzw. eines Parameters – von der Deklaration
     * bis zur schließenden Klammer des Blocks, in dem sie angelegt ist – als grüner Balken am Rand.
     */
    private markScopeOfSymbol(module: JavaCompiledModule, symbol: BaseSymbol, cursor: monaco.Position, decorations: monaco.editor.IModelDeltaDecoration[]) {
        if (!(module instanceof JavaCompiledModule) || !JavaSymbolAndMethodMarker.gsgShowScope) return;
        // Variable des Hauptprogramms (für die Online-IDE ein statisches Attribut der Hauptklasse)
        if (symbol instanceof JavaField && symbol._isStatic && (symbol.classEnum as { isMainClass?: boolean } | undefined)?.isMainClass) {
            for (const r of mainVariableScopeRanges(module, symbol.identifierRange.startLineNumber)) decorations.push(this.scopeDecoration(r, symbol.identifier));
            return;
        }
        if (!(symbol instanceof JavaLocalVariable || symbol instanceof JavaParameter)) return;
        const declaration = symbol.identifierRange;
        // Tabelle mit dem Symbol: von der Stelle des Cursors (liegt im Gültigkeitsbereich) bzw. der Deklaration nach außen
        const tableOf = (line: number, column: number) => {
            let t: BaseSymbolTable | undefined = module.findSymbolTableAtPosition(new Position(line, column));
            while (t && t.identifierToSymbolMap.get(symbol.identifier) !== symbol) t = t.parent;
            return t;
        };
        const table = tableOf(cursor.lineNumber, cursor.column) ?? tableOf(declaration.startLineNumber, declaration.startColumn);
        if (!table) return;
        decorations.push(this.scopeDecoration({ startLineNumber: declaration.startLineNumber, endLineNumber: table.range.endLineNumber }, symbol.identifier));
    }

    private scopeDecoration(r: { startLineNumber: number, endLineNumber: number }, identifier: string): monaco.editor.IModelDeltaDecoration {
        return {
            range: { startLineNumber: r.startLineNumber, startColumn: 1, endLineNumber: r.endLineNumber, endColumn: 1 },
            options: {
                isWholeLine: true,
                linesDecorationsClassName: 'gsg-scope-gutter',
                linesDecorationsTooltip: `Gültigkeitsbereich von ${identifier}`,
                overviewRuler: { color: '#45B82F', position: monaco.editor.OverviewRulerLane.Right },
            }
        };
    }

    private markMethodUnderCursor(editor: monaco.editor.IStandaloneCodeEditor,
        module: JavaCompiledModule, position: monaco.Position, decorations: monaco.editor.IModelDeltaDecoration[]) {

        if(!(module instanceof JavaCompiledModule)) return;    
        let methodRange = module.methodDeclarationRanges.find(range => Range.containsPosition(range, position));

        if (methodRange) {
            decorations.push({
                range: { startColumn: 0, startLineNumber: methodRange.startLineNumber, endColumn: 100, endLineNumber: methodRange.endLineNumber },
                options: {
                    className: 'jo_highlightMethod', isWholeLine: true,
                    overviewRuler: {
                        color: { id: "jo_highlightMethod" },
                        darkColor: { id: "jo_highlightMethod" },
                        position: monaco.editor.OverviewRulerLane.Left
                    },
                    minimap: {
                        color: { id: 'jo_highlightMethod' },

                        position: monaco.editor.MinimapPosition.Inline
                    },
                    zIndex: -100
                }
            })
        }

    }


    clearDecorations() {
        if (this.decorations) {
            this.decorations.clear();
            this.decorations = undefined;
        }
    }

}