/** Generated-style types mirroring openapi.yaml (PIS v3). */
export interface Address {
  line1: string;
  city: string;
  state: string;
  zip: string;
}

export interface Identifier {
  system: string;
  value: string;
}

export interface Patient {
  identifier: Identifier[];
  given: string[];
  family: string;
  dob: string;
  gender: string;
  phone: string;
  email: string | null;
  address: Address;
}

export interface PatientSearchResponse {
  data: Patient[];
  meta: { total: number };
}

export interface PisApi {
  getPatient(patientId: string): Promise<Patient>;
  searchPatients(q: string): Promise<PatientSearchResponse>;
}

/** Raw PIS v3 HTTP client (openapi-generator style). */
export function createPisRawClient(baseUrl: string): PisApi {
  async function get<T>(path: string): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`);
    if (!res.ok) throw new Error(`PIS ${path} failed: ${res.status}`);
    return res.json() as Promise<T>;
  }
  return {
    getPatient: (patientId) => get(`/v2/patients/${encodeURIComponent(patientId)}`),
    searchPatients: (q) => get(`/v2/patients?q=${encodeURIComponent(q)}`),
  };
}
