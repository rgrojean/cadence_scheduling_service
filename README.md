# Cadence — Appointment Scheduling Service

**Repo:** `scheduling-service` · **Owning team:** Access & Scheduling (Digital Health) · **In production since:** March 2022 · **Stack:** TypeScript / Node 20 / Fastify / Postgres

---

## What it is

Cadence is Riverbend Health's internal scheduling engine. It manages appointment slot inventory for 41 clinics across the Riverbend and (since the 2024 acquisition) St. Ansgar facilities, and it books, reschedules, and cancels appointments on behalf of three callers: the front-desk scheduling UI, the MyRiverbend patient portal's "book a visit" flow, and the automated SMS reminder pipeline. It does not own patient identity — it stores appointments keyed by `patientId` and asks the Patient Identity Service (PIS) for demographics whenever a human needs to see who an appointment belongs to.

Roughly 9,000 appointments touch Cadence on a weekday. Its consumers care about two things: that a slot, once booked, stays booked (no double-booking under concurrency), and that the reminder pipeline sends the right message to the right phone.

## History

Cadence replaced a scheduling module inside the legacy practice-management suite that IT retired in 2022. It was built in-house by the Access & Scheduling team, which was staffed during the 2021 digital-health push and follows current platform conventions: services are TypeScript, clients for internal APIs are generated from their OpenAPI specs, and runtime inputs are validated at the boundary. Cadence is generally considered the best-maintained consumer of PIS and is often the reference implementation new teams are pointed at.

## Architecture

```
front-desk UI ─┐
portal (book) ─┼──► Cadence API (Fastify) ──► Postgres (slots, appointments)
reminder cron ─┘         │
                         └──► PIS v3 (generated client, read-only)
```

Three components in one repo:

- **API layer** (`src/api/`) — REST endpoints for slot search, booking, cancellation. Booking uses a Postgres advisory lock per slot to prevent double-booking.
- **Reminder worker** (`src/reminders/`) — a cron-driven job that runs every 15 minutes, finds appointments in the next 48 hours, fetches each patient's current phone number from PIS, and enqueues SMS messages to the outbound messaging gateway.
- **PIS client** (`src/pis-client/`, generated) — a typed client generated from the PIS v3 OpenAPI document with `openapi-generator`, wrapped in `src/identity.ts`.

## How Cadence consumes the Patient Identity Service

Cadence calls two PIS endpoints: `GET /v2/patients/{patientId}` (demographics for appointment display and reminders) and `GET /v2/patients?q=` (typeahead for front-desk patient lookup).

Per team convention, every PIS response is validated at the boundary before it enters the application. The generated client types the full v3 payload, and a Zod schema (`src/pis-client/schema.ts`) mirrors the v3 spec exactly — all fields the spec marks required are required in the schema. The team's linter forbids `.passthrough()`/partial schemas on external boundaries — the position being that silent contract drift is worse than a loud failure.

```ts
export const Patient = z.object({
  identifier: z.array(Identifier).min(1),
  given: z.array(z.string()).min(1),
  family: z.string(),
  dob: z.string(),           // "MM/DD/YYYY"
  gender: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  address: Address,
}).strict();

export async function getPatient(id: string): Promise<Patient> {
  const res = await pisRaw.getPatient(id);
  return Patient.parse(res);   // throws on any contract deviation
}
```

The application itself uses four fields: a composed display name from `family` + `given[]` (rendered on appointment cards and in reminder text — `family + ", " + given.join(" ")`, or family only when given is empty), `dob` (shown to front desk for verbal identity confirmation at check-in), `phone` (reminder delivery), and `patientId` (the foreign key everything is stored under, taken from the Riverbend `identifier.system` value; lookups fail closed when that system is absent). HTTP paths `GET /v2/patients` and `GET /v2/patients/{patientId}` are unchanged so stored `appointments.patient_id` remains the path key.

## Data storage

Postgres holds `slots`, `appointments`, and `reminder_log`. No PIS data is persisted except `patientId`; demographics are fetched on read. This was a deliberate 2022 decision after a privacy review — Cadence's database contains no PHI beyond the appointment fact itself.

## Testing & CI

The strongest suite in the fleet: unit tests for booking logic (including a concurrency test that hammers one slot from 20 workers), and integration tests for the reminder worker that run against recorded PIS v3 response fixtures (`test/fixtures/pis/*.json`). CI runs on every PR: lint, typecheck, tests, plus a contract check that re-validates the fixtures against the Zod schema. Merges to `main` require one review from the Access & Scheduling team per CODEOWNERS.

## Operational notes

