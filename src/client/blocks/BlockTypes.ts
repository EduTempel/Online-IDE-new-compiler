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
    start: "j_start",               // Programmstart (Hut-Block), Eingang BODY

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

/** Blockly-Speicherformat (vereinfacht) */
export type BlockState = {
    type: string;
    id?: string;
    x?: number;
    y?: number;
    fields?: { [name: string]: string };
    inputs?: { [name: string]: { block: BlockState } };
    next?: { block: BlockState };
    extraState?: { code?: string; elseIfs?: number; hasElse?: boolean; items?: number };
    deletable?: boolean;
};

export type WorkspaceState = {
    blocks: { languageVersion: 0; blocks: BlockState[] };
};
