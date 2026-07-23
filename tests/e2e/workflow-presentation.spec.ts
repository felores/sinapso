import { expect, test, type Page } from "@playwright/test";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { captureBrowserDiagnostics } from "./diagnostics";
import { E2E_VAULT } from "./global-setup";

const WIKI_SOURCE_ID = "inbox/workflow-presentation-source.md";

async function sessionToken(page: Page): Promise<string> {
  const response = await page.request.get("/api/session");
  return ((await response.json()) as { token: string }).token;
}

async function rescanFixture(page: Page): Promise<void> {
  await page.request.post("/api/rescan", {
    headers: { "x-sinapso-token": await sessionToken(page) },
  });
}

test("rescan progress stays in ops and its terminal retry stays in the sole workflow host", async ({
  page,
}) => {
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info());
  try {
    await page.route("**/api/rescan*", (route) =>
      route.fulfill({ json: { ok: false, error: "vault unavailable" } }),
    );
    await page.goto("/");
    await expect(page.locator("#workflow-terminal-cards")).toBeAttached();
    await expect(page.locator("#activity-cards")).toHaveCount(0);
    await page.evaluate(() =>
      (document.querySelector("#mi-rescan") as HTMLButtonElement).click(),
    );
    const card = page.locator("#workflow-terminal-cards .terminal-card", {
      hasText: "Could not rescan",
    });
    await expect(card).toHaveAttribute("role", "alert");
    await expect(card.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.locator("#modal-backdrop")).toHaveClass(/hidden/);
    await card.locator(".terminal-card-dismiss").click();
    await expect(
      page.locator("#workflow-terminal-cards .terminal-card-aggregate"),
    ).toBeVisible();
    await expect(
      page.locator(
        "#workflow-terminal-cards .terminal-card-aggregate > summary",
      ),
    ).toBeFocused();
  } finally {
    await assertCleanBrowser();
  }
});

test("qmd maintenance stays in ops while running and clears when settled", async ({
  page,
}) => {
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info());
  let running = false;
  let starts = 0;
  try {
    await page.addInitScript(() => {
      localStorage.setItem("sinapso-qmd-auto-update", "0");
      localStorage.setItem("sinapso-qmd-auto-embed", "0");
    });
    await page.route("**/api/integrations", async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as Record<string, unknown>;
      await route.fulfill({
        response,
        json: {
          ...body,
          tools: { ...(body.tools as object), qmd: { installed: true } },
        },
      });
    });
    await page.route("**/api/qmd/status", (route) =>
      route.fulfill({ json: { state: "ready", collections: ["e2e"] } }),
    );
    await page.route("**/api/qmd/maintenance*", (route) => {
      if (route.request().method() === "POST") {
        starts++;
        running = true;
        return route.fulfill({ json: { ok: true, running: true } });
      }
      return route.fulfill({
        json: {
          available: true,
          running,
          op: "update",
          index: {
            total: 4,
            vectors: 4,
            pending: running ? 2 : 0,
            updatedAgo: "just now",
          },
        },
      });
    });

    await page.goto("/");
    const toolsMenu = page
      .locator(".menu")
      .filter({ has: page.locator("#mi-integrations") });
    await toolsMenu.locator(".menu-label").click();
    const update = page.locator("#qmd-update");
    await expect(update).toBeEnabled();
    await update.click();
    await expect.poll(() => starts).toBe(1);
    await expect(page.locator("#ops-status")).toContainText("updating qmd");
    await expect(page.locator("#ops-status")).toContainText("2 pending");
    await expect(page.locator("#ops-status")).not.toHaveClass(/hidden/);
    await expect(update).toBeDisabled();
    await expect(page.locator("#modal-backdrop")).toHaveClass(/hidden/);
    await expect(page.locator("#workflow-terminal-cards")).toBeEmpty();
    await expect(page.locator("#activity-cards")).toHaveCount(0);

    running = false;
    await expect(page.locator("#qmd-maint-status")).toHaveText(
      "index up to date · updated just now",
      { timeout: 5_000 },
    );
    await expect(page.locator("#ops-status")).toHaveClass(/hidden/);
    await expect(update).toBeEnabled();
  } finally {
    await assertCleanBrowser();
  }
});

