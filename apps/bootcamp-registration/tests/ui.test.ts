import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import { chromium } from "playwright";
import type { Browser, Locator } from "playwright";
import type { AddressInfo } from "node:net";

async function assertCardActions(card: Locator): Promise<void> {
  const layout = await card.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    const name = node.querySelector(".participant-name")!.getBoundingClientRect();
    return {
      top: bounds.top, right: bounds.right, nameRight: name.right,
      buttons: [...node.querySelectorAll<HTMLButtonElement>(".participant-actions button")].map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          left: rect.left, right: rect.right, top: rect.top, width: rect.width, height: rect.height,
          text: button.textContent, label: button.getAttribute("aria-label"), title: button.title,
          decorativeIcon: button.querySelector('svg[aria-hidden="true"]') !== null,
        };
      }),
    };
  });
  assert.equal(layout.buttons.length, 2);
  assert.ok(layout.buttons[0].left >= layout.nameRight);
  assert.ok(Math.abs(layout.buttons[1].right - layout.right) <= 1);
  for (const button of layout.buttons) {
    assert.equal(button.text, "");
    assert.equal(button.title, button.label);
    assert.ok(button.decorativeIcon);
    assert.ok(button.top >= layout.top && button.top <= layout.top + 20);
    assert.ok(button.width >= 32 && button.height >= 32);
  }
}

