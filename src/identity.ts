import { createPisRawClient } from "./pis-client/index.js";
import { PatientSearchResponse, PatientV2 } from "./pis-client/schema.js";
import type { PisApi } from "./pis-client/index.js";

export const RIVERBEND_MRN_SYSTEM = "urn:riverbend:mrn";

let pisRaw: PisApi | undefined;

function client(): PisApi {
  if (!pisRaw) {
    pisRaw = createPisRawClient(process.env.PIS_URL ?? "http://localhost:4110");
  }
  return pisRaw;
}

export function riverbendPatientId(patient: PatientV2): string {
  const match = patient.identifier.find((id) => id.system === RIVERBEND_MRN_SYSTEM);
  if (!match) throw new Error("missing Riverbend identifier");
  return match.value;
}

export function displayName(patient: PatientV2): string {
  return `${patient.family}, ${patient.given.join(" ")}`;
}

export async function getPatient(id: string): Promise<PatientV2> {
  const res = await client().getPatient(id);
  return PatientV2.parse(res); // throws on any contract deviation
}

export async function searchPatients(q: string): Promise<PatientSearchResponse> {
  const res = await client().searchPatients(q);
  return PatientSearchResponse.parse(res);
}
