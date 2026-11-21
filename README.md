# MediBook — Clinic Appointment Booking Backend

Final assessment project: a RESTful backend for a community clinic, built with
**Node.js + Express.js + MySQL (parameterized queries, no ORM) + Redis**.

Doctors see patients in fixed 30-minute slots during working hours
(09:00–17:00) and can handle at most **12 appointments per day**. The system
supports booking with hard concurrency guarantees, cancellations with
tiered refunds, a Redis-backed waitlist with a separate worker process,
an append-only audit log, Jest unit tests, and a localized feedback page.

---

## 1. Requirements

- Node.js 18+
- MySQL 8.0.16+ (CHECK constraints must be enforced; MariaDB 10.2+ also works)
- Redis 6+

## 2. Setup

```bash
# 1. Clone your fork and install dependencies
git clone https://github.com/<your-username>/adv-backend-summative-medibook-project.git
cd adv-backend-summative-medibook-project
npm install

# 2. Configure the environment
cp .env.example .env        # then edit credentials

# 3. Create the database and load sample data
mysql -u root -p < database/schema.sql
mysql -u root -p < database/seed.sql

# 4. Start Redis (if not already running)
redis-server

# 5. Start the API
npm start                   # http://localhost:3000

# 6. In a SECOND terminal, start the worker (waitlist + notifications)
npm run worker

# 7. Run the tests (no MySQL/Redis needed)
npm test
```

## 3. Project structure

```
├── database/
│   ├── schema.sql          # DDL: 3 tables, keys, constraints (Part B.1)
│   └── seed.sql            # 3 patients, 3 doctors (one idle), 16 appointments
├── locales/
│   ├── en.json             # feedback page strings (English)
│   └── fr.json             # feedback page strings (French)
├── logs/                   # audit.log is created here at runtime (git-ignored)
├── src/
│   ├── config/             # MySQL pool and Redis client factories
│   ├── models/             # ALL application SQL lives here — nowhere else
│   ├── controllers/        # business logic; calls models, never the DB
│   ├── routes/             # URL/method -> controller mapping
│   ├── services/           # Redis queue operations (waitlist, notifications)
│   ├── middleware/         # central error handler, 404 handler
│   ├── utils/              # pure functions: refund, slot rules, audit logger
│   ├── app.js / server.js  # Express wiring / HTTP entry point
│   └── worker.js           # Part E worker process (npm run worker)
├── tests/                  # Jest unit tests (pure functions only)
├── schema-diagram.png/.pdf # Part A diagram
├── schema.dbml             # same diagram in dbdiagram.io format
└── .env.example
```

## 4. Database design (Part A) — normalization notes

The clinic's single spreadsheet mixes three kinds of facts in every row:
patient details, doctor details, and one booking. It was normalized to 3NF:

- **1NF** — every column is atomic; repeating groups (multiple appointments)
  are rows, not columns.
- **2NF** — after splitting out `appointments`, every non-key attribute
  depends on the whole key of its table (no partial dependencies).
