// Dates shown in the app, always in London time: "21 Oct 2026 at 14:02".
const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export function formatDateTime(value: Date | string): string {
  const at = typeof value === "string" ? new Date(value) : value;
  return `${date.format(at)} at ${time.format(at)}`;
}

export function formatDate(value: Date | string): string {
  return date.format(typeof value === "string" ? new Date(value) : value);
}

export function wordCount(text: string): number {
  const words = text.trim().match(/\S+/g);
  return words ? words.length : 0;
}

// Model costs in US dollars, before VAT (γ4 orientation Q7).
export function formatCost(usd: number): string {
  if (usd <= 0) return "$0.00";
  if (usd < 0.01) return "under $0.01";
  return `$${usd.toFixed(2)}`;
}
