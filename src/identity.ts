import { createPisRawClient } from "./pis-client/index.js";
import { PatientSearchResponse, Patient } from "./pis-client/schema.js";
import type { PisApi } from "./pis-client/index.js";

/** Riverbend MRN namespace — the expected system for Cadence bookable patientId. */
export const PRIMARY_IDENTIFIER_SYSTEM = "urn:riverbend:mrn";

export class IdentifierSystemMissingError extends Error {
  constructor() {
    super("identifier_system_missing");
    this.name = "IdentifierSystemMissingError";
  }
}

let pisRaw: PisApi | undefined;

function client(): PisApi {
  if (!pisRaw) {
    pisRaw = createPisRawClient(process.env.PIS_URL ?? "http://localhost:4110");
  }
  return pisRaw;
}

/** Rebuild the historical PIS display string: family + ", " + given parts (family only if given is empty). */
export function composeDisplayName(patient: { family: string; given: string[] }): string {
  const given = patient.given.filter((part) => part.length > 0).join(" ");
  if (given.length === 0) return patient.family;
  return `${patient.family}, ${given}`;
}

/**
 * Bookable Cadence patientId is the identifier.value for the expected (Riverbend) system.
 * When expectedValue is provided (path / appointments.patient_id), that value must equal
 * the Riverbend identifier — never echo a secondary system.
 */
export function bookablePatientId(patient: Patient, expectedValue?: string): string {
  const primary = patient.identifier.find((id) => id.system === PRIMARY_IDENTIFIER_SYSTEM);
  if (!primary) {
    throw new IdentifierSystemMissingError();
  }
  if (expectedValue !== undefined && primary.value !== expectedValue) {
    throw new IdentifierSystemMissingError();
  }
  return primary.value;
}

export type CadencePatientProjection = {
  patientId: string;
  name: string;
  dob: string;
  gender: string;
  phone: string;
  email: string | null;
  address: Patient["address"];
};

export async function getPatient(id: string): Promise<Patient> {
  const res = await client().getPatient(id);
  const patient = Patient.parse(res); // throws on any contract deviation
  bookablePatientId(patient, id);
  return patient;
}

export async function searchPatients(q: string): Promise<{
  data: CadencePatientProjection[];
  meta: { total: number };
}> {
  const res = await client().searchPatients(q);
  const parsed = PatientSearchResponse.parse(res);
  const data: CadencePatientProjection[] = [];
  for (const patient of parsed.data) {
    try {
      const patientId = bookablePatientId(patient);
      data.push({
        patientId,
        name: composeDisplayName(patient),
        dob: patient.dob,
        gender: patient.gender,
        phone: patient.phone,
        email: patient.email,
        address: patient.address,
      });
    } catch (err) {
      if (err instanceof IdentifierSystemMissingError) continue;
      throw err;
    }
  }
  return { data, meta: { total: data.length } };
}
