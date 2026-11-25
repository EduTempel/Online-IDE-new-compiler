import { B } from "../blocks/BlockTypes";
import { BUEHNEN_KLASSE, buehnenQuelltext, figurQuelltext } from "./BloecklyProjekt";
import { blBlock, defaultHatName, messageMethodName, type BloecklyContext } from "./BloecklySpec";

/**
 * GSG (Paket 19j): Hilfe-Karte für Blöckly – zu jedem Block der Werkzeugleiste ein Satz, was er macht, und ein
 * winziges Beispiel-Skript. Die Skripte sind Java (wie im Handbuch) und werden als Blöcke gezeichnet.
 * Ohne Abhängigkeit von Blockly (testbar).
 */

export type BlHilfe = {
    /** was der Block macht; fehlt er: der Tooltip aus BL_BLOCKS */
    satz?: string;
    /** Mitglieder der Klasse (Skripte, eigene Blöcke), schon eingerückt */
    zeilen: string[];
    /** Beispiel auf der Bühne statt beim Waschbären */
    buehne?: boolean;
};

// ------------------------------------------------------------------ kurze Schreibweise (wie im Handbuch)

const einr = (zeilen: string[], tiefe: string) => zeilen.map((z) => (z ? tiefe + z : z));
function skript(annotation: string, name: string, rumpf: string[], param = ""): string[] {
    return ["    " + annotation, `    void ${name}(${param}) {`, ...einr(rumpf, "        "), "    }"];
}
const flagge = (...rumpf: string[]) => skript("@BeimStart", "beimStart", rumpf);
const taste = (key: string, ...rumpf: string[]) => skript(`@WennTaste(${JSON.stringify(key)})`, defaultHatName(B.blKey, { KEY: key }), rumpf);
const angeklickt = (...rumpf: string[]) => skript("@WennAngeklickt", "wennAngeklickt", rumpf);
const nachricht = (msg: string, ...rumpf: string[]) => skript(`@WennNachricht(${JSON.stringify(msg)})`, messageMethodName(msg), rumpf);
const mitWert = (msg: string, ...rumpf: string[]) => skript(`@WennNachricht(${JSON.stringify(msg)})`, messageMethodName(msg), rumpf, "double wert");
const alsKlon = (...rumpf: string[]) => skript("@WennIchAlsKlonEntstehe", "alsKlon", rumpf);
const eigener = (kopf: string, ...rumpf: string[]) => [`    ${kopf} {`, ...einr(rumpf, "        "), "    }"];
const skripte = (...s: string[][]) => s.flatMap((x, i) => (i ? ["", ...x] : x));
/** wiederhole n mal (wie der Block) */
const mal = (n: number, ...rumpf: string[]) => [`for (int durchlauf = 1; durchlauf <= ${n}; durchlauf++) {`, ...einr(rumpf, "    "), "}"];
const immer = (...rumpf: string[]) => ["while (true) {", ...einr(rumpf, "    "), "}"];
const falls = (bed: string, ...rumpf: string[]) => [`if (${bed}) {`, ...einr(rumpf, "    "), "}"];

const h = (zeilen: string[], satz?: string): BlHilfe => ({ zeilen, satz });

// gemeinsame Beispiele
const KLON = skripte(flagge(...mal(3, "erzeugeKlon();", "dreheRechts(120);")), alsKlon("gehe(100);"));
const VERSTECKEN = flagge("verstecke();", "warte(1);", "zeige();");
const FRAGE = flagge("frage(\"Wie heißt du?\");", "sage(\"Hallo \" + antwort() + \"!\", 2);");
const STOPPUHR = flagge("setzeStoppuhrZurueck();", "while (!beruehrtMauszeiger()) {", "    warte(0.05);", "}", "sage(stoppuhr());");
const NACHRICHT_MIT_WERT = skripte(angeklickt("Nachricht.sende(\"Punkte\", 10);"), mitWert("Punkte", "sage(\"Danke für \" + wert + \" Punkte!\", 2);"));
const VARIABLE = flagge("int punkte = 0;", "punkte = 10;", "punkte += 5;", "sage(punkte, 2);");
const SPRINGE = skripte(flagge("springe(50);", "warte(0.5);", "springe(120);"),
    eigener("void springe(int hoehe)", "aendereYUm(hoehe);", "warte(0.3);", "aendereYUm(-1 * hoehe);"));
