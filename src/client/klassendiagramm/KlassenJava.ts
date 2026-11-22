import { JavaBlockParser } from "../blocks/JavaBlockParser";
import { classInfosFromState, typeInfo, type ClassInfo } from "../blocks/ClassModel";
import { adtTypeOf } from "../blocks/AdtSpec";
import { emptyDoc, istAbiturklasse, javaTyp, newId, oberklasse, zerlegeTyp, type Klasse, type KlassenDoc, type Operation, type Sicht } from "./KlassenDoc";
import { ordneAn, type Measure } from "./KlassenSvg";

/**
 * Klassendiagramm ↔ Code (Paket 20):
 * - „In Code umwandeln“: je Klasse eine Datei mit Attributen, Konstruktoren und Operationen; die Rümpfe enthalten
 *   ein TODO und – wo nötig – eine Standardrückgabe, damit das Programm sofort übersetzt.
 * - „Aus dem Code übernehmen“: Klassen der Java-Dateien des Projekts als Diagramm (Lage automatisch).
 */

const STANDARD: Record<string, string> = {
    int: "0", long: "0", short: "0", byte: "0", double: "0.0", float: "0.0f", boolean: "false", char: "' '", String: "\"\"",
};

const sichtwort = (s: Sicht) => s === "-" ? "private" : "public";

function parameterListe(o: Operation): string {
    return o.parameter.map((p) => `${javaTyp(p.typ)} ${p.name}`).join(", ");
}

/**
 * Hat die Oberklasse Konstruktoren, aber keinen ohne Parameter, muss jeder Konstruktor der Unterklasse zuerst
 * super(...) aufrufen: mit gleichnamigen Parametern, sonst mit Standardwerten (und einem TODO).
 */
function superAufruf(ober: Klasse | undefined, o: Operation): { zeile: string; weitergegeben: Set<string> } | undefined {
    const konstruktoren = ober?.operationen.filter((x) => x.konstruktor) ?? [];
    if (!konstruktoren.length || konstruktoren.some((x) => !x.parameter.length)) return undefined;
    const passt = (p: { name: string; typ: string }) => o.parameter.some((q) => q.name === p.name && javaTyp(q.typ) === javaTyp(p.typ));
    const wahl = konstruktoren.find((x) => x.parameter.every(passt)) ?? konstruktoren[0];
    const args = wahl.parameter.map((p) => passt(p) ? p.name : STANDARD[javaTyp(p.typ)] ?? "null");
    return {
        zeile: `super(${args.join(", ")});${wahl.parameter.every(passt) ? "" : "   // TODO: passende Werte für die Oberklasse"}`,
        weitergegeben: new Set(wahl.parameter.filter(passt).map((p) => p.name)),
    };
}

/** Texva-Code einer Klasse */
export function klasseZuJava(doc: KlassenDoc, k: Klasse, quelle?: string): string {
    const z: string[] = [];
    if (quelle) z.push(`// erzeugt aus dem Klassendiagramm „${quelle}“`);
    const ober = oberklasse(doc, k.id);
    z.push(`public class ${k.name}${ober ? " extends " + ober.name : ""} {`);
    const attribute = new Map(k.attribute.map((a) => [a.name, a.typ]));
    if (k.attribute.length) z.push("");
    for (const a of k.attribute) {
        z.push(`    ${sichtwort(a.sicht)} ${javaTyp(a.typ)} ${a.name};`);
    }
    if (k.mehrAttribute) z.push("    // ... weitere Attribute");
    for (const o of k.operationen) {
        z.push("");
        if (o.konstruktor) {
            z.push(`    ${sichtwort(o.sicht)} ${k.name}(${parameterListe(o)}) {`);
            const aufruf = superAufruf(ober, o);
            if (aufruf) z.push(`        ${aufruf.zeile}`);
            // Parameter, die wie ein Attribut heißen und denselben Typ haben, werden übernommen
            const uebernommen = o.parameter.filter((p) => attribute.get(p.name) === p.typ);
            for (const p of uebernommen) z.push(`        this.${p.name} = ${p.name};`);
            const offen = o.parameter.filter((p) => !uebernommen.includes(p) && !aufruf?.weitergegeben.has(p.name));
            if (offen.length || (!o.parameter.length && !aufruf)) z.push("        // TODO");
            z.push("    }");
            continue;
        }
        const rueckgabe = o.rueckgabe ? javaTyp(o.rueckgabe) : "";
        z.push(`    ${sichtwort(o.sicht)} ${rueckgabe || "void"} ${o.name}(${parameterListe(o)}) {`);
        z.push("        // TODO");
        if (rueckgabe) z.push(`        return ${STANDARD[rueckgabe] ?? "null"};`);
        z.push("    }");
    }
    if (k.mehrOperationen) z.push("", "    // ... weitere Operationen");
    if (k.attribute.length || k.operationen.length) z.push("");
    z.push("}", "");
    return z.join("\n");
}

