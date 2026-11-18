import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** The shared demo session (auth.setup.ts) is already signed in. */
async function signIn(page: Page) {
  await page.goto("/n/northstar");
}

test("the landing page says what AGINT does", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Use agents to discover agents.");
  await expect(page.getByRole("heading", { name: "Connect. Debrief. Corroborate." })).toBeVisible();
});

test("a person sees the Northstar picture: map, sources, leads, debriefs, dossier", async ({ page }) => {
  await signIn(page);
  const nav = page.getByRole("navigation", { name: "Network" });
  await expect(nav).toBeVisible();

  await nav.getByRole("link", { name: /^Sources/ }).click();
  await page.waitForURL((url) => url.pathname.endsWith("/sources"));
  await expect(page.getByRole("link", { name: "release-assistant" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "maya-cursor" }).first()).toBeVisible();

  await nav.getByRole("link", { name: /^Leads/ }).click();
  await page.waitForURL((url) => url.pathname.endsWith("/leads"));
  await expect(page.getByText("notes-sync").first()).toBeVisible();

  await nav.getByRole("link", { name: /^Debriefs/ }).click();
  await page.waitForURL((url) => url.pathname.endsWith("/activity"));
  await expect(page.getByText(/maya-cursor connected/).first()).toBeVisible();

  await nav.getByRole("link", { name: /^Leads/ }).click();
  await page.getByRole("link", { name: "notes-sync" }).first().click();
  await page.waitForURL((url) => url.pathname.includes("/e/"));
  await expect(page.getByRole("heading", { level: 1, name: /notes-sync/ })).toBeVisible();
  await expect(page.getByText("support-summarizer").first()).toBeVisible();
});

test("pages pass axe", async ({ page }) => {
  await signIn(page);
  for (const path of ["/n/northstar", "/n/northstar/sources", "/n/northstar/leads", "/n/northstar/activity", "/n/northstar/connect"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations.map((violation) => `${path}: ${violation.id}`)).toEqual([]);
  }
});

test("issuing a key shows it once, with setup for the chosen client", async ({ page }) => {
  await signIn(page);
  await page.goto("/n/northstar/connect");
  await page.getByLabel("Key label").fill(`e2e ${Date.now()}`);
  await page.getByRole("button", { name: "Issue intake key" }).click();
  await expect(page.getByText(/copy it now/)).toBeVisible();
  await expect(page.getByText(/claude mcp add --transport http agint .*agt_/)).toBeVisible();
});

test("the map focuses a node and shows who reported it", async ({ page }) => {
  await signIn(page);
  const node = page.locator('[data-node][data-kind="mcp_server"]').filter({ hasText: "notes-sync" });
  await expect(node).toHaveAttribute("data-state", "corroborated");
  await node.click();
  await expect(page.getByRole("heading", { name: "notes-sync" }).first()).toBeVisible();
  await expect(page.getByText("Reported by", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "Table" }).click();
  await expect(page.getByRole("table").first()).toContainText("release-assistant");
});