test("a 390x844 bottom rail keeps terminal cards in the measured central workspace", async ({
  page,
}) => {
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info());
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/rescan*", (route) =>
      route.fulfill({ json: { ok: false, error: "vault unavailable" } }),
    );
    await page.goto("/");
    await page.evaluate(() =>
      (document.querySelector("#mi-rescan") as HTMLButtonElement).click(),
    );
    const card = page.locator("#workflow-terminal-cards .terminal-card");
    await expect(card).toBeVisible();
    const [cardBox, hostBox, searchBox, topbarBox] = await Promise.all([
      card.boundingBox(),
      page.locator("#workflow-terminal-cards").boundingBox(),
      page.locator("#search-wrap").boundingBox(),
      page.locator("#topbar").boundingBox(),
    ]);
    expect(cardBox).not.toBeNull();
    expect(hostBox).not.toBeNull();
    expect(searchBox).not.toBeNull();
    expect(topbarBox).not.toBeNull();
    expect(cardBox!.y).toBeGreaterThanOrEqual(hostBox!.y);
    expect(hostBox!.y).toBeGreaterThanOrEqual(
      topbarBox!.y + topbarBox!.height + 8,
    );
    expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(searchBox!.y - 8);
    expect(cardBox!.x).toBeGreaterThanOrEqual(0);
    expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(390);
  } finally {
    await assertCleanBrowser();
  }
});

test("a 390x844 terminal host stays portal-fixed and exposes its aggregate when Research fills the workspace", async ({
  page,
}) => {
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info());
  const assertClear = async (panel: "#reader" | "#research") => {
    const [card, panelBox] = await Promise.all([
      page.locator("#workflow-terminal-cards .terminal-card").boundingBox(),
      page.locator(panel).boundingBox(),
    ]);
    expect(card).not.toBeNull();
    expect(panelBox).not.toBeNull();
    if (panelBox!.x + panelBox!.width / 2 < 195)
      expect(card!.x).toBeGreaterThanOrEqual(
        panelBox!.x + panelBox!.width + 12,
      );
    else expect(card!.x + card!.width).toBeLessThanOrEqual(panelBox!.x - 12);
  };
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    let rescanCalls = 0;
    await page.route("**/api/rescan*", (route) => {
      rescanCalls++;
      return route.fulfill({ json: { ok: false, error: "vault unavailable" } });
    });
    await page.goto("/?node=alpha-note.md");
    await expect(page.locator("#reader")).not.toHaveClass(/hidden/, {
      timeout: 15_000,
    });
    await page.evaluate(() =>
      (document.querySelector("#mi-rescan") as HTMLButtonElement).click(),
    );
    await expect(
      page.locator("#workflow-terminal-cards .terminal-card"),
    ).toBeVisible();
    await assertClear("#reader");

    await page.evaluate(() =>
      (document.querySelector("#reader-close") as HTMLButtonElement).click(),
    );
    await page.request.get(
      "/api/search?q=Alpha&history=1&displayQuery=Terminal%20placement",
      { headers: { "x-sinapso-token": await sessionToken(page) } },
    );
    await page.evaluate(() =>
      (document.querySelector("#reopen-research") as HTMLButtonElement).click(),
    );
    await expect(page.locator("#research")).not.toHaveClass(/hidden/);
    await page.waitForTimeout(350);
    const host = page.locator("#workflow-terminal-cards");
    await expect(
      page.locator("#research-head #workflow-terminal-cards"),
    ).toHaveCount(0);
    await expect(host).toHaveAttribute("data-terminal-placement", "aggregate");
    expect(
      await host.evaluate((element) => element.parentElement === document.body),
    ).toBe(true);
    const aggregate = host.locator(".terminal-card-aggregate > summary");
    await aggregate.focus();
    await page.keyboard.press("Enter");
    const retry = host.getByRole("button", { name: "Try again" });
    await retry.focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => rescanCalls).toBe(2);
  } finally {
    await assertCleanBrowser();
  }
});

