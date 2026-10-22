/**
 * Blockmodus (eigene Erweiterung des GSG, nicht im Original der Online-IDE):
 * Namen der Block-Typen und ihrer Felder. Ohne Abhängigkeit von Blockly, damit der Parser
 * (Java -> Blöcke) auch ohne die Blockly-Bibliothek geladen werden kann.
 *
 * Grundsatz: Der Java-Code ist die Wahrheit. Blöcke werden aus dem Code erzeugt und schreiben
 * bei jeder Änderung den Code neu. Was es nicht als Block gibt, wird ein Java-Block mit dem
 * unveränderten Quelltext – beim Umschalten geht nichts verloren.
 */

export const B = {
    start: "j_start",               // Hauptprogramm (Hut-Block), Eingang BODY

    // Operationen (Methoden im Hauptprogramm)
    method: "j_method",             // Hut-Block; Felder NAME, RETURN (void/int/…), PNAME0/PTYPE0 …; Anweisungen BODY; extraState { params }
    return: "j_return",             // Eingang VALUE  (return wert;)
    returnVoid: "j_return_void",    // (return;)
    call: "j_call",                 // Feld NAME; Eingänge ARG0 …; extraState { args }  (name(…);)
    callExpr: "j_call_expr",        // wie call, als Wert  (name(…))

    // Anweisungen
    varDeclare: "j_var_declare",    // Felder NAME, TYPE; Eingang VALUE (optional)
    varSet: "j_var_set",            // Feld NAME; Eingang VALUE
    varChange: "j_var_change",      // Feld NAME; Eingang VALUE  (x += …)
    varSub: "j_var_sub",            // Feld NAME; Eingang VALUE  (x -= …)
    varInc: "j_var_inc",            // Feld NAME  (x++)
    varDec: "j_var_dec",            // Feld NAME  (x--)
    print: "j_print",               // Feld MODE (println/print); Eingänge VALUE, VALUE1 …; extraState { items }
    if: "j_if",                     // Eingänge COND, DO, COND1, DO1 …, ELSE; extraState { elseIfs, hasElse }
    while: "j_while",               // Eingang COND; Anweisungen DO
    forever: "j_forever",           // Anweisungen DO  (while (true))
    repeat: "j_repeat",             // Eingang TIMES; Anweisungen DO  (for (int durchlauf = 1; durchlauf <= n; durchlauf++))
    for: "j_for",                   // Felder VAR, DIR (up/down), CMP (incl/excl); Eingänge FROM, TO, STEP; Anweisungen DO
    wait: "j_wait",                 // Eingang MS  (Thread.sleep)
    comment: "j_comment",           // Feld TEXT
    javaStatement: "j_java_stmt",   // Feld CODE (eine Zeile, bearbeitbar)
    javaRaw: "j_java_raw",          // extraState { code } (mehrzeilig, nur in der Java-Ansicht bearbeitbar)

    // Reihungen und Listen (Paket 5): Feld NAME = Name der Reihung bzw. Liste, Positionen ab 0
    arrayNew: "j_array_new",        // Felder NAME, TYPE; Eingang LEN  (int[] a = new int[n];)
    arrayValues: "j_array_values",  // Felder NAME, TYPE; Eingänge V0, V1 …; extraState { items }  (int[] a = {1, 2};)
    arrayGet: "j_array_get",        // Feld NAME; Eingang I  (a[i])
    arraySet: "j_array_set",        // Feld NAME; Eingänge I, V  (a[i] = v;)
    arrayLength: "j_array_length",  // Feld NAME  (a.length)
    array2dNew: "j_array2d_new",    // Felder NAME, TYPE; Eingänge R, C  (int[][] m = new int[r][c];)
    array2dGet: "j_array2d_get",    // Feld NAME; Eingänge R, C  (m[r][c])
    array2dSet: "j_array2d_set",    // Feld NAME; Eingänge R, C, V  (m[r][c] = v;)
    array2dSize: "j_array2d_size",  // Felder NAME, DIM (rows/cols)  (m.length / m[0].length)
    forEach: "j_foreach",           // Felder VAR, LIST; Anweisungen DO  (for (int x : a))
    listNew: "j_list_new",          // Felder NAME, TYPE  (ArrayList<Integer> l = new ArrayList<Integer>();)
    listAdd: "j_list_add",          // Feld NAME; Eingang V  (l.add(v);)
    listInsert: "j_list_insert",    // Feld NAME; Eingänge I, V  (l.add(i, v);)
    listRemove: "j_list_remove",    // Feld NAME; Eingang I  (l.remove(i);)
    listGet: "j_list_get",          // Feld NAME; Eingang I  (l.get(i))
    listSet: "j_list_set",          // Feld NAME; Eingänge I, V  (l.set(i, v);)
    listSize: "j_list_size",        // Feld NAME  (l.size())
    listContains: "j_list_contains",// Feld NAME; Eingang V  (l.contains(v))
    collIsEmpty: "j_coll_isempty",  // Feld NAME  (l.isEmpty() einer Liste)

    // ADT (abstrakte Datentypen, Abiturklassen Niedersachsen): dynamische Reihung
    dynNew: "j_dyn_new",            // Feld NAME  (DynArray d = new DynArray();)
    dynAppend: "j_dyn_append",      // Feld NAME; Eingang V  (d.append(v);)
    dynInsert: "j_dyn_insert",      // Feld NAME; Eingänge I, V  (d.insertAt(i, v);)
    dynSet: "j_dyn_set",            // Feld NAME; Eingänge I, V  (d.setItem(i, v);)
    dynDelete: "j_dyn_delete",      // Feld NAME; Eingang I  (d.delete(i);)
    dynGet: "j_dyn_get",            // Felder NAME, TYPE (Object = ohne Umwandlung); Eingang I  ((int) d.getItem(i))
    dynLength: "j_dyn_length",      // Feld NAME  (d.getLength())
    dynIsEmpty: "j_dyn_isempty",    // Feld NAME  (d.isEmpty())

    // Werte
    number: "j_number",             // Feld NUM (Text, z. B. "3.5")
    text: "j_text",                 // Feld TEXT (ohne Anführungszeichen, unmaskiert)
    char: "j_char",                 // Feld CHAR (ein Zeichen, unmaskiert)
    bool: "j_bool",                 // Feld VALUE (true/false)
    varGet: "j_var_get",            // Feld NAME
    arith: "j_arith",               // Feld OP (+ - * / %); Eingänge A, B
    compare: "j_compare",           // Feld OP (== != < <= > >=); Eingänge A, B
    logic: "j_logic",               // Feld OP (&& ||); Eingänge A, B
    not: "j_not",                   // Eingang VALUE
    input: "j_input",               // Feld METHOD (readInt …); Eingang PROMPT
    random: "j_random",             // Eingänge FROM, TO  (Random.randint)
    randomDouble: "j_random_double",// (Math.random())
    math: "j_math",                 // Feld FUNC (sqrt, abs, round); Eingang VALUE
    minMax: "j_minmax",             // Feld FUNC (min/max); Eingänge A, B
    cast: "j_cast",                 // Feld TYPE (int/double/char); Eingang VALUE  ((int) x)
    javaExpression: "j_java_expr",  // Feld CODE (beliebiger Java-Ausdruck)

    // Text (Abitur Niedersachsen: Umgang mit Zeichenketten)
    concat: "j_concat",             // Eingänge A, B  (a + b mit Text)
    strLength: "j_str_length",      // Eingang TEXT  (s.length())
    strCharAt: "j_str_charat",      // Eingänge TEXT, INDEX  (s.charAt(i))
    strSubstring: "j_str_substring",// Eingänge TEXT, FROM, TO  (s.substring(a, b))
    strEquals: "j_str_equals",      // Eingänge A, B  (a.equals(b))
    strContains: "j_str_contains",  // Eingänge A, B  (a.contains(b))
    strCompare: "j_str_compare",    // Eingänge A, B  (a.compareTo(b))
    strCase: "j_str_case",          // Feld CASE (upper/lower); Eingang TEXT
} as const;

