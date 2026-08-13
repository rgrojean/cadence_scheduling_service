import { beforeAll, describe, expect, it } from "vitest";
import { bookSlot, migrate, pool } from "../src/db.js";

describe("booking", () => {
  const slotId = "slot_concurrency_1";

  beforeAll(async () => {
    await migrate();
    await pool.query(`DELETE FROM reminder_log`);
    await pool.query(`DELETE FROM appointments`);
    await pool.query(`DELETE FROM slots WHERE id = $1`, [slotId]);
    await pool.query(
      `INSERT INTO slots (id, clinic_id, starts_at, ends_at)
       VALUES ($1, 'clinic_rb_01', now() + interval '1 day', now() + interval '1 day 30 minutes')`,
      [slotId]
    );
  });

  it("books a free slot", async () => {
    await pool.query(`DELETE FROM appointments WHERE slot_id = $1`, [slotId]);
    const result = await bookSlot(slotId, "483921");
    expect(result.ok).toBe(true);
  });

  it("rejects a second booking on the same slot", async () => {
    const result = await bookSlot(slotId, "100101");
    expect(result).toEqual({ ok: false, reason: "already_booked" });
  });

  it("allows exactly one success when 20 workers hammer one slot", async () => {
    await pool.query(`DELETE FROM appointments WHERE slot_id = $1`, [slotId]);

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => bookSlot(slotId, `patient_${i}`))
    );

    const successes = results.filter((r) => r.ok);
    const failures = results.filter((r) => !r.ok);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(19);

    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM appointments WHERE slot_id = $1 AND status = 'booked'`,
      [slotId]
    );
    expect(rows[0].n).toBe(1);
  });
});
