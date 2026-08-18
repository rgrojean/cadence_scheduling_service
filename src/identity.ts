import { createPisRawClient } from "./pis-client/index.js";
import { PatientSearchResponse, PatientV2 } from "./pis-client/schema.js";
import type { AddressV2, PisApi } from "./pis-client/index.js";

const RIVERBEND_MRN = "urn:riverbend:mrn";

export interface CadencePatient {
  patientId: string;
  name: string;
  dob: string;
  gender: string;
  phone: string;
  email: string | null;
  address: AddressV2;
}

export interface CadencePatientSearchResponse {
  data: CadencePatient[];
  meta: { total: number; page: number; nextPage: number | null };
}

let pisRaw: PisApi | undefined;

function client(): PisApi {
  if (!pisRaw) {
    pisRaw = createPisRawClient(process.env.PIS_URL ?? "http://localhost:4110");
  }
  return pisRaw;
}

export function composeDisplayName(family: string, given: string[]): string {
  return `${family}, ${given.join(" ")}`;
}

function extractRiverbendMrn(identifier: { system: string; value: string }[]): string | undefined {
  return identifier.find((id) => id.system === RIVERBEND_MRN)?.value;
}

function toCadencePatient(raw: PatientV2): CadencePatient {
  const patientId = extractRiverbendMrn(raw.identifier);
  if (!patientId) {
    throw new Error("missing Riverbend identifier");
  }
  return {
    patientId,
    name: composeDisplayName(raw.family, raw.given),
    dob: raw.dob,
    gender: raw.gender,
    phone: raw.phone,
    email: raw.email,
    address: raw.address,
  };
}

export async function getPatient(id: string): Promise<CadencePatient> {
  const res = await client().getPatient(id);
  return toCadencePatient(PatientV2.parse(res));
}

export async function searchPatients(q: string): Promise<CadencePatientSearchResponse> {
  const res = await client().searchPatients(q);
  const parsed = PatientSearchResponse.parse(res);
  const data: CadencePatient[] = [];
  for (const patient of parsed.data) {
    try {
      data.push(toCadencePatient(patient));
    } catch {
      // omit records lacking urn:riverbend:mrn
    }
  }
  return { data, meta: parsed.meta };
}