- **3NF** — transitive dependencies removed: `specialty`, `consultation_fee`
  and `room` depend on the *doctor*, not on the appointment, so they live in
  `doctors`; patient name/email/phone live in `patients`. Nothing is stored
  twice, which kills the update anomalies in the spreadsheet (e.g. changing a
  doctor's fee previously meant editing every row).

`appointments` also keeps the refund history: `status`, `refund_amount`,
`cancelled_at`. The stored generated column `active_slot`
(`1` while confirmed, `NULL` once cancelled) participates in
`UNIQUE(doctor_id, appointment_datetime, active_slot)`. Because MySQL treats
`NULL`s as distinct in a unique index, **a doctor can never hold two confirmed
appointments at the same date/time**, while any number of historical
cancellations may share a slot — so a cancelled slot becomes bookable again
without deleting the cancellation record. See `schema-diagram.png`.

## 5. API reference

Base URL: `/api`

| Method | Path                    | Purpose                                   | Success | Errors |
|--------|-------------------------|-------------------------------------------|---------|--------|
| POST   | `/patients`             | Create patient                            | 201     | 400, 409 |
| GET    | `/patients`             | List patients                             | 200     | — |
| GET    | `/patients/:id`         | Get one patient                           | 200     | 404 |
| PUT    | `/patients/:id`         | Update patient (partial)                  | 200     | 400, 404, 409 |
| DELETE | `/patients/:id`         | Delete patient                            | 204     | 404, 409 |
| POST   | `/doctors`              | Create doctor                             | 201     | 400 |
| GET    | `/doctors`              | List doctors                              | 200     | — |
| GET    | `/doctors/:id`          | Get one doctor                            | 200     | 404 |
| PUT    | `/doctors/:id`          | Update doctor (partial)                   | 200     | 400, 404 |
| DELETE | `/doctors/:id`          | Delete doctor                             | 204     | 404, 409 |
| GET    | `/doctors/:id/stats`    | Doctor statistics (C.4)                   | 200     | 404 |
| POST   | `/appointments`         | **Book** an appointment (C.2)             | 201 / 202 waitlisted | 400, 404, 409, 422 |
| GET    | `/appointments`         | List appointments                         | 200     | — |
| GET    | `/appointments/:id`     | Get one appointment                       | 200     | 404 |
| DELETE | `/appointments/:id`     | **Cancel** with refund (C.3)              | 200     | 404, 409 |
| GET    | `/reports/doctors`      | Per-doctor totals, zero-appointment doctors included (C.5) | 200 | — |
| GET    | `/reports/busy-days`    | (doctor, date) above 80% of daily capacity (C.6) | 200 | — |
| GET    | `/feedback?lang=en\|fr` | Localized feedback page (Part G)          | 200 | — |
| GET    | `/health`               | Liveness/readiness probe                  | 200/503 | — |

### Booking request body

```json
{ "patient_id": 1, "doctor_id": 2, "appointment_datetime": "2026-08-10 09:00:00" }
```

Optional: `"waitlist_if_full": true` — if the slot/day is full, the patient is
added to the waitlist and the API answers `202 Accepted` with their queue
position instead of `409 Conflict`.

## 6. Design decisions & justifications

### Part C — controllers & endpoints

**REST design.** Resources are plural nouns (`/patients`, `/doctors`,
`/appointments`). Appointments deliberately have no generic CRUD: their
lifecycle *is* the business workflow, so creation is the booking operation
(`POST /appointments`) and deletion is the cancellation operation
(`DELETE /appointments/:id`, which returns the refund). Statistics hang off
the resource they describe (`/doctors/:id/stats`); cross-cutting reports live
under `/reports`. Every route delegates to a controller, every controller to a
model; **all SQL is in `src/models/` and every statement uses `?`
parameter binding** (`mysql2`), so there is no string-concatenated SQL —
and therefore no SQL injection vector — anywhere in the app.

**Status codes.** `400` malformed input (missing fields, wrong types);
`404` unknown ids; `409` state conflicts (duplicate slot/email, day cap hit,
double cancellation, deleting a referenced patient/doctor); `422` syntactically
valid input that violates a business rule (past date, off-hours, not on a
30-minute boundary); `201` created, `202` waitlisted, `204` deleted.

**Concurrency (two patients can never hold the same slot).** Two layers:
1. `SELECT ... FOR UPDATE` on the doctor row inside the booking transaction
   serializes all bookings for that doctor, so the 12-per-day count check is
   race-free.
2. The `uq_doctor_slot` unique index is the storage-level guard for the exact
   slot; the loser of any race gets `ER_DUP_ENTRY`, which the model translates
   to `SLOT_TAKEN` → HTTP 409. Locks are held for milliseconds and released by
   commit/rollback, and every conflict path rolls the transaction back.

**Pricing.** `amount_paid` is taken from the doctor's current
`consultation_fee` *inside* the locked transaction — clients never send money
amounts.

**Refund policy (C.3) — documented boundaries.** Notice is the time between
cancellation and the appointment: `> 48h → 100%`, `24h ≤ notice ≤ 48h → 50%`,
`< 24h → 0%`. Therefore **exactly 48h and exactly 24h both refund 50%** (the
tiers are inclusive on the lower side). The calculator is a pure function in
`src/utils/refund.js` and the cancellation + refund write happen in **one
transaction**, so they succeed or fail together. A cancellation also publishes
a `freed_slots` event so the worker can promote the waitlist.

**Reports (C.4–C.6).** All aggregation — revenue (confirmed amounts plus the
un-refunded part of cancellations), upcoming counts, per-day utilization
against the 12-slot cap, the zero-appointment `LEFT JOIN` report, and the
`HAVING COUNT(*) > 12 * 0.8` busy-days report — is computed **in SQL** in
`reportModel.js`, not in JavaScript.

### Part D — audit log

Every successful booking, cancellation, waitlist join, promotion and simulated
notification is appended as one JSON line to `logs/audit.log`. Implementation
choices: only the **async** `fs.promises` API (`mkdir` + `appendFile`) — no
`*Sync` calls, so request handling is never blocked on disk I/O; the directory
is created on first write via a memoized promise; and the write is fire-and-
forget with its own `.catch()`, so **a logging failure can never fail the
user's request** (it is reported on stderr instead). JSON Lines was chosen
because each line is self-contained and the file is trivially parseable.

### Part E — queues & Redis (plain Redis lists)

I chose **plain Redis lists** over BullMQ: the requirements map directly onto
three lists, there are no extra dependencies, and the semantics are easy to
reason about and demonstrate.

- `waitlist:{doctorId}:{date}` — FIFO (`RPUSH` to join, worker `LPOP`s the
  head) of patients waiting for that doctor on that day.
- `freed_slots` — published by the cancellation endpoint; the **separate
  worker process** (`npm run worker`) blocks on `BLPOP`, then promotes the
  waitlist head by running the *same* transactional booking code as the API.
- `jobs:notifications` — every confirmed appointment enqueues a confirmation
  job; the worker "sends" it by writing the message to the audit log.

**Failure policy (a patient must never vanish):** if the promoted booking
fails with a *transient* conflict (slot/day was re-taken), the entry is
`RPUSH`ed back onto the waitlist so the patient keeps their place; if it fails
*permanently* (patient deleted, requested time now in the past), the entry is
moved to a `waitlist:failed` list with the reason for inspection — it is never
silently dropped from both the queue and the database. If Redis itself is
down, booking still works; waitlist joins return `503` and missed notification
jobs are logged as warnings.

### Part F — tests

`npm test` runs 15 Jest tests against the pure functions only — no live MySQL
or Redis needed:

- `tests/refund.test.js` — all three refund tiers, **both boundaries**
  (exactly 24h and exactly 48h → 50%, per the policy above), past appointments,
  and invalid input.
- `tests/slot.test.js` — valid slots, first/last slot of the day (09:00,
  16:30), a 17:00 start (rejected), 09:15 off-boundary, before opening, past
  dates, and malformed date strings.

### Part G — i18n / l10n

`GET /feedback` renders a course-feedback form with the 5 required essay
questions. All visible strings come from `locales/en.json` / `locales/fr.json`;
`?lang=fr` switches to French, any unsupported `lang` falls back to English,
and the date is formatted with `Intl.DateTimeFormat` for the active locale.

## 7. Notes & assumptions

- **Timezone:** slot rules are evaluated in the server's local timezone
  (`appointment_datetime` is a naive `DATETIME`). Deploy with the server TZ
  set to the clinic's timezone.
- **Working hours:** the last bookable slot starts at 16:30 so it ends exactly
  at 17:00; a 17:00 start is rejected (tested).
- **Seed data** uses dates relative to `CURDATE()`, so the capped doctor-day
  (Dr. Boateng, 12/12 appointments, 7 days out) is always in the future for
  demos; Dr. Quaye intentionally has no appointments for the C.5 report.
- Secrets live only in `.env` (git-ignored); `.env.example` documents the
  required variables without real credentials.
