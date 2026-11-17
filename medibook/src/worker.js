// Redis-backed queues (Part E). Two plain Redis lists plus per-day waitlists:
//
//   waitlist:{doctorId}:{YYYY-MM-DD}  FIFO of patients waiting for that
//                                     doctor on that day (RPUSH to join,
//                                     LPOP by the worker to promote).
//   freed_slots                       events published by the cancellation
//                                     endpoint; the worker consumes them and
//                                     tries to promote the head of the
//                                     matching waitlist.
//   jobs:notifications                "confirmation SMS/email" jobs, one per
//                                     confirmed appointment; the worker
//                                     processes them into the audit log.
//   waitlist:failed                   entries whose promotion failed
//                                     permanently — kept, never dropped.
const { getClient, isReady } = require('../config/redis');

function waitlistKey(doctorId, dateStr) {
  return `waitlist:${doctorId}:${dateStr}`;
}

// YYYY-MM-DD in the server's local timezone, for both 'YYYY-MM-DD hh:mm:ss'
// strings and JS Date objects — the waitlist key must match no matter which
// representation a caller holds.
function dateKey(datetime) {
  if (datetime instanceof Date) {
    const m = String(datetime.getMonth() + 1).padStart(2, '0');
    const d = String(datetime.getDate()).padStart(2, '0');
    return `${datetime.getFullYear()}-${m}-${d}`;
  }
  return String(datetime).slice(0, 10);
}

async function joinWaitlist({ patientId, doctorId, appointmentDatetime }) {
  const client = getClient();
  const date = dateKey(appointmentDatetime);
  const entry = JSON.stringify({
    patient_id: patientId,
    doctor_id: doctorId,
    requested_datetime: appointmentDatetime,
    enqueued_at: new Date().toISOString(),
  });
  // RPUSH + worker-side LPOP => FIFO order.
  return client.rPush(waitlistKey(doctorId, date), entry);
}

async function publishFreedSlot({ doctorId, appointmentDatetime }) {
  const client = getClient();
  await client.rPush(
    'freed_slots',
    JSON.stringify({
      doctor_id: doctorId,
      appointment_datetime: appointmentDatetime,
      date: dateKey(appointmentDatetime),
      freed_at: new Date().toISOString(),
    })
  );
}

async function enqueueNotification(appointment) {
  const client = getClient();
  await client.rPush(
    'jobs:notifications',
    JSON.stringify({
      type: 'booking_confirmation',
      appointment_id: appointment.id,
      patient_name: appointment.patient_name,
      doctor_name: appointment.doctor_name,
      appointment_datetime: appointment.appointment_datetime,
      enqueued_at: new Date().toISOString(),
    })
  );
}

module.exports = {
  isReady,
  waitlistKey,
  dateKey,
  joinWaitlist,
  publishFreedSlot,
  enqueueNotification,
};
