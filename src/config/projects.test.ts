import { describe, expect, it } from "vitest";
import { clientStatus } from "./projects";

describe("project config", () => {
  it("derives the client status from its projects", () => {
    expect(clientStatus([])).toBe("setup");
    expect(clientStatus(["paused", "active"])).toBe("active");
    expect(clientStatus(["paused"])).toBe("paused");
  });
});
