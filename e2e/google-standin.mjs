// A local stand-in for Google's token and Drive APIs (γ5 orientation Q6), so Playwright never reaches Google.
// It serves a small folder tree like Migss's: a parent folder with Bathrooms and Kitchens subfolders.
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 3198);
const origin = `http://localhost:${port}`;
const FOLDER = "application/vnd.google-apps.folder";
const files = [
  { id: "playwright-migss", name: "Migss Interiors", mimeType: FOLDER, parents: ["my-drive"] },
  { id: "pw-bathrooms", name: "Bathrooms", mimeType: FOLDER, parents: ["playwright-migss"] },
  { id: "pw-kitchens", name: "Kitchens", mimeType: FOLDER, parents: ["playwright-migss"] },
  ...Array.from({ length: 64 }, (_, index) => ({ id: `pw-bath-${index + 1}`, name: `Wet room ${index + 1}.jpg`, mimeType: "image/jpeg", parents: ["pw-bathrooms"] })),
  { id: "pw-kitchen-1", name: "Shaker kitchen.jpg", mimeType: "image/jpeg", parents: ["pw-kitchens"] },
];

// A labelled tile, so screenshots show which photo is which.
function tile(id) {
  const file = files.find((item) => item.id === id);
  const hue = (Number(id.replace(/\D/g, "")) * 37) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="hsl(${hue} 35% 78%)"/><text x="16" y="128" font-family="sans-serif" font-size="22" fill="#1f2a30">${file?.name ?? id}</text></svg>`;
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", origin);
  const json = (status, body) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };
  if (url.pathname === "/") return json(200, { ok: true });
  if (url.pathname === "/token") return json(200, { access_token: "playwright-access-token", expires_in: 3600, scope: "https://www.googleapis.com/auth/drive.readonly" });
  if (request.headers.authorization !== "Bearer playwright-access-token") return json(401, { error: "unauthorised" });
  const thumb = /^\/thumb\/([^=]+)=s\d+$/.exec(url.pathname);
  if (thumb) {
    response.writeHead(200, { "content-type": "image/svg+xml" });
    return response.end(tile(thumb[1]));
  }
  const one = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
  if (one) {
    const file = files.find((item) => item.id === decodeURIComponent(one[1]));
    if (!file) return json(404, { error: "not found" });
    return json(200, { ...file, thumbnailLink: file.mimeType.startsWith("image/") ? `${origin}/thumb/${file.id}=s220` : undefined });
  }
  if (url.pathname === "/drive/v3/files") {
    const parent = /'([^']+)' in parents/.exec(url.searchParams.get("q") ?? "")?.[1];
    const all = files.filter((file) => file.parents.includes(parent) && (file.mimeType === FOLDER || file.mimeType.startsWith("image/")));
    const size = Number(url.searchParams.get("pageSize") ?? 100);
    const start = Number(url.searchParams.get("pageToken") ?? 0);
    return json(200, { files: all.slice(start, start + size), nextPageToken: start + size < all.length ? String(start + size) : undefined });
  }
  return json(404, { error: "not found" });
});

server.listen(port, () => console.log(`Google stand-in on ${origin}`));
