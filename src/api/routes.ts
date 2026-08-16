import type { FastifyInstance } from "fastify";
import { bookSlot, cancelAppointment, pool, searchSlots } from "../db.js";
import { displayName, getPatient, riverbendPatientId, searchPatients } from "../identity.js";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/slots", async (req) => {
    const { clinicId } = req.query as { clinicId?: string };
    return { slots: await searchSlots(clinicId) };
  });

  app.post("/appointments", async (req, reply) => {
    const { slotId, patientId } = req.body as { slotId: string; patientId: string };
    const result = await bookSlot(slotId, patientId);
    if (!result.ok) return reply.code(409).send(result);
    return result;
  });

  app.delete("/appointments/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = await cancelAppointment(id);
    if (!ok) return reply.code(404).send({ ok: false });
    return { ok: true };
  });

  app.get("/appointments/:id/patient", async (req) => {
    const { id } = req.params as { id: string };
    // Demographics fetched on read — never stored
    const appt = await pool.query(`SELECT patient_id FROM appointments WHERE id = $1`, [id]);
    if (appt.rowCount === 0) return { error: "not_found" };
    const patient = await getPatient(appt.rows[0].patient_id);
    return {
      patientId: riverbendPatientId(patient),
      name: displayName(patient),
      dob: patient.dob,
    };
  });

  app.get("/patients", async (req) => {
    const { q } = req.query as { q: string };
    return searchPatients(q);
  });
}
