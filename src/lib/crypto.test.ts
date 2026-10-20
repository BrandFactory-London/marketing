import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { decrypt, encrypt, encryptionKeyProblem, parseKey } from "./crypto";

const key = randomBytes(32);

describe("AES-GCM helper", () => {
  afterEach(() => {
    delete process.env.APP_ENCRYPTION_KEY;
  });

  it("round-trips a value", () => {
    const payload = encrypt("1//refresh-token", "google-refresh-token:u1", key);
    expect(payload.startsWith("v1.")).toBe(true);
    expect(payload).not.toContain("refresh-token");
    expect(decrypt(payload, "google-refresh-token:u1", key)).toBe("1//refresh-token");
  });

  it("uses a fresh IV every time", () => {
    expect(encrypt("same", "aad", key)).not.toBe(encrypt("same", "aad", key));
  });

  it("rejects a tampered ciphertext", () => {
    const [version, iv, tag, ciphertext] = encrypt("secret value", "aad", key).split(".");
    const flipped = Buffer.from(ciphertext, "base64url");
    flipped[0] ^= 1;
    expect(() => decrypt([version, iv, tag, flipped.toString("base64url")].join("."), "aad", key)).toThrow();
  });

  it("rejects different associated data, so a value moved to another row will not decrypt", () => {
    const payload = encrypt("secret", "google-refresh-token:u1", key);
    expect(() => decrypt(payload, "google-refresh-token:u2", key)).toThrow();
  });

  it("rejects the wrong key", () => {
    const payload = encrypt("secret", "aad", key);
    expect(() => decrypt(payload, "aad", randomBytes(32))).toThrow();
  });

  it("rejects a malformed payload", () => {
    expect(() => decrypt("not-a-payload", "aad", key)).toThrow("expected format");
    expect(() => decrypt("v2.a.b.c", "aad", key)).toThrow("expected format");
  });

  it("only accepts a 32-byte key", () => {
    expect(() => parseKey(randomBytes(16).toString("base64"))).toThrow("32 bytes");
    expect(parseKey(key.toString("base64"))).toEqual(key);
  });

  it("reads the key from APP_ENCRYPTION_KEY and fails clearly when it is missing", () => {
    expect(() => encrypt("secret", "aad")).toThrow("APP_ENCRYPTION_KEY");
    process.env.APP_ENCRYPTION_KEY = key.toString("base64");
    expect(decrypt(encrypt("secret", "aad"), "aad")).toBe("secret");
  });

  it("names the problem with an unusable APP_ENCRYPTION_KEY, and accepts a 32-byte base64 key", () => {
    expect(encryptionKeyProblem(undefined)).toBe("is not set");
    expect(encryptionKeyProblem("")).toBe("is not set");
    expect(encryptionKeyProblem("not base64 at all!")).toBe("is not valid base64");
    expect(encryptionKeyProblem(randomBytes(16).toString("base64"))).toBe("decodes to 16 bytes, not 32");
    expect(encryptionKeyProblem(randomBytes(48).toString("base64"))).toBe("decodes to 48 bytes, not 32");
    expect(encryptionKeyProblem(key.toString("base64"))).toBeNull();
    expect(encryptionKeyProblem(`${key.toString("base64")}\n`)).toBeNull();
  });
});
