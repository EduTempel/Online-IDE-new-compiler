import { B } from "../blocks/BlockTypes";
import { BUEHNEN_DATEI, BUEHNEN_KLASSE, buehnenQuelltext, figurQuelltext, HAUPTPROGRAMM, hauptprogrammQuelltext } from "../bloeckly/BloecklyProjekt";
import { defaultHatName, messageMethodName } from "../bloeckly/BloecklySpec";
import type { HandbookEntry, HandbookSection } from "./Handbook";

/**
 * Handbuch für Blöckly (Paket 18h): gegliedert wie die acht Kategorien der Werkzeugleiste, dazu Beispielprojekte
 * und der Übergang zu Blöckva. Jedes Beispiel ist ein kleines, vollständiges Blöckly-Projekt (Bühne, Figuren,
 * Hauptprogramm). Gezeichnet werden die Skripte der Figuren (bzw. der Bühne); „Ausprobieren“ legt das Projekt
 * als neues Projekt an – so stört es kein eigenes Projekt (z. B. durch eine zweite 🚩).
 */

type Figur = {
    klasse: string;
    /** Bibliotheksfigur (Waschbaer, RoterPanda, Roboter, Axolotl, Pinguin) */
    aussehen: string;
    x?: number;
    y?: number;
    /** Skripte und eigene Blöcke (Zeilen, schon eingerückt wie in der Klasse) */
    skripte?: string[];
};

type Beispiel = {
    title: string;
    text: string;
    buehne?: { bild?: string; variablen?: string[]; skripte?: string[] };
    figuren: Figur[];
    /** welche Dateien gezeichnet werden (Klassenname oder „Bühne“); sonst alle mit Skripten */
    zeige?: string[];
};

// ------------------------------------------------------------------ kurze Schreibweise für Skripte

const einr = (zeilen: string[], tiefe: string) => zeilen.map((z) => (z ? tiefe + z : z));

/** ein Skript: Annotation, Methode, Rumpf (Rumpf ohne Einrückung, Verschachtelung mit 4 Leerzeichen) */
function skript(annotation: string, name: string, rumpf: string[]): string[] {
    return ["    " + annotation, `    void ${name}() {`, ...einr(rumpf, "        "), "    }"];
}
const flagge = (...rumpf: string[]) => skript("@BeimStart", "beimStart", rumpf);
const taste = (key: string, ...rumpf: string[]) => skript(`@WennTaste(${JSON.stringify(key)})`, defaultHatName(B.blKey, { KEY: key }), rumpf);
const angeklickt = (...rumpf: string[]) => skript("@WennAngeklickt", "wennAngeklickt", rumpf);
const nachricht = (msg: string, ...rumpf: string[]) => skript(`@WennNachricht(${JSON.stringify(msg)})`, messageMethodName(msg), rumpf);
const alsKlon = (...rumpf: string[]) => skript("@WennIchAlsKlonEntstehe", "alsKlon", rumpf);
/** eigener Block (Methode der Figur) */
const eigener = (kopf: string, ...rumpf: string[]) => [`    ${kopf} {`, ...einr(rumpf, "        "), "    }"];
/** mehrere Skripte, durch Leerzeilen getrennt */
const skripte = (...s: string[][]) => s.flatMap((x, i) => (i ? ["", ...x] : x));

const VARIABLE = (typ: string, name: string, wert: string) => `    static ${typ} ${name} = ${wert};`;

// ------------------------------------------------------------------ Dateien eines Beispiels

function mitMitgliedern(quelltext: string, zeilen: string[]): string {
    if (!zeilen.length) return quelltext;
    const ende = quelltext.lastIndexOf("}");
    return quelltext.slice(0, ende) + zeilen.join("\n") + "\n\n" + quelltext.slice(ende);
}

export type BloecklyDatei = { name: string; text: string };