const QUADRAT = skripte(flagge("sage(\"5 mal 5 ist \" + quadrat(5), 2);"), eigener("int quadrat(int x)", "return x * x;"));
const L = "Spiel.einkauf";

export const BL_HILFE: Record<string, BlHilfe> = {
    // —— Bewegung ——
    bl_gehe: h(flagge(...immer("gehe(10);", "pralleVomRandAb();"))),
    bl_drehe: h(flagge(...mal(4, "gehe(80);", "dreheRechts(90);"))),
    bl_gehe_zu: h(angeklickt("geheZuZufaelligerPosition();")),
    bl_gehe_xy: h(flagge("geheZu(0, 0);", "sage(\"Ich bin in der Mitte.\", 2);")),
    bl_gleite: h(flagge("geheZu(-150, 0);", "gleite(2, 150, 0);")),
    bl_richtung: h(flagge("zeigeInRichtung(-90);", "gehe(100);")),
    bl_zeige_auf: h(flagge(...immer("zeigeAufMauszeiger();", "gehe(3);"))),
    bl_aendere_xy: h(taste("ArrowUp", "aendereYUm(10);")),
    bl_setze_xy: h(flagge("setzeX(-200);", "gleite(2, 200, 0);")),
    bl_abprallen: h(flagge(...immer("gehe(10);", "pralleVomRandAb();"))),
    bl_drehstil: h(flagge("setzeDrehstil(\"links-rechts\");", ...immer("gehe(10);", "pralleVomRandAb();"))),
    bl_x: h(flagge("sage(xPosition(), 2);")),
    bl_y: h(flagge(...immer("aendereYUm(5);", ...falls("yPosition() > 150", "setzeY(-150);")))),
    bl_dir: h(flagge("dreheRechts(45);", "sage(richtung(), 2);")),
    // —— Aussehen ——
    bl_sage_sek: h(flagge("sage(\"Hallo!\", 2);", "gehe(50);")),
    bl_sage: h(flagge("sage(\"Hallo!\");")),
    bl_denke_sek: h(flagge("denke(\"Hmm …\", 2);", "sage(\"Ich hab's!\");")),
    bl_denke: h(flagge("denke(\"Was mache ich heute?\");")),
    bl_kostuem: h(angeklickt("wechsleZuKostuem(\"winken\");", "warte(1);", "wechsleZuKostuem(\"stehen\");")),
    bl_naechstes_kostuem: h(flagge(...immer("gehe(6);", "naechstesKostuem();", "warte(0.1);"))),
    bl_buehnenbild: h(flagge("wechsleZuBuehnenbild(\"Wiese\");", "warte(2);", "wechsleZuBuehnenbild(\"Wald\");")),
    bl_naechstes_bild: h(angeklickt("naechstesBuehnenbild();")),
    bl_groesse_um: h(flagge(...mal(5, "aendereGroesseUm(10);", "warte(0.2);"))),
    bl_groesse_auf: h(flagge("setzeGroesse(50);", "warte(1);", "setzeGroesse(100);")),
    bl_zeige: h(VERSTECKEN),
    bl_verstecke: h(VERSTECKEN),
    bl_ebene: h(angeklickt("geheGanzNachVorne();")),
    bl_kostuem_name: h(angeklickt("naechstesKostuem();", "sage(kostuemName(), 1);")),
    bl_groesse: h(flagge("aendereGroesseUm(20);", "sage(groesse(), 2);")),
    bl_bild_name: {
        buehne: true,
        zeilen: angeklickt("naechstesBuehnenbild();", ...falls(`buehnenbildName().contains("Wald")`, "Nachricht.sende(\"Wald\");")),
    },
    // —— Ereignisse ——
    bl_flag: h(flagge("sage(\"Los geht's!\", 2);"), "Startet das Skript, wenn jemand auf die grüne Flagge 🚩 klickt. Diesen Hut gibt es nur einmal im ganzen Projekt."),
    bl_key: h(taste(" ", "aendereYUm(60);", "warte(0.3);", "aendereYUm(-60);"), "Startet das Skript bei jedem Druck auf diese Taste."),
    bl_click: h(angeklickt("sage(\"Au!\", 1);"), "Startet das Skript, wenn jemand beim laufenden Programm auf die Figur (bzw. die Bühne) klickt."),
    bl_msg: h(nachricht("los", "gehe(50);"), "Startet das Skript, sobald irgendwer diese Nachricht sendet."),
    bl_msg_data: h(NACHRICHT_MIT_WERT, "Startet bei dieser Nachricht und bekommt den mitgeschickten Wert – im Skript steht er im Block „Wert“."),
    bl_backdrop: h(skript("@WennBuehnenbild(\"Wald\")", "wennBuehnenbildWald", ["sage(\"Ab in den Wald!\", 2);"]), "Startet, sobald die Bühne dieses Bühnenbild zeigt."),
    bl_timer: h(skript("@WennStoppuhrUeber(10)", "wennStoppuhr", ["sage(\"Die Zeit ist um!\");", "stoppeAlles();"]),
        "Startet einmal, sobald die Stoppuhr mehr als so viele Sekunden zeigt."),
    [B.msgSend]: h(flagge("Nachricht.sende(\"los\");"), "Schickt eine Nachricht an alle Figuren und die Bühne – ihre Skripte „Wenn ich … empfange“ starten."),
    [B.msgSendWait]: h(flagge("Nachricht.sendeUndWarte(\"los\");", "sage(\"Alle sind fertig.\");"),
        "Schickt eine Nachricht und wartet, bis alle Skripte, die sie empfangen, fertig sind."),
    [B.blSendWith]: h(NACHRICHT_MIT_WERT, "Schickt eine Nachricht und gibt ihr einen Wert mit (eine Zahl oder einen Text)."),
    [B.blSendWithWait]: h(skripte(angeklickt("Nachricht.sendeUndWarte(\"Punkte\", 10);", "sage(\"Gesendet!\");"), mitWert("Punkte", "sage(wert, 1);")),
        "Schickt eine Nachricht mit Wert und wartet, bis alle Skripte, die sie empfangen, fertig sind."),
    [B.blWert]: h(NACHRICHT_MIT_WERT, "Der Wert, der mit der Nachricht kam – nur im Skript „Wenn ich … empfange mit Wert“."),
    // —— Steuerung ——
    bl_warte: h(flagge("sage(\"Gleich geht's los …\");", "warte(2);", "sage(\"Los!\");")),
    [B.repeat]: h(flagge(...mal(4, "gehe(80);", "dreheRechts(90);")), "Wiederholt die Blöcke darin so oft."),
    [B.forever]: h(flagge(...immer("gehe(10);", "pralleVomRandAb();")), "Wiederholt die Blöcke darin immer wieder, bis das Programm stoppt."),
    [B.if]: h(flagge(...immer("gehe(5);", ...falls("beruehrtRand()", "dreheRechts(180);"))), "Die Blöcke darin laufen nur, wenn die Bedingung wahr ist."),
    [`${B.if}:sonst`]: h(flagge("geheZuZufaelligerPosition();", "if (xPosition() > 0) {", "    sage(\"rechts\");", "} else {", "    sage(\"links\");", "}"),
        "Ist die Bedingung wahr, laufen die oberen Blöcke, sonst die unteren."),
    [B.while]: h(flagge("while (!beruehrtRand()) {", "    gehe(5);", "}", "sage(\"Angekommen!\", 2);"), "Wiederholt die Blöcke darin, bis die Bedingung wahr ist."),
    [`${B.while}:solange`]: h(flagge("geheZu(-200, 0);", "while (xPosition() < 150) {", "    gehe(5);", "}", "sage(\"Weit genug!\", 2);"),
        "Wiederholt die Blöcke darin, solange die Bedingung wahr ist."),
    bl_stoppe_alles: h(flagge(...immer("gehe(8);", ...falls("beruehrtRand()", "stoppeAlles();")))),
    bl_stoppe_andere: h(skripte(flagge(...immer("dreheRechts(5);")), angeklickt("stoppeAndereSkripteDieserFigur();", "sage(\"Halt!\", 1);"))),
    [B.blClone]: h(KLON, "Startet in jedem neuen Klon dieser Figur."),
    bl_klon: h(KLON),
    bl_loesche_klon: h(skripte(flagge("erzeugeKlon();"), alsKlon("gleite(1, 200, 0);", "loescheDiesenKlon();"))),
    // —— Fühlen ——
    bl_beruehrt: h(flagge("while (!beruehrt(\"Pinguin\")) {", "    gehe(5);", "}", "sage(\"Gefunden!\", 2);")),
    bl_abstand: h(flagge(...immer("if (abstandZuMauszeiger() < 80) {", "    sage(\"Nicht so nah!\");", "} else {", "    sage(\"\");", "}"))),
    [B.blVon]: h(flagge("sage(figur(\"Pinguin\").xPosition(), 2);"),
        "Ein Wert einer anderen Figur (Position, Richtung, Kostüm, Größe oder eine ihrer Variablen) oder das Bühnenbild."),
    bl_frage: h(FRAGE),
    bl_antwort: h(FRAGE),
    bl_antwort_zahl: h(flagge("frage(\"Wie alt bist du?\");", "sage(antwortAlsZahl() + 1, 2);")),
    bl_taste: h(flagge(...immer(...falls("tasteGedrueckt(\"ArrowRight\")", "aendereXUm(5);")))),
    bl_maus_gedrueckt: h(flagge(...immer(...falls("mausGedrueckt()", "geheZuMauszeiger();")))),
    bl_maus_x: h(flagge(...immer("setzeX(mausX());"))),
    bl_maus_y: h(flagge(...immer("setzeY(mausY());"))),
    bl_ziehbar: h(flagge("setzeZiehbar(true);", "sage(\"Zieh mich!\");")),
    bl_stoppuhr: h(STOPPUHR),
    bl_stoppuhr_null: h(STOPPUHR),
    bl_zeit: h(flagge("sage(\"Es ist \" + aktuelleStunde() + \" Uhr.\", 2);")),
    bl_tage_seit_2000: h(flagge("sage(tageSeit2000(), 2);")),
    // —— Operatoren ——
    [B.arith]: h(flagge("sage(3 * 4 + 2, 2);"), "Rechnet mit zwei Zahlen: plus, minus, mal, geteilt – % ist der Rest beim Teilen."),
    [B.random]: h(angeklickt("sage(Random.randint(1, 6), 1);"), "Eine Zufallszahl von der ersten bis zur zweiten Zahl (beide können vorkommen)."),
    [B.compare]: h(flagge(...falls("xPosition() > 0", "sage(\"Ich bin rechts.\", 2);")), "Vergleicht zwei Werte (größer, kleiner, gleich) – das Ergebnis ist wahr oder falsch."),
    [B.logic]: h(flagge(...falls("xPosition() > 0 && yPosition() > 0", "sage(\"Ich bin oben rechts.\", 2);")),
        "„und“ ist wahr, wenn beide Bedingungen wahr sind; „oder“, wenn mindestens eine wahr ist."),
    [B.not]: h(flagge(...falls("!beruehrtRand()", "gehe(50);")), "Kehrt eine Bedingung um: aus wahr wird falsch und aus falsch wahr."),
    [B.concat]: h(flagge("sage(\"Ich stehe bei x = \" + xPosition(), 2);"), "Hängt zwei Texte (oder Text und Zahl) aneinander."),
    [B.strCharAt]: h(flagge("frage(\"Wie heißt du?\");", "sage(\"Dein Name beginnt mit \" + antwort().charAt(0), 2);"),
        "Das Zeichen an dieser Position im Text – das erste hat die Position 0."),
    [B.strLength]: h(flagge("frage(\"Wie heißt du?\");", "sage(antwort().length(), 2);"), "Wie viele Zeichen ein Text hat."),
    [B.strContains]: h(flagge("frage(\"Magst du Äpfel?\");", ...falls("antwort().contains(\"j\")", "sage(\"Ich auch!\", 2);")),
        "Wahr, wenn der erste Text den zweiten enthält."),
    [B.math]: h(flagge("sage(Math.round(2.5), 2);"), "Rundet eine Zahl, nimmt den Betrag (ohne Minus) oder die Wurzel."),
    [B.number]: h(flagge("gehe(10);"), "Eine Zahl. Kommazahlen schreibst du mit Punkt: 0.5"),
    [B.text]: h(flagge("sage(\"Hallo!\");"), "Ein Text."),
    [B.bool]: h(flagge("boolean fertig = false;", "while (!fertig) {", "    gehe(10);", "    fertig = beruehrtRand();", "}"), "Wahr oder falsch."),
    // —— Variablen und Listen ——
    [B.blVar]: h(["int leben = 3;", "", ...angeklickt("leben = leben - 1;", "sage(leben, 1);")],
        "Legt eine Variable an und gibt ihr einen Startwert. Der Block gehört oben in ein Skript. In einer Figur gilt die Variable dann in allen Skripten der Figur, auf der Bühne für alle Figuren."),
    [B.blList]: h(["Liste<String> sachen = new Liste<>();", ...flagge("sachen.add(\"Ball\");", "sachen.add(\"Buch\");", "sage(sachen.size(), 2);")],
        "Legt eine Liste an, die am Anfang leer ist. Der Block gehört oben in ein Skript. In einer Figur gilt die Liste dann in allen Skripten der Figur, auf der Bühne für alle Figuren."),
    [B.varDeclare]: h(flagge("int schritte = 2;", ...mal(5, "gehe(schritte);", "schritte += 2;")),
        "Legt eine Variable an, die nur in diesem Skript gilt, und gibt ihr einen Startwert."),
    [B.varGet]: h(VARIABLE, "Der Wert, den die Variable gerade hat."),
    [B.varSet]: h(VARIABLE, "Gibt der Variable einen neuen Wert."),
    [B.varChange]: h(VARIABLE, "Erhöht die Variable um diesen Wert (mit einer negativen Zahl wird sie kleiner)."),
    [B.listAdd]: h(flagge(`${L}.add("Brot");`, `sage(${L}.size(), 2);`), "Hängt den Wert hinten an die Liste an."),
    [B.listRemove]: h(flagge(`${L}.remove(0);`), "Löscht das Element an dieser Position; die dahinter rücken auf."),
    [B.listClear]: h(flagge(`${L}.clear();`), "Macht die Liste leer."),
    [B.listInsert]: h(flagge(`${L}.add(0, "Milch");`), "Fügt den Wert an dieser Position ein; die dahinter rücken eins nach hinten."),
    [B.listSet]: h(flagge(`${L}.set(0, "Käse");`), "Ersetzt das Element an dieser Position."),
    [B.listGet]: h(flagge(`sage(${L}.get(0), 2);`), "Das Element an dieser Position – das erste hat die Position 0."),
    [B.listIndexOf]: h(flagge(`sage(${L}.indexOf("Brot"), 2);`), "An welcher Position der Wert steht – -1, wenn er nicht in der Liste ist."),
    [B.listSize]: h(flagge(`sage(${L}.size(), 2);`), "Wie viele Elemente die Liste hat."),
    [B.listContains]: h(flagge(...falls(`${L}.contains("Brot")`, "sage(\"Brot steht schon drauf.\", 2);")), "Wahr, wenn der Wert in der Liste steht."),
    [B.collIsEmpty]: h(flagge(...falls(`${L}.isEmpty()`, "sage(\"Nichts mehr zu tun!\", 2);")), "Wahr, wenn die Liste kein Element hat."),
    // —— Operationen ——
    [B.method]: h(SPRINGE, "Ein eigener Block: fasst Blöcke zusammen, die du öfter brauchst – auch mit Parametern."),
    [B.call]: h(SPRINGE, "Führt deinen eigenen Block aus."),
    [B.callExpr]: h(QUADRAT, "Führt deinen eigenen Block aus und liefert sein Ergebnis."),
    [B.return]: h(QUADRAT, "Legt das Ergebnis deines Blocks fest und beendet ihn."),
    [B.returnVoid]: h(skripte(flagge(...immer("vorsichtig();")), eigener("void vorsichtig()", ...falls("beruehrtRand()", "return;"), "gehe(5);")),
        "Beendet deinen eigenen Block sofort."),
    // —— Malstift ——
    bl_stift_loeschen: h(angeklickt("loescheAlles();")),
    bl_stempel: h(flagge(...mal(5, "stempel();", "gehe(60);"))),
    bl_stift_runter: h(flagge("stiftRunter();", "gehe(100);", "stiftHoch();", "gehe(50);")),
    bl_stift_hoch: h(flagge("stiftRunter();", "gehe(100);", "stiftHoch();", "gehe(50);")),
    bl_stift_farbe: h(flagge("setzeStiftfarbe(\"rot\");", "stiftRunter();", "gehe(100);")),
    bl_stift_farbe_um: h(flagge("stiftRunter();", ...mal(10, "aendereStiftfarbeUm(10);", "gehe(20);"))),
    bl_stift_dicke: h(flagge("setzeStiftdicke(5);", "stiftRunter();", "gehe(100);")),
    bl_stift_dicke_um: h(flagge("stiftRunter();", ...mal(10, "aendereStiftdickeUm(1);", "gehe(20);"))),
};

