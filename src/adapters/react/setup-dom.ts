import { Window } from "happy-dom";

const window = new Window({ url: "http://localhost" });

for (const key of Object.getOwnPropertyNames(window)) {
  if (key !== "undefined" && !(key in globalThis)) {
    try {
      Object.defineProperty(globalThis, key, {
        value: (window as unknown as Record<string, unknown>)[key],
        writable: true,
        configurable: true,
      });
    } catch {
      // Some properties can't be defined on globalThis
    }
  }
}

Object.defineProperty(globalThis, "window", { value: window, writable: true, configurable: true });
Object.defineProperty(globalThis, "document", {
  value: window.document,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: window.navigator,
  writable: true,
  configurable: true,
});