export function beispielDateien(b: Beispiel): BloecklyDatei[] {
    // Variablen für alle Figuren stehen oben in der Bühne (vor dem Konstruktor), die Skripte am Ende
    let buehne = buehnenQuelltext(b.buehne?.bild ?? "");
    const variablen = b.buehne?.variablen ?? [];
    if (variablen.length) {
        const kopf = buehne.indexOf("\n\n") + 2;
        buehne = buehne.slice(0, kopf) + variablen.join("\n") + "\n\n" + buehne.slice(kopf);
    }
    buehne = mitMitgliedern(buehne, b.buehne?.skripte ?? []);
    return [
        { name: BUEHNEN_DATEI, text: buehne },
        ...b.figuren.map((f) => ({
            name: f.klasse,
            text: mitMitgliedern(figurQuelltext({ klasse: f.klasse, figur: f.aussehen, x: f.x ?? 0, y: f.y ?? 0 }), f.skripte ?? []),
        })),
        { name: HAUPTPROGRAMM, text: hauptprogrammQuelltext(BUEHNEN_KLASSE, b.figuren.map((f) => f.klasse)) },
    ];
}

function eintrag(b: Beispiel): HandbookEntry {
    const files = beispielDateien(b);
    const show = b.zeige ?? [
        ...(b.buehne?.skripte?.length ? [BUEHNEN_DATEI] : []),
        ...b.figuren.filter((f) => f.skripte?.length).map((f) => f.klasse),
    ];
    return {
        title: b.title,
        text: b.text,
        code: files.filter((f) => show.includes(f.name)).map((f) => f.text).join("\n"),
        bloeckly: { files, show },
    };
}

const W = (skripte?: string[], x = 0, y = 0): Figur => ({ klasse: "Waschbär", aussehen: "Waschbaer", x, y, skripte });

// ------------------------------------------------------------------ Inhalte

