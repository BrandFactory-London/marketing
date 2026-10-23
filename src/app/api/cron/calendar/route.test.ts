import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

// The daily cron (γ8 orientation Q2): Vercel sends "Authorization: Bearer <CRON_SECRET>"; anything else is refused.
describe("the calendar cron route", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("refuses to run until CRON_SECRET is set", async () => {
    const response = await GET(new Request("http://localhost/api/cron/calendar"));
    expect(response.status).toBe(503);
  });

  it("refuses a request without the secret", async () => {
    process.env.CRON_SECRET = "s3cret";
    expect((await GET(new Request("http://localhost/api/cron/calendar"))).status).toBe(401);
    expect((await GET(new Request("http://localhost/api/cron/calendar", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
  });
});
