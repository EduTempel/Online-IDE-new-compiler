import { CallbackParameter } from "../../../common/interpreter/CallbackParameter";
import type { PartOwner } from "../../../common/interpreter/GsgParts";
import type { Interpreter } from "../../../common/interpreter/Interpreter";
import { SchedulerState } from "../../../common/interpreter/SchedulerState";
import { Thread } from "../../../common/interpreter/Thread";
import { ThreadState } from "../../../common/interpreter/ThreadState";
import { LibraryDeclarations } from "../../module/libraries/DeclareType";
import { NonPrimitiveType } from "../../types/NonPrimitiveType";
import { ObjectClass } from "../system/javalang/ObjectClassStringClass";
import { RuntimeExceptionClass } from "../system/javalang/RuntimeException";
import { ausGrafik, BUEHNE_BREITE, BUEHNE_HOEHE, buehnenbildAus, schluessel, zurGrafik } from "./GsgBuehnenLogik";
import { GSG_BUEHNENBILD_NAME, GSG_BUEHNENBILDER } from "./GsgFigurenLibrary";
import { MouseClass } from "./MouseClass";
import { SpriteClass } from "./SpriteClass";
import type { WorldClass } from "./WorldClass";

/** was die Bühne von einer Figur braucht (FigurClass) */
export interface BuehnenFigur {
    figBuehne: BuehneClass;
    figEbene: number;
    figGeloescht: boolean;
    figIstKlon: boolean;
    figName(): string;
    figKlonen(t: Thread, callback: CallbackParameter): void;
}

const STORE_KEY = "BuehneClass";

/** Bildtakt wie in Scratch: 30 Bilder je Sekunde */
export const BILD_MS = 1000 / 30;

// Ende jeder Schleifenrunde in Figuren und Bühnen (StatementCodeGenerator.gsgRunde)
Thread.gsgSchleifenRunde = (t: Thread) => BuehneClass.von(t.scheduler.interpreter)?.schleifenRunde(t);

/**
 * Blöckly (Paket 18c): die Bühne wie in Scratch – 480 × 360 Punkte, Mittelpunkt (0 | 0), y nach oben. Sie zeigt
 * ein Bühnenbild, kennt alle Figuren und kann eigene Programmteile haben (class Spiel extends Buehne { @BeimStart … }).
 * Jedes Programm hat eine Bühne; erzeugt das Programm keine, entsteht sie mit der ersten Figur.
 *
 * In der IDE zeichnet sie in eine Welt mit 480 × 360 Punkten (Ursprung oben links); umgerechnet wird in
 * GsgBuehnenLogik. Ohne Grafik (Tests) rechnet sie genauso, zeichnet aber nichts.
 */
export class BuehneClass extends ObjectClass implements PartOwner {
    static __javaDeclarations: LibraryDeclarations = [
        { type: "declaration", signature: "class Buehne extends Object", comment: "Die Bühne (wie in Scratch): 480 × 360 Punkte, Mittelpunkt (0 | 0), y nach oben. Sie zeigt ein Bühnenbild und kann eigene Programmteile haben (@BeimStart, @WennTaste, @WennNachricht, @WennAngeklickt). Jedes Programm hat genau eine Bühne." },
        { type: "method", signature: "Buehne()", java: BuehneClass.prototype._cj$_constructor_$Buehne$, comment: "Erzeugt die Bühne ohne Bühnenbild (weiß)." },
        { type: "method", signature: "Buehne(string buehnenbild)", java: BuehneClass.prototype._cj$_constructor_$Buehne$string, comment: "Erzeugt die Bühne mit diesem Bühnenbild: Wiese, Wald, Stadt, Schulhof, Weltraum oder Unterwasser." },

        { type: "method", signature: "void wechsleZuBuehnenbild(string name)", native: BuehneClass.prototype._wechsleZuBuehnenbild, comment: "Zeigt dieses Bühnenbild: Wiese, Wald, Stadt, Schulhof, Weltraum oder Unterwasser." },
        { type: "method", signature: "void naechstesBuehnenbild()", native: BuehneClass.prototype._naechstesBuehnenbild, comment: "Zeigt das nächste Bühnenbild (nach Unterwasser wieder die Wiese)." },
        { type: "method", signature: "string buehnenbildName()", native: BuehneClass.prototype._buehnenbildName, comment: "Name des Bühnenbildes, z. B. \"Schulhof\" (ohne Bühnenbild: \"\")." },

        { type: "method", signature: "void warte(double sekunden)", java: BuehneClass.prototype._mj$warte$void$double, comment: "Wartet so viele Sekunden." },
        { type: "method", signature: "double mausX()", native: BuehneClass.prototype._mausX, comment: "x-Koordinate des Mauszeigers auf der Bühne." },
        { type: "method", signature: "double mausY()", native: BuehneClass.prototype._mausY, comment: "y-Koordinate des Mauszeigers auf der Bühne." },
        { type: "method", signature: "boolean mausGedrueckt()", native: BuehneClass.prototype._mausGedrueckt, comment: "Wahr, solange die Maustaste über der Bühne gedrückt ist." },
        { type: "method", signature: "boolean tasteGedrueckt(string taste)", native: BuehneClass.prototype._tasteGedrueckt, comment: "Wahr, solange diese Taste gedrückt ist, z. B. \"ArrowUp\", \" \" (Leertaste) oder \"a\"." },
        { type: "method", signature: "double stoppuhr()", native: BuehneClass.prototype._stoppuhr, comment: "Sekunden seit dem Start der Bühne oder seit setzeStoppuhrZurueck()." },
        { type: "method", signature: "void setzeStoppuhrZurueck()", native: BuehneClass.prototype._setzeStoppuhrZurueck, comment: "Setzt die Stoppuhr auf 0." },
        { type: "method", signature: "void erzeugeKlonVon(string figur)", java: BuehneClass.prototype._mj$erzeugeKlonVon$void$string, comment: "Erzeugt einen Klon dieser Figur (Name ihrer Klasse, z. B. \"Waschbaer\")." },
        { type: "method", signature: "void stoppeAlles()", java: BuehneClass.prototype._mj$stoppeAlles$void$, comment: "Beendet das ganze Programm (wie der Stopp-Knopf)." },
    ];

