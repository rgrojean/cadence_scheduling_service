import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { registerRoutes } from "../src/api/routes.js";
import { migrate, pool } from "../src/db.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures/pis");

function load(file: string) {
  return JSON.parse(readFileSync(join(fixtureDir, file), "utf8"));
}

describe("appointment card and typeahead projections", () => {
  const slotId = "slot_projection_1";
  const apptId = "appt_projection_1";
  const skipApptId = "appt_projection_skip";

  beforeAll(async () => {
    await migrate();
    await pool.query(`DELETE FROM reminder_log WHERE appointment_id IN ($1, $2)`, [
      apptId,
      skipApptId,
    ]);
    await pool.query(`DELETE FROM appointments WHERE id IN ($1, $2)`, [apptId, skipApptId]);
    await pool.query(`DELETE FROM slots WHERE id = $1`, [slotId]);
    await pool.query(
      `INSERT INTO slots (id, clinic_id, starts_at, ends_at)
       VALUES ($1, 'clinic_rb_01', now() + interval '1 day', now() + interval '1 day 30 minutes')`,
      [slotId]
    );
    await pool.query(
      `INSERT INTO appointments (id, slot_id, patient_id, status)
       VALUES ($1, $2, $3, 'booked')`,
      [apptId, slotId, "483921"]
    );
    await pool.query(
      `INSERT INTO appointments (id, slot_id, patient_id, status)
       VALUES ($1, $2, $3, 'cancelled')`,
      [skipApptId, slotId, "550001"]
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
  });

  it("compose appointment display name from given[] and family", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/v2/patients/483921")) {
          return { ok: true, json: async () => load("patient-483921.json") };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      })
    );

    const app = Fastify();
    await registerRoutes(app);
    const res = await app.inject({ method: "GET", url: `/appointments/${apptId}/patient` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      patientId: "483921",
      name: "Garcia, Maria",
      dob: "03/15/1961",
    });
    await app.close();
  });

  it("skips appointment-card projection when only a non-primary identifier system is present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => load("patient-550001.json"),
      }))
    );

    const app = Fastify();
    await registerRoutes(app);
    const res = await app.inject({ method: "GET", url: `/appointments/${skipApptId}/patient` });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: "identifier_system_missing" });
    await app.close();
  });

  it("GET /patients returns bookable patientId only from the expected identifier system", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => load("search-page1.json"),
      }))
    );

    const app = Fastify();
    await registerRoutes(app);
    const res = await app.inject({ method: "GET", url: "/patients?q=Garcia" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { patientId: string; name: string }[] };
    const ids = body.data.map((row) => row.patientId);
    expect(ids).toContain("100104");
    expect(ids).not.toContain("550001");
    expect(ids).not.toContain("sam-100104");
    expect(body.data.find((row) => row.patientId === "483921")?.name).toBe("Garcia, Maria");
    await app.close();
  });
});
