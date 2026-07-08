import { expect, test } from "@playwright/test";
import { captureBrowserDiagnostics } from "./diagnostics";

test("loads Solaris shell", async ({ page }) => {
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info());
  try {
    await page.goto("/");
    await expect(page).toHaveTitle(/Solaris/);
    await expect(page.locator("#graph")).toBeAttached();
  } finally {
    await assertCleanBrowser();
  }
});
