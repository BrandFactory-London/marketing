import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Content and performance" };

// Phase 2: every page in the sitemap with its GA4 and Search Console figures.
export default function ContentPage() {
  return (
    <EmptyState
      title="No performance figures yet"
      text="Every page on the site will show here with its GA4 and Search Console figures once those connections arrive in Phase 2. The page list itself is on the Sitemap tab."
    />
  );
}
