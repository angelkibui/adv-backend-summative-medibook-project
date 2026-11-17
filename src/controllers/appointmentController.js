const appointmentModel = require('../models/appointmentModel');
const queueService = require('../services/queueService');
const ApiError = require('../utils/ApiError');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateSlot } = require('../utils/slot');
const { calculateRefund } = require('../utils/refund');
const { audit } = require('../utils/auditLogger');

const list = asyncHandler(async (req, res) => {
  res.json(await appointmentModel.findAll());
});

const getOne = asyncHandler(async (req, res) => {
  const appt = await appointmentModel.findById(req.params.id);
  if (!appt) throw new ApiError(404, 'Appointment not found');
  res.json(appt);
});

// C.2 — book an appointment.
const book = asyncHandler(async (req, res) => {
  const { patient_id, doctor_id, appointment_datetime, waitlist_if_full } = req.body || {};

  // --- syntactic validation (400) ---
  if (!Number.isInteger(patient_id) || patient_id <= 0) {
    throw new ApiError(400, 'patient_id must be a positive integer');
  }
  if (!Number.isInteger(doctor_id) || doctor_id <= 0) {
    throw new ApiError(400, 'doctor_id must be a positive integer');
  }
  if (typeof appointment_datetime !== 'string' || appointment_datetime.trim() === '') {
    throw new ApiError(400, 'appointment_datetime is required (e.g. "2026-08-10 09:00:00")');
  }

  // --- business-rule validation (422) ---
  const slot = validateSlot(appointment_datetime);
  if (!slot.ok) throw new ApiError(422, slot.reason);

  try {
    const appt = await appointmentModel.book({
      patientId: patient_id,
      doctorId: doctor_id,
      appointmentDatetime: appointment_datetime,
    });

    // Side effects after commit: audit log (never blocks) + notification job.
    audit('booking_created', {
      appointment_id: appt.id,
      patient_id: appt.patient_id,
      doctor_id: appt.doctor_id,
      appointment_datetime: appt.appointment_datetime,
      amount_paid: appt.amount_paid,
    });
    if (queueService.isReady()) {
      queueService
        .enqueueNotification(appt)
        .catch((err) => console.error('[queue] notification enqueue failed:', err.message));
    } else {
      console.warn('[queue] Redis unavailable — notification job skipped for appointment', appt.id);
    }

    res.status(201).json(appt);
  } catch (err) {
    if (err.code === 'PATIENT_NOT_FOUND') throw new ApiError(404, 'Patient not found');
    if (err.code === 'DOCTOR_NOT_FOUND') throw new ApiError(404, 'Doctor not found');

    if (err instanceof appointmentModel.BookingConflict) {
      // Fully booked -> the patient may take a waitlist spot (Part E).
      if (waitlist_if_full === true) {
        if (!queueService.isReady()) {
          throw new ApiError(503, 'Waitlist service is temporarily unavailable');
        }
        const position = await queueService.joinWaitlist({
          patientId: patient_id,
          doctorId: doctor_id,
          appointmentDatetime: appointment_datetime,
        });
        audit('waitlist_joined', {
          patient_id, doctor_id, requested_datetime: appointment_datetime, position,
        });
        return res.status(202).json({
          waitlisted: true,
          position,
          message: 'The requested slot/day is fully booked. You have been added to the waitlist.',
        });
      }
      throw new ApiError(409, err.message, { extra: { waitlist_available: true } });
    }
    throw err;
  }
});

// C.3 — cancel an appointment with server-computed refund.
const cancel = asyncHandler(async (req, res) => {
  const appt = await appointmentModel.findById(req.params.id);
  if (!appt) throw new ApiError(404, 'Appointment not found');
  if (appt.status === 'cancelled') throw new ApiError(409, 'Appointment is already cancelled');

  const { refundAmount, refundPercent, noticeHours } = calculateRefund(
    appt.amount_paid,
    appt.appointment_datetime
  );

  try {
    await appointmentModel.cancel(req.params.id, refundAmount);
  } catch (err) {
    if (err.code === 'APPT_NOT_FOUND') throw new ApiError(404, 'Appointment not found');
    if (err.code === 'ALREADY_CANCELLED') throw new ApiError(409, err.message);
    throw err;
  }

  audit('appointment_cancelled', {
    appointment_id: appt.id,
    patient_id: appt.patient_id,
    doctor_id: appt.doctor_id,
    appointment_datetime: appt.appointment_datetime,
    amount_paid: appt.amount_paid,
    refund_amount: refundAmount,
    refund_percent: refundPercent,
    notice_hours: noticeHours,
  });

  // Tell the worker a slot opened up so it can promote the waitlist head.
  if (queueService.isReady()) {
    queueService
      .publishFreedSlot({
        doctorId: appt.doctor_id,
        appointmentDatetime: appt.appointment_datetime,
      })
      .catch((err) => console.error('[queue] freed-slot publish failed:', err.message));
  }

  res.json({
    message: 'Appointment cancelled',
    appointment_id: appt.id,
    amount_paid: appt.amount_paid,
    refund_amount: refundAmount,
    refund_percent: refundPercent,
    notice_hours: noticeHours,
  });
});

module.exports = { list, getOne, book, cancel };
