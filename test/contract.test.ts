import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  displayName,
  riverbendPatientId,
  RIVERBEND_MRN_SYSTEM,
} from "../src/identity.js";
import { PatientSearchResponse, PatientV2 } from "../src/pis-client/schema.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures/pis");

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

  it("parses v3 patient fixture with identifier, given, family and no ssn", () => {
    const raw = JSON.parse(
      readFileSync(join(fixtureDir, "patient-483921.json"), "utf8")
    );
    const patient = PatientV2.parse(raw);
    expect(patient.identifier).toEqual([
      { system: RIVERBEND_MRN_SYSTEM, value: "483921" },
    ]);
    expect(patient.given).toEqual(["Maria"]);
    expect(patient.family).toBe("Garcia");
    expect(patient).not.toHaveProperty("ssn");
    expect(patient).not.toHaveProperty("patientId");
    expect(patient).not.toHaveProperty("name");
  });

  it("extracts Riverbend identifier value from v3 patient", () => {
    const raw = JSON.parse(
      readFileSync(join(fixtureDir, "patient-483921.json"), "utf8")
    );
    const patient = PatientV2.parse(raw);
    expect(riverbendPatientId(patient)).toBe("483921");
  });

  it("composes display name from given[] and family", () => {
    const raw = JSON.parse(
      readFileSync(join(fixtureDir, "patient-483921.json"), "utf8")
    );
    const patient = PatientV2.parse(raw);
    expect(displayName(patient)).toBe("Garcia, Maria");
  });

  it("search fixture patients expose projected patientId and name fields", () => {
    const raw = JSON.parse(
      readFileSync(join(fixtureDir, "search-page1.json"), "utf8")
    );
    const result = PatientSearchResponse.parse(raw);
    const first = result.data[0];
    expect(riverbendPatientId(first)).toBe("483921");
    expect(displayName(first)).toBe("Garcia, Maria");
    expect(first).toHaveProperty("identifier");
    expect(first).toHaveProperty("given");
    expect(first).toHaveProperty("family");
  });
});
