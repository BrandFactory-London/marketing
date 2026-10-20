import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "BrandFactory rules" };

export default function RulesPage() {
  return <EmptyState title="No rules yet" text="Writing rules and banned phrases that apply to every post will show here." />;
}
