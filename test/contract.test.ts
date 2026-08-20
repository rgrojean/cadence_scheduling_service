import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Patient, PatientSearchResponse } from "../src/pis-client/schema.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures/pis");

function load(file: string) {
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
        expect(() => Patient.parse(raw), file).not.toThrow();
      }
    }
  });

  it("strict schema accepts v3 patient with no ssn", () => {
    const patient = load("patient-483921.json");
    expect(patient).not.toHaveProperty("ssn");
    expect(() => Patient.parse(patient)).not.toThrow();
  });

  it("strict schema rejects leftover v2 name, patientId, and ssn", () => {
    const patient = load("patient-483921.json");
    const leftover = {
      ...patient,
      name: "leftover-display",
      patientId: "leftover-id",
      ssn: "leftover-key",
    };
    expect(() => Patient.parse(leftover)).toThrow();
  });
});
