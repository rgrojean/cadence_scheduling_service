import "dotenv/config";
import { fileURLToPath } from "node:url";
import { pool } from "../db.js";
import { displayName, getPatient } from "../identity.js";

/**
 * Reminder worker — runs every 15 minutes in production (cron).
 * Finds appointments in the next 48 hours, fetches phone from PIS,
 * and enqueues SMS to the outbound messaging gateway.
 * Fails closed: if PIS is unreachable, skip the reminder (no stale cache).
 */
export async function runReminders(log: (msg: string) => void = console.log): Promise<number> {
  const { rows: appointments } = await pool.query(
    `SELECT a.id, a.patient_id, a.slot_id, s.starts_at
     FROM appointments a
     JOIN slots s ON s.id = a.slot_id
     WHERE a.status = 'booked'
       AND s.starts_at > now()
       AND s.starts_at <= now() + interval '48 hours'
       AND NOT EXISTS (
         SELECT 1 FROM reminder_log r WHERE r.appointment_id = a.id
       )
     ORDER BY s.starts_at`
  );

  let sent = 0;
  for (const appt of appointments) {
    try {
      const patient = await getPatient(appt.patient_id);
      const message = `Riverbend Health reminder: appointment for ${displayName(patient)} on ${new Date(appt.starts_at).toISOString()}. Reply HELP for help.`;
      // Stub messaging gateway — write intended message to stdout/log (no real SMS)
      const gateway = process.env.MESSAGING_GATEWAY_URL ?? "http://localhost:5100";
      log(`[SMS → ${patient.phone}] via ${gateway}: ${message}`);
      await pool.query(
        `INSERT INTO reminder_log (id, appointment_id) VALUES ($1, $2)`,
        [`rem_${appt.id}_${Date.now()}`, appt.id]
      );
      sent++;
    } catch (err) {
      // Fail closed — no reminder rather than a possibly-wrong reminder
      log(`[skip] appointment ${appt.id}: PIS unavailable or invalid (${(err as Error).message})`);
    }
  }
  return sent;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runReminders()
    .then((n) => {
      console.log(`Reminders processed: ${n}`);
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
