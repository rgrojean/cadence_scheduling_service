/** Generated-style types mirroring openapi.yaml (PIS v3). */
export interface AddressV2 {
  line1: string;
  city: string;
  state: string;
  zip: string;
}

export interface Identifier {
  system: string;
  value: string;
}

export interface PatientV2 {
  identifier: Identifier[];
  given: string[];
  family: string;
  dob: string;
  gender: string;
  phone: string;
  email: string | null;
  address: AddressV2;
}

export interface PatientSearchResponse {
  data: PatientV2[];
  meta: { total: number; page: number; nextPage: number | null };
}

export interface PisApi {
  getPatient(patientId: string): Promise<PatientV2>;
  searchPatients(q: string): Promise<PatientSearchResponse>;
}

/** Raw PIS v3 HTTP client (openapi-generator style). Path is unchanged. */
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
