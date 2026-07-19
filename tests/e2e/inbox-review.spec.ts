import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { captureBrowserDiagnostics } from "./diagnostics";
import { E2E_GRAPH, E2E_VAULT } from "./global-setup";

const CONTINUE = "inbox/review-continue.md";
const STALE = "inbox/review-stale.md";
const EMPTY = "inbox/review-empty.md";
const REVIEW_STATE = join(dirname(E2E_GRAPH), "inbox-review.json");

async function token(page: Page): Promise<string> {
  const response = await page.request.get("/api/session");
  return ((await response.json()) as { token: string }).token;
}

function card(page: Page, path: string, action: string) {
  return page
    .locator(".inbox-review-card")
    .filter({ has: page.locator(".inbox-review-path", { hasText: path }) })
    .filter({ has: page.locator(".inbox-review-action", { hasText: action }) })
    .first();
}

async function openInbox(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("sinapso-qmd-prompted", "1");
    localStorage.setItem("sinapso-lang", "en");
  });
  await page.goto("/");
  await expect(page.locator("#brand-stats")).toContainText("notes");
  await page.locator('[data-target="new-doc-btn"]').click();
  await expect(page.locator("#research")).not.toHaveClass(/hidden/);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("button", { name: "Review Inbox" }),
  ).toBeVisible();
}