test("wiki proposal apply restores its dirty, pinned Inbox context", async ({
  page,
}) => {
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info());
  const sourceFile = join(E2E_VAULT, WIKI_SOURCE_ID);
  let applied = 0;
  try {
    writeFileSync(sourceFile, "# Workflow review source\n\nKeep this open.\n");
    await rescanFixture(page);
    await page.route("**/api/wiki-ingest/propose", (route) =>
      route.fulfill({
        json: {
          wiki: { id: "wiki", label: "Test Wiki", path: "wiki" },
          source: "Workflow review source",
          title: "Derived review",
          sourceNote: WIKI_SOURCE_ID,
          operations: [
            {
              type: "create",
              path: "wiki/derived.md",
              content: "# Derived\n\nHidden until expanded.\n",
            },
          ],
        },
      }),
    );
    await page.route("**/api/wiki-ingest/apply", (route) => {
      applied++;
      return route.fulfill({ json: { ids: ["wiki/derived.md"] } });
    });
    await page.route("**/api/rescan*", (route) =>
      route.fulfill({ json: { ok: false, error: "vault unavailable" } }),
    );
    await page.goto(`/?node=${encodeURIComponent(WIKI_SOURCE_ID)}`);
    const ingest = page.locator("#reader-wiki-top .web-save");
    await expect(ingest).toBeVisible({ timeout: 15_000 });
    await page.request.get(
      "/api/search?q=Alpha&history=1&displayQuery=Pinned%20research",
      { headers: { "x-sinapso-token": await sessionToken(page) } },
    );
    await page.locator("#reopen-research").click();
    const pin = page.locator("#research-pin");
    await expect(pin).toBeVisible();
    await pin.click();
    await expect(pin).toHaveAttribute("aria-pressed", "true");
    await page.locator("#new-doc-btn").click();
    const title = page.locator(".inbox-create-row input");
    await expect(title).toBeVisible();
    await title.fill("Dirty Inbox during wiki review");
    await page.locator(".inbox-create-row button.primary").click();
    const inboxEditor = page.locator("#research .cm-content");
    await expect(inboxEditor).toBeVisible();
    await inboxEditor.click();
    await page.keyboard.type("Unsaved Inbox text must flush before review.");
    await ingest.click();
    const card = page.locator("#workflow-terminal-cards .terminal-card", {
      hasText: "Workflow review source",
    });
    await expect(card).toContainText("Workflow review source → Test Wiki");
    await page.evaluate(() =>
      (document.querySelector("#mi-rescan") as HTMLButtonElement).click(),
    );
    const retry = page.locator("#workflow-terminal-cards .terminal-card", {
      hasText: "Could not rescan",
    });
    await expect(
      retry.getByRole("button", { name: "Try again" }),
    ).toBeVisible();
    await expect(inboxEditor).toContainText("Unsaved Inbox text");
    const flushed = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/notes" &&
        response.request().method() === "PUT" &&
        response.ok(),
    );
    const review = card.getByRole("button", { name: "Review" });
    await review.click();
    await flushed;
    await expect(card).toHaveCount(0);
    await expect(
      retry.getByRole("button", { name: "Try again" }),
    ).toBeVisible();
    const body = page.locator("#research-body");
    await expect(body).toContainText("Derived review → Test Wiki");
    await expect(body).toContainText("Show proposed operations");
    await expect(
      body.locator(".wiki-proposal-disclosure > summary"),
    ).toBeFocused();
    await page.locator("#research-toggle-inbox").click();
    await page.locator("#research-toggle-inbox").click();
    await expect(page.locator(".inbox-list")).toBeVisible();
    await expect(review).toBeVisible();
    await review.click();
    await expect(body).toContainText("Derived review → Test Wiki");
    await page.locator("#research-close").click();
    await expect(page.locator("#research")).not.toHaveClass(/hidden/);
    await expect(inboxEditor).toContainText("Unsaved Inbox text");
    await expect(review).toBeVisible();
    await page.locator("#research-close").click();
    await expect(page.locator("#research")).toHaveClass(/hidden/);
    await review.click();
    await expect(body).toContainText("Derived review → Test Wiki");
    const preview = body.locator(".wiki-proposal-op pre");
    await expect(preview).toBeHidden();
    await body.locator(".wiki-proposal-disclosure > summary").click();
    await expect(preview).toContainText("Hidden until expanded.");
    await page.locator(".wiki-proposal-actions .web-save").first().click();
    expect(applied).toBe(1);
    await expect(card).toHaveCount(0);
    await expect(inboxEditor).toContainText("Unsaved Inbox text");
    await expect(page.locator("#research-toggle-inbox")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      retry.getByRole("button", { name: "Try again" }),
    ).toBeFocused();
    await page.locator("#research-toggle-inbox").click();
    await expect(page.locator("#research-pin")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      retry.getByRole("button", { name: "Try again" }),
    ).toBeVisible();
  } finally {
    rmSync(sourceFile, { force: true });
    await rescanFixture(page);
    await page.request.delete("/api/research/history", {
      headers: { "x-sinapso-token": await sessionToken(page) },
    });
    await assertCleanBrowser();
  }
});

