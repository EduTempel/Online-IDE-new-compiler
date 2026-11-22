import { LibraryDeclarations } from "../../../module/libraries/DeclareType.ts";
import { NonPrimitiveType } from "../../../types/NonPrimitiveType.ts";
import { ObjectClassOrNull } from "../javalang/ObjectClassStringClass.ts";
import { ArrayListClass } from "./ArrayListClass.ts";

/**
 * GSG (22.11.2026): einfache Liste mit Inhaltstyp – die Listenblöcke (Blocks, Mix) erzeugen sie statt ArrayList:
 *
 *     Liste<String> namen = new Liste<>();
 *     namen.add("Ada");
 *     println(namen.get(0) + " " + namen.size());
 *
 * Sie erbt alles von ArrayList (add, get, set, remove, size, indexOf, contains, clear, for-each …). Ohne Inhaltstyp
 * meldet der Compiler einen Fehler (GsgInhaltstyp). Eingebunden in SystemModule (eine Zeile).
 */
export class GsgListeClass extends ArrayListClass {
    static __javaDeclarations: LibraryDeclarations = [
        { type: "declaration", signature: "class Liste<E> extends ArrayList<E>", comment: "Liste mit Inhaltstyp, z. B. Liste<String> namen = new Liste<>(); – wie ArrayList: add, get, set, remove, size, indexOf, contains, clear. Die erste Position ist 0." },
        { type: "method", signature: "Liste()", native: ArrayListClass.prototype._constructor, comment: "Legt eine leere Liste an." },
    ];

    static type: NonPrimitiveType;

    constructor(elements?: ObjectClassOrNull[]) {
        super(elements);
    }
}
