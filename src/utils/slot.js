// Pure slot-validation rules — no DB, no Redis, unit-testable in isolation.
//
// Slot policy:
//   - strictly in the future
//   - on a 30-minute boundary (e.g. 09:00, 09:30)
//   - start time between 09:00 and 16:30 inclusive; the last 30-minute
//     appointment then ends exactly at 17:00 (working hours 09:00–17:00).
//     A 17:00 *start* is therefore rejected.
// Times are evaluated in the server's local timezone (documented in README).

const SLOT_MINUTES = 30;
const WORK_START_MIN = 9 * 60; // 09:00
const LAST_START_MIN = 16 * 60 + 30; // 16:30 (slot ends 17:00)

function validateSlot(datetime, now = new Date()) {
  const d = datetime instanceof Date ? datetime : new Date(datetime);

  if (Number.isNaN(d.getTime())) {
    return { ok: false, reason: 'appointment_datetime is not a valid date/time' };
  }
  if (d.getTime() <= now.getTime()) {
    return { ok: false, reason: 'Appointments can only be booked in the future' };
  }
  if (
    d.getMinutes() % SLOT_MINUTES !== 0 ||
    d.getSeconds() !== 0 ||
    d.getMilliseconds() !== 0
  ) {
    return {
      ok: false,
      reason: 'Appointment must start on a 30-minute boundary (e.g. 09:00 or 09:30)',
    };
  }
  const minutes = d.getHours() * 60 + d.getMinutes();
  if (minutes < WORK_START_MIN || minutes > LAST_START_MIN) {
    return {
      ok: false,
      reason:
        'Appointments must start between 09:00 and 16:30 (working hours are 09:00–17:00)',
    };
  }
  return { ok: true };
}

module.exports = { validateSlot, SLOT_MINUTES, WORK_START_MIN, LAST_START_MIN };
