import { expect, test } from "vitest";
import "../../compiler/common/interpreter/Interpreter";
import "../../compiler/java/JavaCompiler";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { freigabeKatalog } from "./BlockFreigabeKatalog";
import { BLOCK_CATEGORY_IDS } from "./BlockDefinitions";
import { BL_CATEGORIES } from "../bloeckly/BloecklySpec";

/** Tests laufen im Ordner clients/java-ide; die Verwaltung liegt im Hauptrepository (fehlt sie, nur prüfen) */
const ZIEL = resolve(process.cwd(), "../../backend/public/verwaltung/bloecke-katalog.json");

const k = freigabeKatalog();

test("Katalog für die Freigaben: Mix und Blocks mit Blöcken je Kategorie", () => {
    expect(k.bloeckva.map((c) => c.id).every((id) => (BLOCK_CATEGORY_IDS as readonly string[]).includes(id))).toBe(true);
    expect(k.bloeckly.map((c) => c.id)).toEqual(BL_CATEGORIES.map((c) => "bl-" + c.id));
    const steuerung = k.bloeckva.find((c) => c.id === "steuerung")!.bloecke;
    expect(steuerung).toContainEqual({ schluessel: "j_while", text: "wiederhole solange …" });
    expect(k.bloeckly.find((c) => c.id === "bl-operatoren")!.bloecke).toContainEqual({ schluessel: "j_arith:+", text: "1 + 1" });
    expect(k.bloeckly.find((c) => c.id === "bl-aussehen")!.bloecke).toContainEqual({ schluessel: "bl_sage", text: "sage „Hallo!“" });
    // jeder Schlüssel je Kategorie nur einmal
    for (const c of [...k.bloeckva, ...k.bloeckly]) expect(new Set(c.bloecke.map((b) => b.schluessel)).size).toBe(c.bloecke.length);
});

test("backend/public/verwaltung/bloecke-katalog.json ist aktuell (neu schreiben: GSG_KATALOG_SCHREIBEN=1)", () => {
    const text = JSON.stringify(k, null, 1) + "\n";
    if (process.env.GSG_KATALOG_SCHREIBEN === "1") writeFileSync(ZIEL, text, "utf-8");
    if (!existsSync(ZIEL)) return;
    expect(readFileSync(ZIEL, "utf-8").replace(/\r\n/g, "\n"), "Katalog veraltet: mit GSG_KATALOG_SCHREIBEN=1 neu schreiben").toBe(text);
});
