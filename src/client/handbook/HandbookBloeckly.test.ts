import { describe, expect, test } from "vitest";
// Ladereihenfolge der Compiler-Module wie in der IDE (sonst zyklische Importe)
import { Interpreter } from "../../compiler/common/interpreter/Interpreter";
import { JavaCompiler } from "../../compiler/java/JavaCompiler";
import { JavaLibraryManager } from "../../compiler/java/runtime/JavaLibraryManager";
import { CompilerFile } from "../../compiler/common/module/CompilerFile";
import { JavaBlockGenerator } from "../blocks/JavaBlockGenerator";
import { JavaBlockParser } from "../blocks/JavaBlockParser";
import { BL_CATEGORIES, type BloecklyContext } from "../bloeckly/BloecklySpec";
import { BUEHNEN_DATEI, BUEHNEN_KLASSE, liesProjekt, variablenDerKlasse } from "../bloeckly/BloecklyProjekt";
import { BLOECKLY_HANDBOOK } from "./HandbookBloeckly";
import { findBlockEntry } from "./HandbookSearch";

void Interpreter;

const entries = BLOECKLY_HANDBOOK.flatMap((s) => s.entries.map((e) => ({ section: s.id, ...e })));

function ctxFor(files: { name: string; text: string }[], name: string): BloecklyContext {
    const stage = files.find((f) => f.name === BUEHNEN_DATEI)!;
    return { stage: BUEHNEN_KLASSE, globals: name === BUEHNEN_DATEI ? {} : variablenDerKlasse(stage.text, { stage: BUEHNEN_KLASSE, globals: {} }) };
}

async function compile(texts: string[]) {
    const files = texts.map((t, i) => {
        const f = new CompilerFile("Datei" + i);
        f.setText(t);
        return f;
    });
    const compiler = new JavaCompiler();
    new JavaLibraryManager().addLibrariesToCompiler(compiler);
    compiler.setFiles(files as never);
    const executable = await compiler.compileIfDirty();
    return executable!.getAllErrors().filter((e) => e.level == "error").map((e) => `${e.message} (Zeile ${e.range.startLineNumber})`);
}

describe("Handbuch Blöckly (Paket 18h)", () => {
    test("alle acht Kategorien der Werkzeugleiste haben einen Abschnitt; Kennungen und Titel eindeutig", () => {
        const ids = BLOECKLY_HANDBOOK.map((s) => s.id);
        for (const c of BL_CATEGORIES) expect(ids).toContain(c.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(new Set(entries.map((e) => e.title)).size).toBe(entries.length);
    });

    test.each(entries.map((e) => [e.section + ": " + e.title, e] as const))("%s: Blöcke ↔ Java unverändert, nur Blöckly-Blöcke", (_, e) => {
        const files = e.bloeckly!.files;
        expect(liesProjekt(files.map((f) => ({ name: f.name, getText: () => f.text, isFolder: false }) as never)).figuren.length).toBeGreaterThan(0);
        expect(e.bloeckly!.show.length).toBeGreaterThan(0);
        for (const name of e.bloeckly!.show) {
            const file = files.find((f) => f.name === name)!;
            const ctx = ctxFor(files, name);
            const { state } = JavaBlockParser.parse(file.text, { bloeckly: ctx });
            expect(JSON.stringify(state), `${name}`).not.toMatch(/j_java_(expr|stmt|raw)/);
            expect(JavaBlockGenerator.generate(state, { bloeckly: ctx }).code, name).toBe(file.text);
        }
    });

    test.each(entries.map((e) => [e.title, e] as const))("%s: übersetzt ohne Fehler", async (_, e) => {
        expect(await compile(e.bloeckly!.files.map((f) => f.text))).toEqual([]);
    });

    test("Hilfe per Rechtsklick findet Blöckly-Blöcke", () => {
        expect(findBlockEntry(BLOECKLY_HANDBOOK, "bl_gehe", "bewegung")?.section).toBe("bewegung");
        expect(findBlockEntry(BLOECKLY_HANDBOOK, "bl_naechstes_kostuem", "aussehen")?.section).toBe("aussehen");
        expect(findBlockEntry(BLOECKLY_HANDBOOK, "bl_klon", "steuerung")?.section).toBe("steuerung");
        expect(findBlockEntry(BLOECKLY_HANDBOOK, "bl_beruehrt", "fuehlen")?.section).toBe("fuehlen");
    });
});
