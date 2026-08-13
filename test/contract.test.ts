import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PatientSearchResponse, PatientV2 } from "../src/pis-client/schema.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures/pis");

describe("PIS v2 fixture contract check", () => {
  it("re-validates every recorded fixture against the Zod schema", () => {
    const files = readdirSync(fixtureDir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(fixtureDir, file), "utf8"));
      if (file.startsWith("search-")) {
        expect(() => PatientSearchResponse.parse(raw), file).not.toThrow();
      } else {
        expect(() => PatientV2.parse(raw), file).not.toThrow();
      }
    }
  });
});