test("wiki proposal operation counts use Spanish labels", async ({ page }) => {
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info());
  const sourceFile = join(E2E_VAULT, "inbox/wiki-spanish-counts.md");
  try {
    writeFileSync(sourceFile, "# Spanish operation counts\n");
    await rescanFixture(page);
    await page.addInitScript(() => localStorage.setItem("sinapso-lang", "es"));
    await page.route("**/api/wiki-ingest/propose", (route) =>
      route.fulfill({
        json: {
          wiki: { id: "wiki", label: "Test Wiki", path: "wiki" },
          source: "Spanish operation counts",
          title: "Spanish review",
          sourceNote: "inbox/wiki-spanish-counts.md",
          operations: [
            { type: "create", path: "wiki/new.md" },
            { type: "edit", path: "wiki/existing.md" },
            { type: "move", path: "wiki/moved.md" },
          ],
        },
      }),
    );
    await page.goto("/?node=inbox%2Fwiki-spanish-counts.md");
    await page.locator("#reader-wiki-top .web-save").click();
    const card = page.locator("#workflow-terminal-cards .terminal-card", {
      hasText: "Spanish operation counts",
    });
    await card.getByRole("button", { name: "Revisar propuesta" }).click();
    await expect(page.locator(".wiki-proposal-meta")).toHaveText(
      "Spanish operation counts · 1 crear, 1 editar, 1 mover.",
    );
  } finally {
    rmSync(sourceFile, { force: true });
    await rescanFixture(page);
    await assertCleanBrowser();
  }
});

test("closing a wiki review restores its Research return context", async ({
  page,
}) => {
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info());
  const sourceFile = join(E2E_VAULT, WIKI_SOURCE_ID);
  try {
    writeFileSync(sourceFile, "# Workflow review source\n\nKeep this open.\n");
    await rescanFixture(page);
    await page.route("**/api/wiki-ingest/propose", (route) =>
      route.fulfill({
        json: {
          wiki: { id: "wiki", label: "Test Wiki", path: "wiki" },
          source: "Workflow review source",
          title: "Derived review",
          sourceNote: WIKI_SOURCE_ID,
          operations: [
            { type: "create", path: "wiki/derived.md", content: "# Derived\n" },
          ],
        },
      }),
    );
    await page.goto(`/?node=${encodeURIComponent(WIKI_SOURCE_ID)}`);
    await expect(page.locator("#reader-wiki-top .web-save")).toBeVisible({
      timeout: 15_000,
    });
    await page.request.get(
      "/api/search?q=Alpha&history=1&displayQuery=Research%20return%20context",
      { headers: { "x-sinapso-token": await sessionToken(page) } },
    );
    await page.locator("#reopen-research").click();
    await expect(page.locator("#research-body")).toContainText(
      "Research return context",
    );

    await page.locator("#reader-wiki-top .web-save").click();
    const card = page.locator("#workflow-terminal-cards .terminal-card", {
      hasText: "Workflow review source",
    });
    await card.getByRole("button", { name: "Review" }).click();
    await expect(page.locator("#research-body")).toContainText(
      "Derived review → Test Wiki",
    );
    await page.locator("#research-close").click();

    await expect(page.locator("#research")).not.toHaveClass(/hidden/);
    await expect(page.locator("#research-body")).toContainText(
      "Research return context",
    );
    await expect(card.getByRole("button", { name: "Review" })).toBeVisible();
  } finally {
    rmSync(sourceFile, { force: true });
    await rescanFixture(page);
    await page.request.delete("/api/research/history", {
      headers: { "x-sinapso-token": await sessionToken(page) },
    });
    await assertCleanBrowser();
  }
});