    static type: NonPrimitiveType;

    interpreter!: Interpreter;
    /** von einer Figur erzeugt (das Programm hat keine eigene Bühne) – eine eigene Bühne darf sie noch ablösen */
    automatisch = false;
    figuren: BuehnenFigur[] = [];
    bildIndex = -1;
    world?: WorldClass;
    bildSprite?: SpriteClass;
    private stoppuhrStart = performance.now();
    private vorne = 0;
    private hinten = 0;
    private aufraeumen?: () => void;
    /** seit dem letzten Bild hat sich etwas Sichtbares verändert (Figur bewegt, Kostüm, Sprechblase, Bühnenbild …) */
    bildAngefordert = false;
    private bildWartende: Thread[] = [];
    private bildTimer?: ReturnType<typeof setTimeout>;
    private letztesBild = 0;
    /** letzter Takt des Interpreters (in der IDE alle 33 ms); ohne Takt (Tests) zählt ein eigener Timer */
    private letzterTakt = -Infinity;

    /** Bühne des laufenden Programms */
    static von(interpreter: Interpreter): BuehneClass | undefined {
        return interpreter.retrieveObject(STORE_KEY);
    }

    /** Bühne des laufenden Programms; gibt es noch keine, entsteht eine (ohne Bühnenbild) */
    static sicher(t: Thread, callback: (buehne: BuehneClass) => void) {
        const vorhanden = BuehneClass.von(t.scheduler.interpreter);
        if (vorhanden) {
            callback(vorhanden);
            return;
        }
        const buehne = new BuehneClass();
        buehne.automatisch = true;
        buehne._cj$_constructor_$Buehne$string(t, () => {
            t.s.pop();
            callback(buehne);
        }, "");
    }

    _cj$_constructor_$Buehne$(t: Thread, callback: CallbackParameter) {
        this._cj$_constructor_$Buehne$string(t, callback, "");
    }

