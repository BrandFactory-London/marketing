import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  return (
    <>
      <PageHeader eyebrow="BrandFactory Marketing" title="Home" />
      <EmptyState title="No projects yet" text="Your projects and the next two weeks of posts will show here." />
    </>
  );
}
