import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";
import { captureBrowserDiagnostics } from "./diagnostics";

interface SessionResponse {
  token: string;
}

interface SearchResponse {
  historyId?: string;
}

interface DocumentResponse {
  id: string;
  revision: string;
  title?: string;
  content?: string;
}

interface HistoryResponse {
  entries: Array<Record<string, unknown>>;
}

interface IntegrationsResponse {
  [key: string]: unknown;
  voice?: Record<string, unknown>;
}

const syntheticLongEntry = {
  id: "e2e-long-snippet",
  ts: "2026-01-01T00:00:00.000Z",
  mode: "keyword",
  query: "Seven-line clamp proof",
  results: [
    {
      id: "alpha-note.md",
      title: "Alpha Note",
      score: 1,
      snippet: Array.from(
        { length: 18 },
        (_, index) =>
          `Visible snippet line ${index + 1} proves the preview clamp.`,
      ).join("\n"),
    },
  ],
};

async function token(page: Page) {
  const response = await page.request.get("/api/session");
  const body: SessionResponse = await response.json();
  return body.token;
}

async function clearHistory(page: Page) {
  await page.request.delete("/api/research/history", {
    headers: { "x-sinapso-token": await token(page) },
  });
}

async function createEvidence(page: Page, term: string, label: string) {
  const response = await page.request.get(
    `/api/search?q=${encodeURIComponent(term)}&history=1&displayQuery=${encodeURIComponent(label)}`,
    { headers: { "x-sinapso-token": await token(page) } },
  );
  expect(response.ok()).toBe(true);
  const body: SearchResponse = await response.json();
  expect(body.historyId).toBeTruthy();
  return body.historyId!;
}

async function createDocument(page: Page, title: string, content: string) {
  const response = await page.request.post("/api/document", {
    headers: { "x-sinapso-token": await token(page) },
    data: { title, content },
  });
  expect(response.ok()).toBe(true);
  const body: DocumentResponse = await response.json();
  return body;
}

async function updateDocument(
  page: Page,
  document: DocumentResponse,
  title: string,
  content: string,
) {
  const response = await page.request.post("/api/document", {
    headers: { "x-sinapso-token": await token(page) },
    data: { id: document.id, revision: document.revision, title, content },
  });
  expect(response.ok()).toBe(true);
  const body: DocumentResponse = await response.json();
  return { id: document.id, revision: body.revision, title, content };
}

async function installVoiceHarness(page: Page) {
  let socket: WebSocketRoute | undefined;
  let includeLongEntry = false;

  await page.route("**/api/integrations", async (route) => {
    const response = await route.fetch();
    const body: IntegrationsResponse = await response.json();
    await route.fulfill({
      response,
      json: {
        ...body,
        voice: {
          ...body.voice,
          provider: "gemini",
          voice: "Kore",
          keys: { gemini: true },
        },
      },
    });
  });
  await page.route("**/api/research/history", async (route) => {
    if (!includeLongEntry || route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body: HistoryResponse = await response.json();
    await route.fulfill({
      response,
      json: { entries: [syntheticLongEntry, ...body.entries] },
    });
  });
  await page.routeWebSocket("**/api/voice/ws?token=*", (route) => {
    socket = route;
    setTimeout(() => route.send(JSON.stringify({ type: "ready" })), 50);
  });
  await page.addInitScript(() => {
    localStorage.setItem("sinapso-qmd-prompted", "1");
    const analyser = {
      fftSize: 512,
      smoothingTimeConstant: 0,
      connect() {},
      getByteTimeDomainData(buffer: Uint8Array) {
        buffer.fill(128);
      },
    };
    class FakeAudioContext {
      currentTime = 0;
      destination = {};
      audioWorklet = { addModule: async () => undefined };
      resume = async () => undefined;
      close = async () => undefined;
      createAnalyser() {
        return { ...analyser };
      }
      createMediaStreamSource() {
        return { connect() {} };
      }
      createScriptProcessor() {
        return { connect() {}, disconnect() {}, onaudioprocess: null };
      }
      createBuffer() {
        return { duration: 0, getChannelData: () => new Float32Array(0) };
      }
      createBufferSource() {
        return {
          buffer: null,
          connect() {},
          start() {},
          stop() {},
          onended: null,
        };
      }
      createGain() {
        return { gain: { value: 1 }, connect() {} };
      }
    }
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop() {} }],
        }),
      },
    });
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: FakeAudioContext,
    });
    Object.defineProperty(window, "AudioWorkletNode", {
      configurable: true,
      value: class {
        port = { onmessage: null };
        connect() {}
      },
    });
  });

  await page.goto("/");
  await expect(page.locator("#voice-toggle")).toBeEnabled();
  await page.locator("#voice-toggle").click();
  await expect(page.locator("#voice-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  return {
    show: async (id: string, action = "open_research") => {
      expect(socket, "voice WebSocket connected").toBeDefined();
      const acknowledgment = page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            window.addEventListener(
              "sinapso:research-display-ack",
              () => resolve(),
              { once: true },
            ),
          ),
      );
      socket!.send(JSON.stringify({ type: "action", action, id }));
      await acknowledgment;
    },
    includeLongEntry: () => {
      includeLongEntry = true;
    },
  };
}

async function expectVisibleQuery(page: Page, query: string) {
  await expect(page.locator("#research")).not.toHaveClass(/hidden/);
  await expect(page.locator("#research-body")).toContainText(query);
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await clearHistory(page);
});

