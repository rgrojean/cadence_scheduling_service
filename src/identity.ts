import { createPisRawClient } from "./pis-client/index.js";
import { PatientSearchResponse, PatientV2 } from "./pis-client/schema.js";
import type { PisApi } from "./pis-client/index.js";

const RIVERBEND_MRN_SYSTEM = "urn:riverbend:mrn";

let pisRaw: PisApi | undefined;

function client(): PisApi {
  if (!pisRaw) {
    pisRaw = createPisRawClient(process.env.PIS_URL ?? "http://localhost:4110");
  }
  return pisRaw;
}

export function displayName(patient: PatientV2): string {
  return `${patient.family}, ${patient.given.join(" ")}`;
}

export function riverbendMrn(patient: PatientV2): string | undefined {
  const hit = patient.identifier.find((id) => id.system === RIVERBEND_MRN_SYSTEM);
  if (!hit?.value) return undefined;
  return hit.value;
}

function requireRiverbendMrn(patient: PatientV2): string {
  const value = riverbendMrn(patient);
  if (!value) {
    throw new Error("missing_riverbend_mrn");
  }
  return value;
}

export async function getPatient(id: string): Promise<PatientV2> {
  const res = await client().getPatient(id);
  const patient = PatientV2.parse(res); // throws on any contract deviation
  requireRiverbendMrn(patient);
  return patient;
}

export async function searchPatients(q: string): Promise<PatientSearchResponse> {
  const res = await client().searchPatients(q);
  const parsed = PatientSearchResponse.parse(res);
  return {
    ...parsed,
    data: parsed.data.filter((p) => riverbendMrn(p) !== undefined),
  };
}
