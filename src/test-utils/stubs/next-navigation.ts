import { vi } from "vitest";

/**
 * Aliased over `next/navigation` in the jsdom project.
 *
 * The higher-fidelity alternative is to mount Next's real `AppRouterContext`,
 * but that lives under `next/dist/**` and moves between majors — it would fail
 * during exactly the Next upgrade this suite exists to validate. Real routing is
 * covered by Playwright instead; here a stable stub is worth more than fidelity.
 */

export const routerMock = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
};

/** Mutable so a test can say which route it is pretending to be on. */
export const pathnameRef = { current: "/" };

export const useRouter = () => routerMock;
export const usePathname = () => pathnameRef.current;
export const useSearchParams = () => new URLSearchParams();
export const useParams = () => ({});
export const redirect = vi.fn();
export const notFound = vi.fn();