export const VAR_TYPES = ["int", "double", "String", "boolean", "char"] as const;
export const INPUT_METHODS = ["readInt", "readDouble", "readString", "readBoolean", "readChar"] as const;
export const MATH_FUNCTIONS = ["sqrt", "abs", "round"] as const;
/** Ergebnistypen von Operationen: void = kein Ergebnis */
export const RETURN_TYPES = ["void", ...VAR_TYPES] as const;

export type Param = { name: string; type: string };

// ------------------------------------------------------------------ Reihungen und Listen

/** Art einer Reihung bzw. Liste */
export type CollKind = "array" | "array2d" | "list" | "dyn";
/** Name -> Art und Elementtyp (int, String … ; bei DynArray null) */
export type Collections = Map<string, { kind: CollKind; elem: string | null }>;

/** Blöcke, die eine Reihung bzw. Liste anlegen */
export const COLLECTION_DECLARATIONS: Record<string, CollKind> = {
    j_array_new: "array", j_array_values: "array", j_array2d_new: "array2d", j_list_new: "list", j_dyn_new: "dyn",
};

/** Methodenaufrufe an ArrayList und DynArray: Block, Java-Methode, Eingänge in Java-Reihenfolge */
export const COLLECTION_CALLS: { type: string; kind: "list" | "dyn"; method: string; args: string[]; stmt: boolean }[] = [
    { type: "j_list_add", kind: "list", method: "add", args: ["V"], stmt: true },
    { type: "j_list_insert", kind: "list", method: "add", args: ["I", "V"], stmt: true },
    { type: "j_list_remove", kind: "list", method: "remove", args: ["I"], stmt: true },
    { type: "j_list_set", kind: "list", method: "set", args: ["I", "V"], stmt: true },
    { type: "j_list_get", kind: "list", method: "get", args: ["I"], stmt: false },
    { type: "j_list_size", kind: "list", method: "size", args: [], stmt: false },
    { type: "j_list_contains", kind: "list", method: "contains", args: ["V"], stmt: false },
    { type: "j_coll_isempty", kind: "list", method: "isEmpty", args: [], stmt: false },
    { type: "j_dyn_isempty", kind: "dyn", method: "isEmpty", args: [], stmt: false },
    { type: "j_dyn_append", kind: "dyn", method: "append", args: ["V"], stmt: true },
    { type: "j_dyn_insert", kind: "dyn", method: "insertAt", args: ["I", "V"], stmt: true },
    { type: "j_dyn_set", kind: "dyn", method: "setItem", args: ["I", "V"], stmt: true },
    { type: "j_dyn_delete", kind: "dyn", method: "delete", args: ["I"], stmt: true },
    { type: "j_dyn_get", kind: "dyn", method: "getItem", args: ["I"], stmt: false },
    { type: "j_dyn_length", kind: "dyn", method: "getLength", args: [], stmt: false },
];

