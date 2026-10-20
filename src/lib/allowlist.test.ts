import { describe, expect, it } from "vitest";
import { isAllowedSignIn } from "./allowlist";

const allowed = "hello@brandfactorylondon.com";

describe("sign-in allowlist", () => {
  it("allows the verified allowed address, ignoring case and spaces", () => {
    expect(isAllowedSignIn({ email: "Hello@BrandFactoryLondon.com ", email_verified: true }, allowed)).toBe(true);
  });

  it("refuses any other address", () => {
    expect(isAllowedSignIn({ email: "someone@gmail.com", email_verified: true }, allowed)).toBe(false);
    expect(isAllowedSignIn({ email: "hello@brandfactorylondon.com.evil.io", email_verified: true }, allowed)).toBe(false);
  });

  it("refuses the allowed address when Google has not verified it", () => {
    expect(isAllowedSignIn({ email: allowed, email_verified: false }, allowed)).toBe(false);
    expect(isAllowedSignIn({ email: allowed }, allowed)).toBe(false);
  });

  it("refuses everyone when ALLOWED_EMAIL is not set", () => {
    expect(isAllowedSignIn({ email: allowed, email_verified: true }, undefined)).toBe(false);
    expect(isAllowedSignIn({ email: allowed, email_verified: true }, "")).toBe(false);
  });

  it("refuses a missing profile", () => {
    expect(isAllowedSignIn(undefined, allowed)).toBe(false);
  });
});