test("opening a second review restores the first card and rejects into the second context", async ({
  page,
}) => {
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info());
  const sourceA = "inbox/workflow-inline-a.md";
  const sourceB = "inbox/workflow-inline-b.md";
  const sourceAFile = join(E2E_VAULT, sourceA);
  const sourceBFile = join(E2E_VAULT, sourceB);
  try {
    writeFileSync(sourceAFile, "# Inline review A\n");
    writeFileSync(sourceBFile, "# Inline review B\n");
    await rescanFixture(page);
    await page.route("**/api/wiki-ingest/propose", (route) => {
      const sourceNote = (
        route.request().postDataJSON() as {
          sourceNote?: string;
        }
      ).sourceNote;
      const label = sourceNote === sourceA ? "Review A" : "Review B";
      return route.fulfill({
        json: {
          wiki: { id: "wiki", label: "Test Wiki", path: "wiki" },
          source: label,
          title: `Proposal ${label}`,
          sourceNote,
          operations: [
            { type: "create", path: `wiki/${label.toLowerCase()}.md` },
          ],
        },
      });
    });
    await page.goto(`/?node=${encodeURIComponent(sourceA)}`);
    await expect(page.locator("#reader-wiki-top .web-save")).toBeVisible({
      timeout: 15_000,
    });
    await page.locator("#reader-wiki-top .web-save").click();
    const cardA = page.locator("#workflow-terminal-cards .terminal-card", {
      hasText: "Review A → Test Wiki",
    });
    await expect(cardA).toBeVisible();

    await page.evaluate((id) => {
      window.location.hash = new URLSearchParams({ node: id }).toString();
    }, sourceB);
    await expect(page.locator("#reader-editor .cm-content")).toContainText(
      "Inline review B",
    );
    await page.locator("#reader-wiki-top .web-save").click();
    const cardB = page.locator("#workflow-terminal-cards .terminal-card", {
      hasText: "Review B → Test Wiki",
    });
    await expect(cardB).toBeVisible();

    await page.request.get(
      "/api/search?q=Alpha&history=1&displayQuery=Second%20review%20return",
      { headers: { "x-sinapso-token": await sessionToken(page) } },
    );
    await page.locator("#reopen-research").click();
    await expect(page.locator("#research-body")).toContainText(
      "Second review return",
    );
    await page.locator("#research-toggle-inbox").click();
    await expect(page.locator(".inbox-list")).toBeVisible();
    await page.locator("#research-close").click();

    await cardA.getByRole("button", { name: "Review" }).click();
    await expect(page.locator("#research-body")).toContainText(
      "Proposal Review A → Test Wiki",
    );
    await expect(cardA).toHaveCount(0);
    await cardB.getByRole("button", { name: "Review" }).click();
    await expect(page.locator("#research-body")).toContainText(
      "Proposal Review B → Test Wiki",
    );
    await expect(cardA.getByRole("button", { name: "Review" })).toBeVisible();
    await expect(cardB).toHaveCount(0);

    await page.getByRole("button", { name: "Reject" }).click();
    await expect(page.locator(".inbox-list")).toBeVisible();
    await expect(page.locator("#research-title")).toHaveText("Inbox");
    await expect(cardA.getByRole("button", { name: "Review" })).toBeVisible();
  } finally {
    rmSync(sourceAFile, { force: true });
    rmSync(sourceBFile, { force: true });
    await rescanFixture(page);
    await page.request.delete("/api/research/history", {
      headers: { "x-sinapso-token": await sessionToken(page) },
    });
    await assertCleanBrowser();
  }
});

test("rejecting a wiki review returns an Inbox list without opening a note", async ({
  page,
}) => {
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info());
  const sourceFile = join(E2E_VAULT, WIKI_SOURCE_ID);
  try {
    writeFileSync(sourceFile, "# Workflow review source\n\nKeep this open.\n");
    await rescanFixture(page);
    await page.route("**/api/wiki-ingest/propose", (route) =>
      route.fulfill({
        json: {
          wiki: { id: "wiki", label: "Test Wiki", path: "wiki" },
          source: "Workflow review source",
          title: "Derived review",
          sourceNote: WIKI_SOURCE_ID,
          operations: [
            { type: "create", path: "wiki/derived.md", content: "# Derived\n" },
          ],
        },
      }),
    );
    await page.goto(`/?node=${encodeURIComponent(WIKI_SOURCE_ID)}`);
    await expect(page.locator("#reader-wiki-top .web-save")).toBeVisible({
      timeout: 15_000,
    });
    await page.request.get(
      "/api/search?q=Alpha&history=1&displayQuery=Inbox%20list%20return",
      { headers: { "x-sinapso-token": await sessionToken(page) } },
    );
    await page.locator("#reopen-research").click();
    await page.locator("#research-toggle-inbox").click();
    await expect(page.locator(".inbox-list")).toBeVisible();
    await expect(page.locator("#research .cm-content")).toHaveCount(0);

    await page.locator("#reader-wiki-top .web-save").click();
    const card = page.locator("#workflow-terminal-cards .terminal-card", {
      hasText: "Workflow review source",
    });
    await card.getByRole("button", { name: "Review" }).click();
    await expect(page.locator("#research-body")).toContainText(
      "Derived review → Test Wiki",
    );
    await page.getByRole("button", { name: "Reject" }).click();

    await expect(page.locator(".inbox-list")).toBeVisible();
    await expect(page.locator("#research-pos")).toHaveText(/^0\/\d+$/);
    await expect(page.locator("#research .cm-content")).toHaveCount(0);
  } finally {
    rmSync(sourceFile, { force: true });
    await rescanFixture(page);
    await page.request.delete("/api/research/history", {
      headers: { "x-sinapso-token": await sessionToken(page) },
    });
    await assertCleanBrowser();
  }
});

