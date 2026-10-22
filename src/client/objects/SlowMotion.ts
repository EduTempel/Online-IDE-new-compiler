import type { Main } from "../main/Main";

/**
 * Zeitlupe (Paket 9): das Programm läuft so langsam, dass man der markierten Zeile bzw. dem leuchtenden
 * Block folgen kann (der Programmzeiger erscheint unter 20 Schritten pro Sekunde). Ein zweiter Klick
 * stellt die vorige Geschwindigkeit wieder her.
 */

export const SLOW_STEPS_PER_SECOND = 3;

let savedSpeed: number | "max" | undefined;
const listeners = new Set<() => void>();

export function isSlowMotion(main: Main): boolean {
    const i = main.getInterpreter?.();
    return !!i && !i.isMaxSpeed && (i.stepsPerSecondGoal ?? 1e8) <= SLOW_STEPS_PER_SECOND + 0.5;
}

export function toggleSlowMotion(main: Main) {
    const speed = main.programControlButtons?.speedControl;
    const interpreter = main.getInterpreter?.();
    if (!speed || !interpreter) return;
    if (isSlowMotion(main)) {
        speed.setSpeedInStepsPerSecond(savedSpeed ?? "max");
        savedSpeed = undefined;
    } else {
        savedSpeed = interpreter.isMaxSpeed ? "max" : interpreter.stepsPerSecondGoal ?? "max";
        speed.setSpeedInStepsPerSecond(SLOW_STEPS_PER_SECOND);
    }
    listeners.forEach((l) => l());
}

/** Knopf "🐢 Zeitlupe" (in der Blockansicht und im Reiter "Objekte") */
export function slowMotionButton(main: Main, className: string): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = className;
    b.textContent = "🐢 Zeitlupe";
    b.title = "Programm ganz langsam laufen lassen: die aktuelle Zeile bzw. der aktuelle Block leuchtet. Nochmal klicken: wieder schnell.";
    const update = () => {
        const on = isSlowMotion(main);
        b.classList.toggle("gsg-slow-on", on);
        b.setAttribute("aria-pressed", String(on));
    };
    b.addEventListener("click", () => toggleSlowMotion(main));
    listeners.add(update);
    setInterval(update, 1000);   // falls jemand den Geschwindigkeitsregler benutzt
    setTimeout(update, 0);
    return b;
}
