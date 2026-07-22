import { describe, expect, it } from "vitest";
import { parseUiLocale } from "./locale";

describe("UI locale parsing", () => {
  it("accepts only Spanish and falls back safely to English", () => {
    expect(parseUiLocale("es")).toBe("es");
    expect(parseUiLocale("en")).toBe("en");
    expect(parseUiLocale("fr")).toBe("en");
    expect(parseUiLocale(["es"])).toBe("en");
  });
});
