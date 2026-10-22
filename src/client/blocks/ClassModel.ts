import { B, VAR_TYPES, WRAPPERS, type BlockState, type CollKind, type Param, type WorkspaceState } from "./BlockTypes";

/**
 * Datentypen als Text (wie in Java: "int", "String[]", "int[][]", "ArrayList<Integer>", "Hund",
 * "DynArray") und die Beschreibung von Klassen (Attribute, Konstruktoren, Operationen) –
 * ohne Blockly, damit Parser, Generator und Blockansicht dasselbe benutzen (Paket 6).
 */

export type TypeKind = "scalar" | "class" | CollKind;
export type TypeInfo = { kind: TypeKind; elem: string };

/** Hüllklasse für ArrayList: int -> Integer; Klassen bleiben, wie sie sind */
export function wrapperOf(elem: string): string {
    return WRAPPERS[elem] ?? elem;
}

/** Integer -> int usw. (Klassen bleiben) */
export function unwrap(type: string): string {
    return Object.keys(WRAPPERS).find((k) => WRAPPERS[k] === type && k !== type) ?? type;
}

export function isScalar(t: string): boolean {
    return (VAR_TYPES as readonly string[]).includes(t);
}

/** Art eines Datentyps: einfach, Klasse, Reihung, zweidimensionale Reihung, Liste, DynArray */
export function typeInfo(t: string): TypeInfo {
    const s = t.trim();
    if (s.endsWith("[][]")) return { kind: "array2d", elem: s.slice(0, -4) };
    if (s.endsWith("[]")) return { kind: "array", elem: s.slice(0, -2) };
    const list = /^ArrayList\s*<\s*([\p{L}_$][\p{L}\p{N}_$]*)\s*>$/u.exec(s);
    if (list) return { kind: "list", elem: unwrap(list[1]) };
    if (s === "DynArray") return { kind: "dyn", elem: "Object" };
    return { kind: isScalar(s) ? "scalar" : "class", elem: s };
}

/** Datentyp einer Reihung/Liste als Text */
export function collectionType(kind: CollKind, elem: string | null): string {
    switch (kind) {
        case "array": return `${elem ?? "int"}[]`;
        case "array2d": return `${elem ?? "int"}[][]`;
        case "list": return `ArrayList<${wrapperOf(elem ?? "int")}>`;
        case "dyn": return "DynArray";
    }
}

/** Reihung/Liste zu einem Datentyp (sonst undefined) */
export function collectionOfType(t: string | undefined): { kind: CollKind; elem: string | null } | undefined {
    if (!t) return undefined;
    const info = typeInfo(t);
    if (info.kind === "scalar" || info.kind === "class") return undefined;
    return { kind: info.kind, elem: info.kind === "dyn" ? null : info.elem };
}

/** Ist das ein Objekt-Typ (Klasse, nicht String)? */
export function isClassType(t: string | null | undefined): t is string {
    return !!t && typeInfo(t).kind === "class" && t !== "String" && t !== "Object";
}

// ------------------------------------------------------------------ Klassen

export type AttributeInfo = { name: string; type: string; vis: string };
export type ConstructorInfo = { params: Param[]; vis: string };
export type MethodInfo = { name: string; ret: string; params: Param[]; vis: string };
export type ClassInfo = { name: string; superName: string; attributes: AttributeInfo[]; constructors: ConstructorInfo[]; methods: MethodInfo[] };
export type ClassMap = Map<string, ClassInfo>;

/** Parameter einer Operation bzw. eines Konstruktors aus den Feldern PNAME0/PTYPE0 … */
export function methodParams(b: BlockState): Param[] {
    const f = b.fields ?? {};
    const count = Math.max(b.extraState?.params?.length ?? 0, Object.keys(f).filter((k) => /^PNAME\d+$/.test(k)).length);
    const result: Param[] = [];
    for (let i = 0; i < count; i++) {
        result.push({ name: f["PNAME" + i] ?? b.extraState?.params?.[i]?.name ?? "wert" + (i + 1), type: f["PTYPE" + i] ?? b.extraState?.params?.[i]?.type ?? "int" });
    }
    return result;
}

/** Klassen aus dem Speicherformat der Blöcke (z. B. andere Dateien des Projekts) */
export function classInfosFromState(state: WorkspaceState): ClassInfo[] {
    const result: ClassInfo[] = [];
    for (const top of state.blocks?.blocks ?? []) {
        if (top.type !== B.class) continue;
        const info: ClassInfo = { name: top.fields?.NAME ?? "", superName: top.fields?.SUPER ?? "", attributes: [], constructors: [], methods: [] };
        for (let m = top.inputs?.MEMBERS?.block; m; m = m.next?.block) addMember(info, m.type, m.fields ?? {}, methodParams(m));
        if (info.name) result.push(info);
    }
    return result;
}

/** Ein Mitglied (Attribut, Konstruktor, Operation) zur Beschreibung der Klasse hinzufügen */
export function addMember(info: ClassInfo, type: string, f: { [name: string]: string }, params: Param[]) {
    if (type === B.attribute) info.attributes.push({ name: f.NAME ?? "", type: f.TYPE ?? "int", vis: f.VIS ?? "" });
    else if (type === B.ctor) info.constructors.push({ params, vis: f.VIS ?? "" });
    else if (type === B.classMethod) info.methods.push({ name: f.NAME ?? "", ret: f.RETURN ?? "void", params, vis: f.VIS ?? "" });
}

/** Klasse und ihre Oberklassen (ohne Endlosschleife bei Fehlern) */
export function classChain(classes: ClassMap, name: string | undefined): ClassInfo[] {
    const chain: ClassInfo[] = [];
    for (let c = name ? classes.get(name) : undefined; c && !chain.includes(c); c = c.superName ? classes.get(c.superName) : undefined) chain.push(c);
    return chain;
}

/** Operationen einer Klasse samt geerbter (eigene zuerst) */
export function methodsOf(classes: ClassMap, name: string | undefined): MethodInfo[] {
    return classChain(classes, name).flatMap((c) => c.methods);
}

/** Attribute einer Klasse samt geerbter */
export function attributesOf(classes: ClassMap, name: string | undefined): AttributeInfo[] {
    return classChain(classes, name).flatMap((c) => c.attributes);
}

/** passende Operation: gleicher Name, möglichst gleiche Anzahl Parameter */
export function findMethod(classes: ClassMap, cls: string | undefined, method: string, argc?: number): MethodInfo | undefined {
    const all = methodsOf(classes, cls).filter((m) => m.name === method);
    return all.find((m) => m.params.length === argc) ?? all[0];
}

/** passender Konstruktor: möglichst gleiche Anzahl Parameter */
export function findConstructor(classes: ClassMap, cls: string | undefined, argc?: number): ConstructorInfo | undefined {
    const all = cls ? classes.get(cls)?.constructors ?? [] : [];
    return all.find((c) => c.params.length === argc) ?? all[0];
}

/** Ist sub dieselbe Klasse wie sup oder eine Unterklasse davon? */
export function isSubclass(classes: ClassMap, sub: string, sup: string): boolean {
    return classChain(classes, sub).some((c) => c.name === sup);
}