export const BLOECKLY_HANDBOOK: HandbookSection[] = [
    {
        id: "bewegung", title: "Bewegung", icon: "🏃",
        intro: "Die Bühne ist 480 breit und 360 hoch, die Mitte ist **x = 0, y = 0**. Nach rechts wird x größer, nach oben y. **Richtung 90** heißt nach rechts, **-90** nach links, **0** nach oben. Die Figur dreht sich nicht, sondern schaut in die passende Richtung (Kostüm von vorne, rechts, links oder hinten).",
        entries: [
            eintrag({
                title: "Gehen und vom Rand abprallen",
                text: "**wiederhole fortlaufend** wiederholt die Blöcke darin, bis du auf Stopp klickst. **pralle vom Rand ab** dreht die Figur um, wenn sie den Rand berührt.",
                figuren: [W(flagge("while (true) {", "    gehe(10);", "    pralleVomRandAb();", "}"))],
            }),
            eintrag({
                title: "Mit den Pfeiltasten steuern",
                text: "Für jede Taste gibt es ein eigenes Skript mit **Wenn Taste … gedrückt**. **zeige in Richtung** dreht die Figur, **ändere y um** bewegt sie nach oben oder unten.",
                figuren: [W(skripte(
                    taste("ArrowRight", "zeigeInRichtung(90);", "gehe(10);"),
                    taste("ArrowLeft", "zeigeInRichtung(-90);", "gehe(10);"),
                    taste("ArrowUp", "aendereYUm(10);"),
                    taste("ArrowDown", "aendereYUm(-10);"),
                ))],
            }),
            eintrag({
                title: "Springen und gleiten",
                text: "**gehe zu x: y:** springt sofort an eine Stelle, **gleite in … Sek. zu** bewegt die Figur gleichmäßig dorthin. **gehe zu zufälliger Position** wählt eine Stelle auf der Bühne.",
                figuren: [W(flagge("geheZu(-150, 0);", "gleite(2, 150, 0);", "warte(1);", "geheZuZufaelligerPosition();"))],
            }),
            eintrag({
                title: "Dem Mauszeiger folgen",
                text: "**drehe dich zu Mauszeiger** stellt die Richtung ein, dann geht die Figur ein Stück. Ist sie schon da, bleibt sie stehen – sonst würde sie hin- und herzappeln.",
                figuren: [W(flagge("while (true) {", "    zeigeAufMauszeiger();", "    if (abstandZuMauszeiger() > 10) {", "        gehe(5);", "    }", "}"))],
            }),
        ],
    },
    {
        id: "aussehen", title: "Aussehen", icon: "🎨",
        intro: "Jede Figur hat mehrere **Kostüme**: stehen, laufen 1 bis laufen 4 und winken. Welche Ansicht (vorne, rechts, links, hinten) gezeigt wird, richtet sich nach der Richtung. Die Bühne hat **Bühnenbilder**.",
        entries: [
            eintrag({
                title: "Laufanimation mit Kostümwechsel",
                text: "**wechsle zum nächsten Kostüm** schaltet beim Laufen zum nächsten Laufbild. Mit einer kurzen Pause dazwischen sieht es aus, als ob die Figur läuft.",
                buehne: { bild: "Wald" },
                figuren: [W(flagge("while (true) {", "    gehe(6);", "    naechstesKostuem();", "    pralleVomRandAb();", "    warte(0.1);", "}"), -150, -60)],
            }),
            eintrag({
                title: "Sprechen und denken",
                text: "**sage … für … Sekunden** zeigt eine Sprechblase und wartet. **sage …** ohne Sekunden lässt die Blase stehen, bis die Figur etwas anderes sagt.",
                figuren: [W(flagge("sage(\"Hallo!\", 2);", "denke(\"Was mache ich heute?\", 2);", "sage(\"Ich weiß es!\");"))],
            }),
            eintrag({
                title: "Größe und Sichtbarkeit",
                text: "**ändere Größe um** macht die Figur größer (negativ: kleiner). **verstecke dich** und **zeige dich** lassen sie verschwinden und wieder auftauchen.",
                figuren: [W(flagge("for (int durchlauf = 1; durchlauf <= 10; durchlauf++) {", "    aendereGroesseUm(10);", "    warte(0.1);", "}", "verstecke();", "warte(1);", "setzeGroesse(100);", "zeige();"))],
            }),
            eintrag({
                title: "Bühnenbilder wechseln",
                text: "Die **Bühne** hat eigene Skripte (im Reiter „Figuren“ die Bühne anklicken). Hier wechselt sie alle zwei Sekunden das Bühnenbild.",
                buehne: { bild: "Wiese", skripte: flagge("while (true) {", "    warte(2);", "    naechstesBuehnenbild();", "}") },
                figuren: [W()],
            }),
        ],
    },
    {
        id: "ereignisse", title: "Ereignisse", icon: "⚡",
        intro: "Jedes Skript beginnt mit einem **Hut-Block**: Er sagt, wann das Skript startet. **Wenn 🚩 angeklickt** gibt es im ganzen Projekt nur einmal – weitere Figuren starten über Nachrichten.",
        entries: [
            eintrag({
                title: "Wenn 🚩 angeklickt",
                text: "Das Skript startet, wenn du auf die grüne Flagge über der Bühne klickst.",
                figuren: [W(flagge("sage(\"Los geht's!\", 2);", "gehe(50);"))],
            }),
            eintrag({
                title: "Wenn Taste gedrückt",
                text: "Bei jedem Druck auf die **Leertaste** springt die Figur kurz hoch.",
                figuren: [W(taste(" ", "aendereYUm(60);", "warte(0.3);", "aendereYUm(-60);"))],
            }),
            eintrag({
                title: "Wenn diese Figur angeklickt wird",
                text: "Klickst du beim laufenden Programm auf die Figur, winkt sie.",
                figuren: [W(angeklickt("wechsleZuKostuem(\"winken\");", "sage(\"Hallo!\", 1);", "wechsleZuKostuem(\"stehen\");"))],
            }),
            eintrag({
                title: "Nachrichten senden und empfangen",
                text: "**sende Nachricht** startet bei **allen** Figuren und der Bühne die Skripte **Wenn ich … empfange**. So reden Figuren miteinander – und so starten weitere Figuren, obwohl es nur eine 🚩 gibt.",
                figuren: [
                    W(flagge("sage(\"Pinguin, bist du da?\", 2);", "Nachricht.sende(\"frage\");"), -100, 0),
                    { klasse: "Pinguin", aussehen: "Pinguin", x: 100, y: 0, skripte: nachricht("frage", "sage(\"Ja, hier bin ich!\", 2);") },
                ],
            }),
        ],
    },
    {
        id: "steuerung", title: "Steuerung", icon: "🔁",
        intro: "Mit **warte**, **wiederhole** und **falls** bestimmst du, wann und wie oft etwas passiert. **Klone** sind Kopien einer Figur mit eigenen Skripten.",
        entries: [
            eintrag({
                title: "Wiederhole n-mal",
                text: "Viermal: 80 Schritte gehen, dann um 90 Grad drehen – die Figur läuft ein Quadrat ab.",
                figuren: [W(flagge("for (int durchlauf = 1; durchlauf <= 4; durchlauf++) {", "    gehe(80);", "    warte(0.5);", "    dreheRechts(90);", "}"), -40, -40)],
            }),
            eintrag({
                title: "Falls … sonst",
                text: "**falls** prüft eine Bedingung. Ist sie wahr, laufen die oberen Blöcke, sonst die unteren.",
                figuren: [W(flagge("while (true) {", "    gehe(5);", "    pralleVomRandAb();", "    if (xPosition() > 0) {", "        sage(\"rechts\");", "    } else {", "        sage(\"links\");", "    }", "}"))],
            }),
            eintrag({
                title: "Wiederhole bis",
                text: "Die Figur geht so lange, **bis** sie den Rand berührt.",
                figuren: [W(flagge("zeigeInRichtung(90);", "while (!beruehrtRand()) {", "    gehe(5);", "}", "sage(\"Angekommen!\", 2);"), -200, 0)],
            }),
            eintrag({
                title: "Klone erzeugen",
                text: "**erzeuge Klon von mir selbst** macht eine Kopie der Figur. Jeder Klon startet **Wenn ich als Klon entstehe** – hier läuft jeder Klon in eine andere Richtung und verschwindet dann mit **lösche diesen Klon**.",
                figuren: [W(skripte(
                    flagge("for (int durchlauf = 1; durchlauf <= 6; durchlauf++) {", "    dreheRechts(60);", "    erzeugeKlon();", "}"),
                    alsKlon("for (int durchlauf = 1; durchlauf <= 30; durchlauf++) {", "    gehe(4);", "}", "loescheDiesenKlon();"),
                ))],
            }),
            eintrag({
                title: "Alles stoppen",
                text: "**stoppe alles** beendet das ganze Programm – wie der Stopp-Knopf. Hier, sobald die Figur den Rand berührt.",
                figuren: [W(flagge("while (true) {", "    gehe(8);", "    if (beruehrtRand()) {", "        sage(\"Ende!\", 1);", "        stoppeAlles();", "    }", "}"))],
            }),
        ],
    },
    {
        id: "fuehlen", title: "Fühlen", icon: "👀",
        intro: "Mit den Blöcken aus **Fühlen** merkt eine Figur, was um sie herum passiert: ob sie etwas berührt, welche Taste gedrückt ist, wo die Maus ist.",
        entries: [
            eintrag({
                title: "Berührt eine andere Figur?",
                text: "Der Waschbär geht auf den Pinguin zu, bis er ihn **berührt**.",
                figuren: [
                    W(flagge("zeigeAuf(\"Pinguin\");", "while (!beruehrt(\"Pinguin\")) {", "    gehe(5);", "}", "sage(\"Gefunden!\", 2);"), -180, -80),
                    { klasse: "Pinguin", aussehen: "Pinguin", x: 150, y: 60 },
                ],
            }),
            eintrag({
                title: "Flüssig steuern mit Taste gedrückt?",
                text: "**Taste … gedrückt?** ist wahr, solange die Taste unten ist. In einer Schleife abgefragt, bewegt sich die Figur flüssiger als mit „Wenn Taste gedrückt“.",
                figuren: [W(flagge(
                    "while (true) {",
                    "    if (tasteGedrueckt(\"ArrowRight\")) {", "        aendereXUm(5);", "    }",
                    "    if (tasteGedrueckt(\"ArrowLeft\")) {", "        aendereXUm(-5);", "    }",
                    "}"))],
            }),
            eintrag({
                title: "Abstand zum Mauszeiger",
                text: "**Entfernung von Mauszeiger** misst von der Mitte der Figur bis zur Maus.",
                figuren: [W(flagge("while (true) {", "    if (abstandZuMauszeiger() < 80) {", "        sage(\"Nicht so nah!\");", "    } else {", "        sage(\"\");", "    }", "}"))],
            }),
            eintrag({
                title: "Stoppuhr",
                text: "Die **Stoppuhr** zählt die Sekunden seit dem Start. Wie schnell erreichst du mit der Maus den Waschbären?",
                figuren: [W(flagge("setzeStoppuhrZurueck();", "while (!beruehrtMauszeiger()) {", "    warte(0.05);", "}", "sage(stoppuhr());"))],
            }),
        ],
    },
    {
        id: "operatoren", title: "Operatoren", icon: "🧮",
        intro: "Rechnen, vergleichen, Zufallszahlen und Texte verbinden. Die runden Blöcke liefern einen Wert, die spitzen eine Bedingung (wahr oder falsch).",
        entries: [
            eintrag({
                title: "Zufallszahlen",
                text: "**Zufallszahl von … bis …** liefert jedes Mal eine andere ganze Zahl – hier eine zufällige Stelle auf der Bühne.",
                figuren: [W(flagge("while (true) {", "    geheZu(Random.randint(-200, 200), Random.randint(-150, 150));", "    warte(1);", "}"))],
            }),
            eintrag({
                title: "Rechnen und vergleichen",
                text: "Rechenblöcke lassen sich ineinanderstecken. **und** ist nur wahr, wenn beide Bedingungen wahr sind.",
                figuren: [W(flagge("sage(3 * 4 + 2, 2);", "geheZuZufaelligerPosition();", "if (xPosition() > 0 && yPosition() > 0) {", "    sage(\"Ich bin oben rechts.\", 2);", "}"))],
            }),
            eintrag({
                title: "Texte verbinden",
                text: "**verbinde** hängt zwei Texte aneinander. Auch Zahlen lassen sich so in einen Satz einbauen.",
                figuren: [W(flagge("sage(\"Ich stehe bei x = \" + xPosition(), 2);"), 60, 0)],
            }),
        ],
    },
    {
        id: "variablen", title: "Variablen", icon: "📦",
        intro: "Eine **Variable** merkt sich einen Wert. **erstelle neue Variable** im Skript gilt nur in diesem Skript. Mit **Neue Variable für alle Figuren** entsteht eine Variable, die alle Figuren und die Bühne gemeinsam haben – zum Beispiel Punkte.",
        entries: [
            eintrag({
                title: "Variable im Skript",
                text: "Die Schritte werden mit jeder Runde größer: Die Figur wird immer schneller.",
                figuren: [W(flagge("int schritte = 2;", "for (int durchlauf = 1; durchlauf <= 10; durchlauf++) {", "    gehe(schritte);", "    schritte += 2;", "    warte(0.2);", "}"), -200, 0)],
            }),
            eintrag({
                title: "Punkte für alle Figuren",
                text: "**punkte** gehört allen Figuren. Jeder Klick auf den Waschbären oder den Pinguin zählt mit – beide erhöhen dieselbe Variable.",
                buehne: { variablen: [VARIABLE("int", "punkte", "0")] },
                figuren: [
                    W(angeklickt("Spiel.punkte++;", "sage(Spiel.punkte, 1);"), -100, 0),
                    { klasse: "Pinguin", aussehen: "Pinguin", x: 100, y: 0, skripte: angeklickt("Spiel.punkte++;", "sage(Spiel.punkte, 1);") },
                ],
                zeige: ["Waschbär"],
            }),
        ],
    },
    {
        id: "meine", title: "Meine Blöcke", icon: "🧩",
        intro: "Brauchst du dieselben Blöcke öfter, fasse sie zu einem **eigenen Block** zusammen. Er gehört zu dieser Figur und kann **Parameter** haben – Werte, die er beim Aufruf bekommt.",
        entries: [
            eintrag({
                title: "Eigener Block mit Parameter",
                text: "**springe** bekommt die Höhe als Parameter. Das Skript ruft ihn zweimal mit verschiedenen Werten auf.",
                figuren: [W(skripte(
                    flagge("springe(50);", "warte(0.5);", "springe(120);"),
                    eigener("void springe(int hoehe)", "aendereYUm(hoehe);", "warte(0.3);", "aendereYUm(-1 * hoehe);"),
                ))],
            }),
        ],
    },
    {
        id: "projekte", title: "Beispielprojekte", icon: "🎮",
        intro: "Größere Beispiele zum Ausprobieren und Weiterbauen. **▶ Ausprobieren** legt jedes als eigenes Projekt an.",
        entries: [
            eintrag({
                title: "Laufanimation: Waschbär und Panda",
                text: "Zwei Figuren laufen durch den Wald und wechseln dabei ihre Kostüme. Der Panda startet über eine Nachricht, weil es die 🚩 nur einmal gibt. Klickst du eine Figur an, winkt sie.",
                buehne: { bild: "Wald" },
                figuren: [
                    W(skripte(
                        flagge("Nachricht.sende(\"los\");", "while (true) {", "    gehe(6);", "    naechstesKostuem();", "    pralleVomRandAb();", "    warte(0.1);", "}"),
                        angeklickt("wechsleZuKostuem(\"winken\");", "sage(\"Hallo!\", 1);"),
                    ), -150, -80),
                    {
                        klasse: "Panda", aussehen: "RoterPanda", x: 150, y: 40, skripte: skripte(
                            nachricht("los", "zeigeInRichtung(-90);", "while (true) {", "    gehe(4);", "    naechstesKostuem();", "    pralleVomRandAb();", "    warte(0.15);", "}"),
                            angeklickt("wechsleZuKostuem(\"winken\");", "sage(\"Hi!\", 1);"),
                        ),
                    },
                ],
            }),
            eintrag({
                title: "Fangspiel",
                text: "Fange mit dem Waschbären (Pfeiltasten) die Pinguine, die vom Himmel fallen. Jeder gefangene Pinguin gibt einen Punkt, jeder verpasste kostet ein Leben. Die Bühne setzt die Variablen und startet das Spiel.",
                buehne: {
                    bild: "Schulhof",
                    variablen: [VARIABLE("int", "punkte", "0"), VARIABLE("int", "leben", "3")],
                    skripte: flagge("punkte = 0;", "leben = 3;", "Nachricht.sende(\"los\");"),
                },
                figuren: [
                    W(nachricht("los",
                        "geheZu(0, -140);",
                        "while (true) {",
                        "    if (tasteGedrueckt(\"ArrowRight\")) {", "        zeigeInRichtung(90);", "        gehe(8);", "        naechstesKostuem();", "    }",
                            "    if (tasteGedrueckt(\"ArrowLeft\")) {", "        zeigeInRichtung(-90);", "        gehe(8);", "        naechstesKostuem();", "    }",
                            "}"), 0, -140),
                    {
                        klasse: "Pinguin", aussehen: "Pinguin", x: 0, y: 160, skripte: nachricht("los",
                            "while (true) {",
                            "    geheZu(Random.randint(-220, 220), 170);",
                            "    while (!(beruehrt(\"Waschbär\") || yPosition() < -170)) {", "        aendereYUm(-4);", "    }",
                            "    if (beruehrt(\"Waschbär\")) {", "        Spiel.punkte++;", "    } else {", "        Spiel.leben--;", "    }",
                            "    if (Spiel.leben == 0) {", "        sage(\"Spiel vorbei: \" + Spiel.punkte + \" Punkte\", 3);", "        stoppeAlles();", "    }",
                            "}"),
                    },
                ],
            }),
            eintrag({
                title: "Labyrinth mit Wächtern",
                text: "Bring den Waschbären mit den Pfeiltasten zum Pinguin. Drei Roboter-Wächter (Klone) laufen auf und ab. Wer einen berührt, muss zurück zum Start.",
                buehne: { bild: "Stadt" },
                figuren: [
                    W(flagge(
                        "Nachricht.sende(\"los\");",
                        "geheZu(-210, 0);",
                        "while (true) {",
                        "    if (tasteGedrueckt(\"ArrowRight\")) {", "        aendereXUm(4);", "    }",
                        "    if (tasteGedrueckt(\"ArrowLeft\")) {", "        aendereXUm(-4);", "    }",
                        "    if (tasteGedrueckt(\"ArrowUp\")) {", "        aendereYUm(4);", "    }",
                        "    if (tasteGedrueckt(\"ArrowDown\")) {", "        aendereYUm(-4);", "    }",
                        "    if (beruehrt(\"Roboter\")) {", "        sage(\"Erwischt!\", 1);", "        geheZu(-210, 0);", "    }",
                        "    if (beruehrt(\"Pinguin\")) {", "        sage(\"Geschafft!\", 2);", "        stoppeAlles();", "    }",
                        "}"), -210, 0),
                    {
                        klasse: "Roboter", aussehen: "Roboter", x: -100, y: 0, skripte: skripte(
                            nachricht("los",
                                "setzeGroesse(70);",
                                "geheZu(-100, 120);",
                                "erzeugeKlon();",
                                "geheZu(20, -120);",
                                "erzeugeKlon();",
                                "geheZu(140, 120);",
                                "erzeugeKlon();",
                                "verstecke();"),
                            alsKlon(
                                "zeige();",
                                "if (yPosition() > 0) {", "    zeigeInRichtung(180);", "} else {", "    zeigeInRichtung(0);", "}",
                                "while (true) {", "    gehe(3);", "    pralleVomRandAb();", "}"),
                        ),
                    },
                    { klasse: "Pinguin", aussehen: "Pinguin", x: 210, y: 0 },
                ],
            }),
            eintrag({
                title: "Klone: Roboter-Regen",
                text: "Der Roboter versteckt sich und erzeugt immer neue Klone. Jeder Klon taucht an einer zufälligen Stelle oben auf, fällt nach unten und löscht sich am Rand.",
                buehne: { bild: "Weltraum" },
                figuren: [{
                    klasse: "Roboter", aussehen: "Roboter", x: 0, y: 170, skripte: skripte(
                        flagge("verstecke();", "setzeGroesse(40);", "while (true) {", "    erzeugeKlon();", "    warte(0.3);", "}"),
                        alsKlon("geheZu(Random.randint(-220, 220), 180);", "zeige();", "while (yPosition() > -170) {", "    aendereYUm(-5);", "}", "loescheDiesenKlon();"),
                    ),
                }],
            }),
            eintrag({
                title: "Klone: Axolotl einsammeln",
                text: "Unter Wasser tauchen immer wieder Axolotl auf (Klone). Der Pinguin folgt der Maus. Jedes Axolotl, das er berührt, gibt einen Punkt und verschwindet.",
                buehne: { bild: "Unterwasser", variablen: [VARIABLE("int", "punkte", "0")] },
                figuren: [
                    {
                        klasse: "Axolotl", aussehen: "Axolotl", x: 0, y: 0, skripte: skripte(
                            flagge("Spiel.punkte = 0;", "verstecke();", "setzeGroesse(60);", "Nachricht.sende(\"los\");", "while (true) {", "    erzeugeKlon();", "    warte(1);", "}"),
                            alsKlon("geheZuZufaelligerPosition();", "zeige();", "while (!beruehrt(\"Pinguin\")) {", "    warte(0.05);", "}", "Spiel.punkte++;", "loescheDiesenKlon();"),
                        ),
                    },
                    {
                        klasse: "Pinguin", aussehen: "Pinguin", x: 0, y: 0, skripte: nachricht("los",
                            "while (true) {", "    zeigeAufMauszeiger();", "    if (abstandZuMauszeiger() > 10) {", "        gehe(6);", "    }", "    sage(Spiel.punkte);", "}"),
                    },
                ],
            }),
        ],
    },
    {
        id: "bloeckva", title: "Weiter nach Blöckva", icon: "🎓",
        intro: "In Blöckva (Jahrgang 11) programmierst du mit Blöcken, die näher an Java sind. Deine Blöckly-Projekte kannst du mitnehmen.",
        entries: [
            eintrag({
                title: "Deine Figuren sind Klassen",
                text: "Rechtsklick auf ein Projekt in der Projektliste → **Als Blöckva-Projekt kopieren**. In Blöckva siehst du, was die ganze Zeit dahintersteckte: Jede Figur ist eine **Klasse**, die von **Figur** erbt, jedes Skript eine **Operation** mit einer Annotation wie `@BeimStart`. Das Hauptprogramm erzeugt die Bühne und die Figuren mit `new`. Klappe unten „Java-Code“ auf, wenn deine Lerngruppe Java sehen darf.",
                figuren: [W(skripte(
                    flagge("while (true) {", "    gehe(10);", "    pralleVomRandAb();", "}"),
                    angeklickt("sage(\"Ich bin ein Objekt der Klasse Waschbär!\", 2);"),
                ))],
            }),
        ],
    },
];
