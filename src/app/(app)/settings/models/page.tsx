import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "AI models" };

export default function ModelsPage() {
  return <EmptyState title="Models not set yet" text="The default writer, critic and derivative models will show here." />;
}
