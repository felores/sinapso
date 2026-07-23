import { describe, expect, it } from "vitest";
import { createTrustedExternalSourceRegistry } from "./trusted-external-sources";

describe("trusted external source registry", () => {
  it("accepts 2,048-byte URLs and rejects 2,049-byte URLs", () => {
    const base = "https://example.com/";
    const url = (bytes: number) => base + "a".repeat(bytes - base.length);
    const accepted = url(2048);
    const rejected = url(2049);
    const registry = createTrustedExternalSourceRegistry(() => "source");

    expect(new TextEncoder().encode(accepted)).toHaveLength(2048);
    expect(new TextEncoder().encode(rejected)).toHaveLength(2049);
    expect(registry.register(accepted)).toEqual({
      id: "source",
      label: "example.com",
    });
    expect(registry.register(rejected)).toBeUndefined();
  });
});
