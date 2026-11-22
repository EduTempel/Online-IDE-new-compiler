import { unwrap, wrapperOf } from "../blocks/ClassModel";

/**
 * Klassendiagramm-Dateien (*.klassendiagramm, Paket 20): Modell, Speicherformat (JSON im Dateitext) und
 * Bearbeitungsschritte – ohne Oberfläche, damit Editor, Umwandlung nach Texva und Tests dasselbe benutzen.
 *
 * Schreibweise nach den Ergänzenden Hinweisen (Abschnitt 6): Sichtbarkeit + und -, Konstruktoren mit „c“,
 * „...“ für weggelassene Einträge, Assoziation als einfache Linie, Vererbung als Pfeil.
 * Datentypen stehen im Modell als Java-Text („int“, „Person[]“, „Liste<String>“, „Person“); angezeigt werden
 * sie in Abitur-Sprache („Ganzzahl“, „stat. Reihung vom Inhaltstyp Person“ …) oder als Java.
 */

export type Sicht = "+" | "-";
export type Parameter = { name: string; typ: string };
export type Attribut = { id: string; sicht: Sicht; name: string; typ: string };
/** Operation; konstruktor: heißt wie die Klasse und hat keinen Rückgabetyp. rueckgabe "" = keine */
export type Operation = { id: string; sicht: Sicht; name: string; konstruktor?: boolean; parameter: Parameter[]; rueckgabe: string };
export type Klasse = {
    id: string; name: string; x: number; y: number;
    attribute: Attribut[]; operationen: Operation[];
    /** „...“: weitere Attribute bzw. Operationen nicht aufgeführt */
    mehrAttribute?: boolean; mehrOperationen?: boolean;
};
/** Vererbung: von = Unterklasse, nach = Oberklasse */
export type Beziehung = { id: string; art: "assoziation" | "vererbung"; von: string; nach: string };
export type Typnamen = "abitur" | "java";
export type KlassenDoc = { version: 1; typen: Typnamen; klassen: Klasse[]; beziehungen: Beziehung[] };

export type Eintrag = Attribut | Operation;

export function emptyDoc(): KlassenDoc {
    return { version: 1, typen: "abitur", klassen: [], beziehungen: [] };
}

let counter = 0;
export function newId(): string {
    counter = (counter + 1) % 1296;
    return Date.now().toString(36).slice(-5) + counter.toString(36).padStart(2, "0") + Math.random().toString(36).slice(2, 5);
}

// ------------------------------------------------------------------ Speicherformat

const str = (v: unknown, fallback = ""): string => typeof v === "string" ? v : fallback;
const num = (v: unknown): number => typeof v === "number" && isFinite(v) ? Math.round(v) : 0;
const sicht = (v: unknown): Sicht => v === "-" ? "-" : "+";
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
type Obj = Record<string, unknown>;

/** Dateitext lesen; leer oder kaputt → leeres Diagramm (kaputt: fehler gesetzt) */
export function parseDoc(text: string): KlassenDoc & { fehler?: string } {
    if (!text.trim()) return emptyDoc();
    let raw: Obj;
    try {
        raw = JSON.parse(text);
        if (!raw || typeof raw !== "object") throw new Error("kein Objekt");
    } catch {
        return { ...emptyDoc(), fehler: "Die Datei enthält kein lesbares Klassendiagramm." };
    }
    const ids = new Set<string>();
    const id = (v: unknown): string => {
        let s = str(v);
        if (!s || ids.has(s)) s = newId();
        ids.add(s);
        return s;
    };
    const param = (p: unknown): Parameter => ({ name: str((p as Obj)?.name), typ: str((p as Obj)?.typ, "int") });
    const klassen: Klasse[] = arr(raw.klassen).map((k0) => {
        const k = (k0 ?? {}) as Obj;
        return {
            id: id(k.id), name: str(k.name, "Klasse"), x: num(k.x), y: num(k.y),
            attribute: arr(k.attribute).map((a0) => {
                const a = (a0 ?? {}) as Obj;
                return { id: id(a.id), sicht: sicht(a.sicht), name: str(a.name), typ: str(a.typ, "int") };
            }),
            operationen: arr(k.operationen).map((o0) => {
                const o = (o0 ?? {}) as Obj;
                const op: Operation = { id: id(o.id), sicht: sicht(o.sicht), name: str(o.name), parameter: arr(o.parameter).map(param), rueckgabe: str(o.rueckgabe) };
                if (o.konstruktor === true) op.konstruktor = true;
                return op;
            }),
            ...(k.mehrAttribute === true ? { mehrAttribute: true } : {}),
            ...(k.mehrOperationen === true ? { mehrOperationen: true } : {}),
        };
    });
    const vorhanden = new Set(klassen.map((k) => k.id));
    const beziehungen: Beziehung[] = arr(raw.beziehungen).map((b0) => {
        const b = (b0 ?? {}) as Obj;
        return { id: id(b.id), art: b.art === "vererbung" ? "vererbung" as const : "assoziation" as const, von: str(b.von), nach: str(b.nach) };
    }).filter((b) => vorhanden.has(b.von) && vorhanden.has(b.nach) && b.von !== b.nach);
    return { version: 1, typen: raw.typen === "java" ? "java" : "abitur", klassen, beziehungen };
}

