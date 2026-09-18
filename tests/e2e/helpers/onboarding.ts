import type { BrowserContext, Page } from "@playwright/test";

const ONBOARDING_STORAGE_KEY = "aaspaas-onboarding-v1";

/**
 * The onboarding tour (src/components/onboarding/onboarding-tour.tsx) opens
 * as a focus-trapping dialog on first visit and marks the rest of the page
 * `aria-hidden` while it's open — invisible to accessibility-tree-based
 * locators (getByRole, getByLabel) exactly like a real screen reader would
 * see it, even though the underlying DOM is still there. Every spec must
 * call this before its first navigation.
 */
export async function skipOnboarding(target: Page | BrowserContext): Promise<void> {
  await target.addInitScript((key) => {
    window.localStorage.setItem(key, "1");
  }, ONBOARDING_STORAGE_KEY);
}
