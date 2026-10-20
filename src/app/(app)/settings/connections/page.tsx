import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Connections" };

export default function ConnectionsPage() {
  return <EmptyState title="No connections yet" text="Your Google connection and publishing targets will show here." />;
}
