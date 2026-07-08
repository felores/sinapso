import { expect, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type BrowserDiagnostic = {
  kind: "console" | "pageerror" | "requestfailed" | "response";
  message: string;
  url?: string;
  status?: number;
};

export function captureBrowserDiagnostics(
  page: Page,
  testInfo: TestInfo,
  options: { allow?: (entry: BrowserDiagnostic) => boolean } = {},
) {
  const entries: BrowserDiagnostic[] = [];

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location();
    entries.push({
      kind: "console",
      message: message.text(),
      url: location.url,
    });
  });

  page.on("pageerror", (error) => {
    entries.push({ kind: "pageerror", message: error.stack || error.message });
  });

  page.on("requestfailed", (request) => {
    entries.push({
      kind: "requestfailed",
      message: request.failure()?.errorText || "request failed",
      url: request.url(),
    });
  });

  page.on("response", (response) => {
    if (response.status() < 500) return;
    entries.push({
      kind: "response",
      message: response.statusText(),
      status: response.status(),
      url: response.url(),
    });
  });

  return async () => {
    const failures = browserDiagnosticFailures(entries, options.allow);
    const diagnostics = {
      test: testInfo.title,
      entries,
      failures,
    };
    const body = JSON.stringify(diagnostics, null, 2);
    const file = join(process.cwd(), "test-results", "browser-diagnostics.json");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, body);
    await testInfo.attach("browser-diagnostics", {
      body,
      contentType: "application/json",
    });
    expect(failures, "browser console/network diagnostics").toEqual([]);
  };
}

export function browserDiagnosticFailures(
  entries: BrowserDiagnostic[],
  allow?: (entry: BrowserDiagnostic) => boolean,
) {
  return entries.filter((entry) => !allow?.(entry));
}
