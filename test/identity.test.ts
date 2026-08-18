import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { registerRoutes } from "../src/api/routes.js";
import { migrate, pool } from "../src/db.js";
import {
  displayName,
  getPatient,
  riverbendMrn,
  searchPatients,
} from "../src/identity.js";
import { PatientV2 } from "../src/pis-client/schema.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures/pis");

function loadPatient(file: string): PatientV2 {
  return PatientV2.parse(JSON.parse(readFileSync(join(fixtureDir, file), "utf8")));
}

const garcia = loadPatient("patient-483921.json");
const nguyen = loadPatient("patient-550001.json");

const stansgarOnly = {
  ...nguyen,
  identifier: [{ system: "urn:stansgar:mrn", value: nguyen.identifier[0].value }],
};

const dualSystem = {
  ...garcia,
  identifier: [
    { system: "urn:stansgar:mrn", value: "100101" },
    { system: "urn:riverbend:mrn", value: "483921" },
  ],
};

describe("PIS v3 identity mapping", () => {
  it("composes appointment-card and SMS display name from given[] + family as Family, Given", () => {
    expect(displayName(garcia)).toBe("Garcia, Maria");
    expect(displayName(loadPatient("patient-100101.json"))).toBe(
      "Garcia Lopez, Maria del Carmen"
    );
    expect(displayName(loadPatient("patient-100102.json"))).toBe("Van Der Berg, Jan");
    expect(displayName(loadPatient("patient-100103.json"))).toBe("King Jr, Robert");
  });

  it("extracts Cadence patientId from identifier system urn:riverbend:mrn when a second system is also present", () => {
    expect(dualSystem.identifier[0].value).toBe("100101");
    expect(riverbendMrn(dualSystem)).toBe("483921");
    expect(riverbendMrn(stansgarOnly)).toBeUndefined();
  });

  it("parses a v3 patient object that has no ssn field", () => {
    expect(garcia).not.toHaveProperty("ssn");
    expect(() => PatientV2.parse(garcia)).not.toThrow();
  });
});

describe("PIS v3 getPatient / searchPatients", () => {
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("skips/flags a patient whose identifier[] contains only urn:stansgar:mrn (no urn:riverbend:mrn)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const href = String(url);
        if (href.includes("/v2/patients?") ) {
          return {
            ok: true,
            json: async () => ({
              data: [garcia, stansgarOnly],
              meta: { total: 2, page: 1, nextPage: null },
            }),
          };
        }
        if (href.includes("/v2/patients/")) {
          return { ok: true, json: async () => stansgarOnly };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      })
    );

    await expect(getPatient("550001")).rejects.toThrow("missing_riverbend_mrn");

    const search = await searchPatients("q");
    expect(search.data).toHaveLength(1);
    expect(riverbendMrn(search.data[0])).toBe("483921");
    expect(search.data.some((p) => riverbendMrn(p) === undefined)).toBe(false);
  });
});

describe("GET /appointments/:id/patient v3 card", () => {
  const slotId = "slot_v3_card_1";
  const apptId = "appt_v3_card_1";

  beforeAll(async () => {
    await migrate();
    await pool.query(`DELETE FROM reminder_log WHERE appointment_id = $1`, [apptId]);
    await pool.query(`DELETE FROM appointments WHERE id = $1`, [apptId]);
    await pool.query(`DELETE FROM slots WHERE id = $1`, [slotId]);
    await pool.query(
      `INSERT INTO slots (id, clinic_id, starts_at, ends_at)
       VALUES ($1, 'clinic_rb_01', now() + interval '24 hours', now() + interval '24 hours 30 minutes')`,
      [slotId]
    );
    await pool.query(
      `INSERT INTO appointments (id, slot_id, patient_id, status)
       VALUES ($1, $2, $3, 'booked')`,
      [apptId, slotId, "483921"]
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/v2/patients/483921")) {
          return { ok: true, json: async () => dualSystem };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      })
    );
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("composes appointment-card display name from given[] + family and uses the Riverbend identifier", async () => {
    const app = Fastify();
    await registerRoutes(app);
    const res = await app.inject({ method: "GET", url: `/appointments/${apptId}/patient` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({
      patientId: "483921",
      name: "Garcia, Maria",
      dob: garcia.dob,
    });
    await app.close();
  });
});
