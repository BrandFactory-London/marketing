import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Posts" };

export default function PostsPage() {
  return (
    <>
      <PageHeader eyebrow="Every post written, across all clients and projects." title="Posts" />
      <EmptyState title="No posts yet" text="Every post you write will show here, filterable by status and client." />
    </>
  );
}
