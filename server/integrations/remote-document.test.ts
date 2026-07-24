import { describe, expect, it } from "vitest";
import { classifyResource } from "../../shared/resource";
import {
  downloadDocument,
  isPublicAddress,
  pinnedLookup,
} from "./remote-document";

describe("shared resource classifier", () => {
  it("recognizes supported document formats and normalizes Google exports", () => {
    for (const ext of [
      "pdf",
      "docx",
      "pptx",
      "xls",
      "xlsx",
      "csv",
      "json",
      "xml",
      "zip",
      "epub",
    ])
      expect(classifyResource(`https://example.test/file.${ext}`).kind).toBe(
        "document",
      );
    for (const ext of ["doc", "ppt", "rtf", "odt", "ods", "odp"])
      expect(
        classifyResource(`https://example.test/file.${ext}`),
      ).toMatchObject({ kind: "unsupported" });
    expect(classifyResource("https://example.test/page.html")).toMatchObject({
      kind: "webpage",
    });
    expect(classifyResource("https://arxiv.org/pdf/2607.20402")).toEqual({
      kind: "document",
      extension: "pdf",
      url: "https://arxiv.org/pdf/2607.20402",
    });
    expect(classifyResource("https://arxiv.org/abs/2607.20402")).toMatchObject({
      kind: "webpage",
    });
    expect(
      classifyResource("https://docs.google.com/document/d/abc/edit"),
    ).toEqual({
      kind: "document",
      extension: "docx",
      url: "https://docs.google.com/document/d/abc/export?format=docx",
    });
    expect(
      classifyResource("https://docs.google.com/spreadsheets/d/sheet/edit"),
    ).toEqual({
      kind: "document",
      extension: "xlsx",
      url: "https://docs.google.com/spreadsheets/d/sheet/export?format=xlsx",
    });
    expect(
      classifyResource("https://docs.google.com/presentation/d/deck/edit"),
    ).toEqual({
      kind: "document",
      extension: "pptx",
      url: "https://docs.google.com/presentation/d/deck/export/pptx",
    });
    expect(
      classifyResource("https://drive.google.com/file/d/abc/view"),
    ).toMatchObject({ kind: "unsupported" });
    expect(classifyResource("https://office.com/share/abc")).toMatchObject({
      kind: "unsupported",
    });
    expect(
      classifyResource("https://user:pass@example.test/a.pdf"),
    ).toMatchObject({
      kind: "invalid",
    });
  });
});

describe("secure document downloader", () => {
  const publicLookup = async () => [{ address: "8.8.8.8", family: 4 as const }];
  const response = (
    body = new Uint8Array([1]),
    headers = { "content-type": "application/pdf" },
  ) => ({ status: 200, headers, body });

  it("pins both Node DNS callback shapes to the validated address", async () => {
    const address = { address: "8.8.8.8", family: 4 as const };
    const lookup = pinnedLookup(address);
    const run = (all: boolean) =>
      new Promise<string | Array<{ address: string; family: number }>>(
        (resolve, reject) =>
          lookup("example.test", { all }, (error, result) =>
            error ? reject(error) : resolve(result),
          ),
      );

    await expect(run(false)).resolves.toBe(address.address);
    await expect(run(true)).resolves.toEqual([address]);
  });

  it("rejects non-public address families", () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "169.254.1.1",
      "224.0.0.1",
      "::1",
      "fe80::1",
      "fc00::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
    ])
      expect(isPublicAddress(address)).toBe(false);
    expect(isPublicAddress("8.8.8.8")).toBe(true);
  });

  it("revalidates every redirect and rejects private redirect hosts", async () => {
    let lookups = 0;
    await expect(
      downloadDocument("https://example.test/a.pdf", {
        lookup: async () =>
          ++lookups === 1
            ? [{ address: "8.8.8.8", family: 4 }]
            : [{ address: "127.0.0.1", family: 4 }],
        request: async () => ({
          status: 302,
          headers: { location: "https://redirect.test/b.pdf" },
          body: new Uint8Array(),
        }),
      }),
    ).rejects.toThrow("not public");
  });

  it("keeps the expected document type across signed extensionless redirects", async () => {
    let requests = 0;
    const result = await downloadDocument("https://example.test/a.pdf", {
      lookup: publicLookup,
      request: async () =>
        requests++ === 0
          ? {
              status: 302,
              headers: { location: "https://cdn.test/signed-download" },
              body: new Uint8Array(),
            }
          : response(new TextEncoder().encode("%PDF-1.7")),
    });
    expect(result.extension).toBe("pdf");
    expect(result.url).toBe("https://cdn.test/signed-download");
  });

  it("enforces MIME and the 50MB response limit", async () => {
    await expect(
      downloadDocument("https://example.test/a.pdf", {
        lookup: publicLookup,
        request: async () =>
          response(new Uint8Array([1]), { "content-type": "text/html" }),
      }),
    ).rejects.toThrow("expected file type");
    await expect(
      downloadDocument("https://example.test/a.pdf", {
        lookup: publicLookup,
        request: async () => response(new Uint8Array(50 * 1024 * 1024 + 1)),
      }),
    ).rejects.toThrow("too large");
  });

  it("rejects binary content whose signature does not match the URL type", async () => {
    await expect(
      downloadDocument("https://example.test/a.pdf", {
        lookup: publicLookup,
        request: async () => response(new TextEncoder().encode("not a pdf")),
      }),
    ).rejects.toThrow("signature");
  });
});
