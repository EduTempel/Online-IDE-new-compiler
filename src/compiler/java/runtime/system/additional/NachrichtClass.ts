import { Thread } from "../../../../common/interpreter/Thread.ts";
import { ThreadState } from "../../../../common/interpreter/ThreadState.ts";
import { LibraryDeclarations } from "../../../module/libraries/DeclareType.ts";
import { NonPrimitiveType } from "../../../types/NonPrimitiveType.ts";
import { ObjectClass, StringClass } from "../javalang/ObjectClassStringClass.ts";
import { setJavaStringFactory } from "../../../../common/interpreter/GsgParts.ts";

// Paket 19e: Nachrichten mit Text – Programmteile mit String-Parameter bekommen einen Java-String
setJavaStringFactory((s) => new StringClass(s));

/**
 * GSG (Blockmodus, Paket 15c): Nachrichten wie in Scratch. „sende“ startet alle Programmteile mit
 * @WennNachricht("…") in eigenen Threads (siehe GsgParts); „sendeUndWarte“ wartet, bis sie fertig sind.
 *
 *     Nachricht.sende("Tor");
 *
 *     @WennNachricht("Tor")
 *     void jubeln() { … }
 */
export class NachrichtClass extends ObjectClass {
    static __javaDeclarations: LibraryDeclarations = [
        { type: "declaration", signature: "class Nachricht extends Object", comment: "Nachrichten an die Programmteile mit @WennNachricht(\"…\") (wie in Scratch)." },
        { type: "method", signature: "static void sende(String nachricht)", java: NachrichtClass._sende, comment: "Startet alle Programmteile mit @WennNachricht(\"nachricht\"). Das Programm läuft sofort weiter. Läuft ein solcher Programmteil noch, startet er nicht neu." },
        { type: "method", signature: "static void sendeUndWarte(String nachricht)", java: NachrichtClass._sendeUndWarte, comment: "Startet alle Programmteile mit @WennNachricht(\"nachricht\") und wartet, bis sie alle fertig sind." },
        // Paket 19e: Nachrichten mit Daten – der Programmteil bekommt sie als Parameter: @WennNachricht("Treffer") void beiTreffer(double wert)
        { type: "method", signature: "static void sende(String nachricht, double wert)", java: NachrichtClass._sendeMit, comment: "Wie sende(nachricht), dazu eine Zahl: Programmteile mit einem Parameter (z. B. double wert) bekommen sie." },
        { type: "method", signature: "static void sende(String nachricht, String wert)", java: NachrichtClass._sendeMit, comment: "Wie sende(nachricht), dazu ein Text: Programmteile mit einem Parameter (z. B. String wert) bekommen ihn." },
        { type: "method", signature: "static void sendeUndWarte(String nachricht, double wert)", java: NachrichtClass._sendeUndWarteMit, comment: "Wie sendeUndWarte(nachricht), dazu eine Zahl für die Programmteile." },
        { type: "method", signature: "static void sendeUndWarte(String nachricht, String wert)", java: NachrichtClass._sendeUndWarteMit, comment: "Wie sendeUndWarte(nachricht), dazu ein Text für die Programmteile." },
    ];

    static type: NonPrimitiveType;

    static _sende(t: Thread, message: unknown) {
        t.scheduler.interpreter.parts?.onMessage(text(message));
    }

    static _sendeMit(t: Thread, message: unknown, data: unknown) {
        t.scheduler.interpreter.parts?.onMessage(text(message), data);
    }

    static _sendeUndWarteMit(t: Thread, message: unknown, data: unknown) {
        NachrichtClass._sendeUndWarte(t, message, data);
    }

    static _sendeUndWarte(t: Thread, message: unknown, data?: unknown) {
        const started = t.scheduler.interpreter.parts?.onMessage(text(message), data) ?? [];
        // auf sich selbst wartet ein Programmteil nicht (er schickt seine eigene Nachricht)
        const open = started.filter((th) => th !== t && th.state !== ThreadState.terminated && th.state !== ThreadState.terminatedWithException);
        if (open.length === 0) return;
        let remaining = open.length;
        t.scheduler.suspendThread(t);
        t.state = ThreadState.timedWaiting;
        for (const th of open) {
            const before = th.callbackAfterTerminated;
            th.callbackAfterTerminated = () => {
                before?.();
                if (--remaining === 0) t.scheduler.restoreThread(t);
            };
        }
    }
}

function text(message: unknown): string {
    if (typeof message === "string") return message;
    const value = (message as { value?: unknown } | null)?.value;
    return typeof value === "string" ? value : String(message ?? "");
}