/** je Klasse eine Datei „Name.java“ */
export function docZuJava(doc: KlassenDoc, quelle?: string): { name: string; code: string }[] {
    return doc.klassen.map((k) => ({ name: k.name + ".java", code: klasseZuJava(doc, k, quelle) }));
}

// ------------------------------------------------------------------ aus dem Code

const sichtVon = (vis: string): Sicht => vis === "private" ? "-" : "+";

/** Klassen aus Java-Texten (Dateien, die nicht passen, werden übersprungen) */
export function klassenAusJava(texte: string[]): ClassInfo[] {
    const result: ClassInfo[] = [];
    for (const text of texte) {
        if (!/\bclass\b/.test(text)) continue;
        try {
            result.push(...classInfosFromState(JavaBlockParser.parse(text).state));
        } catch {
            // Datei überspringen
        }
    }
    return result;
}

/** Klassendiagramm aus Klassen: Vererbung im Diagramm als Pfeil, Attribute mit einer Klasse des Diagramms als Linie */
export function docAusKlassen(klassen: ClassInfo[], measure: Measure, typen: KlassenDoc["typen"] = "abitur"): KlassenDoc {
    const doc = emptyDoc();
    doc.typen = typen;
    const ids = new Map<string, string>();
    for (const c of klassen) {
        if (ids.has(c.name)) continue;
        const id = newId();
        ids.set(c.name, id);
        doc.klassen.push({
            id, name: c.name, x: 0, y: 0,
            attribute: c.attributes.map((a) => ({ id: newId(), sicht: sichtVon(a.vis), name: a.name, typ: a.type })),
            operationen: [
                ...c.constructors.map((k) => ({ id: newId(), sicht: sichtVon(k.vis), name: c.name, konstruktor: true, parameter: k.params.map((p) => ({ name: p.name, typ: p.type })), rueckgabe: "" })),
                ...c.methods.map((m) => ({ id: newId(), sicht: sichtVon(m.vis), name: m.name, parameter: m.params.map((p) => ({ name: p.name, typ: p.type })), rueckgabe: m.ret === "void" ? "" : m.ret })),
            ],
        });
    }
    const paare = new Set<string>();
    for (const c of klassen) {
        const von = ids.get(c.name)!;
        if (c.superName && ids.has(c.superName)) doc.beziehungen.push({ id: newId(), art: "vererbung", von, nach: ids.get(c.superName)! });
        for (const a of c.attributes) {
            const nach = ids.get(adtTypeOf(a.type)?.elem ?? typeInfo(a.type).elem);   // auch Stack<Person> usw.
            if (!nach || nach === von) continue;
            const key = [von, nach].sort().join("|");
            if (paare.has(key)) continue;
            paare.add(key);
            doc.beziehungen.push({ id: newId(), art: "assoziation", von, nach });
        }
    }
    return ordneAn(doc, measure);
}
