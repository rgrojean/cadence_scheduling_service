import { z } from "zod";

export const AddressV2 = z
  .object({
    line1: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
  })
  .strict();

export const PatientV2 = z
  .object({
    patientId: z.string(),
    name: z.string(), // "Garcia, Maria"
    dob: z.string(), // "MM/DD/YYYY"
    gender: z.string(),
    ssn: z.string(), // present per v2 spec; not used by Cadence
    phone: z.string(),
    email: z.string().nullable(),
    address: AddressV2,
  })
  .strict();

export type PatientV2 = z.infer<typeof PatientV2>;

export const PatientSearchResponse = z
  .object({
    data: z.array(PatientV2),
    meta: z
      .object({
        total: z.number(),
        page: z.number(),
        nextPage: z.number().nullable(),
      })
      .strict(),
  })
  .strict();
export type PatientSearchResponse = z.infer<typeof PatientSearchResponse>;
