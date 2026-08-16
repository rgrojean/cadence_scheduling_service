import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { PatientSearchResponse, Patient } from "../src/pis-client/schema.js";
import { displayName, riverbendPatientId, searchPatients } from "../src/identity.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures/pis");

function loadJson(file: string) {
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

  it("parses v3 patient fixture with identifier, given, family and no ssn", () => {
    const raw = loadJson("patient-483921.json");
    expect(raw).not.toHaveProperty("ssn");
    expect(raw).not.toHaveProperty("patientId");
    expect(raw).not.toHaveProperty("name");
    const parsed = Patient.parse(raw);
    expect(parsed.identifier.length).toBeGreaterThan(0);
    expect(parsed.given).toEqual(["Maria"]);
    expect(parsed.family).toBe("Garcia");
  });

  it("searchPatients validates v3 search-page fixture via PatientSearchResponse", async () => {
    const raw = loadJson("search-page1.json");
    expect(() => PatientSearchResponse.parse(raw)).not.toThrow();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => raw,
      }))
    );
    const result = await searchPatients("Garcia");
    expect(result.data).toHaveLength(raw.data.length);
    expect(result.data[0]).not.toHaveProperty("ssn");
    expect(result.data[0].identifier.length).toBeGreaterThan(0);
    expect(result.data[0].given.length).toBeGreaterThan(0);
    expect(result.data[0].family).toBeTruthy();
    vi.unstubAllGlobals();
  });
});

describe("v3 mapping helpers", () => {
  it("formats display name matching legacy v2 strings for edge-case fixtures", () => {
    const expected: Record<string, string> = {
      "patient-483921.json": "Garcia, Maria",
      "patient-100101.json": "Garcia Lopez, Maria del Carmen",
      "patient-100102.json": "Van Der Berg, Jan",
      "patient-100103.json": "King Jr, Robert",
    };
    for (const [file, legacy] of Object.entries(expected)) {
      const patient = Patient.parse(loadJson(file));
      expect(displayName(patient), file).toBe(legacy);
    }
  });
});
