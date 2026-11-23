import { useEffect, useRef } from "react";
import { isMacPlatform } from "./shortcuts";

export type HotkeyBinding = {
  /** Shortcut syntax, see `shortcuts.ts` ("c", "g h", "mod+k", "?"). */
  keys: string;
  handler: (event: KeyboardEvent) => void;
  /** Fire even while typing in an input/textarea. Default: only for `mod+` combos. */
  allowInInputs?: boolean;
  /** Skip without unbinding. Default true. */
  enabled?: boolean;
  /** Call preventDefault when matched. Default true. */
  preventDefault?: boolean;
  /** Fire while a modal dialog/drawer is open (plain keys and `mod+` combos). Default false. */
  allowInDialogs?: boolean;
};

function modalOpen(): boolean {
  return !!document.querySelector(
    "[role='dialog'][data-state='open'],[role='alertdialog'][data-state='open']",
  );
}

const SEQUENCE_MS = 1000;

/*
 * Every useHotkeys instance has its own listener, so a page binding "p" would
 * also fire on the second key of the layout's "g p". Instances share which
 * keydown started a sequence, and plain keys right after it are left to the
 * sequence (vim-style).
 */
const prefixEvents = new WeakSet<KeyboardEvent>();
let currentEvent: KeyboardEvent | null = null;
let previousEvent: KeyboardEvent | null = null;

function trackEvent(e: KeyboardEvent) {
  if (currentEvent === e) return;
  previousEvent = currentEvent;
  currentEvent = e;
}

function followsSequencePrefix(e: KeyboardEvent): boolean {
  const prev = previousEvent;
  return !!prev && prefixEvents.has(prev) && e.timeStamp - prev.timeStamp <= SEQUENCE_MS;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    return !["checkbox", "radio", "button", "submit", "reset", "range"].includes(type);
  }
  return !!target.closest("[role='textbox'],[contenteditable='true']");
}

function normalizeKey(key: string): string {
  const k = key.toLowerCase();
  if (k === "escape") return "esc";
  if (k === "return") return "enter";
  if (k === " ") return "space";
  return k;
}

type Combo = { mod: boolean; shift: boolean; alt: boolean; ctrl: boolean; key: string };

function parseCombo(step: string): Combo {
  const parts = step.toLowerCase().split("+");
  const key = normalizeKey(parts.pop() ?? "");
  return {
    mod: parts.includes("mod"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
    ctrl: parts.includes("ctrl"),
    key,
  };
}

function comboMatches(c: Combo, e: KeyboardEvent, mac: boolean): boolean {
  const key = normalizeKey(e.key);
  if (key !== c.key) return false;
  const modPressed = mac ? e.metaKey : e.ctrlKey;
  if (c.mod !== modPressed) return false;
  if (c.alt !== e.altKey) return false;
  if (!c.mod && c.ctrl !== e.ctrlKey) return false;
  if (mac && !c.mod && e.metaKey) return false;
  // Shift only matters for letters; "?" etc. are typed with shift.
  const isLetter = /^[a-z]$/.test(c.key);
  if (isLetter && c.shift !== e.shiftKey) return false;
  return true;
}

/**
 * Global keyboard shortcuts with sequence support ("g h"). Bindings can
 * change every render; the listener is attached once.
 *
 *   useHotkeys([
 *     { keys: "c", handler: () => openComposer() },
 *     { keys: "g h", handler: () => navigate(dash("home")) },
 *   ]);
 */
export function useHotkeys(bindings: HotkeyBinding[], options?: { enabled?: boolean }) {
  const ref = useRef(bindings);
  const enabledRef = useRef(options?.enabled ?? true);
  useEffect(() => {
    ref.current = bindings;
    enabledRef.current = options?.enabled ?? true;
  });

  useEffect(() => {
    const mac = isMacPlatform();
    let buffer: string[] = [];
    let last = 0;

    const onKeyDown = (e: KeyboardEvent) => {
      trackEvent(e);
      if (!enabledRef.current || e.isComposing || e.repeat) return;
      const active = ref.current.filter((b) => b.enabled !== false);
      if (active.length === 0) return;
      const typing = isTypingTarget(e.target);
      const inModal = modalOpen();

      // 1) Single-step combos with modifiers (mod+k) or explicit keys. Like
      // plain keys, they stay out of open dialogs unless allowed: ⌘K over a
      // blocking gate or the composer would stack UI on top of it.
      for (const b of active) {
        const steps = b.keys.trim().split(/\s+/);
        if (steps.length !== 1) continue;
        const combo = parseCombo(steps[0]!);
        const hasMod = combo.mod || combo.ctrl || combo.alt;
        if (!hasMod) continue;
        if (typing && !(b.allowInInputs ?? true)) continue;
        if (inModal && b.allowInDialogs !== true) continue;
        if (comboMatches(combo, e, mac)) {
          if (b.preventDefault !== false) e.preventDefault();
          buffer = [];
          b.handler(e);
          return;
        }
      }

      // 2) Plain keys and sequences. Never while typing unless allowed.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const token = normalizeKey(e.key);
      if (token === "shift" || token === "meta" || token === "control" || token === "alt") return;

      const now = Date.now();
      if (now - last > SEQUENCE_MS) buffer = [];
      last = now;
      buffer = [...buffer, token].slice(-2);

      const eligible = active.filter(
        (b) =>
          (!typing || b.allowInInputs === true) &&
          (!inModal || b.allowInDialogs === true),
      );

      if (buffer.length === 2) {
        const seq = buffer.join(" ");
        const hit = eligible.find((b) => b.keys.trim().toLowerCase() === seq);
        if (hit) {
          if (hit.preventDefault !== false) e.preventDefault();
          buffer = [];
          hit.handler(e);
          return;
        }
      }

      const isPrefix = eligible.some((b) =>
        b.keys.trim().toLowerCase().startsWith(`${token} `),
      );
      if (isPrefix) {
        buffer = [token];
        prefixEvents.add(e);
        return;
      }
      // Second key of another instance's sequence ("g p"): not a plain "p".
      if (followsSequencePrefix(e)) {
        buffer = [];
        return;
      }

      const single = eligible.find((b) => {
        const steps = b.keys.trim().split(/\s+/);
        if (steps.length !== 1) return false;
        const combo = parseCombo(steps[0]!);
        if (combo.mod || combo.ctrl || combo.alt) return false;
        return comboMatches(combo, e, mac);
      });
      buffer = [];
      if (single) {
        if (single.preventDefault !== false) e.preventDefault();
        single.handler(e);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