export function serializeDoc(doc: KlassenDoc): string {
    const { version, typen, klassen, beziehungen } = doc;
    return JSON.stringify({ version, typen, klassen, beziehungen }, null, 1) + "\n";
}

// ------------------------------------------------------------------ Datentypen

export const GRUNDTYPEN = ["int", "double", "String", "boolean", "char"] as const;

const ABITUR: Record<string, string> = {
    int: "Ganzzahl", long: "Ganzzahl", short: "Ganzzahl", byte: "Ganzzahl", Integer: "Ganzzahl", Long: "Ganzzahl",
    double: "Fließkommazahl", float: "Fließkommazahl", Double: "Fließkommazahl", Float: "Fließkommazahl",
    String: "Zeichenkette", boolean: "Wahrheitswert", Boolean: "Wahrheitswert", char: "Zeichen", Character: "Zeichen",
};

/**
 * Formen wie im Struktogramm-Editor: stat. Reihung → `X[]`, zweidimensionale stat. Reihung → `X[][]`,
 * Liste → `Liste<X>` (ältere Diagramme: `ArrayList<X>`) und die Abiturklassen dyn. Reihung, Stapel, Schlange, Binärbaum mit Inhaltstyp
 * (`DynArray<X>`, `Stack<X>`, `Queue<X>`, `BinTree<X>`; seit 22.11.2026 auch in Java mit Inhaltstyp).
 */
export type Form = "einfach" | "stat" | "stat2" | "dyn" | "liste" | "stapel" | "schlange" | "baum";

/** Abiturklassen: Form, Klasse in Java, Wort wie in den Ergänzenden Hinweisen (Abschnitte 4–6) */
const ABITURKLASSEN: { form: Form; klasse: string; wort: string }[] = [
    { form: "dyn", klasse: "DynArray", wort: "dyn. Reihung" },
    { form: "stapel", klasse: "Stack", wort: "Stapel" },
    { form: "schlange", klasse: "Queue", wort: "Schlange" },
    { form: "baum", klasse: "BinTree", wort: "Binärbaum" },
];
const abiturklasse = (form: Form) => ABITURKLASSEN.find((a) => a.form === form);

/** dyn. Reihung, Stapel, Schlange oder Binärbaum? */
export function istAbiturklasse(form: Form): boolean {
    return !!abiturklasse(form);
}

/**
 * „Person[]“ → stat. Reihung von Person; „int[][]“ → zweidimensionale stat. Reihung von int;
 * „Stack<Person>“ → Stapel von Person („Stack“ allein: ohne Inhaltstyp); „Liste<Integer>“ (auch „ArrayList<Integer>“) → Liste von int
 */
