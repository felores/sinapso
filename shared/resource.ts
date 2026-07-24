export const DOCUMENT_EXTENSIONS = [
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
] as const;

export type DocumentExtension = (typeof DOCUMENT_EXTENSIONS)[number];
export type ResourceClassification =
  | { kind: "document"; url: string; extension: DocumentExtension }
  | { kind: "webpage"; url: string }
  | { kind: "unsupported" | "invalid"; reason: string };

const LEGACY_DOCUMENT = /\.(?:doc|ppt|rtf|odt|ods|odp)$/i;
const DOCUMENT = new Set<string>(DOCUMENT_EXTENSIONS);

function googleExport(url: URL): ResourceClassification | null {
  if (url.hostname !== "docs.google.com") return null;
  const match = url.pathname.match(
    /^\/(document|spreadsheets|presentation)\/d\/([^/]+)(?:\/|$)/,
  );
  if (!match) return { kind: "unsupported", reason: "google-share-url" };
  const [, product, id] = match;
  const extension: DocumentExtension =
    product === "document"
      ? "docx"
      : product === "spreadsheets"
        ? "xlsx"
        : "pptx";
  const path =
    product === "presentation"
      ? `/presentation/d/${id}/export/pptx`
      : `/${product}/d/${id}/export`;
  return {
    kind: "document",
    url: `https://docs.google.com${path}${product === "presentation" ? "" : `?format=${extension}`}`,
    extension,
  };
}

/** Pure URL classifier shared by browser intent and server trust boundaries. */
export function classifyResource(value: string): ResourceClassification {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return { kind: "invalid", reason: "invalid-url" };
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password
  )
    return { kind: "invalid", reason: "invalid-url" };

  const google = googleExport(url);
  if (google) return google;
  if (
    (url.hostname === "arxiv.org" || url.hostname === "export.arxiv.org") &&
    /^\/pdf\/[^/]+(?:\/[^/]+)?\/?$/.test(url.pathname)
  )
    return { kind: "document", url: url.toString(), extension: "pdf" };
  if (
    url.hostname === "drive.google.com" ||
    url.hostname === "onedrive.live.com" ||
    url.hostname === "1drv.ms" ||
    url.hostname === "office.com" ||
    url.hostname.endsWith(".office.com") ||
    url.hostname.endsWith(".sharepoint.com")
  )
    return { kind: "unsupported", reason: "cloud-share-url" };

  const path = url.pathname.toLowerCase();
  if (/\.(?:html?|xhtml)$/i.test(path))
    return { kind: "webpage", url: url.toString() };
  const extension = path.match(/\.([a-z0-9]+)$/)?.[1];
  if (extension && DOCUMENT.has(extension))
    return {
      kind: "document",
      url: url.toString(),
      extension: extension as DocumentExtension,
    };
  if (LEGACY_DOCUMENT.test(path))
    return { kind: "unsupported", reason: "unsupported-document" };
  return { kind: "webpage", url: url.toString() };
}
