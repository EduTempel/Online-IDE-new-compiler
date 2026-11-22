import { le } from "../../../tools/language/LanguageManager";

/**
 * GSG (22.11.2026): Die Abiturklassen DynArray, Stack, Queue und BinTree (Niedersachsen) haben einen Inhaltstyp wie in
 * den Ergänzenden Hinweisen („Stapel vom Inhaltstyp Zeichenkette“): Stack<String>. Ohne Inhaltstyp (Stack s = …)
 * meldet der Compiler einen Fehler – anders als Java, das dann still Object nimmt. Ebenso die Liste (Liste<String>).
 *
 * Eingebunden in TypeResolver.resolveTypeNode (je eine Zeile).
 */

const ABITURKLASSEN = new Set(["DynArray", "Stack", "Queue", "BinTree"]);

const BEISPIEL: Record<string, string> = {
    DynArray: "DynArray<String> namen = new DynArray<>();",
    Stack: "Stack<Integer> stapel = new Stack<>();",
    Queue: "Queue<String> schlange = new Queue<>();",
    BinTree: "BinTree<Integer> baum = new BinTree<>();",
    Liste: "Liste<String> namen = new Liste<>();",
};

/** Abiturklasse aus Niedersachsen (Paket nds) oder Liste, die nur mit Inhaltstyp benutzt werden darf? */
export function brauchtInhaltstyp(type: { identifier: string; pathAndIdentifierAsDotSeparatedString?: string; isLibraryType?: boolean }): boolean {
    if (type.identifier === "Liste") return !!type.isLibraryType;   // GSG-Liste (GsgListeClass), keine eigene Klasse Liste
    if (!ABITURKLASSEN.has(type.identifier)) return false;
    return type.pathAndIdentifierAsDotSeparatedString === "nds." + type.identifier;   // nicht java.util.Stack
}

export const ohneInhaltstyp = (klasse: string) => le({
    "de": `Gib den Inhaltstyp an: ${klasse}<…>. Zum Beispiel: ${BEISPIEL[klasse] ?? klasse + "<String>"}`,
    "en": `Specify the content type: ${klasse}<…>, e.g. ${BEISPIEL[klasse] ?? klasse + "<String>"}`,
    "fr": `Indiquez le type de contenu : ${klasse}<…>, p. ex. ${BEISPIEL[klasse] ?? klasse + "<String>"}`,
});

/**
 * Eigene Klasse mit dem Namen einer GSG-Bibliotheksklasse erlaubt? Bei Liste ja: Viele schreiben im Unterricht ihre eigene
 * (verkettete) Liste – die überdeckt dann im Programm die Klasse Liste<E> aus der Bibliothek.
 */
export const eigeneKlasseUeberdeckt = (bezeichner: string): boolean => bezeichner === "Liste";

const HUELLKLASSE: Record<string, string> = {
    int: "Integer", double: "Double", boolean: "Boolean", char: "Character",
    long: "Long", float: "Float", short: "Short", byte: "Byte",
};

/** Grundtyp als Inhaltstyp (Stack<int>): die passende Hüllklasse nennen */
export const grundtypAlsInhaltstyp = (klasse: string, grundtyp: string) => le({
    "de": `Ein Grundtyp wie ${grundtyp} geht hier nicht. Schreibe stattdessen die Hüllklasse: ${klasse}<${HUELLKLASSE[grundtyp] ?? grundtyp}>. `
        + `Beim Hineinlegen und Herausholen wandelt Java ${grundtyp}-Werte automatisch um.`,
    "en": `A primitive type like ${grundtyp} can't be used here. Use the wrapper class instead: ${klasse}<${HUELLKLASSE[grundtyp] ?? grundtyp}>.`,
    "fr": `Un type primitif comme ${grundtyp} n'est pas possible ici. Utilisez la classe enveloppe : ${klasse}<${HUELLKLASSE[grundtyp] ?? grundtyp}>.`,
});
