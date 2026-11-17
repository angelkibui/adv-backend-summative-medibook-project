// ============================================================================
// MediBook worker process (Part E) — run separately from the web server:
//     npm run worker
//
// Consumes two Redis lists:
//   freed_slots        -> tries to promote the head of the matching waitlist
//                         into a real booking after a cancellation.
//   jobs:notifications -> "sends" the confirmation SMS/email by writing it to
//                         the audit log (no real sending required).
//
// Waitlist promotion failure policy (a patient must never vanish):
//   - slot/day conflict (someone else won the race) -> RPUSH the entry back
//     onto the waitlist so they keep their place in line;
//   - permanent failure (patient deleted, requested time now in the past,
//     validation error) -> move the entry to the `waitlist:failed` list with
//     the reason, so it stays inspectable instead of disappearing.
// ============================================================================
require('dotenv').config();
const { createClient } = require('redis');
const appointmentModel = require('./models/appointmentModel');
const queueService = require('./services/queueService');
const { validateSlot } = require('./utils/slot');
const { audit } = require('./utils/auditLogger');

async function promoteFromWaitlist(client, freed) {
  const date = freed.date || queueService.dateKey(freed.appointment_datetime);
  const key = queueService.waitlistKey(freed.doctor_id, date);

  const raw = await client.lPop(key); // FIFO: head of the queue
  if (!raw) {
    console.log(`[worker] slot freed for doctor ${freed.doctor_id} on ${date}, waitlist empty`);
    return;
  }

  const entry = JSON.parse(raw);
  console.log(`[worker] promoting waitlisted patient ${entry.patient_id} (doctor ${entry.doctor_id}, ${entry.requested_datetime})`);

  try {
    const slot = validateSlot(entry.requested_datetime);
    if (!slot.ok) {
      const err = new Error(slot.reason);
      err.code = 'PERMANENT';
      throw err;
    }

    const appt = await appointmentModel.book({
      patientId: entry.patient_id,
      doctorId: entry.doctor_id,
      appointmentDatetime: entry.requested_datetime,
    });

    audit('waitlist_promoted', {
      appointment_id: appt.id,
      patient_id: appt.patient_id,
      doctor_id: appt.doctor_id,
      appointment_datetime: appt.appointment_datetime,
    });
    await queueService.enqueueNotification(appt);
    console.log(`[worker] promoted -> appointment #${appt.id}`);
  } catch (err) {
    if (err instanceof appointmentModel.BookingConflict) {
      // Transient: keep the patient queued for the next freed slot.
      await client.rPush(key, raw);
      console.log(`[worker] promotion blocked (${err.kind}); patient re-queued`);
    } else {
      // Permanent failure: park the entry — never silently drop it.
      await client.rPush(
        'waitlist:failed',
        JSON.stringify({ ...entry, failed_at: new Date().toISOString(), reason: err.message })
      );
      console.error(`[worker] promotion failed permanently for patient ${entry.patient_id}: ${err.message}`);
    }
  }
}

async function sendNotification(job) {
  const message = `MediBook confirmation: appointment #${job.appointment_id} with ${job.doctor_name} on ${job.appointment_datetime} is confirmed.`;
  audit('notification_sent', {
    channel: 'sms+email (simulated)',
    appointment_id: job.appointment_id,
    patient_name: job.patient_name,
    message,
  });
  console.log(`[worker] notification logged for appointment #${job.appointment_id}`);
}

async function main() {
  const client = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
  client.on('error', (err) => console.error('[worker][redis]', err.message));
  await client.connect();
  console.log('[worker] started — waiting for jobs (freed_slots, jobs:notifications)');

  for (;;) {
    // Blocks until an item appears on either list.
    const item = await client.blPop(['freed_slots', 'jobs:notifications'], 0);
    try {
      const payload = JSON.parse(item.element);
      if (item.key === 'freed_slots') await promoteFromWaitlist(client, payload);
      else await sendNotification(payload);
    } catch (err) {
      console.error('[worker] job handling error:', err);
    }
  }
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
