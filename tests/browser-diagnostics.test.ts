import { describe, expect, it } from "vitest";
import { browserDiagnosticFailures, type BrowserDiagnostic } from "./e2e/diagnostics";

describe("browserDiagnosticFailures", () => {
  it("keeps unallowlisted diagnostics and drops allowlisted ones", () => {
    const entries: BrowserDiagnostic[] = [
      { kind: "console", message: "boom" },
      { kind: "response", message: "expected dev 500", status: 500, url: "/allowed" },
    ];

    expect(browserDiagnosticFailures(entries, (entry) => entry.url === "/allowed")).toEqual([
      { kind: "console", message: "boom" },
    ]);
  });
});
