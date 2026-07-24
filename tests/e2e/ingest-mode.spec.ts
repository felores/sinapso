import { expect, test } from "@playwright/test";
import { captureBrowserDiagnostics } from "./diagnostics";

test("Ingest accepts URLs, local paths, and browsed files", async ({
  page,
}) => {
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info());
  const sources: string[] = [];
  let uploadName = "";

  await page.addInitScript(() =>
    localStorage.setItem("sinapso-qmd-prompted", "1"),
  );
  await page.route("**/api/integrations", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    await route.fulfill({
      response,
      json: {
        ...body,
        tools: {
          ...(body.tools as Record<string, unknown>),
          markitdown: { installed: true, version: "0.1.5" },
        },
      },
    });
  });
  await page.route("**/api/intake", async (route) => {
    const source = (route.request().postDataJSON() as { url: string }).url;
    sources.push(source);
    await route.fulfill({
      json: {
        id: "inbox/imported-source.md",
        graphUpdated: false,
      },
    });
  });
  await page.route("**/api/ingest", async (route) => {
    const source = (route.request().postDataJSON() as { source: string })
      .source;
    sources.push(source);
    await route.fulfill({
      json: {
        id: "inbox/imported-source.md",
        graphUpdated: false,
      },
    });
  });
  await page.route("**/api/ingest-upload?*", async (route) => {
    uploadName = new URL(route.request().url()).searchParams.get("name") ?? "";
    await route.fulfill({
      json: {
        id: "inbox/local-report.md",
        graphUpdated: false,
      },
    });
  });
  await page.route("**/api/inbox", (route) =>
    route.fulfill({
      json: {
        destination: "inbox",
        entries: [
          {
            id: "inbox/imported-source.md",
            title: "Imported source",
            modifiedAt: new Date(0).toISOString(),
            baseHash: "a".repeat(64),
          },
          {
            id: "inbox/local-report.md",
            title: "Local report",
            modifiedAt: new Date(0).toISOString(),
            baseHash: "b".repeat(64),
          },
        ],
      },
    }),
  );
  await page.route("**/api/note?*", (route) =>
    route.fulfill({
      json: {
        markdown: "# Imported source\n\nImported content\n",
        baseHash: "a".repeat(64),
      },
    }),
  );

  try {
    await page.goto("/");
    const mode = page.locator("#mode-ingest");
    await expect(mode).toBeEnabled();
    await mode.click();
    await expect(mode).toHaveClass(/active/);
    await expect(page.locator("#search")).toHaveAttribute(
      "placeholder",
      "Ingest file/url…",
    );
    await expect(page.locator("#ingest-browse")).toBeVisible();

    for (const source of [
      "https://example.com/report.pdf",
      "/Users/example/report.pdf",
    ]) {
      await page.locator("#search").fill(source);
      await page.locator("#search").press("Enter");
      await expect.poll(() => sources).toContain(source);
    }

    const chooserPromise = page.waitForEvent("filechooser");
    await page.locator("#ingest-browse").click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: "local-report.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("local report"),
    });
    await expect.poll(() => uploadName).toBe("local-report.txt");
  } finally {
    await assertCleanBrowser();
  }
});
