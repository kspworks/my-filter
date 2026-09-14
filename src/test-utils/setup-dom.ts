import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, vi } from "vitest";
import { pathnameRef, routerMock } from "~/test-utils/stubs/next-navigation";

/**
 * jsdom implements none of the Pointer Events surface Radix relies on, and no
 * observers. Without these, opening any Radix overlay throws before a single
 * assertion runs.
 */
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

globalThis.IntersectionObserver ??= class {
  root = null;
  rootMargin = "";
  thresholds = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
} as unknown as typeof IntersectionObserver;

// next-themes reads this on mount, and `ui/sonner` reads next-themes.
globalThis.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => false,
})) as unknown as typeof matchMedia;

afterEach(() => {
  // Explicit because this project runs without `globals`, so RTL's own
  // auto-cleanup never registers itself.
  cleanup();
  // sonner's store is module-global and would otherwise bleed between tests.
  toast.dismiss();
  // next-themes persists the choice here.
  localStorage.clear();
  pathnameRef.current = "/";
  for (const fn of Object.values(routerMock)) fn.mockClear();
  vi.clearAllMocks();
});
