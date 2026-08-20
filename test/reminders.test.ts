import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrate, pool } from "../src/db.js";
import { runReminders } from "../src/reminders/worker.js";

const fixture = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "fixtures/pis/patient-483921.json"),
    "utf8"
  )
);

describe("reminder worker", () => {
  const slotId = "slot_reminder_1";
  const apptId = "appt_reminder_1";

  beforeAll(async () => {
    await migrate();
    await pool.query(`DELETE FROM reminder_log`);
    await pool.query(`DELETE FROM appointments`);
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
          return {
            ok: true,
            json: async () => fixture,
          };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      })
    );
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await pool.end();
  });

  it("fetches patient phone/name from fixtures and logs an SMS (no live PIS)", async () => {
    const lines: string[] = [];
    const sent = await runReminders((msg) => lines.push(msg));
    expect(sent).toBe(1);
    expect(lines[0]).toContain("615-555-0142");
    expect(lines[0]).toContain("Garcia, Maria");
    expect(lines[0]).toMatch(/^\[SMS →/);
  });

  it("skip when patient has only a non-primary identifier system", async () => {
    await pool.query(`DELETE FROM reminder_log WHERE appointment_id = $1`, [apptId]);
    const skipApptId = "appt_reminder_skip";
    await pool.query(`DELETE FROM appointments WHERE id = $1`, [skipApptId]);
    await pool.query(`UPDATE appointments SET status = 'cancelled' WHERE id = $1`, [apptId]);
    await pool.query(
      `INSERT INTO appointments (id, slot_id, patient_id, status)
       VALUES ($1, $2, $3, 'booked')`,
      [skipApptId, slotId, "550001"]
    );
    const skipFixture = JSON.parse(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), "fixtures/pis/patient-550001.json"),
        "utf8"
      )
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/v2/patients/550001")) {
          return { ok: true, json: async () => skipFixture };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      })
    );
    const lines: string[] = [];
    const sent = await runReminders((msg) => lines.push(msg));
    expect(sent).toBe(0);
    expect(lines[0]).toMatch(/^\[skip]/);
    expect(lines[0]).toContain("identifier_system_missing");
    await pool.query(`DELETE FROM appointments WHERE id = $1`, [skipApptId]);
    await pool.query(`UPDATE appointments SET status = 'booked' WHERE id = $1`, [apptId]);
  });

  it("fails closed when PIS is unavailable", async () => {
    await pool.query(`DELETE FROM reminder_log WHERE appointment_id = $1`, [apptId]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }))
    );
    const lines: string[] = [];
    const sent = await runReminders((msg) => lines.push(msg));
    expect(sent).toBe(0);
    expect(lines[0]).toMatch(/^\[skip]/);
  });
});