test("rejecting a wiki review returns the Inbox list when its saved target was deleted", async ({
  page,
}) => {
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info());
  const sourceFile = join(E2E_VAULT, WIKI_SOURCE_ID);
  const deletedId = "inbox/deleted-return-target.md";
  const fallbackId = "inbox/other-return-note.md";
  const deletedFile = join(E2E_VAULT, deletedId);
  const fallbackFile = join(E2E_VAULT, fallbackId);
  try {
    writeFileSync(sourceFile, "# Workflow review source\n\nKeep this open.\n");
    writeFileSync(
      deletedFile,
      "# Deleted return target\n\nDo not restore this.\n",
    );
    writeFileSync(
      fallbackFile,
      "# Other Inbox note\n\nDo not open this either.\n",
    );
    await rescanFixture(page);
    await page.route("**/api/wiki-ingest/propose", (route) =>
      route.fulfill({
        json: {
          wiki: { id: "wiki", label: "Test Wiki", path: "wiki" },
          source: "Workflow review source",
          title: "Derived review",
          sourceNote: WIKI_SOURCE_ID,
          operations: [
            { type: "create", path: "wiki/derived.md", content: "# Derived\n" },
          ],
        },
      }),
    );
    await page.goto(`/?node=${encodeURIComponent(WIKI_SOURCE_ID)}`);
    await expect(page.locator("#reader-wiki-top .web-save")).toBeVisible({
      timeout: 15_000,
    });
    await page.request.get(
      "/api/search?q=Alpha&history=1&displayQuery=Deleted%20Inbox%20return",
      { headers: { "x-sinapso-token": await sessionToken(page) } },
    );
    await page.locator("#reopen-research").click();
    await page.locator("#research-toggle-inbox").click();
    await page
      .locator(".inbox-list-item", { hasText: "deleted-return-target" })
      .click();
    await expect(page.locator("#research .cm-content")).toContainText(
      "Deleted return target",
    );

    await page.locator("#reader-wiki-top .web-save").click();
    const card = page.locator("#workflow-terminal-cards .terminal-card", {
      hasText: "Workflow review source",
    });
    await card.getByRole("button", { name: "Review" }).click();
    await expect(page.locator("#research-body")).toContainText(
      "Derived review → Test Wiki",
    );
    rmSync(deletedFile);
    await page.getByRole("button", { name: "Reject" }).click();

    await expect(page.locator(".inbox-list")).toBeVisible();
    await expect(page.locator("#research-title")).toHaveText("Inbox");
    await expect(page.locator("#research-pos")).toHaveText(/^0\/\d+$/);
    await expect(
      page.locator(".inbox-list-item", { hasText: "other-return-note" }),
    ).toBeVisible();
    await expect(page.locator("#research .cm-content")).toHaveCount(0);
  } finally {
    rmSync(sourceFile, { force: true });
    rmSync(deletedFile, { force: true });
    rmSync(fallbackFile, { force: true });
    await rescanFixture(page);
    await page.request.delete("/api/research/history", {
      headers: { "x-sinapso-token": await sessionToken(page) },
    });
    await assertCleanBrowser();
  }
});

test("conflicted Inbox review keeps its editor and terminal action", async ({
  page,
}) => {
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info(), {
    allow: (entry) =>
      entry.kind === "console" &&
      entry.url?.endsWith("/api/notes") === true &&
      entry.message.includes("409 (Conflict)"),
  });
  const sourceFile = join(E2E_VAULT, WIKI_SOURCE_ID);
  try {
    writeFileSync(sourceFile, "# Workflow review source\n\nKeep this open.\n");
    await rescanFixture(page);
    await page.route("**/api/wiki-ingest/propose", (route) =>
      route.fulfill({
        json: {
          wiki: { id: "wiki", label: "Test Wiki", path: "wiki" },
          source: "Workflow review source",
          title: "Derived review",
          sourceNote: WIKI_SOURCE_ID,
          operations: [
            { type: "create", path: "wiki/derived.md", content: "# Derived\n" },
          ],
        },
      }),
    );
    await page.goto(`/?node=${encodeURIComponent(WIKI_SOURCE_ID)}`);
    await expect(page.locator("#reader-wiki-top .web-save")).toBeVisible({
      timeout: 15_000,
    });
    await page.request.get(
      "/api/search?q=Alpha&history=1&displayQuery=Conflict%20review",
      { headers: { "x-sinapso-token": await sessionToken(page) } },
    );
    await page.locator("#reopen-research").click();
    await page.locator("#research-pin").click();
    await page.locator("#new-doc-btn").click();
    await page
      .locator(".inbox-create-row input")
      .fill("Conflicted Inbox review");
    await page.locator(".inbox-create-row button.primary").click();
    const inboxEditor = page.locator("#research .cm-content");
    await expect(inboxEditor).toBeVisible();
    await page.route("**/api/notes", (route) => {
      if (route.request().method() === "PUT")
        return route.fulfill({ status: 409, json: { error: "stale note" } });
      return route.continue();
    });
    await inboxEditor.click();
    await page.keyboard.type("This must survive the failed transfer.");
    await page.locator("#reader-wiki-top .web-save").click();
    const card = page.locator("#workflow-terminal-cards .terminal-card", {
      hasText: "Workflow review source",
    });
    await expect(card.getByRole("button", { name: "Review" })).toBeVisible();
    await card.getByRole("button", { name: "Review" }).click();
    await expect(page.locator("#research-banner")).not.toHaveClass(/hidden/);
    await expect(inboxEditor).toContainText(
      "This must survive the failed transfer.",
    );
    await expect(card.getByRole("button", { name: "Review" })).toBeVisible();
    await expect(page.locator("#research-body")).not.toContainText(
      "Derived review → Test Wiki",
    );
  } finally {
    rmSync(sourceFile, { force: true });
    await rescanFixture(page);
    await page.request.delete("/api/research/history", {
      headers: { "x-sinapso-token": await sessionToken(page) },
    });
    await assertCleanBrowser();
  }
});

