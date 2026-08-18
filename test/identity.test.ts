import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PatientV2 } from "../src/pis-client/schema.js";
import {
  composeDisplayName,
  getPatient,
  searchPatients,
} from "../src/identity.js";

describe("identity boundary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Zod Patient schema accepts a v3 payload with identifier/given/family and no ssn", () => {
    const payload = {
      identifier: [{ system: "urn:riverbend:mrn", value: "483921" }],
      given: ["Maria"],
      family: "Garcia",
      dob: "03/15/1961",
      gender: "F",
      phone: "615-555-0142",
      email: "mgarcia@example.com",
      address: {
        line1: "412 Oak Street",
        city: "Nashville",
        state: "TN",
        zip: "37211",
      },
    };
    expect(() => PatientV2.parse(payload)).not.toThrow();
    expect(PatientV2.parse(payload).given).toEqual(["Maria"]);
  });

  it("Cadence patientId is the value of identifier.system === urn:riverbend:mrn", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          identifier: [
            { system: "urn:stansgar:mrn", value: "999999" },
            { system: "urn:riverbend:mrn", value: "483921" },
          ],
          given: ["Maria"],
          family: "Garcia",
          dob: "03/15/1961",
          gender: "F",
          phone: "615-555-0142",
          email: null,
          address: { line1: "1 Main", city: "Nashville", state: "TN", zip: "37201" },
        }),
      }))
    );
    const patient = await getPatient("483921");
    expect(patient.patientId).toBe("483921");
  });

  it("Patient carrying only urn:stansgar:mrn is skipped, not booked or displayed via identifier[0]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: [
            {
              identifier: [{ system: "urn:stansgar:mrn", value: "999999" }],
              given: ["Test"],
              family: "Patient",
              dob: "01/01/1980",
              gender: "F",
              phone: "615-555-0000",
              email: null,
              address: { line1: "1 Main", city: "Nashville", state: "TN", zip: "37201" },
            },
            {
              identifier: [{ system: "urn:riverbend:mrn", value: "483921" }],
              given: ["Maria"],
              family: "Garcia",
              dob: "03/15/1961",
              gender: "F",
              phone: "615-555-0142",
              email: null,
              address: { line1: "1 Main", city: "Nashville", state: "TN", zip: "37201" },
            },
          ],
          meta: { total: 2, page: 1, nextPage: null },
        }),
      }))
    );
    const result = await searchPatients("garcia");
    expect(result.data).toHaveLength(1);
    expect(result.data[0].patientId).toBe("483921");
  });

  it("getPatient throws when urn:riverbend:mrn is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          identifier: [{ system: "urn:stansgar:mrn", value: "999999" }],
          given: ["Test"],
          family: "Patient",
          dob: "01/01/1980",
          gender: "F",
          phone: "615-555-0000",
          email: null,
          address: { line1: "1 Main", city: "Nashville", state: "TN", zip: "37201" },
        }),
      }))
    );
    await expect(getPatient("999999")).rejects.toThrow("missing Riverbend identifier");
  });

  it('Multi-part v2 display "Garcia Lopez, Maria del Carmen" is preserved when composing family/given', () => {
    const fixture = JSON.parse(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), "fixtures/pis/patient-100101.json"),
        "utf8"
      )
    );
    expect(composeDisplayName(fixture.family, fixture.given)).toBe(
      "Garcia Lopez, Maria del Carmen"
    );
  });

  it('Appointment card and reminder SMS render "Garcia, Maria" from family plus given[]', async () => {
    const fixture = JSON.parse(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), "fixtures/pis/patient-483921.json"),
        "utf8"
      )
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => fixture,
      }))
    );
    const patient = await getPatient("483921");
    expect(patient.name).toBe("Garcia, Maria");
  });
});
