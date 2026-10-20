import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "BrandFactory calendar" };

export default function CalendarPage() {
  return (
    <>
      <PageHeader eyebrow="Every post across all projects." title="BrandFactory calendar" />
      <EmptyState title="Nothing planned yet" text="Planned slots and written posts for every project will show here." />
    </>
  );
}