// ------------------------------------------------------------------ Datei zum Zeichnen

export const HILFE_FIGUR = "Waschbär";
export const HILFE_FIGUREN = [HILFE_FIGUR, "Pinguin"];
/** Liste für alle Figuren, die die Beispiele benutzen */
export const HILFE_GLOBALS: Record<string, string> = { einkauf: "Liste<String>" };

/** Schlüssel für einen Block: „falls … sonst“ und „wiederhole solange“ (Feld MODE) haben ein eigenes Beispiel */
export function hilfeSchluessel(type: string, hatSonst: boolean, modus?: string): string {
    if (type === B.if && hatSonst) return `${B.if}:sonst`;
    if (type === B.while && modus === "while") return `${B.while}:solange`;
    return type;
}

export type HilfeBeispiel = { satz: string; text: string; buehne: boolean; ctx: BloecklyContext };

/** Satz und Datei (Figur Waschbär bzw. Bühne) zum Block; undefined: kein Beispiel */
export function hilfeBeispiel(schluessel: string): HilfeBeispiel | undefined {
    const e = BL_HILFE[schluessel];
    if (!e) return undefined;
    const satz = e.satz ?? blBlock(schluessel)?.tooltip ?? "";
    const basis = e.buehne ? buehnenQuelltext("Wiese") : figurQuelltext({ klasse: HILFE_FIGUR, figur: "Waschbaer", x: 0, y: 0 });
    const ende = basis.lastIndexOf("}");
    const text = basis.slice(0, ende) + e.zeilen.join("\n") + "\n\n" + basis.slice(ende);
    return { satz, text, buehne: !!e.buehne, ctx: { stage: BUEHNEN_KLASSE, globals: e.buehne ? {} : HILFE_GLOBALS } };
}
