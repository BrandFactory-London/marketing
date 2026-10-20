import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return (
    <>
      <PageHeader eyebrow="Each project is one site that gets marketing content, grouped by client." title="Projects" />
      <EmptyState title="No projects yet" text="Projects you add will show here, grouped by client." />
    </>
  );
}