    _cj$_constructor_$Buehne$string(t: Thread, callback: CallbackParameter, name: string) {
        t.s.push(this);
        const interpreter = t.scheduler.interpreter;
        this.interpreter = interpreter;
        const vorher = BuehneClass.von(interpreter);
        if (vorher && !vorher.automatisch) throw new RuntimeExceptionClass("Es gibt schon eine Bühne. Ein Programm hat genau eine Bühne.");
        const bild = text(name) === "" ? undefined : buehnenbildAus(text(name));
        if (text(name) !== "" && !bild) throw new RuntimeExceptionClass(unbekanntesBild(text(name)));
        this.bildIndex = bild?.index ?? -1;

        if (vorher) {
            // die eigene Bühne löst die automatisch entstandene ab: Figuren, Welt und Bild gehen über
            this.figuren = vorher.figuren;
            for (const f of this.figuren) f.figBuehne = this;
            this.world = vorher.world;
            this.bildSprite = vorher.bildSprite;
            this.vorne = vorher.vorne;
            this.hinten = vorher.hinten;
            vorher.naechstesBild();
            vorher.aufraeumen?.();
            if (this.bildIndex < 0) this.bildIndex = vorher.bildIndex;
        }
        interpreter.storeObject(STORE_KEY, this);
        const takt = () => {
            this.letzterTakt = performance.now();
            this.naechstesBild();
        };
        interpreter.gsgTakt = takt;
        const aufraeumen = () => {
            if (this.bildTimer !== undefined) clearTimeout(this.bildTimer);
            this.bildTimer = undefined;
            this.bildWartende = [];
            if (interpreter.gsgTakt === takt) interpreter.gsgTakt = undefined;
            if (BuehneClass.von(interpreter) === this) interpreter.deleteObject(STORE_KEY);
            interpreter.eventManager.off(aufraeumen);
        };
        this.aufraeumen = aufraeumen;
        interpreter.eventManager.on("stop", aufraeumen);
        interpreter.eventManager.on("resetRuntime", aufraeumen);

        if (!interpreter.graphicsManager || this.world) {
            this.zeigeBild();
            if (callback) callback();
            return;
        }
        // Welt mit 480 × 360 Punkten, weiß; dahinter das Bühnenbild (immer da, ohne Bühnenbild unsichtbar)
        new t.classes["World"]()._cj$_constructor_$World$int$int(t, () => {
            this.world = t.s.pop();
            this.world!._setBackgroundColor("#ffffff");
            const sprite = new SpriteClass();
            const mitte = zurGrafik(0, 0);
            sprite._cj$_constructor_$Sprite$double$double$SpriteLibrary$int(t, () => {
                t.s.pop();
                this.bildSprite = sprite;
                this.zeigeBild();
                if (callback) callback();
            }, mitte.x, mitte.y, GSG_BUEHNENBILD_NAME, Math.max(0, this.bildIndex));
        }, BUEHNE_BREITE, BUEHNE_HOEHE);
    }

    /** nach dem Konstruktor einer eigenen Bühnenklasse: Programmteile anmelden */
    _registerListeners(t: Thread) {
        t.scheduler.interpreter.parts?.registerObject(this, klassenVon(this, BuehneClass));
    }

    // —— Bildtakt (wie Scratch) ——

    /** etwas Sichtbares hat sich verändert: Schleifen warten am Ende ihrer Runde aufs nächste Bild */
    bildAnfordern() {
        this.bildAngefordert = true;
    }

    /**
     * Ende einer Schleifenrunde: Hat sich seit dem letzten Bild etwas verändert, wartet der Thread aufs
     * nächste Bild (so läuft „wiederhole fortlaufend“ mit „gehe 10 Schritte“ 30-mal je Sekunde, nicht millionenfach).
     * Sonst geht es ohne Pause weiter – reine Rechenschleifen bleiben schnell.
     */
    schleifenRunde(t: Thread) {
        if (!this.bildAngefordert) return;
        t.scheduler.suspendThread(t);
        t.state = ThreadState.timedWaiting;
        this.bildWartende.push(t);
        // in der IDE gibt der Takt des Interpreters das nächste Bild frei; ohne Takt (Tests) ein eigener Timer
        if (this.bildTimer === undefined && performance.now() - this.letzterTakt > 3 * BILD_MS) {
            const warten = Math.max(0, this.letztesBild + BILD_MS - performance.now());
            this.bildTimer = setTimeout(() => this.naechstesBild(), warten);
        }
    }

    /** nächstes Bild: alle wartenden Schleifen laufen ihre nächste Runde */
    naechstesBild() {
        if (this.bildTimer !== undefined) clearTimeout(this.bildTimer);
        this.bildTimer = undefined;
        this.letztesBild = performance.now();
        this.bildAngefordert = false;
        const wartende = this.bildWartende;
        this.bildWartende = [];
        for (const t of wartende) t.scheduler.restoreThread(t);
    }

    private zeigeBild() {
        this.bildAnfordern();
        const s = this.bildSprite;
        if (!s || s.isDestroyed) return;
        if (this.bildIndex >= 0) s.setTexture(GSG_BUEHNENBILD_NAME, this.bildIndex);
        s.container.visible = this.bildIndex >= 0;
        s._sendToBack();
    }

    _wechsleZuBuehnenbild(name: string) {
        const bild = buehnenbildAus(text(name));
        if (!bild) throw new RuntimeExceptionClass(unbekanntesBild(text(name)));
        this.bildIndex = bild.index;
        this.zeigeBild();
    }

    _naechstesBuehnenbild() {
        this.bildIndex = (this.bildIndex + 1) % GSG_BUEHNENBILDER.length;
        this.zeigeBild();
    }

    _buehnenbildName(): string {
        return GSG_BUEHNENBILDER[this.bildIndex]?.titel ?? "";
    }

    // —— Figuren ——

