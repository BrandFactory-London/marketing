import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "CRM" };

export default function CrmPage() {
  return (
    <>
      <PageHeader eyebrow="Clients and the marketing packages their projects run on." title="CRM" />
      <EmptyState title="No clients yet" text="Clients you add will show here with their projects and packages." />
    </>
  );
}
