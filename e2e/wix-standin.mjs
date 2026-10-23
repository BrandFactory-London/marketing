// A local stand-in for the Wix REST API (γ6 orientation Q9), so Playwright never reaches Wix. It serves the calls
// publishing makes (tags, members, the upload URL and the upload, draft posts, posts by slug and ID), checks the key
// and site headers, and can fail a route once. The live check runs in Trigger.dev, which Playwright stands in for.
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 3197);
const origin = `http://localhost:${port}`;
export const KEY = "IST.playwright-wix-key-0000000000000000-pw01";
export const SITE = "cba1d6e0-2aaa-4097-b52d-71939abe2255";

let state;
function reset() {
  state = {
    tags: [
      { id: "tag-bath", label: "Bathroom Renovation", slug: "bathroom-renovation" },
      { id: "tag-kitchen", label: "Kitchen Renovation", slug: "kitchen-renovation" },
    ],
    members: [
      { id: "fa29eebd-77ca-40d3-a742-64c80d431737", profile: { nickname: "Amir Taylor" } },
      { id: "ef67bb59-f6c7-4cdb-a269-5292568887cf", profile: { nickname: "info4499403" } },
    ],
    drafts: [],
    posts: [],
    files: [],
    failures: {},
  };
}
reset();
let counter = 0;

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", origin);
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  const json = (status, body) => {
    response.writeHead(status, { "content-type": "application/json", "x-wix-request-id": `pw-req-${++counter}` });
    response.end(JSON.stringify(body));
  };
  const fail = (route) => {
    if (!state.failures[route]) return false;
    delete state.failures[route];
    json(503, { message: "Service unavailable", details: { applicationError: { code: "STAND_IN", description: "Service unavailable" } } });
    return true;
  };

  if (url.pathname === "/") return json(200, { ok: true });
  if (url.pathname === "/__state") return json(200, state);
  if (url.pathname === "/__reset") return reset(), json(200, { ok: true });
  if (url.pathname === "/__fail") return (state.failures[url.searchParams.get("route")] = true), json(200, { ok: true });

  if (request.method === "PUT" && url.pathname.startsWith("/upload/")) {
    if (fail("upload")) return;
    const file = { id: `pw_${++counter}~mv2.jpg`, name: url.searchParams.get("filename"), size: raw.length, mimeType: request.headers["content-type"] };
    state.files.push(file);
    return json(200, { file: { id: file.id, displayName: file.name, url: `${origin}/media/${file.id}`, operationStatus: "PENDING" } });
  }
  if (request.headers.authorization !== KEY || request.headers["wix-site-id"] !== SITE || request.headers["wix-account-id"]) {
    return json(403, { message: "Permission denied", details: { applicationError: { code: "PERMISSION_DENIED", description: "The API key cannot reach this site" } } });
  }
  const body = raw.length ? JSON.parse(raw.toString("utf8")) : {};
  const path = url.pathname;
  if (request.method === "POST" && path === "/blog/v3/tags/query") {
    if (fail("tags")) return;
    const slugs = body.query?.filter?.slug?.$in ?? [];
    return json(200, { tags: state.tags.filter((tag) => slugs.includes(tag.slug)) });
  }
  if (request.method === "GET" && path === "/members/v1/members") {
    if (fail("members")) return;
    return json(200, { members: state.members });
  }
  if (request.method === "POST" && path === "/site-media/v1/files/generate-upload-url") {
    if (fail("uploadUrl")) return;
    return json(200, { uploadUrl: `${origin}/upload/${++counter}?token=pw` });
  }
  const bySlug = /^\/blog\/v3\/posts\/slugs\/(.+)$/.exec(path);
  if (request.method === "GET" && bySlug) {
    const post = state.posts.find((item) => item.slug === decodeURIComponent(bySlug[1]));
    return post ? json(200, { post }) : json(404, { message: "Post not found" });
  }
  const byId = /^\/blog\/v3\/posts\/([^/]+)$/.exec(path);
  if (request.method === "GET" && byId) {
    const post = state.posts.find((item) => item.id === byId[1]);
    return post ? json(200, { post }) : json(404, { message: "Post not found" });
  }
  if (request.method === "POST" && path === "/blog/v3/draft-posts/query") {
    const title = body.query?.filter?.title?.$eq;
    return json(200, { draftPosts: state.drafts.filter((draft) => draft.title === title) });
  }
  if (request.method === "POST" && path === "/blog/v3/draft-posts") {
    if (fail("createDraft")) return;
    const draft = { id: `draft-${++counter}`, title: body.draftPost.title, seoSlug: body.draftPost.seoSlug, status: "UNPUBLISHED", sent: body };
    state.drafts.push(draft);
    return json(200, { draftPost: { id: draft.id, title: draft.title, seoSlug: draft.seoSlug, status: draft.status } });
  }
  const publish = /^\/blog\/v3\/draft-posts\/([^/]+)\/publish$/.exec(path);
  if (request.method === "POST" && publish) {
    if (fail("publish")) return;
    const draft = state.drafts.find((item) => item.id === publish[1]);
    if (!draft) return json(404, { message: "Draft post not found" });
    if (!draft.postId) {
      const post = { id: `post-${++counter}`, title: draft.title, slug: draft.seoSlug, url: { base: "https://www.migssinteriors.com", path: `/blog/${draft.seoSlug}` } };
      state.posts.push(post);
      draft.postId = post.id;
      draft.status = "PUBLISHED";
    }
    return json(200, { postId: draft.postId });
  }
  return json(404, { message: `No stand-in route for ${request.method} ${path}` });
});

server.listen(port, () => console.log(`Wix stand-in on ${origin}`));
