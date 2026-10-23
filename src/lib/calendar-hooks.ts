import "server-only";
import { after } from "next/server";
import { syncCalendarSafely } from "./calendar-sync";

// Starts a calendar pass once the response has gone (γ8 orientation Q2), so a post action or a page is never slowed
// or blocked by Google. After an action every due event goes at once; a page read is throttled to one pass a minute.
export function syncCalendarAfter(kind: "action" | "read"): void {
  after(() => syncCalendarSafely({ throttle: kind === "read" }).then(() => undefined));
}
