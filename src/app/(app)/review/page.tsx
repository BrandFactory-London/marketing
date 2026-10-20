import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Review queue" };

export default function ReviewPage() {
  return (
    <>
      <PageHeader eyebrow="Every post waits here for your approval before it can publish." title="Review queue" />
      <EmptyState title="Nothing to review" text="Posts waiting for your approval will show here." />
    </>
  );
}