export function zerlegeTyp(typ: string): { form: Form; inhalt: string } {
    const t = typ.trim();
    const zwei = /^(.+?)\s*\[\]\s*\[\]$/.exec(t);
    if (zwei && !zwei[1].endsWith("]")) return { form: "stat2", inhalt: zwei[1] };
    if (t.endsWith("[]")) return { form: "stat", inhalt: t.slice(0, -2).trim() };
    const adt = /^(DynArray|Stack|Queue|BinTree)\s*(?:<\s*(.+)\s*>)?$/.exec(t);
    if (adt) return { form: ABITURKLASSEN.find((a) => a.klasse === adt[1])!.form, inhalt: adt[2] ? unwrap(adt[2].trim()) : "" };
    const liste = /^(?:Liste|ArrayList)\s*<\s*(.+)\s*>$/.exec(t);
    if (liste) return { form: "liste", inhalt: unwrap(liste[1].trim()) };
    return { form: "einfach", inhalt: t };
}

export function baueTyp(form: Form, inhalt: string): string {
    const adt = abiturklasse(form);
    if (adt) return inhalt ? `${adt.klasse}<${inhalt}>` : adt.klasse;
    switch (form) {
        case "stat": return `${inhalt}[]`;
        case "stat2": return `${inhalt}[][]`;
        case "liste": return `Liste<${wrapperOf(inhalt)}>`;
        default: return inhalt;
    }
}

/** Datentyp in Java („Stack<int>“ → „Stack<Integer>“; ohne Inhaltstyp: Object) */
export function javaTyp(typ: string): string {
    const { form, inhalt } = zerlegeTyp(typ);
    if (form === "stat") return javaTyp(inhalt) + "[]";
    if (form === "stat2") return javaTyp(inhalt) + "[][]";
    const adt = abiturklasse(form);
    if (adt) return `${adt.klasse}<${wrapperOf(inhalt ? javaTyp(inhalt) : "Object")}>`;
    if (form === "liste") return `Liste<${wrapperOf(javaTyp(inhalt))}>`;   // auch ältere Diagramme mit ArrayList
    return typ.trim();
}

/** Datentyp zum Anzeigen: Abitur-Sprache oder Java */
export function typText(typ: string, typen: Typnamen): string {
    if (typen === "java") return javaTyp(typ);
    const { form, inhalt } = zerlegeTyp(typ);
    if (form === "stat") return "stat. Reihung vom Inhaltstyp " + typText(inhalt, typen);
    if (form === "stat2") return "zweidimensionale stat. Reihung vom Inhaltstyp " + typText(inhalt, typen);
    if (form === "liste") return "Liste vom Inhaltstyp " + typText(inhalt, typen);
    const adt = abiturklasse(form);
    if (adt) return inhalt ? `${adt.wort} vom Inhaltstyp ${typText(inhalt, typen)}` : adt.wort;
    return ABITUR[inhalt] ?? (inhalt === "Object" ? "Objekt" : inhalt);
}

/** braucht das Diagramm die Abiturklassen (DynArray, Stack, Queue, BinTree)? */
export function brauchtAbiturklassen(doc: { klassen: Klasse[] }): boolean {
    const typen = doc.klassen.flatMap((k) => [...k.attribute.map((a) => a.typ), ...k.operationen.flatMap((o) => [o.rueckgabe, ...o.parameter.map((p) => p.typ)])]);
    return typen.some((t) => /\b(?:DynArray|Stack|Queue|BinTree)\b/.test(t));
}

/** Parameterliste; aufeinanderfolgende Parameter mit gleichem Typ zusammengefasst („a, b: Ganzzahl“) */
export function parameterText(ps: Parameter[], typen: Typnamen): string {
    const gruppen: { namen: string[]; typ: string }[] = [];
    for (const p of ps) {
        const last = gruppen[gruppen.length - 1];
        if (last && last.typ === p.typ) last.namen.push(p.name);
        else gruppen.push({ namen: [p.name], typ: p.typ });
    }
    return gruppen.map((g) => `${g.namen.join(", ")}: ${typText(g.typ, typen)}`).join(", ");
}

