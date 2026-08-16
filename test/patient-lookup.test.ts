import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { registerRoutes } from "../src/api/routes.js";
import { migrate, pool } from "../src/db.js";
import { Patient } from "../src/pis-client/schema.js";
import { riverbendPatientId } from "../src/identity.js";

const fixture = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "fixtures/pis/patient-483921.json"),
    "utf8"
  )
);

describe("GET /appointments/:id/patient", () => {
  const slotId = "slot_patient_lookup_1";
  const apptId = "appt_patient_lookup_1";
  const app = Fastify();

  beforeAll(async () => {
    await migrate();
    await registerRoutes(app);
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
          return { ok: true, json: async () => fixture };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      })
    );
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await app.close();
  });

  it("extracts Riverbend patientId from identifier array for /appointments/:id/patient response", async () => {
    const patient = Patient.parse(fixture);
    expect(patient.identifier[0].system).toBe("urn:stansgar:mrn");
    expect(patient.identifier[0].value).not.toBe("483921");
    expect(riverbendPatientId(patient)).toBe("483921");

    const res = await app.inject({ method: "GET", url: `/appointments/${apptId}/patient` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.patientId).toBe("483921");
    expect(body.name).toBe("Garcia, Maria");
    expect(body.dob).toBe("03/15/1961");
  });
});
