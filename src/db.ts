import { Pool } from "pg";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS slots (
      id TEXT PRIMARY KEY,
      clinic_id TEXT NOT NULL,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      slot_id TEXT NOT NULL REFERENCES slots(id),
      patient_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('booked', 'cancelled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS reminder_log (
      id TEXT PRIMARY KEY,
      appointment_id TEXT NOT NULL REFERENCES appointments(id),
      sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

/** Book under a Postgres advisory lock per slot to prevent double-booking. */
export async function bookSlot(
  slotId: string,
  patientId: string
): Promise<{ ok: true; appointmentId: string } | { ok: false; reason: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [slotId]);
    const slot = await client.query("SELECT id FROM slots WHERE id = $1", [slotId]);
    if (slot.rowCount === 0) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "slot_not_found" };
    }
    const existing = await client.query(
      `SELECT id FROM appointments WHERE slot_id = $1 AND status = 'booked'`,
      [slotId]
    );
    if ((existing.rowCount ?? 0) > 0) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "already_booked" };
    }
    const appointmentId = `appt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await client.query(
      `INSERT INTO appointments (id, slot_id, patient_id, status) VALUES ($1, $2, $3, 'booked')`,
      [appointmentId, slotId, patientId]
    );
    await client.query("COMMIT");
    return { ok: true, appointmentId };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function cancelAppointment(appointmentId: string): Promise<boolean> {
  const res = await pool.query(
    `UPDATE appointments SET status = 'cancelled' WHERE id = $1 AND status = 'booked'`,
    [appointmentId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function searchSlots(clinicId?: string) {
  const res = await pool.query(
    `SELECT s.* FROM slots s
     WHERE ($1::text IS NULL OR s.clinic_id = $1)
       AND NOT EXISTS (
         SELECT 1 FROM appointments a WHERE a.slot_id = s.id AND a.status = 'booked'
       )
     ORDER BY s.starts_at`,
    [clinicId ?? null]
  );
  return res.rows;
}