test("closed workflow cards keep every pending review reachable without taking over the workspace", async ({
  page,
}) => {
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info());
  try {
    await page.goto("/");
    const result = await page.evaluate(async () => {
      const modulePath = "/src/tool-presentation.ts";
      const {
        removeActionable,
        reserveActionable,
        resolveActionable,
        setActionableInline,
        visibleActionables,
      } = await import(modulePath);
      let entries = new Map();
      for (let index = 0; index < 7; index++) {
        const id = `123e4567-e89b-42d3-a456-${String(index).padStart(12, "0")}`;
        const presentation = {
          version: 1,
          id,
          name: "wiki-ingest",
          state: "decision-required",
          decision: {
            kind: "review",
            decisionId: id,
            review: {
              reviewId: id,
              sourceLabel: `Source ${index}`,
              targetLabel: "Test Wiki",
              counts: { create: 1, edit: 0, move: 0 },
            },
          },
        } as const;
        entries = resolveActionable(
          reserveActionable(entries, presentation, index),
          id,
          presentation,
          { index },
        );
      }
      const extra = {
        version: 1,
        id: "123e4567-e89b-42d3-a456-999999999999",
        name: "wiki-ingest",
        state: "decision-required",
        decision: {
          kind: "review",
          decisionId: "123e4567-e89b-42d3-a456-999999999999",
          review: {
            reviewId: "123e4567-e89b-42d3-a456-999999999999",
            sourceLabel: "Over capacity",
            targetLabel: "Test Wiki",
            counts: { create: 1, edit: 0, move: 0 },
          },
        },
      } as const;
      entries = setActionableInline(
        entries,
        "123e4567-e89b-42d3-a456-000000000000",
      );
      const blocked = reserveActionable(entries, extra, 8);
      const released = reserveActionable(
        removeActionable(entries, "123e4567-e89b-42d3-a456-000000000000"),
        extra,
        8,
      );
      const view = visibleActionables(entries);
      return {
        size: entries.size,
        blockedSize: blocked.size,
        releasedSize: released.size,
        individual: view.individual.map((entry: { id: string }) => entry.id),
        aggregate: view.aggregate.map((entry: { id: string }) => entry.id),
      };
    });
    expect(result.size).toBe(7);
    expect(result.blockedSize).toBe(7);
    expect(result.releasedSize).toBe(7);
    expect(result.individual).toHaveLength(2);
    expect(result.aggregate).toHaveLength(4);
    expect(new Set([...result.individual, ...result.aggregate]).size).toBe(6);
  } finally {
    await assertCleanBrowser();
  }
});

