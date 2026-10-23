// A fake Wix REST API for Vitest (γ6 orientation Q9). It keeps drafts, posts and uploaded files in memory, checks the
// API key and site ID headers, and can fail any route once so retries can be tested. Never the real Wix.

export type FakeRoute = "tags" | "members" | "uploadUrl" | "upload" | "postBySlug" | "getPost" | "queryDrafts" | "createDraft" | "publish";

type Draft = { id: string; title: string; seoSlug: string; status: "UNPUBLISHED" | "PUBLISHED"; body: Record<string, unknown>; postId?: string };
type Post = { id: string; title: string; slug: string };

export const FAKE_KEY = "IST.fake-wix-api-key-0000000000000000-7f3a";
export const FAKE_SITE = "cba1d6e0-2aaa-4097-b52d-71939abe2255";
export const FAKE_ACCOUNT = "0f0f0f0f-1111-2222-3333-444444444444";

export function fakeWix(options: { siteBase?: string } = {}) {
  const siteBase = options.siteBase ?? "https://www.migss.co.uk";
  const state = {
    tags: [
      { id: "tag-bath", label: "Bathroom Renovation", slug: "bathroom-renovation" },
      { id: "tag-kitchen", label: "Kitchen Renovation", slug: "kitchen-renovation" },
    ],
    members: [
      { id: "fa29eebd-77ca-40d3-a742-64c80d431737", profile: { nickname: "Amir Taylor" } },
      { id: "ef67bb59-f6c7-4cdb-a269-5292568887cf", profile: { nickname: "info4499403" } },
    ],
    drafts: [] as Draft[],
    posts: [] as Post[],
    files: [] as { id: string; name: string; size: number; mimeType: string }[],
    calls: [] as FakeRoute[],
    failures: new Map<FakeRoute, { status: number; message: string; times: number }>(),
    // Lose the reply to the next draft create after Wix has made it (γ6 orientation Q4).
    loseCreateReply: false,
    // Wix publishes at another slug than the draft's seoSlug (the docs do not say whether it ever does).
    publishSlug: null as string | null,
  };
  let counter = 0;
  const nextId = (prefix: string) => `${prefix}-${++counter}`;

  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "x-wix-request-id": `req-${counter}` } });

  function failing(route: FakeRoute): Response | null {
    state.calls.push(route);
    const failure = state.failures.get(route);
    if (!failure || failure.times <= 0) return null;
    failure.times -= 1;
    return reply(failure.status, { message: failure.message, details: { applicationError: { code: "FAKE_FAILURE", description: failure.message } } });
  }

  const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers);
    if (url.hostname === "upload.fake-wix.test") {
      const failure = failing("upload");
      if (failure) return failure;
      const bytes = init.body instanceof Uint8Array ? init.body.byteLength : 0;
      const file = { id: `8bde49_${nextId("cover")}~mv2.jpg`, name: url.searchParams.get("filename") ?? "file", size: bytes, mimeType: headers.get("content-type") ?? "" };
      state.files.push(file);
      return reply(200, { file: { id: file.id, displayName: file.name, url: `https://static.wixstatic.com/media/${file.id}`, operationStatus: "PENDING" } });
    }
    if (headers.get("authorization") !== FAKE_KEY || headers.get("wix-site-id") !== FAKE_SITE || headers.has("wix-account-id")) {
      return reply(403, { message: "Permission denied", details: { applicationError: { code: "PERMISSION_DENIED", description: "The API key cannot reach this site" } } });
    }
    const body = init.body ? JSON.parse(String(init.body)) : {};
    const path = url.pathname;

    if (method === "POST" && path === "/blog/v3/tags/query") {
      const failure = failing("tags");
      if (failure) return failure;
      const slugs: string[] = body.query?.filter?.slug?.$in ?? [];
      return reply(200, { tags: state.tags.filter((tag) => slugs.includes(tag.slug)) });
    }
    if (method === "GET" && path === "/members/v1/members") {
      const failure = failing("members");
      if (failure) return failure;
      return reply(200, { members: state.members });
    }
    if (method === "POST" && path === "/site-media/v1/files/generate-upload-url") {
      const failure = failing("uploadUrl");
      if (failure) return failure;
      return reply(200, { uploadUrl: `https://upload.fake-wix.test/upload/${nextId("u")}?token=abc` });
    }
    const bySlug = /^\/blog\/v3\/posts\/slugs\/(.+)$/.exec(path);
    if (method === "GET" && bySlug) {
      const failure = failing("postBySlug");
      if (failure) return failure;
      const post = state.posts.find((item) => item.slug === decodeURIComponent(bySlug[1]));
      return post ? reply(200, { post: { ...post, url: { base: siteBase, path: `/blog/${post.slug}` } } }) : reply(404, { message: "Post not found" });
    }
    const byId = /^\/blog\/v3\/posts\/([^/]+)$/.exec(path);
    if (method === "GET" && byId) {
      const failure = failing("getPost");
      if (failure) return failure;
      const post = state.posts.find((item) => item.id === byId[1]);
      return post ? reply(200, { post: { ...post, url: { base: siteBase, path: `/blog/${post.slug}` } } }) : reply(404, { message: "Post not found" });
    }
    if (method === "POST" && path === "/blog/v3/draft-posts/query") {
      const failure = failing("queryDrafts");
      if (failure) return failure;
      const title = body.query?.filter?.title?.$eq;
      return reply(200, { draftPosts: state.drafts.filter((draft) => draft.title === title).map(({ id, title: t, seoSlug, status }) => ({ id, title: t, seoSlug, status })) });
    }
    if (method === "POST" && path === "/blog/v3/draft-posts") {
      const failure = failing("createDraft");
      if (failure) return failure;
      const input = body.draftPost;
      if (!input?.memberId) return reply(400, { message: "Missing post owner information" });
      const draft: Draft = { id: nextId("draft"), title: input.title, seoSlug: input.seoSlug, status: "UNPUBLISHED", body };
      state.drafts.push(draft);
      if (state.loseCreateReply) {
        state.loseCreateReply = false;
        throw new TypeError("fetch failed: socket hang up");
      }
      return reply(200, { draftPost: { id: draft.id, title: draft.title, seoSlug: draft.seoSlug, status: draft.status } });
    }
    const publish = /^\/blog\/v3\/draft-posts\/([^/]+)\/publish$/.exec(path);
    if (method === "POST" && publish) {
      const failure = failing("publish");
      if (failure) return failure;
      const draft = state.drafts.find((item) => item.id === publish[1]);
      if (!draft) return reply(404, { message: "Draft post not found" });
      if (!draft.postId) {
        const slug = state.publishSlug ?? draft.seoSlug;
        const post = { id: nextId("post"), title: draft.title, slug };
        state.posts.push(post);
        draft.postId = post.id;
        draft.status = "PUBLISHED";
      }
      return reply(200, { postId: draft.postId });
    }
    return reply(404, { message: `No fake route for ${method} ${path}` });
  }) as typeof fetch;

  return {
    fetchImpl,
    state,
    failOnce(route: FakeRoute, status = 500, message = "Internal error") {
      state.failures.set(route, { status, message, times: 1 });
    },
  };
}