/** Zeile im Diagramm: „- name: Zeichenkette“, „c Person(name: Zeichenkette)“, „+ getName(): Zeichenkette“ */
export function eintragText(e: Eintrag, klasse: Klasse, typen: Typnamen): string {
    if (!("parameter" in e)) return `${e.sicht} ${e.name}: ${typText(e.typ, typen)}`;
    const params = `(${parameterText(e.parameter, typen)})`;
    if (e.konstruktor) return `c ${klasse.name}${params}`;
    return `${e.sicht} ${e.name}${params}${e.rueckgabe ? ": " + typText(e.rueckgabe, typen) : ""}`;
}

export function istAttribut(e: Eintrag): e is Attribut {
    return !("parameter" in e);
}

// ------------------------------------------------------------------ Namen prüfen

const SCHLUESSELWOERTER = new Set(("abstract assert boolean break byte case catch char class const continue default do double else enum " +
    "extends final finally float for goto if implements import instanceof int interface long native new package private " +
    "protected public return short static strictfp super switch synchronized this throw throws transient try void volatile " +
    "while true false null var record").split(" "));
const BEZEICHNER = /^[\p{L}_$][\p{L}\p{N}_$]*$/u;

/** Problem mit einem Namen (sonst undefined) */
export function namenProblem(name: string, was: string): string | undefined {
    if (!name.trim()) return `${was} braucht einen Namen.`;
    if (!BEZEICHNER.test(name)) return `„${name}“ ist kein gültiger Name (Buchstaben, Ziffern, _; nicht mit einer Ziffer beginnen, keine Leerzeichen).`;
    if (SCHLUESSELWOERTER.has(name)) return `„${name}“ ist ein reserviertes Wort und kein Name.`;
    return undefined;
}

/** alle Probleme, die eine Umwandlung nach Texva verhindern */
export function probleme(doc: KlassenDoc): string[] {
    const result: string[] = [];
    const namen = new Map<string, number>();
    for (const k of doc.klassen) namen.set(k.name, (namen.get(k.name) ?? 0) + 1);
    for (const k of doc.klassen) {
        const p = namenProblem(k.name, "Eine Klasse");
        if (p) result.push(p);
        else if ((namen.get(k.name) ?? 0) > 1) result.push(`Die Klasse „${k.name}“ gibt es mehrfach.`);
        const attr = new Set<string>();
        for (const a of k.attribute) {
            const pa = namenProblem(a.name, `Ein Attribut in „${k.name}“`);
            if (pa) result.push(pa);
            else if (attr.has(a.name)) result.push(`Das Attribut „${a.name}“ gibt es in „${k.name}“ mehrfach.`);
            attr.add(a.name);
        }
        for (const o of k.operationen) {
            if (!o.konstruktor) {
                const po = namenProblem(o.name, `Eine Operation in „${k.name}“`);
                if (po) result.push(po);
            }
            const ps = new Set<string>();
            for (const p of o.parameter) {
                const pp = namenProblem(p.name, `Ein Parameter von „${o.konstruktor ? k.name : o.name}“`);
                if (pp) result.push(pp);
                else if (ps.has(p.name)) result.push(`Der Parameter „${p.name}“ steht bei „${o.konstruktor ? k.name : o.name}“ mehrfach.`);
                ps.add(p.name);
            }
        }
    }
    return [...new Set(result)];
}

// ------------------------------------------------------------------ Bearbeiten (jeweils ein neues Diagramm)

const kopie = (doc: KlassenDoc): KlassenDoc => JSON.parse(JSON.stringify(doc));

export function klasseVon(doc: KlassenDoc, id: string | undefined): Klasse | undefined {
    return id ? doc.klassen.find((k) => k.id === id) : undefined;
}

/** Eintrag (Attribut oder Operation) samt Klasse */
export function findeEintrag(doc: KlassenDoc, id: string | undefined): { klasse: Klasse; eintrag: Eintrag } | undefined {
    if (!id) return undefined;
    for (const klasse of doc.klassen) {
        const eintrag = (klasse.attribute as Eintrag[]).find((a) => a.id === id) ?? klasse.operationen.find((o) => o.id === id);
        if (eintrag) return { klasse, eintrag };
    }
    return undefined;
}

