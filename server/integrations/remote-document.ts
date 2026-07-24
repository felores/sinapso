import { request as httpRequest, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { lookup as dnsLookup } from "node:dns/promises";
import type { LookupFunction } from "node:net";
import { basename } from "node:path";
import {
  classifyResource,
  type DocumentExtension,
} from "../../shared/resource.js";

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const TOTAL_TIMEOUT_MS = 30_000;
const SOCKET_TIMEOUT_MS = 15_000;

export class RemoteDocumentError extends Error {}

export interface DownloadResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Uint8Array;
}

export interface RemoteDocumentDeps {
  lookup?: (
    hostname: string,
  ) => Promise<Array<{ address: string; family: 4 | 6 }>>;
  request?: (
    url: URL,
    address: { address: string; family: 4 | 6 },
  ) => Promise<DownloadResponse>;
}

export function pinnedLookup(address: {
  address: string;
  family: 4 | 6;
}): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) callback(null, [address]);
    else callback(null, address.address, address.family);
  };
}

function ipv4Public(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  )
    return false;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function ipv6Parts(address: string): number[] | null {
  const input = address.toLowerCase();
  if (input.includes(".")) return null; // IPv4-mapped/embedded IPv6 is never public here.
  const halves = input.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) =>
    part ? part.split(":").map((p) => Number.parseInt(p, 16)) : [];
  const left = parse(halves[0]);
  const right = parse(halves[1] ?? "");
  if (
    [...left, ...right].some((p) => !Number.isInteger(p) || p < 0 || p > 0xffff)
  )
    return null;
  if (halves.length === 1 && left.length !== 8) return null;
  if (left.length + right.length > 8) return null;
  return [...left, ...Array(8 - left.length - right.length).fill(0), ...right];
}

/** Reject every non-public range, including IPv4-mapped IPv6. */
export function isPublicAddress(address: string): boolean {
  if (address.includes(".")) return ipv4Public(address);
  const parts = ipv6Parts(address);
  if (!parts) return false;
  const first = parts[0];
  if ((first & 0xe000) !== 0x2000) return false; // global unicast only
  if (
    parts.slice(0, 5).every((part) => part === 0) &&
    (parts[5] === 0 || parts[5] === 0xffff)
  )
    return false; // IPv4-compatible and IPv4-mapped forms.
  if (
    parts.every((part) => part === 0) ||
    (parts.slice(0, 7).every((part) => part === 0) && parts[7] === 1)
  )
    return false;
  if (
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00
  )
    return false;
  if (
    (first === 0x2001 && parts[1] <= 0x0db8) ||
    first === 0x2002 ||
    (first === 0x64 && parts[1] === 0xff9b)
  )
    return false;
  return true;
}

function allowedMime(
  extension: DocumentExtension,
  contentType: string,
): boolean {
  const mime = contentType.split(";", 1)[0].trim().toLowerCase();
  if (mime === "application/octet-stream") return true;
  if (mime === "text/html" || mime === "application/xhtml+xml") return false;
  const exact: Record<DocumentExtension, string[]> = {
    pdf: ["application/pdf"],
    docx: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    pptx: [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
    xls: ["application/vnd.ms-excel"],
    xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    csv: ["text/csv", "application/csv"],
    json: ["application/json", "text/json"],
    xml: ["application/xml", "text/xml"],
    zip: ["application/zip", "application/x-zip-compressed"],
    epub: ["application/epub+zip"],
  };
  return (
    exact[extension].includes(mime) ||
    (extension === "xml" && mime.endsWith("+xml"))
  );
}

function matchesDocumentSignature(
  extension: DocumentExtension,
  body: Uint8Array,
): boolean {
  const starts = (...bytes: number[]) =>
    bytes.every((byte, index) => body[index] === byte);
  if (extension === "pdf") return starts(0x25, 0x50, 0x44, 0x46, 0x2d);
  if (["docx", "pptx", "xlsx", "zip", "epub"].includes(extension))
    return (
      starts(0x50, 0x4b, 0x03, 0x04) ||
      starts(0x50, 0x4b, 0x05, 0x06) ||
      starts(0x50, 0x4b, 0x07, 0x08)
    );
  if (extension === "xls")
    return starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  const text = new TextDecoder().decode(body.slice(0, 512)).trimStart();
  if (extension === "json") return text.startsWith("{") || text.startsWith("[");
  if (extension === "xml") return text.startsWith("<");
  return true; // CSV has no reliable file signature.
}

async function realRequest(
  url: URL,
  address: { address: string; family: 4 | 6 },
): Promise<DownloadResponse> {
  return new Promise((resolve, reject) => {
    const options: RequestOptions = {
      headers: { Accept: "application/octet-stream" },
      lookup: pinnedLookup(address),
    };
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      options,
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES)
            req.destroy(new RemoteDocumentError("document too large"));
          else chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
        res.on("error", reject);
      },
    );
    const total = setTimeout(
      () => req.destroy(new RemoteDocumentError("document download timed out")),
      TOTAL_TIMEOUT_MS,
    );
    req.once("close", () => clearTimeout(total));
    req.setTimeout(SOCKET_TIMEOUT_MS, () =>
      req.destroy(new RemoteDocumentError("document socket timed out")),
    );
    req.once("error", reject);
    req.end();
  });
}