The reminder worker is the component with a pager history: twice in 2024 it sent reminders with stale phone numbers because a PIS staging outage caused fallback to cached responses; the fallback was removed, and the worker now fails closed (no reminder rather than a possibly-wrong reminder). During the St. Ansgar migration wave, front desk staff have flagged occasional typeahead confusion when the same person appears under both a Riverbend and a St. Ansgar record — tracked as a known issue pending the enterprise identity consolidation.

## Data Samples

{
  "data": [
    {
      "identifier": [{ "system": "urn:riverbend:mrn", "value": "483921" }],
      "given": ["Maria"],
      "family": "Garcia",
      "dob": "03/15/1961",
      "gender": "F",
      "phone": "615-555-0142",
      "email": "mgarcia@example.com",
      "address": {
        "line1": "412 Oak Street",
        "city": "Nashville",
        "state": "TN",
        "zip": "37211"
      }
    },
    {
      "identifier": [{ "system": "urn:riverbend:mrn", "value": "100101" }],
      "given": ["Maria", "del Carmen"],
      "family": "Garcia Lopez",
      "dob": "07/22/1978",
      "gender": "F",
      "phone": "615-555-0188",
      "email": "mdc.garcia@example.com",
      "address": {
        "line1": "88 Belmont Ave",
        "city": "Nashville",
        "state": "TN",
        "zip": "37212"
      }
    },
    {
      "identifier": [{ "system": "urn:riverbend:mrn", "value": "100102" }],
      "given": ["Jan"],
      "family": "Van Der Berg",
      "dob": "11/03/1955",
      "gender": "M",
      "phone": "615-555-0199",
      "email": null,
      "address": {
        "line1": "1201 West End Blvd",
        "city": "Nashville",
        "state": "TN",
        "zip": "37203"
      }
    },
    {
      "identifier": [{ "system": "urn:riverbend:mrn", "value": "100103" }],
      "given": ["Robert"],
      "family": "King Jr",
      "dob": "01/09/1982",
      "gender": "M",
      "phone": "615-555-0110",
      "email": "rkingjr@example.com",
      "address": {
        "line1": "55 Music Row",
        "city": "Nashville",
        "state": "TN",
        "zip": "37203"
      }
    },
    {
      "identifier": [
        { "system": "urn:stansgar:mrn", "value": "sam-100104" },
        { "system": "urn:riverbend:mrn", "value": "100104" }
      ],
      "given": ["Sarah"],
      "family": "Williams",
      "dob": "05/14/1990",
      "gender": "F",
      "phone": "615-555-0121",
      "email": "swilliams.rvb@example.com",
      "address": {
        "line1": "900 Demonbreun St",
        "city": "Nashville",
        "state": "TN",
        "zip": "37203"
      }
    },
    {
      "identifier": [{ "system": "urn:stansgar:mrn", "value": "550001" }],
      "given": ["Anh"],
      "family": "Nguyen",
      "dob": "12/01/1973",
      "gender": "F",
      "phone": "615-555-0133",
      "email": "anguyen@example.com",
      "address": {
        "line1": "210 Charlotte Ave",
        "city": "Nashville",
        "state": "TN",
        "zip": "37201"
      }
    },
    {
      "identifier": [{ "system": "urn:stansgar:mrn", "value": "550002" }],
      "given": ["Helen"],
      "family": "Brooks",
      "dob": "08/30/1949",
      "gender": "F",
      "phone": "615-555-0155",
      "email": null,
      "address": {
        "line1": "77 Hillsboro Pike",
        "city": "Nashville",
        "state": "TN",
        "zip": "37215"
      }
    },
    {
      "identifier": [{ "system": "urn:riverbend:mrn", "value": "100105" }],
      "given": ["Earl"],
      "family": "Thompson",
      "dob": "06/06/1952",
      "gender": "M",
      "phone": "615-555-0201",
      "email": "ethompson@example.com",
      "address": {
        "line1": "301 Gallatin Pike",
        "city": "Nashville",
        "state": "TN",
        "zip": "37206"
      }
    },
    {
      "identifier": [{ "system": "urn:riverbend:mrn", "value": "100106" }],
      "given": ["Wei"],
      "family": "Chen",
      "dob": "10/19/1985",
      "gender": "M",
      "phone": "615-555-0202",
      "email": "wchen@example.com",
      "address": {
        "line1": "1500 Church St",
        "city": "Nashville",
        "state": "TN",
        "zip": "37203"
      }
    },
    {
      "identifier": [{ "system": "urn:riverbend:mrn", "value": "100107" }],
      "given": ["Patricia"],
      "family": "Johnson",
      "dob": "03/03/1964",
      "gender": "F",
      "phone": "615-555-0203",
      "email": "pjohnson@example.com",
      "address": {
        "line1": "44 Nolensville Pike",
        "city": "Nashville",
        "state": "TN",
        "zip": "37211"
      }
    }
  ],
  "meta": {
    "total": 10
  }
}