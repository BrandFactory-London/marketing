// The Migss frontend serves every Wix Blog post at /blog/<slug> (the scope's frontend reading).
export function plannedUrl(siteUrl: string, slug: string): string {
  return new URL(`/blog/${slug}`, siteUrl).toString();
}