test("review cards disclose only bounded summary and choice input remains focus-scoped", async ({
  page,
}) => {
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info());
  try {
    await page.goto("/");
    const result = await page.evaluate(async () => {
      const modulePath = "/src/tool-renderers.ts";
      const { renderTerminalCards } = await import(modulePath);
      const host = document.querySelector("#workflow-terminal-cards")!;
      const id = "123e4567-e89b-42d3-a456-426614174000";
      const choiceId = "123e4567-e89b-42d3-a456-426614174001";
      const reviewId = "123e4567-e89b-42d3-a456-426614174002";
      const choices: string[] = [];
      const review = {
        id,
        status: "ready",
        createdAt: 1,
        collapsed: false,
        presentation: {
          version: 1,
          id,
          name: "wiki-ingest",
          state: "decision-required",
          decision: {
            kind: "review",
            decisionId: reviewId,
            review: {
              reviewId,
              sourceLabel: "Pinned research source",
              targetLabel: "Test Wiki",
              counts: { create: 2, edit: 1, move: 0 },
            },
          },
        },
      } as const;
      const choice = {
        id: choiceId,
        status: "ready",
        createdAt: 2,
        collapsed: false,
        presentation: {
          version: 1,
          id: choiceId,
          name: "web-research",
          state: "decision-required",
          decision: {
            kind: "choose",
            decisionId: choiceId,
            choice: {
              question: "Which source should be used?",
              explanation: "The publication dates differ.",
              candidates: [
                { id: "one", label: "First source" },
                { id: "two", label: "Second source" },
              ],
            },
          },
        },
      } as const;
      renderTerminalCards(
        host,
        new Map<string, unknown>([
          [id, review],
          [choiceId, choice],
        ]),
        {
          open: "Open",
          review: "Review",
          retry: "Retry",
          dismiss: "Dismiss",
          aggregate: "Actions ready",
          other: "Other...",
          otherPlaceholder: "Type an answer",
          create: "create",
          edit: "edit",
          move: "move",
        },
        {
          open: () => {},
          dismiss: () => {},
          chooseWebResearch: (_decisionId: string, value: string) =>
            choices.push(value),
        },
      );
      const cards = [...host.querySelectorAll<HTMLElement>(".terminal-card")];
      const choiceCard = cards.find((card) =>
        card.textContent?.includes("Which source should be used?"),
      )!;
      choiceCard.focus();
      choiceCard.dispatchEvent(
        new KeyboardEvent("keydown", { key: "1", bubbles: true }),
      );
      choiceCard
        .querySelectorAll<HTMLButtonElement>(".terminal-choice-row")[2]
        .click();
      const input = choiceCard.querySelector<HTMLInputElement>("input")!;
      input.value = "Typed alternative";
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "2", bubbles: true }),
      );
      return {
        reviewText: cards.find((card) => card.dataset.id === id)?.textContent,
        choiceRows: choiceCard.querySelectorAll(".terminal-choice-row").length,
        choices,
      };
    });
    expect(result.reviewText).toContain("Pinned research source → Test Wiki");
    expect(result.reviewText).toContain("2 create, 1 edit, 0 move");
    expect(result.reviewText).not.toContain("wiki/hidden-operation.md");
    expect(result.choiceRows).toBe(3);
    expect(result.choices).toEqual(["one", "Typed alternative"]);
  } finally {
    await assertCleanBrowser();
  }
});

test("unknown presentation and spoofed URL provenance fail closed in the browser", async ({
  page,
}) => {
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info());
  try {
    await page.goto("/");
    const result = await page.evaluate(async () => {
      const modulePath = "/src/tool-presentation.ts";
      const { isToolPresentationV1, presentationSurface } = await import(
        modulePath
      );
      const base = {
        version: 1,
        id: "123e4567-e89b-42d3-a456-426614174000",
        name: "web-research",
        state: "success",
      };
      return {
        unknownField: isToolPresentationV1({ ...base, route: "/api/notes" }),
        http: isToolPresentationV1({
          ...base,
          artifacts: [
            {
              kind: "external-source",
              id: "citation",
              url: "http://example.com/",
            },
          ],
        }),
        canonicalHttps: isToolPresentationV1({
          ...base,
          artifacts: [
            {
              kind: "external-source",
              id: "citation",
              url: "https://example.com/",
            },
          ],
        }),
        markerOnly: isToolPresentationV1({
          ...base,
          artifacts: [
            {
              kind: "external-source",
              id: "citation",
              urlSource: "server-validated",
            },
          ],
        }),
        credentials: isToolPresentationV1({
          ...base,
          artifacts: [
            {
              kind: "external-source",
              id: "citation",
              url: "https://a@example.com/",
            },
          ],
        }),
        nonExternalUrl: isToolPresentationV1({
          ...base,
          sources: [
            {
              kind: "research-entry",
              id: "entry",
              url: "https://example.com/",
            },
          ],
        }),
        unknownFallback: (() => {
          const presentation = {
            version: 1,
            id: base.id,
            name: "unknown",
            state: "denied",
            result: { title: "<img src=x>", text: "Unsupported workflow" },
          } as const;
          return {
            valid: isToolPresentationV1(presentation),
            surface: presentationSurface(presentation),
          };
        })(),
      };
    });
    expect(result).toEqual({
      unknownField: false,
      http: false,
      canonicalHttps: false,
      markerOnly: false,
      credentials: false,
      nonExternalUrl: false,
      unknownFallback: { valid: true, surface: "none" },
    });
  } finally {
    await assertCleanBrowser();
  }
});
