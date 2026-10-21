// A local stand-in for the Trigger.dev API, so Playwright never reaches the real service (γ4 orientation).
// It accepts task triggers and records them; tests read the record and play the task's part in the database.
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 3199);
const triggered = [];
let failNext = 0;

// The SDK sends payloads as superjson text: {"json": ...}.
function decodePayload(payload) {
  if (typeof payload !== "string") return payload;
  try {
    const parsed = JSON.parse(payload);
    return parsed && typeof parsed === "object" && "json" in parsed ? parsed.json : parsed;
  } catch {
    return payload;
  }
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${port}`);
  const send = (status, body) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };
  if (request.method === "GET" && url.pathname === "/") return send(200, { ok: true });
  if (request.method === "GET" && url.pathname === "/__triggered") return send(200, triggered);
  if (request.method === "POST" && url.pathname === "/__reset") {
    triggered.length = 0;
    failNext = Number(url.searchParams.get("fail") ?? 0);
    return send(200, { ok: true });
  }
  const match = /^\/api\/v1\/tasks\/([^/]+)\/trigger$/.exec(url.pathname);
  if (request.method === "POST" && match) {
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      if (failNext > 0) {
        failNext -= 1;
        return send(400, { error: "Stand-in refused this trigger." });
      }
      const body = raw ? JSON.parse(raw) : {};
      const id = `run_standin_${triggered.length + 1}`;
      triggered.push({ id, task: decodeURIComponent(match[1]), payload: decodePayload(body.payload), idempotencyKey: body.options?.idempotencyKey ?? null });
      send(200, { id });
    });
    return;
  }
  send(404, { error: `Not in the stand-in: ${request.method} ${url.pathname}` });
});

server.listen(port, () => console.log(`Trigger.dev stand-in on ${port}`));
