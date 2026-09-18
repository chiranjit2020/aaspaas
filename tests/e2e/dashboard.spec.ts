import { test, expect } from "@playwright/test";
import { createVerifiedUser } from "./helpers/db";
import { skipOnboarding } from "./helpers/onboarding";

test("anonymous visit to /dashboard redirects to login", async ({ page }) => {
  await skipOnboarding(page);
  await page.goto("/dashboard");
  await page.waitForURL(/\/login\?next=\/dashboard/);
});

test("a logged-in contributor sees their reputation level and stats", async ({ page }) => {
  const unique = Date.now();
  const username = `e2edash${unique}`;
  const email = `e2e-dash-${unique}@example.com`;
  const password = "E2ePlaywright#3";

  await createVerifiedUser({ username, email, password });
  const { getUsersCollection } = await import("@/lib/db/models/user");
  const users = await getUsersCollection();
  await users.updateOne(
    { username },
    { $set: { "stats.placesAdded": 3, "stats.usefulVotesReceived": 5 } },
  );

  await skipOnboarding(page);
  await page.goto("/login");
  await page.getByLabel("Username or email").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("/");

  await page.goto("/dashboard");
  await expect(page.getByText("Newcomer")).toBeVisible();

  const placesAddedTile = page.locator("text=Places added").locator("..");
  await expect(placesAddedTile.getByText("3", { exact: true })).toBeVisible();

  const usefulVotesTile = page.locator("text=Useful votes received").locator("..");
  await expect(usefulVotesTile.getByText("5", { exact: true })).toBeVisible();
});
