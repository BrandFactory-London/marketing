import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Run plan" };

// γ3: planned slots at the package's cadence, with topics.
export default function PlanPage() {
  return (
    <EmptyState
      title="No run plan yet"
      text="Planned slots for this project's package arrive with the calendar. You will fill in a topic for each slot here."
    />
  );
}
