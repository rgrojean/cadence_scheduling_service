import { createPisRawClient } from "./pis-client/index.js";
import { PatientSearchResponse, Patient } from "./pis-client/schema.js";
import type { PisApi } from "./pis-client/index.js";

const RIVERBEND_MRN = "urn:riverbend:mrn";

let pisRaw: PisApi | undefined;

function client(): PisApi {
  if (!pisRaw) {
    pisRaw = createPisRawClient(process.env.PIS_URL ?? "http://localhost:4110");
  }
  return pisRaw;
}

export async function getPatient(id: string): Promise<Patient> {
  const res = await client().getPatient(id);
  return Patient.parse(res); // throws on any contract deviation
}

export async function searchPatients(q: string): Promise<PatientSearchResponse> {
  const res = await client().searchPatients(q);
  return PatientSearchResponse.parse(res);
}

/** Display string matching the legacy v2 "Family, Given Parts" form. */
export function displayName(patient: Patient): string {
  return `${patient.family}, ${patient.given.join(" ")}`;
}

/** Riverbend-namespaced identifier value used as the Cadence lookup key. */
export function riverbendPatientId(patient: Patient): string {
  const match = patient.identifier.find((id) => id.system === RIVERBEND_MRN);
  if (!match) {
    throw new Error("Riverbend identifier not found");
  }
  return match.value;
}
