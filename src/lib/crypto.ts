import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { requireEnv } from "./env";

// AES-256-GCM for secrets at rest: the Google refresh token now, Wix credentials in γ6.
// Format: v1.<iv>.<tag>.<ciphertext>, each part base64url. The associated data names what the
// secret is and who owns it, so a ciphertext copied into another row or purpose will not decrypt.

const VERSION = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

// Says what is wrong with an APP_ENCRYPTION_KEY value, or null when it is usable. Sign-in checks
// this first, so a missing or malformed key stops sign-in instead of failing later.
export function encryptionKeyProblem(value: string | undefined): string | null {
  if (!value) return "is not set";
  if (!BASE64.test(value.trim())) return "is not valid base64";
  const bytes = Buffer.from(value.trim(), "base64").length;
  if (bytes !== KEY_BYTES) return `decodes to ${bytes} bytes, not ${KEY_BYTES}`;
  return null;
}

export function parseKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(`APP_ENCRYPTION_KEY must be ${KEY_BYTES} bytes, base64 encoded.`);
  }
  return key;
}

function appKey(): Buffer {
  return parseKey(requireEnv("APP_ENCRYPTION_KEY"));
}

export function encrypt(plaintext: string, associatedData: string, key: Buffer = appKey()): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decrypt(payload: string, associatedData: string, key: Buffer = appKey()): string {
  const [version, iv, tag, ciphertext, ...rest] = payload.split(".");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined || rest.length > 0) {
    throw new Error("Encrypted value is not in the expected format.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(associatedData, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