function safeFilename(
  url: URL,
  extension: DocumentExtension,
  header: string | string[] | undefined,
): string {
  const raw = Array.isArray(header) ? header[0] : header;
  const named = raw?.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i)?.[1];
  const base =
    basename(named ? decodeURIComponent(named) : url.pathname) ||
    `document.${extension}`;
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return safe.toLowerCase().endsWith(`.${extension}`)
    ? safe
    : `${safe || "document"}.${extension}`;
}

export async function downloadDocument(
  value: string,
  deps: RemoteDocumentDeps = {},
) {
  let classified = classifyResource(value);
  if (classified.kind !== "document")
    throw new RemoteDocumentError("recognized document URL required");
  const lookup =
    deps.lookup ??
    (async (hostname: string) => {
      const rows = await dnsLookup(hostname, { all: true, verbatim: true });
      return rows.map((row) => ({
        address: row.address,
        family: row.family as 4 | 6,
      }));
    });
  const request = deps.request ?? realRequest;
  let url = new URL(classified.url);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    if (url.username || url.password)
      throw new RemoteDocumentError("URL credentials are not allowed");
    const addresses = await lookup(url.hostname);
    const address = addresses.find((candidate) =>
      isPublicAddress(candidate.address),
    );
    if (
      !address ||
      addresses.some((candidate) => !isPublicAddress(candidate.address))
    )
      throw new RemoteDocumentError("document host is not public");
    const response = await request(url, address);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.location;
      const target = Array.isArray(location) ? location[0] : location;
      if (!target || redirects === MAX_REDIRECTS)
        throw new RemoteDocumentError("too many document redirects");
      const redirected = classifyResource(new URL(target, url).toString());
      if (
        redirected.kind === "invalid" ||
        redirected.kind === "unsupported" ||
        (redirected.kind === "document" &&
          redirected.extension !== classified.extension)
      )
        throw new RemoteDocumentError("redirect is not a recognized document");
      url = new URL(
        redirected.kind === "document" ? redirected.url : new URL(target, url),
      );
      continue;
    }
    if (response.status < 200 || response.status >= 300)
      throw new RemoteDocumentError("document download failed");
    if (response.body.byteLength > MAX_BYTES)
      throw new RemoteDocumentError("document too large");
    const contentType = response.headers["content-type"];
    const mime = Array.isArray(contentType) ? contentType[0] : contentType;
    if (!mime || !allowedMime(classified.extension, mime))
      throw new RemoteDocumentError(
        "document response is not the expected file type",
      );
    if (!matchesDocumentSignature(classified.extension, response.body))
      throw new RemoteDocumentError(
        "document signature does not match its type",
      );
    const preview = new TextDecoder()
      .decode(response.body.slice(0, 512))
      .trim()
      .toLowerCase();
    if (preview.startsWith("<!doctype html") || preview.startsWith("<html"))
      throw new RemoteDocumentError("document response is HTML");
    return {
      bytes: response.body,
      filename: safeFilename(
        url,
        classified.extension,
        response.headers["content-disposition"],
      ),
      url: url.toString(),
      extension: classified.extension,
    };
  }
  throw new RemoteDocumentError("too many document redirects");
}
