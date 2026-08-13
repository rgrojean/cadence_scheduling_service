/** Generated-style types mirroring openapi.yaml (PIS v2). */
export interface AddressV2 {
  line1: string;
  city: string;
  state: string;
  zip: string;
}

export interface PatientV2 {
  patientId: string;
  name: string;
  dob: string;
  gender: string;
  ssn: string;
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

/** Raw PIS v2 HTTP client (openapi-generator style). */
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