test("MCP App UI lists all pages and handles CRUD through a host without the new list-all tool", { timeout: 60_000 }, async () => {
  const vite = await createServer({ configFile: false, server: { host: "127.0.0.1", port: 0 }, root: process.cwd() });
  await vite.listen();
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const page = await browser.newPage({ viewport: { width: 1200, height: 1100 } });
    const imageReferrers: Array<string | undefined> = [];
    await page.route("https://photos.fixture.test/**", async (route) => {
      imageReferrers.push(route.request().headers().referer);
      if (route.request().url().endsWith("/missing.png")) {
        await route.fulfill({ status: 404 });
      } else {
        await route.fulfill({
          contentType: "image/png",
          body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0uUAAAAASUVORK5CYII=", "base64"),
        });
      }
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => { errors.push(error.message); });
    const address = vite.httpServer?.address() as AddressInfo;
    await page.goto(`http://127.0.0.1:${address.port}/tests/host.html`);
    const frame = page.frameLocator("#app");
    await frame.getByText("Alex Example", { exact: true }).waitFor();
    await frame.getByText("Morgan Directory", { exact: true }).waitFor();
    const alexCard = frame.locator(".participant-card").filter({ hasText: "Alex Example" });
    const morganCard = frame.locator(".participant-card").filter({ hasText: "Morgan Directory" });
    await assertCardActions(alexCard);
    await alexCard.locator("img.avatar").waitFor();
    await page.waitForFunction(() => {
      const image = document.querySelector<HTMLIFrameElement>("#app")?.contentDocument?.querySelector<HTMLImageElement>("img.avatar");
      return image?.complete && image.naturalWidth > 0;
    });
    await morganCard.locator("span.avatar").getByText("MD", { exact: true }).waitFor();
    assert.equal(await alexCard.locator("img.avatar").getAttribute("referrerpolicy"), "no-referrer");
    assert.ok(imageReferrers.length >= 2);
    assert.ok(imageReferrers.every((value) => value === undefined));
    await page.evaluate(() => { window.registrationTest.pictureOrigins = []; });
    await frame.getByRole("button", { name: "Refresh", exact: true }).click();
    await alexCard.locator("span.avatar").getByText("AE", { exact: true }).waitFor();
    assert.equal(await alexCard.locator("img").count(), 0);
    await page.evaluate(() => { window.registrationTest.pictureOrigins = ["*"]; });
    await frame.getByRole("button", { name: "Refresh", exact: true }).click();
    await alexCard.locator("img.avatar").waitFor();
    await frame.getByLabel("Search name, email, company, role, or skill").fill("morgan");
    await frame.getByRole("button", { name: "Search", exact: true }).click();
    await page.waitForFunction(() => document.querySelector<HTMLIFrameElement>("#app")?.contentDocument?.getElementById("count")?.textContent === "1 loaded");
    assert.equal(await frame.getByText("Alex Example", { exact: true }).count(), 0);
    await frame.getByRole("button", { name: "List all participants", exact: true }).click();
    await frame.getByText("Alex Example", { exact: true }).waitFor();
    await frame.getByText("Morgan Directory", { exact: true }).waitFor();
    assert.equal(await frame.getByLabel("Search name, email, company, role, or skill").inputValue(), "");
    await page.evaluate(() => { window.registrationTest.repeatCursor = true; });
    await frame.getByRole("button", { name: "Refresh", exact: true }).click();
    await frame.getByRole("status").getByText(/repeated continuation URL/).waitFor();
    assert.equal(await frame.getByText("Alex Example", { exact: true }).count(), 1);
    assert.equal(await frame.getByText("Morgan Directory", { exact: true }).count(), 1);
    await page.evaluate(() => { window.registrationTest.repeatCursor = false; });
    await frame.getByRole("button", { name: "Refresh", exact: true }).click();
    await frame.getByRole("status").getByText("Registrations loaded from Dataverse.", { exact: true }).waitFor();
    await frame.getByLabel("First name *").fill("Jamie");
    await frame.getByLabel("Last name *").fill("Fixture");
    await frame.getByLabel("Email *").fill("jamie@example.com");
    await frame.getByLabel("Company", { exact: true }).fill("Test Company");
    await frame.getByLabel("Role", { exact: true }).fill("Developer");
    await frame.getByLabel("Cowork", { exact: true }).check();
    await frame.getByRole("button", { name: "Add participant", exact: true }).click();
    await frame.getByText("Jamie Fixture", { exact: true }).waitFor();
    await frame.getByRole("button", { name: "Edit Jamie Fixture", exact: true }).focus();
    await page.keyboard.press("Enter");
    await frame.getByLabel("Role", { exact: true }).fill("Organizer");
    await frame.getByRole("button", { name: "Save changes", exact: true }).click();
    await frame.getByText("Test Company / Organizer", { exact: true }).waitFor();
    await frame.getByLabel("Search name, email, company, role, or skill").fill("jamie");
    await frame.getByLabel("Search name, email, company, role, or skill").press("Enter");
    await page.waitForFunction(() => document.querySelector<HTMLIFrameElement>("#app")?.contentDocument?.getElementById("count")?.textContent === "1 loaded");
    assert.equal(await frame.getByText("Alex Example", { exact: true }).count(), 0);
    await frame.getByRole("button", { name: "Delete Jamie Fixture", exact: true }).click();
    await frame.getByRole("button", { name: "Keep participant", exact: true }).click();
    assert.equal(await frame.getByText("Jamie Fixture", { exact: true }).count(), 1);
    await page.evaluate(() => { window.registrationTest.conflictDelete = true; });
    await frame.getByRole("button", { name: "Delete Jamie Fixture", exact: true }).click();
    await frame.getByRole("button", { name: "Delete permanently", exact: true }).click();
    await frame.locator("#delete-error").getByText(/changed in another session/).waitFor();
    await frame.getByRole("button", { name: "Keep participant", exact: true }).click();
    await page.evaluate(() => { window.registrationTest.conflictDelete = false; });
    await frame.getByRole("button", { name: "Delete Jamie Fixture", exact: true }).click();
    await frame.getByRole("button", { name: "Delete permanently", exact: true }).click();
    await frame.getByText("No participants found.", { exact: true }).waitFor();
    await frame.getByLabel("Search name, email, company, role, or skill").fill("");
    await frame.getByRole("button", { name: "Search", exact: true }).click();
    await frame.getByText("Alex Example", { exact: true }).waitFor();
    await page.evaluate(() => { window.registrationTest.failNextList = true; });
    await frame.getByLabel("First name *").fill("Taylor");
    await frame.getByLabel("Last name *").fill("Fixture");
    await frame.getByLabel("Email *").fill("taylor@example.com");
    await frame.getByLabel("Email *").press("Enter");
    await frame.getByRole("status").getByText(/Participant saved.*Refresh failed/).waitFor();
    await frame.getByRole("button", { name: "Refresh", exact: true }).click();
    await frame.getByText("Taylor Fixture", { exact: true }).waitFor();
    await page.evaluate(() => { window.registrationTest.bridge.setHostContext({ theme: "dark" }); });
    await page.waitForFunction(() => document.querySelector<HTMLIFrameElement>("#app")?.contentDocument?.documentElement.dataset.theme === "dark");
    await page.locator("#app").evaluate((node) => { node.setAttribute("width", "375"); });
    await page.waitForFunction(() => {
      const doc = document.querySelector<HTMLIFrameElement>("#app")?.contentDocument;
      return doc && doc.documentElement.scrollWidth <= 375;
    });
    await assertCardActions(alexCard);
    await alexCard.locator(".participant-name").evaluate((node) => { node.textContent = "AlexWithAVeryLongUnbrokenFirstName Example"; });
    await assertCardActions(frame.locator(".participant-card").filter({ hasText: "AlexWithAVeryLongUnbrokenFirstName Example" }));
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); await vite.close(); }
});
