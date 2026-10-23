// Minimal Wix REST client for publishing (design decision 19, γ6 orientation Q1 to Q4). Every request shape here
// was confirmed against the Wix REST documentation on 23 Oct 2026; the tag and member reads were also confirmed
// against the Migss site with read-only calls (γ6 orientation approval, Q9).

export type WixCredentials = { apiKey: string; accountId: string; siteId: string };

// WIX_API_URL points the client at Playwright's local Wix stand-in; it is never set in Vercel.
export function wixApiBase(): string {
  return (process.env.WIX_API_URL ?? "https://www.wixapis.com").replace(/\/+$/, "");
}

// What Wix answered when a request failed: its HTTP status, its own message and its request ID, so Amir can see
// exactly what went wrong at which step.
export class WixError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly requestId: string | null = null,
  ) {
    super(message);
    this.name = "WixError";
  }
}

export type WixTag = { id: string; label: string; slug: string };
export type WixMember = { id: string; nickname: string };
export type WixUrl = { base?: string; path?: string };
export type WixDraft = { id: string; title: string; seoSlug?: string; status?: string; url?: WixUrl };
export type WixPost = { id: string; title: string; slug: string; url?: WixUrl };
export type WixFile = { id: string; url: string | null };

// The draft post fields γ6 sends (Create Draft Post). The cover is a Media Manager file ID without a wix:image prefix.
export type DraftPostInput = {
  title: string;
  memberId: string;
  tagIds: string[];
  excerpt: string;
  seoSlug: string;
  richContent: unknown;
  coverFileId: string;
};

const REQUEST_ID_HEADER = "x-wix-request-id";

function wixMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const record = body as { message?: unknown; details?: { applicationError?: { description?: unknown; code?: unknown } } };
    const application = record.details?.applicationError;
    const parts = [record.message, application?.description, application?.code].filter((part): part is string => typeof part === "string" && part.length > 0);
    if (parts.length > 0) return [...new Set(parts)].join(": ");
  }
  return `Wix answered with status ${status}.`;
}

export class WixClient {
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly credentials: WixCredentials,
    options: { fetchImpl?: typeof fetch } = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  // The docs: an API key goes in Authorization as it is (no "Bearer"), with either the site ID or the account ID
  // header, never both. Every call here is site-level.
  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${wixApiBase()}${path}`, {
        method,
        headers: {
          Authorization: this.credentials.apiKey,
          "wix-site-id": this.credentials.siteId,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      });
    } catch (error) {
      throw new WixError(`Could not reach Wix: ${error instanceof Error ? error.message : String(error)}`, null);
    }
    const requestId = response.headers.get(REQUEST_ID_HEADER);
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!response.ok) throw new WixError(wixMessage(parsed, response.status), response.status, requestId);
    return parsed as T;
  }

  async queryTagsBySlug(slugs: readonly string[]): Promise<WixTag[]> {
    if (slugs.length === 0) return [];
    const body = await this.request<{ tags?: WixTag[] }>("POST", "/blog/v3/tags/query", { query: { filter: { slug: { $in: [...slugs] } } } });
    return (body.tags ?? []).map(({ id, label, slug }) => ({ id, label, slug }));
  }

  async listMembers(): Promise<WixMember[]> {
    const body = await this.request<{ members?: { id: string; profile?: { nickname?: string } }[] }>(
      "GET",
      "/members/v1/members?fieldsets=PUBLIC&paging.limit=100",
    );
    return (body.members ?? []).map((member) => ({ id: member.id, nickname: member.profile?.nickname || member.id }));
  }

  // Generate File Upload URL, then PUT the bytes to it. filePath puts the file in a Media Manager folder, created
  // when it is missing.
  async uploadImage(input: { bytes: Uint8Array; mimeType: string; fileName: string; filePath: string }): Promise<WixFile> {
    const { uploadUrl } = await this.request<{ uploadUrl: string }>("POST", "/site-media/v1/files/generate-upload-url", {
      mimeType: input.mimeType,
      fileName: input.fileName,
      filePath: input.filePath,
    });
    if (!uploadUrl) throw new WixError("Wix did not return an upload URL.", null);
    const url = new URL(uploadUrl);
    url.searchParams.set("filename", input.fileName);
    let response: Response;
    try {
      response = await this.fetchImpl(url, { method: "PUT", headers: { "Content-Type": input.mimeType }, body: Buffer.from(input.bytes), cache: "no-store" });
    } catch (error) {
      throw new WixError(`Could not reach the Wix upload URL: ${error instanceof Error ? error.message : String(error)}`, null);
    }
    const text = await response.text();
    let parsed: { file?: { id?: string; url?: string } } | null = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!response.ok) throw new WixError(wixMessage(parsed, response.status), response.status, response.headers.get(REQUEST_ID_HEADER));
    if (!parsed?.file?.id) throw new WixError("Wix accepted the upload but returned no file ID.", response.status);
    return { id: parsed.file.id, url: parsed.file.url ?? null };
  }

  // Get Post By Slug. Null when no published post has the slug.
  async getPostBySlug(slug: string): Promise<WixPost | null> {
    try {
      const body = await this.request<{ post?: WixPost }>("GET", `/blog/v3/posts/slugs/${encodeURIComponent(slug)}?fieldsets=URL`);
      return body.post ?? null;
    } catch (error) {
      if (error instanceof WixError && error.status === 404) return null;
      throw error;
    }
  }

  async getPost(postId: string): Promise<WixPost> {
    const body = await this.request<{ post: WixPost }>("GET", `/blog/v3/posts/${encodeURIComponent(postId)}?fieldsets=URL`);
    return body.post;
  }

  // Query Draft Posts cannot filter on seoSlug, so drafts are found by title and matched on slug by the caller.
  async queryDraftsByTitle(title: string): Promise<WixDraft[]> {
    const body = await this.request<{ draftPosts?: WixDraft[] }>("POST", "/blog/v3/draft-posts/query", { query: { filter: { title: { $eq: title } } } });
    return body.draftPosts ?? [];
  }

  // Create Draft Post with publish false: the draft's ID is stored before anything is public (γ6 orientation Q4).
  async createDraft(input: DraftPostInput): Promise<WixDraft> {
    const body = await this.request<{ draftPost: WixDraft }>("POST", "/blog/v3/draft-posts", {
      draftPost: {
        title: input.title,
        memberId: input.memberId,
        tagIds: input.tagIds,
        excerpt: input.excerpt,
        seoSlug: input.seoSlug,
        richContent: input.richContent,
        media: { wixMedia: { image: { id: input.coverFileId } }, displayed: true, custom: true },
      },
      publish: false,
    });
    if (!body?.draftPost?.id) throw new WixError("Wix created the draft but returned no ID.", null);
    return body.draftPost;
  }

  // Publish Draft Post. Publishing an already published draft updates the same post (the docs), so a retry is safe.
  async publishDraft(draftId: string): Promise<string> {
    const body = await this.request<{ postId: string }>("POST", `/blog/v3/draft-posts/${encodeURIComponent(draftId)}/publish`, {});
    if (!body?.postId) throw new WixError("Wix published the draft but returned no post ID.", null);
    return body.postId;
  }
}
