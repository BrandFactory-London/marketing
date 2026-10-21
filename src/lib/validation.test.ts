import { describe, expect, it } from "vitest";
import { isUuid, normaliseSiteUrl, optionalText, siteHost } from "./validation";

describe("form validation helpers", () => {
  it("trims text and turns blanks into null", () => {
    expect(optionalText("  Migss  ")).toBe("Migss");
    expect(optionalText("   ")).toBeNull();
    expect(optionalText(undefined)).toBeNull();
  });

  it("normalises website addresses", () => {
    expect(normaliseSiteUrl("migssinteriors.com")).toBe("https://migssinteriors.com");
    expect(normaliseSiteUrl("https://www.migssinteriors.com/")).toBe("https://www.migssinteriors.com");
    expect(normaliseSiteUrl("http://localhost:4000/site/")).toBe("http://localhost:4000/site");
    expect(normaliseSiteUrl("ftp://example.com")).toBeNull();
    expect(normaliseSiteUrl("not a url")).toBeNull();
    expect(normaliseSiteUrl("intranet")).toBeNull();
  });

  it("shows a host without www", () => {
    expect(siteHost("https://www.migssinteriors.com")).toBe("migssinteriors.com");
  });

  it("accepts only well-formed uuids", () => {
    expect(isUuid("1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed")).toBe(true);
    expect(isUuid("1")).toBe(false);
    expect(isUuid("1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed' or 1=1")).toBe(false);
  });
});
