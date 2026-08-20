import { z } from "zod";

export const Address = z
  .object({
    line1: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
  })
  .strict();

export const Identifier = z
  .object({
    system: z.string(),
    value: z.string(),
  })
  .strict();

export const Patient = z
  .object({
    identifier: z.array(Identifier).min(1),
    given: z.array(z.string()).min(1),
    family: z.string(),
    dob: z.string(), // "MM/DD/YYYY"
    gender: z.string(),
    phone: z.string(),
    email: z.string().nullable(),
    address: Address,
  })
  .strict();

export type Patient = z.infer<typeof Patient>;

export const PatientSearchResponse = z
  .object({
    data: z.array(Patient),
    meta: z
      .object({
        total: z.number(),
      })
      .strict(),
  })
  .strict();
export type PatientSearchResponse = z.infer<typeof PatientSearchResponse>;
