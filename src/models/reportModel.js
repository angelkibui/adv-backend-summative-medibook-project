// Reporting SQL (Parts C.4-C.6). The heavy lifting — joins, aggregates,
// grouping — is done in SQL, not in JavaScript.
const pool = require('../config/db');
const { DAILY_CAP } = require('./appointmentModel');

// C.4 — statistics for one doctor.
async function doctorStats(doctorId) {
  const [totals] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE
         WHEN status = 'confirmed' THEN amount_paid
         WHEN status = 'cancelled' THEN amount_paid - refund_amount
         ELSE 0 END), 0)                                   AS revenue_collected,
       SUM(CASE WHEN status = 'confirmed'
                 AND appointment_datetime > NOW() THEN 1 ELSE 0 END) AS upcoming_count
     FROM appointments
     WHERE doctor_id = ?`,
    [doctorId]
  );

  const [perDay] = await pool.query(
    `SELECT DATE(appointment_datetime)                       AS date,
            COUNT(*)                                         AS appointments,
            ?                                                AS capacity,
            ROUND(COUNT(*) / ? * 100, 1)                     AS utilization_pct
       FROM appointments
      WHERE doctor_id = ?
        AND status = 'confirmed'
        AND appointment_datetime >= CURDATE()
        -- window: today plus the next 7 days (inclusive of day 7)
        AND appointment_datetime <  DATE_ADD(CURDATE(), INTERVAL 8 DAY)
      GROUP BY DATE(appointment_datetime)
      ORDER BY date`,
    [DAILY_CAP, DAILY_CAP, doctorId]
  );

  return {
    revenue_collected: Number(totals[0].revenue_collected),
    upcoming_count: Number(totals[0].upcoming_count),
    next_7_days: perDay.map((r) => ({
      date: r.date,
      appointments: Number(r.appointments),
      capacity: DAILY_CAP,
      utilization_pct: Number(r.utilization_pct),
    })),
  };
}

// C.5 — every doctor with totals; LEFT JOIN keeps zero-appointment doctors.
async function doctorsReport() {
  const [rows] = await pool.query(
    `SELECT d.id, d.name, d.specialty, d.room,
            COUNT(a.id)                                        AS total_appointments,
            SUM(a.status = 'confirmed')                        AS confirmed_appointments,
            COALESCE(SUM(CASE
              WHEN a.status = 'confirmed' THEN a.amount_paid
              WHEN a.status = 'cancelled' THEN a.amount_paid - a.refund_amount
              ELSE 0 END), 0)                                  AS revenue_collected
       FROM doctors d
       LEFT JOIN appointments a ON a.doctor_id = d.id
      GROUP BY d.id, d.name, d.specialty, d.room
      ORDER BY revenue_collected DESC, d.id`
  );
  return rows.map((r) => ({
    ...r,
    total_appointments: Number(r.total_appointments),
    confirmed_appointments: Number(r.confirmed_appointments),
    revenue_collected: Number(r.revenue_collected),
  }));
}

// C.6 — every (doctor, date) where more than 80% of the 12-slot day is booked.
async function busyDaysReport() {
  const [rows] = await pool.query(
    `SELECT d.id                            AS doctor_id,
            d.name                          AS doctor_name,
            DATE(a.appointment_datetime)    AS date,
            COUNT(*)                        AS booked,
            ?                               AS capacity,
            ROUND(COUNT(*) / ? * 100, 1)    AS utilization_pct
       FROM appointments a
       JOIN doctors d ON d.id = a.doctor_id
      WHERE a.status = 'confirmed'
      GROUP BY d.id, d.name, DATE(a.appointment_datetime)
     HAVING COUNT(*) > ? * 0.8
      ORDER BY date, d.id`,
    [DAILY_CAP, DAILY_CAP, DAILY_CAP]
  );
  return rows.map((r) => ({
    ...r,
    booked: Number(r.booked),
    utilization_pct: Number(r.utilization_pct),
  }));
}

module.exports = { doctorStats, doctorsReport, busyDaysReport };
