import { Thread } from "../../../../common/interpreter/Thread.ts";
import { ThreadState } from "../../../../common/interpreter/ThreadState.ts";
import { LibraryDeclarations } from "../../../module/libraries/DeclareType.ts";
import { NonPrimitiveType } from "../../../types/NonPrimitiveType.ts";
import { ObjectClass } from "../javalang/ObjectClassStringClass.ts";

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
    ];

    static type: NonPrimitiveType;

    static _sende(t: Thread, message: unknown) {
        t.scheduler.interpreter.parts?.onMessage(text(message));
    }

    static _sendeUndWarte(t: Thread, message: unknown) {
        const started = t.scheduler.interpreter.parts?.onMessage(text(message)) ?? [];
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
