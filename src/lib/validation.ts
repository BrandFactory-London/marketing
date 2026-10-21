// Small form-input helpers shared by the domain modules. Server actions pass FormData entries through these.

export type FieldErrors<K extends string> = Partial<Record<K, string>>;
export type Parsed<T, K extends string> = { ok: true; value: T } | { ok: false; errors: FieldErrors<K> };

export type FormInput = Record<string, unknown>;

export function formInput(formData: FormData): FormInput {
  return Object.fromEntries(formData.entries());
}

// Trimmed text, or null when empty.
export function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Route params reach the database only when they are well-formed, so a bad URL is a 404, not a Postgres error.
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string): boolean {
  return EMAIL.test(value);
}

// Accepts "migssinteriors.com" or a full URL. Returns the origin plus any path, without a trailing slash.
export function normaliseSiteUrl(value: string): string | null {
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path}`;
}

// "https://www.migssinteriors.com" becomes "migssinteriors.com", for cards and headers.
export function siteHost(siteUrl: string): string {
  try {
    return new URL(siteUrl).host.replace(/^www\./, "");
  } catch {
    return siteUrl;
  }
}
