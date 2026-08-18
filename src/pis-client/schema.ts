import { z } from "zod";

export const AddressV2 = z
  .object({
    line1: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
  })
  .strict();

export const IdentifierV2 = z
  .object({
    system: z.string(),
    value: z.string(),
  })
  .strict();

export const PatientV2 = z
  .object({
    identifier: z.array(IdentifierV2).min(1),
    given: z.array(z.string()).min(1),
    family: z.string(),
    dob: z.string(), // "MM/DD/YYYY"
    gender: z.string(),
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
