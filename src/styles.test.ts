import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

const sources = filesUnder(path.join(process.cwd(), "src")).filter(
  (file) => /\.(tsx?|css)$/.test(file) && !file.endsWith(".test.ts"),
);

describe("styling layer", () => {
  it("imports the design system CSS straight from design/system", () => {
    const layout = readFileSync(path.join(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(layout).toContain('import "../../design/system/tokens.css";');
    expect(layout).toContain('import "../../design/system/components/bundle.css";');
  });

  it("has no hardcoded colours in app code (D.3.2)", () => {
    const offenders = sources.filter((file) => /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("uses no Tailwind or shadcn (design decision 2)", () => {
    const pkg = readFileSync(path.join(process.cwd(), "package.json"), "utf8");
    expect(pkg).not.toMatch(/tailwind|shadcn|@radix-ui/);
  });
});