/** Blöcke, die eine Reihung bzw. Liste über ihr Feld NAME benutzen */
export const COLLECTION_USES: string[] = ["j_array_get", "j_array_set", "j_array_length", "j_array2d_get", "j_array2d_set",
    "j_array2d_size", ...new Set(COLLECTION_CALLS.map((c) => c.type))];

/** Elementtyp einer ArrayList: Hüllklasse in Java */
export const WRAPPERS: Record<string, string> = { int: "Integer", double: "Double", String: "String", boolean: "Boolean", char: "Character" };

/** Datentyp der Variablen in "für jedes Element" */
export function elementJavaType(c: { kind: CollKind; elem: string | null } | undefined): string {
    if (!c) return "var";
    if (c.kind === "dyn") return "Object";
    if (c.kind === "list") return WRAPPERS[c.elem ?? ""] ?? "Object";
    if (c.kind === "array2d") return (c.elem ?? "int") + "[]";
    return c.elem ?? "int";
}

/** Blockly-Speicherformat (vereinfacht) */
export type BlockState = {
    type: string;
    id?: string;
    x?: number;
    y?: number;
    fields?: { [name: string]: string };
    inputs?: { [name: string]: { block: BlockState } };
    next?: { block: BlockState };
    extraState?: { code?: string; elseIfs?: number; hasElse?: boolean; items?: number; params?: Param[]; args?: number };
    deletable?: boolean;
};

export type WorkspaceState = {
    blocks: { languageVersion: 0; blocks: BlockState[] };
};
