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
    varDeclare: "j_var_declare",    // Felder TYPE, NAME; Eingang VALUE (optional)
    varSet: "j_var_set",            // Feld NAME; Eingang VALUE
    varChange: "j_var_change",      // Feld NAME; Eingang VALUE  (x += …)
    varIncDec: "j_var_incdec",      // Felder NAME, OP (++/--)
    print: "j_print",               // Feld MODE (println/print); Eingang VALUE (optional)
    if: "j_if",                     // Eingang COND; Anweisungen DO
    ifElse: "j_if_else",            // Eingang COND; Anweisungen DO, ELSE
    while: "j_while",               // Eingang COND; Anweisungen DO
    for: "j_for",                   // Feld VAR; Eingänge FROM, TO; Anweisungen DO
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
    math: "j_math",                 // Feld FUNC (sqrt, abs, round); Eingang VALUE
    javaExpression: "j_java_expr",  // Feld CODE (beliebiger Java-Ausdruck)
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
    extraState?: { code: string };
    deletable?: boolean;
};

export type WorkspaceState = {
    blocks: { languageVersion: 0; blocks: BlockState[] };
};
