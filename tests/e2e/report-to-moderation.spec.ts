import { test, expect } from "@playwright/test";
import { ObjectId } from "mongodb";
import { createPublishedPlace, createVerifiedUser } from "./helpers/db";
import { skipOnboarding } from "./helpers/onboarding";
import { MODERATOR } from "./fixtures";

test("filing a report surfaces it in the moderator's queue", async ({ browser }) => {
  const unique = Date.now();
  const reporterUsername = `e2ereporter${unique}`;
  const reporterEmail = `e2e-reporter-${unique}@example.com`;
  const reporterPassword = "E2ePlaywright#2";
  const placeName = `Playwright Report Target ${unique}`;

  await createVerifiedUser({ username: reporterUsername, email: reporterEmail, password: reporterPassword });
  const place = await createPublishedPlace({ name: placeName, createdBy: new ObjectId() });

  // Separate browser contexts so the reporter's and moderator's sessions
  // never share cookies — closer to two real people than logging in/out
  // in one context.
  const reporterContext = await browser.newContext();
  await skipOnboarding(reporterContext);
  const reporterPage = await reporterContext.newPage();
  await reporterPage.goto("/login");
  await reporterPage.getByLabel("Username or email").fill(reporterUsername);
  await reporterPage.getByLabel("Password", { exact: true }).fill(reporterPassword);
  await reporterPage.getByRole("button", { name: "Log in" }).click();
  await reporterPage.waitForURL("/");

  await reporterPage.goto(`/places/${place.slug}`);
  await reporterPage.getByRole("button", { name: "Report" }).click();
  await reporterPage.getByLabel("Reason").click();
  await reporterPage.getByRole("option", { name: "Some information is wrong" }).click();
  await reporterPage.getByRole("button", { name: "Submit report" }).click();
  await expect(reporterPage.getByText("Thanks — your report has been filed.")).toBeVisible();
  await reporterContext.close();

  const moderatorContext = await browser.newContext();
  await skipOnboarding(moderatorContext);
  const moderatorPage = await moderatorContext.newPage();
  await moderatorPage.goto("/login");
  await moderatorPage.getByLabel("Username or email").fill(MODERATOR.username);
  await moderatorPage.getByLabel("Password", { exact: true }).fill(MODERATOR.password);
  await moderatorPage.getByRole("button", { name: "Log in" }).click();
  await moderatorPage.waitForURL("/");

  await moderatorPage.goto("/moderation");
  await moderatorPage.getByRole("tab", { name: /Reports/ }).click();
  await expect(moderatorPage.getByRole("link", { name: placeName })).toBeVisible({ timeout: 10_000 });
  await moderatorContext.close();
});
