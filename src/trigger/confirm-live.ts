import { task } from "@trigger.dev/sdk";
import { getDb } from "@/db/client";
import { runLiveCheck } from "@/lib/live-check";

export type ConfirmLivePayload = { publicationId: string };

// After Wix accepts a post, look for it on the live site for up to 5 minutes (design decision 19, γ6 orientation Q5).
// It needs only the database and a public fetch. A failed run leaves the post Approved; "Check again" starts another.
export const confirmLive = task({
  id: "confirm-live",
  maxDuration: 15 * 60,
  retry: { maxAttempts: 1 },
  run: async (payload: ConfirmLivePayload) => runLiveCheck(payload.publicationId, { db: getDb() }),
});
