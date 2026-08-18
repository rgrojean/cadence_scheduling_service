import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PatientSearchResponse, PatientV2 } from "../src/pis-client/schema.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures/pis");

function loadFixture(file: string): unknown {
  return JSON.parse(readFileSync(join(fixtureDir, file), "utf8"));
}

describe("PIS v3 fixture contract check", () => {
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

  it("contract-validates v3 fixtures (identifier/given/family; no name, patientId, or ssn)", () => {
    const files = readdirSync(fixtureDir).filter((f) => f.endsWith(".json"));
    const patients: Record<string, unknown>[] = [];

    for (const file of files) {
      const raw = loadFixture(file) as Record<string, unknown>;
      if (file.startsWith("search-")) {
        const parsed = PatientSearchResponse.parse(raw);
        patients.push(...parsed.data);
      } else {
        patients.push(PatientV2.parse(raw));
      }
    }

    expect(patients.length).toBeGreaterThan(0);
    for (const patient of patients) {
      expect(patient).toHaveProperty("identifier");
      expect(patient).toHaveProperty("given");
      expect(patient).toHaveProperty("family");
      expect(patient).not.toHaveProperty("name");
      expect(patient).not.toHaveProperty("patientId");
      expect(patient).not.toHaveProperty("ssn");
    }
  });

  it("parses a v3 patient object that has no ssn field", () => {
    const raw = loadFixture("patient-483921.json") as Record<string, unknown>;
    expect(raw).not.toHaveProperty("ssn");
    expect(() => PatientV2.parse(raw)).not.toThrow();
  });
});