test("RM002 manual Inbox Review is local, persistent, stale-safe, and narrow-screen accessible", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info());
  await page.setViewportSize({ width: 390, height: 844 });
  rmSync(REVIEW_STATE, { force: true });
  writeFileSync(
    join(E2E_VAULT, CONTINUE),
    "# Continue\n\n- [ ] finish review\n",
  );
  writeFileSync(join(E2E_VAULT, STALE), "TODO stale action\n");
  writeFileSync(join(E2E_VAULT, EMPTY), "  \n");

  let reviewRequests = 0;
  let proposalRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/inbox/review")
      reviewRequests++;
  });
  await page.route("**/api/wiki-ingest/propose", async (route) => {
    proposalRequests++;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        wiki: { id: "wiki", label: "wiki", path: "wiki" },
        source: CONTINUE,
        title: "Continue",
        sourceNote: CONTINUE,
        operations: [
          {
            type: "move",
            path: "raw/review-continue.md",
            content: "# Continue\n\n- [ ] finish review\n",
            raw: true,
            sourceNote: CONTINUE,
          },
          {
            type: "create",
            path: "wiki/review-continue.md",
            content: "# Continue\n",
          },
        ],
      }),
    });
  });

  try {
    await openInbox(page);
    expect(reviewRequests).toBe(0);
    expect(proposalRequests).toBe(0);

    await page.locator(".inbox-list-item", { hasText: EMPTY }).click();
    await expect(page.locator("#research .cm-content")).toBeAttached();
    await page
      .locator("#research-pin")
      .evaluate((element) => (element as HTMLButtonElement).click());
    await expect(page.locator("#research-pin")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page
      .locator("#research-close")
      .evaluate((element) => (element as HTMLButtonElement).click());
    await page.locator('[data-target="new-doc-btn"]').click();
    await page.getByRole("button", { name: "Cancel" }).click();

    await page.getByRole("button", { name: "Review Inbox" }).click();
    await expect(card(page, CONTINUE, "Continue")).toBeVisible();
    expect(reviewRequests).toBe(1);
    expect(proposalRequests).toBe(0);

    const continueCard = card(page, CONTINUE, "Continue");
    await continueCard.locator("textarea").fill("Keep this for Monday");
    await continueCard
      .getByRole("button", { name: /Save review comment/ })
      .click();
    await expect(
      continueCard.locator("button", { hasText: "Comment saved" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back to Inbox" }).click();
    await page.getByRole("button", { name: "Review Inbox" }).click();
    await expect(
      card(page, CONTINUE, "Continue").locator("textarea"),
    ).toHaveValue("Keep this for Monday");

    const keepIngest = card(page, "inbox/.keep.md", "Ingest");
    await keepIngest.getByRole("button", { name: "Dismiss" }).click();
    await page.getByRole("button", { name: "Refresh Review" }).click();
    await expect(card(page, "inbox/.keep.md", "Ingest")).toHaveCount(0);

    writeFileSync(join(E2E_VAULT, STALE), "changed after review\n");
    await card(page, STALE, "Continue")
      .getByRole("button", { name: "Approve" })
      .click();
    await expect(page.locator("#research-error")).toContainText(
      "This note or target changed",
    );
    expect(existsSync(join(E2E_VAULT, STALE))).toBe(true);

    page.once("dialog", (dialog) => dialog.accept());
    await card(page, EMPTY, "Archive")
      .getByRole("button", { name: "Approve" })
      .click();
    await expect
      .poll(() => existsSync(join(E2E_VAULT, "archive", "review-empty.md")))
      .toBe(true);
    expect(existsSync(join(E2E_VAULT, EMPTY))).toBe(false);
    await expect(page.locator("#research-pin")).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    const ingest = card(page, CONTINUE, "Ingest");
    await ingest.getByRole("button", { name: "Approve" }).click();
    expect(proposalRequests).toBe(0);
    await ingest.getByRole("button", { name: "Prepare proposal" }).click();
    await expect.poll(() => proposalRequests).toBe(1);

    rmSync(join(E2E_VAULT, CONTINUE), { force: true });
    rmSync(join(E2E_VAULT, STALE), { force: true });
    rmSync(join(E2E_VAULT, "archive", "review-empty.md"), { force: true });
    rmSync(REVIEW_STATE, { force: true });
    await page.request.post("/api/rescan", {
      headers: { "x-sinapso-token": await token(page) },
    });
  } finally {
    rmSync(join(E2E_VAULT, CONTINUE), { force: true });
    rmSync(join(E2E_VAULT, STALE), { force: true });
    rmSync(join(E2E_VAULT, EMPTY), { force: true });
    rmSync(join(E2E_VAULT, "archive", "review-empty.md"), { force: true });
    rmSync(REVIEW_STATE, { force: true });
    await assertCleanBrowser();
  }
});

test("RM002 blocks Merge when the target editor is conflicted", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info(), {
    allow: (entry) =>
      entry.kind === "console" &&
      entry.message.includes("409") &&
      (entry.url ?? "").includes("/api/notes"),
  });
  const targetId = "merge-target.md";
  const sourceId = "inbox/merge-source.md";
  const targetFile = join(E2E_VAULT, targetId);
  const sourceFile = join(E2E_VAULT, sourceId);
  const original =
    "---\ntitle: Shared Merge\n---\n# Shared Merge\nTarget body\n";
  writeFileSync(targetFile, original);
  writeFileSync(
    sourceFile,
    "---\ntitle: shared-merge\n---\n# shared-merge\nSource body\n",
  );
  const sessionToken = await token(page);
  await page.request.post("/api/rescan", {
    headers: { "x-sinapso-token": sessionToken },
  });
  try {
    await page.addInitScript(() => {
      localStorage.setItem("sinapso-qmd-prompted", "1");
      localStorage.setItem("sinapso-lang", "en");
    });
    await page.goto(`/?node=${encodeURIComponent(targetId)}`);
    await expect(page.locator("#reader-editor .cm-content")).toBeAttached({
      timeout: 15_000,
    });
    writeFileSync(targetFile, original.replace("Target body", "External body"));
    const line = page.locator("#reader-editor .cm-line", {
      hasText: "Target body",
    });
    await line.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" local edit");
    await expect(page.locator("#reader-banner")).not.toHaveClass(/hidden/, {
      timeout: 10_000,
    });

    await page.locator("#new-doc-btn").click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Review Inbox" }).click();
    await card(page, sourceId, "Merge")
      .getByRole("button", { name: /Approve Merge/ })
      .click();
    await expect(page.locator("#research-error")).toContainText(
      "Resolve them before applying",
    );
    expect(readFileSync(targetFile, "utf8")).toContain("External body");
    expect(readFileSync(targetFile, "utf8")).not.toContain("Merged from");
    rmSync(targetFile, { force: true });
    rmSync(sourceFile, { force: true });
    await page.request.post("/api/rescan", {
      headers: { "x-sinapso-token": sessionToken },
    });
  } finally {
    rmSync(targetFile, { force: true });
    rmSync(sourceFile, { force: true });
    await assertCleanBrowser();
  }
});
