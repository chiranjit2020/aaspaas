import { test, expect } from "@playwright/test";
import { markEmailVerified } from "./helpers/db";
import { skipOnboarding } from "./helpers/onboarding";
import { CATEGORY_NAME } from "./fixtures";

test("register, verify, log in, submit a place, see it pending", async ({ page }) => {
  const unique = Date.now();
  const username = `e2euser${unique}`;
  const email = `e2e-${unique}@example.com`;
  const password = "E2ePlaywright#1";
  const placeName = `Playwright Test Shop ${unique}`;

  await skipOnboarding(page);
  await page.goto("/register");
  await page.getByLabel("Display name").fill("Playwright Tester");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();

  // Bypasses the real email link (dev/test builds log it to the server
  // console instead of sending it — impractical to scrape across the
  // Playwright/webServer process boundary, see README's "End-to-end tests").
  await markEmailVerified(email);

  await page.goto("/login");
  await page.getByLabel("Username or email").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("/");

  await page.goto("/add-place");
  await page.getByLabel("Place name").fill(placeName);
  await page.getByLabel("Category").click();
  await page.getByRole("option", { name: CATEGORY_NAME }).click();
  await page.getByLabel("District").fill("North 24 Parganas");
  await page.getByLabel("Locality").fill("Habra");
  await page.getByLabel("PIN code").fill("743263");
  await page.getByText("Enter coordinates manually instead").click();
  await page.getByLabel("Latitude").fill("22.84");
  await page.getByLabel("Longitude").fill("88.69");
  await page.getByRole("button", { name: "Submit place" }).click();

  const row = page.locator("li").filter({ hasText: placeName });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row.getByText("Pending review")).toBeVisible();
});
