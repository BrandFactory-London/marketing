import type { PublishStep } from "@/db/schema";

// The publish steps as Amir sees them, in order (γ6 orientation Q4).
export const PUBLISH_STEP_LABELS: Record<PublishStep, string> = {
  cover: "Cover",
  tag: "Pillar tag",
  draft: "Draft",
  publish: "Publish",
  live: "Live check",
};
