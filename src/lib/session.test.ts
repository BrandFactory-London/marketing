import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));

const { withApiSession } = await import("./session");

describe("API session check", () => {
  it("answers 401 without calling the handler when there is no session", async () => {
    const handler = vi.fn();
    const response = await withApiSession(handler, async () => null);
    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("passes the signed-in user to the handler", async () => {
    const response = await withApiSession(
      async (user) => Response.json({ email: user.email }),
      async () => ({ user: { id: "u1", email: "hello@brandfactorylondon.com", name: "Amir" }, expires: "2099-01-01" }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ email: "hello@brandfactorylondon.com" });
  });
});