    figurHinzu(figur: BuehnenFigur) {
        this.figuren.push(figur);
        figur.figEbene = ++this.vorne;
    }

    figurWeg(figur: BuehnenFigur) {
        const i = this.figuren.indexOf(figur);
        if (i >= 0) this.figuren.splice(i, 1);
    }

    nachVorne(figur: BuehnenFigur) {
        figur.figEbene = ++this.vorne;
        this.bildAnfordern();
    }

    nachHinten(figur: BuehnenFigur) {
        figur.figEbene = --this.hinten;
        this.bildAnfordern();
        if (this.bildSprite && !this.bildSprite.isDestroyed) this.bildSprite._sendToBack();
    }

    anzahlKlone(): number {
        return this.figuren.filter((f) => f.figIstKlon).length;
    }

    /** Figuren mit diesem Namen (Name der Klasse oder der Bibliotheksfigur) */
    figurenMitNamen(name: string): BuehnenFigur[] {
        const k = schluessel(name);
        return this.figuren.filter((f) => !f.figGeloescht && schluessel(f.figName()) === k);
    }

    klonVon(t: Thread, callback: CallbackParameter, name: string) {
        const original = this.figurenMitNamen(name).find((f) => !f.figIstKlon) ?? this.figurenMitNamen(name)[0];
        if (!original) throw new RuntimeExceptionClass(`Eine Figur „${name}“ gibt es auf der Bühne nicht.`);
        original.figKlonen(t, callback);
    }

    // —— für alle (Figuren und Bühne) ——

    static warte(t: Thread, sekunden: number) {
        t.scheduler.suspendThread(t);
        t.state = ThreadState.timedWaiting;
        setTimeout(() => t.scheduler.restoreThread(t), Math.max(0, sekunden) * 1000);
    }

    static maus(): { x: number; y: number } {
        return ausGrafik(MouseClass.state.x, MouseClass.state.y);
    }

    static stoppeAlles(t: Thread) {
        const scheduler = t.scheduler;
        try {
            scheduler.interpreter.stop(false);
        } catch {
            // ohne IDE (Tests): alle Threads beenden
            for (const thread of scheduler.getAllThreads()) scheduler.killThread(thread);
        }
        if (scheduler.state !== SchedulerState.stopped) for (const thread of scheduler.getAllThreads()) scheduler.killThread(thread);
        scheduler.killThread(t);
    }

    _mj$warte$void$double(t: Thread, callback: CallbackParameter, sekunden: number) {
        BuehneClass.warte(t, sekunden);
        if (callback) callback();
    }

    _mausX(): number {
        return BuehneClass.maus().x;
    }

    _mausY(): number {
        return BuehneClass.maus().y;
    }

    _mausGedrueckt(): boolean {
        return MouseClass.state.down;
    }

    _tasteGedrueckt(taste: string): boolean {
        return !!this.interpreter?.keyboardManager?.isPressed?.(text(taste));
    }

    _stoppuhr(): number {
        return (performance.now() - this.stoppuhrStart) / 1000;
    }

    _setzeStoppuhrZurueck() {
        this.stoppuhrStart = performance.now();
    }

    _mj$erzeugeKlonVon$void$string(t: Thread, callback: CallbackParameter, name: string) {
        this.klonVon(t, callback, text(name));
    }

    _mj$stoppeAlles$void$(t: Thread, callback: CallbackParameter) {
        BuehneClass.stoppeAlles(t);
    }

    // —— Programmteile ——

    gsgPartsHit(): boolean {
        return false;
    }

    gsgPartsOrder(): number {
        return -Infinity;
    }

    gsgPartsIsStage(): boolean {
        return true;
    }
}

/** Java-Klassen eines Objekts von seiner Klasse bis vor die Bibliotheksklasse (für Programmteile) */
export function klassenVon(objekt: object, bis: Function): { getOwnMethods(): unknown[] }[] {
    const result: { getOwnMethods(): unknown[] }[] = [];
    for (let c = objekt.constructor as (Function & { type?: { getOwnMethods?(): unknown[] } }) | undefined; c && c !== bis; c = Object.getPrototypeOf(c)) {
        if (typeof c.type?.getOwnMethods === "function") result.push(c.type as { getOwnMethods(): unknown[] });
    }
    return result;
}

export function text(value: unknown): string {
    if (typeof value === "string") return value;
    const inner = (value as { value?: unknown } | null)?.value;
    return typeof inner === "string" ? inner : String(value ?? "");
}

function unbekanntesBild(name: string): string {
    return `Ein Bühnenbild „${name}“ gibt es nicht. Bühnenbilder: ${GSG_BUEHNENBILDER.map((b) => b.titel).join(", ")}.`;
}