export function freierKlassenname(doc: KlassenDoc, basis = "Klasse"): string {
    const namen = new Set(doc.klassen.map((k) => k.name));
    if (!namen.has(basis)) return basis;
    for (let i = 2; ; i++) if (!namen.has(basis + i)) return basis + i;
}

export function neueKlasse(doc: KlassenDoc, x: number, y: number): { doc: KlassenDoc; id: string } {
    const d = kopie(doc);
    const id = newId();
    d.klassen.push({ id, name: freierKlassenname(d), x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)), attribute: [], operationen: [] });
    return { doc: d, id };
}

export function aendereKlasse(doc: KlassenDoc, id: string, aenderung: Partial<Omit<Klasse, "id" | "attribute" | "operationen">>): KlassenDoc {
    const d = kopie(doc);
    const k = klasseVon(d, id);
    if (k) Object.assign(k, aenderung);
    return d;
}

/**
 * Klassennamen in Datentypen ersetzen (nach dem Umbenennen einer Klasse von alt nach neu). Nicht, wenn eine
 * andere Klasse noch „alt“ heißt oder schon „neu“ heißt oder „neu“ kein gültiger Name ist.
 */
export function benenneTypenUm(doc: KlassenDoc, alt: string, neu: string): KlassenDoc {
    if (!alt || alt === neu || doc.klassen.some((k) => k.name === alt) || doc.klassen.filter((k) => k.name === neu).length !== 1
        || namenProblem(neu, "")) return doc;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}_$])${alt.replace(/[$]/g, "\\$")}(?![\\p{L}\\p{N}_$])`, "gu");
    const ersetze = (t: string) => t.replace(re, `$1${neu}`);
    const d = kopie(doc);
    for (const k of d.klassen) {
        for (const a of k.attribute) a.typ = ersetze(a.typ);
        for (const o of k.operationen) {
            o.rueckgabe = ersetze(o.rueckgabe);
            for (const p of o.parameter) p.typ = ersetze(p.typ);
        }
    }
    return d;
}

export function entferneKlasse(doc: KlassenDoc, id: string): KlassenDoc {
    const d = kopie(doc);
    d.klassen = d.klassen.filter((k) => k.id !== id);
    d.beziehungen = d.beziehungen.filter((b) => b.von !== id && b.nach !== id);
    return d;
}

export type NeuerEintrag = "attribut" | "konstruktor" | "operation";

/** Eintrag anlegen: Attribute nach dem ausgewählten Attribut bzw. am Ende, Konstruktoren vor den Operationen */
export function neuerEintrag(doc: KlassenDoc, klasseId: string, art: NeuerEintrag, nach?: string): { doc: KlassenDoc; id: string } {
    const d = kopie(doc);
    const k = klasseVon(d, klasseId)!;
    const id = newId();
    if (art === "attribut") {
        const namen = new Set(k.attribute.map((a) => a.name));
        let name = "attribut";
        for (let i = 2; namen.has(name); i++) name = "attribut" + i;
        const a: Attribut = { id, sicht: "-", name, typ: "int" };
        const i = k.attribute.findIndex((x) => x.id === nach);
        k.attribute.splice(i >= 0 ? i + 1 : k.attribute.length, 0, a);
    } else {
        const o: Operation = art === "konstruktor"
            ? { id, sicht: "+", name: k.name, konstruktor: true, parameter: [], rueckgabe: "" }
            : { id, sicht: "+", name: "operation", parameter: [], rueckgabe: "" };
        const i = k.operationen.findIndex((x) => x.id === nach);
        const letzterKonstruktor = k.operationen.reduce((m, x, j) => x.konstruktor ? j : m, -1);
        const pos = i >= 0 ? i + 1 : art === "konstruktor" ? letzterKonstruktor + 1 : k.operationen.length;
        k.operationen.splice(pos, 0, o);
    }
    return { doc: d, id };
}

export function aendereEintrag(doc: KlassenDoc, id: string, aenderung: Partial<Attribut> | Partial<Operation>): KlassenDoc {
    const d = kopie(doc);
    const f = findeEintrag(d, id);
    if (f) Object.assign(f.eintrag, aenderung, { id });
    return d;
}

export function entferneEintrag(doc: KlassenDoc, id: string): KlassenDoc {
    const d = kopie(doc);
    for (const k of d.klassen) {
        k.attribute = k.attribute.filter((a) => a.id !== id);
        k.operationen = k.operationen.filter((o) => o.id !== id);
    }
    return d;
}

/** Eintrag innerhalb seines Felds (Attribute bzw. Operationen) verschieben */
export function verschiebeEintrag(doc: KlassenDoc, id: string, delta: -1 | 1): KlassenDoc {
    const d = kopie(doc);
    for (const k of d.klassen) {
        for (const liste of [k.attribute, k.operationen] as Eintrag[][]) {
            const i = liste.findIndex((e) => e.id === id);
            const j = i + delta;
            if (i < 0 || j < 0 || j >= liste.length) continue;
            [liste[i], liste[j]] = [liste[j], liste[i]];
        }
    }
    return d;
}

/** Oberklasse (über die Vererbung im Diagramm) */
export function oberklasse(doc: KlassenDoc, klasseId: string): Klasse | undefined {
    const b = doc.beziehungen.find((x) => x.art === "vererbung" && x.von === klasseId);
    return b ? klasseVon(doc, b.nach) : undefined;
}

/** Beziehung anlegen – oder der Grund, warum es nicht geht */
export function neueBeziehung(doc: KlassenDoc, art: Beziehung["art"], von: string, nach: string): { doc: KlassenDoc; id: string } | { fehler: string } {
    if (von === nach) return { fehler: "Eine Klasse kann nicht mit sich selbst verbunden werden." };
    const a = klasseVon(doc, von), b = klasseVon(doc, nach);
    if (!a || !b) return { fehler: "Klasse nicht gefunden." };
    if (art === "assoziation") {
        if (doc.beziehungen.some((x) => x.art === "assoziation" && ((x.von === von && x.nach === nach) || (x.von === nach && x.nach === von)))) {
            return { fehler: `„${a.name}“ und „${b.name}“ sind schon verbunden.` };
        }
    } else {
        const ober = oberklasse(doc, von);
        if (ober) return { fehler: `„${a.name}“ erbt schon von „${ober.name}“ – in Java hat jede Klasse höchstens eine Oberklasse.` };
        for (let k: Klasse | undefined = b; k; k = oberklasse(doc, k.id)) {
            if (k.id === von) return { fehler: `„${b.name}“ erbt (über Umwege) schon von „${a.name}“ – eine Vererbung im Kreis geht nicht.` };
        }
    }
    const d = kopie(doc);
    const id = newId();
    d.beziehungen.push({ id, art, von, nach });
    return { doc: d, id };
}

export function entferneBeziehung(doc: KlassenDoc, id: string): KlassenDoc {
    const d = kopie(doc);
    d.beziehungen = d.beziehungen.filter((b) => b.id !== id);
    return d;
}

/** Richtung einer Beziehung tauschen (bei Vererbung: Ober- und Unterklasse) – oder der Grund, warum es nicht geht */
export function tauscheRichtung(doc: KlassenDoc, id: string): KlassenDoc | { fehler: string } {
    const b = doc.beziehungen.find((x) => x.id === id);
    if (!b) return doc;
    const ohne = entferneBeziehung(doc, id);
    const r = neueBeziehung(ohne, b.art, b.nach, b.von);
    if ("fehler" in r) return r;
    const d = r.doc;
    d.beziehungen[d.beziehungen.length - 1].id = id;
    return d;
}

/** Art einer Beziehung ändern – oder der Grund, warum es nicht geht */
export function aendereArt(doc: KlassenDoc, id: string, art: Beziehung["art"]): KlassenDoc | { fehler: string } {
    const b = doc.beziehungen.find((x) => x.id === id);
    if (!b || b.art === art) return doc;
    const r = neueBeziehung(entferneBeziehung(doc, id), art, b.von, b.nach);
    if ("fehler" in r) return r;
    r.doc.beziehungen[r.doc.beziehungen.length - 1].id = id;
    return r.doc;
}
