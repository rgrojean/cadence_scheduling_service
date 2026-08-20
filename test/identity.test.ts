import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IdentifierSystemMissingError,
  bookablePatientId,
  composeDisplayName,
  searchPatients,
} from "../src/identity.js";
import { Patient } from "../src/pis-client/schema.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures/pis");

function load(file: string) {
  return JSON.parse(readFileSync(join(fixtureDir, file), "utf8"));
}

describe("display-name composer", () => {
  it("compose appointment and SMS display name from given[] and family", () => {
    const patient = Patient.parse(load("patient-483921.json"));
    expect(composeDisplayName(patient)).toBe("Garcia, Maria");
  });

  it("compose multi-given legal name Garcia Lopez, Maria del Carmen", () => {
    const patient = Patient.parse(load("patient-100101.json"));
    expect(patient.given.length).toBeGreaterThan(1);
    expect(composeDisplayName(patient)).toBe("Garcia Lopez, Maria del Carmen");
  });

  it("uses family only when given is empty", () => {
    expect(composeDisplayName({ family: "Garcia", given: [] })).toBe("Garcia");
  });
});

describe("identifier helper", () => {
  it("skip when patient has only a non-primary identifier system", () => {
    const patient = Patient.parse(load("patient-550001.json"));
    expect(() => bookablePatientId(patient)).toThrow(IdentifierSystemMissingError);
    expect(() => bookablePatientId(patient, "550001")).toThrow(IdentifierSystemMissingError);
  });

  it("returns bookable patientId only from the expected identifier system", () => {
    const dual = Patient.parse(load("patient-100104.json"));
    expect(bookablePatientId(dual)).toBe("100104");
    expect(bookablePatientId(dual, "100104")).toBe("100104");
    expect(() => bookablePatientId(dual, "sam-100104")).toThrow(IdentifierSystemMissingError);
  });
});

describe("GET /patients mapping", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GET /patients returns bookable patientId only from the expected identifier system", async () => {
    const search = load("search-page1.json");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => search,
      }))
    );

    const result = await searchPatients("Garcia");
    const ids = result.data.map((row) => row.patientId);

    expect(ids).toContain("483921");
    expect(ids).toContain("100101");
    expect(ids).toContain("100104");
    expect(ids).not.toContain("550001");
    expect(ids).not.toContain("550002");
    expect(ids).not.toContain("sam-100104");
    expect(result.data.find((row) => row.patientId === "100104")?.name).toBe("Williams, Sarah");
    expect(result.data.find((row) => row.patientId === "100101")?.name).toBe(
      "Garcia Lopez, Maria del Carmen"
    );
    expect(result.data.every((row) => !("ssn" in row))).toBe(true);
    expect(result.data.every((row) => !("identifier" in row))).toBe(true);
  });
});