test("pinning coordinates agent opens, refreshes, conflicts, unpin, and user navigation", async ({
  page,
}) => {
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info());
  try {
    const resultA = await createEvidence(page, "Alpha", "Persisted result A");
    const harness = await installVoiceHarness(page);
    await harness.show(resultA);
    await expectVisibleQuery(page, "Persisted result A");

    await page.locator("#research-pin").click();
    await expect(page.locator("#research-pin")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const resultB = await createEvidence(page, "Beta", "Agent result B");
    await harness.show(resultB);
    await expectVisibleQuery(page, "Persisted result A");
    await expect(page.locator("#research-pos")).toHaveText(/\/2$/);

    await page.locator("#research-next").click();
    await expectVisibleQuery(page, "Agent result B");
    await page.locator("#research-prev").click();
    await expectVisibleQuery(page, "Persisted result A");
    await expect(page.locator("#research-pin")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.locator("#research-pin").click();

    const cleanDoc = await createDocument(
      page,
      "Clean pinned draft",
      "first server version",
    );
    await harness.show(cleanDoc.id, "show_document");
    await expect(page.locator(".research-document-title")).toHaveValue(
      "Clean pinned draft",
    );
    await page.locator("#research-pin").click();
    const refreshed = await updateDocument(
      page,
      cleanDoc,
      "Clean pinned draft",
      "same-id refreshed version",
    );
    await harness.show(cleanDoc.id, "show_document");
    await expect(page.locator(".research-document-editor")).toContainText(
      "same-id refreshed version",
    );

    const editor = page.locator(".research-document-editor .cm-content");
    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" local unsaved words");
    const external = await updateDocument(
      page,
      refreshed,
      "Clean pinned draft",
      "external competing version",
    );
    await harness.show(cleanDoc.id, "show_document");
    await expect(page.locator("#research-error")).toContainText(
      "unsaved changes",
    );
    await expect(editor).toContainText("local unsaved words");
    const disk = await page.request.get(`/api/document/${external.id}`);
    const diskBody: DocumentResponse = await disk.json();
    expect(diskBody.content).toBe("external competing version");
    // Return both disk and editor to the controller's clean base before
    // navigating away. The conflict assertion above proves the local draft is
    // preserved; cleanup avoids intentionally issuing a stale autosave request,
    // which Chromium reports as a console-level failed resource.
    await updateDocument(
      page,
      external,
      "Clean pinned draft",
      "same-id refreshed version",
    );
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("same-id refreshed version");

    await page.locator("#research-pin").click();
    await expect(page.locator("#research-pin")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await harness.show(resultB);
    await expectVisibleQuery(page, "Agent result B");
  } finally {
    await assertCleanBrowser();
  }
});

test("working document creation, editing, and autosave persist through the real API", async ({
  page,
}) => {
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info());
  try {
    const harness = await installVoiceHarness(page);
    const resultA = await createEvidence(
      page,
      "Alpha",
      "Open panel for document creation",
    );
    await harness.show(resultA);
    await page.locator("#new-doc-btn").click();
    await expect(page.locator(".research-document-title")).toBeVisible();
    await page
      .locator(".research-document-title")
      .fill("Browser-authored working document");
    const editor = page.locator(".research-document-editor .cm-content");
    await editor.click();
    await page.keyboard.type(
      "A complete editable draft created in the browser.",
    );
    await expect(page.locator(".research-document-save-state")).toHaveText(
      "saved",
      {
        timeout: 10_000,
      },
    );

    const history = await page.request.get("/api/research/history");
    const body: HistoryResponse = await history.json();
    const saved = body.entries.find((entry) => entry.mode === "document");
    expect(saved).toBeDefined();
    expect(saved?.document).toMatchObject({
      title: "Browser-authored working document",
      content: "A complete editable draft created in the browser.",
    });
  } finally {
    await assertCleanBrowser();
  }
});

test("evidence is immutable and long snippets expand without opening the note", async ({
  page,
}) => {
  const assertCleanBrowser = captureBrowserDiagnostics(page, test.info());
  try {
    const evidenceId = await createEvidence(
      page,
      "Alpha",
      "Immutable evidence",
    );
    const overwrite = await page.request.post("/api/document", {
      headers: { "x-sinapso-token": await token(page) },
      data: {
        id: evidenceId,
        revision: "stale",
        title: "No",
        content: "overwrite",
      },
    });
    expect(overwrite.status()).toBe(409);
    const evidence = await page.request.get("/api/research/history");
    const evidenceBody: HistoryResponse = await evidence.json();
    expect(
      evidenceBody.entries.find((entry) => entry.id === evidenceId)?.mode,
    ).toBe("keyword");

    const harness = await installVoiceHarness(page);
    harness.includeLongEntry();
    await harness.show(syntheticLongEntry.id);
    const snippet = page.locator(".rel-snippet", {
      hasText: "Visible snippet line 1",
    });
    await expect(snippet).toBeVisible();
    const lineHeight = await snippet.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).lineHeight),
    );
    const collapsedHeight = await snippet.evaluate(
      (element) => element.getBoundingClientRect().height,
    );
    expect(collapsedHeight).toBeLessThanOrEqual(lineHeight * 7 + 2);
    await page.locator(".expand-btn").click();
    await expect(snippet).toHaveClass(/expanded/);
    await expect(page.locator("#reader")).toHaveClass(/hidden/);
    const expandedHeight = await snippet.evaluate(
      (element) => element.getBoundingClientRect().height,
    );
    expect(expandedHeight).toBeGreaterThan(collapsedHeight);
  } finally {
    await assertCleanBrowser();
  }
});
