import { test, expect } from "@playwright/test";
import { ObjectId } from "mongodb";
import { createPublishedPlace } from "./helpers/db";
import { skipOnboarding } from "./helpers/onboarding";

test("anonymous search finds a seeded published place", async ({ page }) => {
  const place = await createPublishedPlace({
    name: "Playwright Search Bakery",
    createdBy: new ObjectId(),
  });

  await skipOnboarding(page);
  await page.goto("/");
  await page.getByLabel("Search places").fill(place.name);
  await expect(page.getByRole("heading", { name: place.name })).toBeVisible({ timeout: 10_000 });
});
