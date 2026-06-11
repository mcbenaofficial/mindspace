import { useEffect, useState } from "react";

// Module-level singleton — one set of DOM listeners shared across all subscribers
const subs = new Set<(v: boolean) => void>();
let active = false;

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if (e.metaKey && !active) { active = true; subs.forEach(fn => fn(true)); }
  }, { passive: true });
  window.addEventListener("keyup", (e) => {
    if (!e.metaKey && active) { active = false; subs.forEach(fn => fn(false)); }
  }, { passive: true });
  // Reset if window loses focus (e.g. Cmd+Tab)
  window.addEventListener("blur", () => {
    if (active) { active = false; subs.forEach(fn => fn(false)); }
  }, { passive: true });
}

export function useCmdKey(): boolean {
  const [val, setVal] = useState(false);
  useEffect(() => {
    subs.add(setVal);
    return () => { subs.delete(setVal); };
  }, []);
  return val;
}
