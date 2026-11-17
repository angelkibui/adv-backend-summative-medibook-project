// All SQL for the appointments table, including the transactional booking and
// cancellation workflows. Controllers never touch the DB directly.
const pool = require('../config/db');

const DAILY_CAP = 12;

// Distinguishes the two "cannot book" situations for the controller.
class BookingConflict extends Error {
  constructor(kind, message) {
    super(message);
    this.name = 'BookingConflict';
    this.kind = kind; // 'SLOT_TAKEN' | 'DAY_FULL'
  }
}

const SELECT_APPT = `
  SELECT a.id, a.patient_id, a.doctor_id, a.appointment_datetime,
         a.amount_paid, a.status, a.refund_amount, a.cancelled_at, a.booked_at,
         p.name  AS patient_name,
         d.name  AS doctor_name,
         d.specialty,
         d.consultation_fee
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    JOIN doctors  d ON d.id = a.doctor_id`;

async function findById(id) {
  const [rows] = await pool.query(`${SELECT_APPT} WHERE a.id = ?`, [id]);
  return rows[0] || null;
}

async function findAll() {
  const [rows] = await pool.query(`${SELECT_APPT} ORDER BY a.appointment_datetime`);
  return rows;
}

/**
 * Book an appointment inside a single transaction.
 *
 * Concurrency design:
 *  1. SELECT ... FOR UPDATE on the doctor row serializes all bookings for
 *     that doctor, so the 12-per-day check below can never be passed by two
 *     requests at the same instant.
 *  2. The uq_doctor_slot unique index (schema.sql) is the final guard for the
 *     slot itself: if two requests race for the exact same datetime, the
 *     loser's INSERT fails with ER_DUP_ENTRY and is turned into SLOT_TAKEN.
 *
 * The price (amount_paid) is taken from the doctor's current consultation fee
 * on the server side — the client never dictates money.
 */
async function book({ patientId, doctorId, appointmentDatetime }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [patients] = await conn.query('SELECT id FROM patients WHERE id = ?', [
      patientId,
    ]);
    if (patients.length === 0) {
      const err = new Error('Patient not found');
      err.code = 'PATIENT_NOT_FOUND';
      throw err;
    }

    // Row lock on the doctor: serializes the day-cap check per doctor.
    const [doctors] = await conn.query(
      'SELECT id, consultation_fee FROM doctors WHERE id = ? FOR UPDATE',
      [doctorId]
    );
    if (doctors.length === 0) {
      const err = new Error('Doctor not found');
      err.code = 'DOCTOR_NOT_FOUND';
      throw err;
    }

    const [capRows] = await conn.query(
      `SELECT COUNT(*) AS booked
         FROM appointments
        WHERE doctor_id = ?
          AND DATE(appointment_datetime) = DATE(?)
          AND status = 'confirmed'`,
      [doctorId, appointmentDatetime]
    );
    if (capRows[0].booked >= DAILY_CAP) {
      throw new BookingConflict(
        'DAY_FULL',
        `Doctor already has ${DAILY_CAP} appointments on that day (daily cap reached)`
      );
    }

    let insertId;
    try {
      const [result] = await conn.query(
        `INSERT INTO appointments (patient_id, doctor_id, appointment_datetime, amount_paid)
         VALUES (?, ?, ?, ?)`,
        [patientId, doctorId, appointmentDatetime, doctors[0].consultation_fee]
      );
      insertId = result.insertId;
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        throw new BookingConflict(
          'SLOT_TAKEN',
          'That slot is already booked for this doctor'
        );
      }
      throw err;
    }

    await conn.commit();
    return findById(insertId);
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {
      /* connection may already be dead */
    }
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Cancel an appointment and store its refund in one transaction, so the
 * cancellation and the refund record always succeed or fail together.
 * The row is kept (status = 'cancelled') for refund history; the generated
 * column frees the slot for rebooking.
 */
async function cancel(id, refundAmount) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT * FROM appointments WHERE id = ? FOR UPDATE',
      [id]
    );
    const appt = rows[0];
    if (!appt) {
      const err = new Error('Appointment not found');
      err.code = 'APPT_NOT_FOUND';
      throw err;
    }
    if (appt.status === 'cancelled') {
      const err = new Error('Appointment is already cancelled');
      err.code = 'ALREADY_CANCELLED';
      throw err;
    }

    // Guard on status as well, so two concurrent cancellations cannot both win.
    const [result] = await conn.query(
      `UPDATE appointments
          SET status = 'cancelled', refund_amount = ?, cancelled_at = NOW()
        WHERE id = ? AND status = 'confirmed'`,
      [refundAmount, id]
    );
    if (result.affectedRows === 0) {
      const err = new Error('Appointment is already cancelled');
      err.code = 'ALREADY_CANCELLED';
      throw err;
    }

    await conn.commit();
    return appt; // pre-cancellation snapshot (has datetime/amount/doctor)
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {
      /* ignore */
    }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { findById, findAll, book, cancel, BookingConflict, DAILY_CAP };
