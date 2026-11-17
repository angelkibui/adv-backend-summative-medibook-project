-- ============================================================================
-- MediBook — sample data (Part B.1)
--   * 3 patients, 3 doctors (Dr. Quaye has NO appointments)
--   * 16 appointments, incl. one doctor-day exactly AT the 12-slot daily cap
--     (Dr. Boateng, 7 days from today, 09:00-14:30) so the booking limit and
--     the busy-days report can be demonstrated immediately.
-- Dates are relative to CURDATE() so the demo data stays in the future.
-- ============================================================================

USE medibook;

INSERT INTO patients (name, email, phone) VALUES
  ('Ama Mensah', 'ama@mail.com',  '0244-111-222'),
  ('Kojo Owusu', 'kojo@mail.com', '0555-333-444'),
  ('Esi Darko',  'esi@mail.com',  '0200-555-666');

INSERT INTO doctors (name, specialty, consultation_fee, room) VALUES
  ('Dr. Boateng', 'Dermatology', 150.00, 'R-12'),
  ('Dr. Adjei',   'Paediatrics', 100.00, 'R-03'),
  ('Dr. Quaye',   'Cardiology',  200.00, 'R-07');  -- zero appointments

-- Dr. Boateng, 7 days from now: all 12 allowed appointments (the daily cap).
INSERT INTO appointments (patient_id, doctor_id, appointment_datetime, amount_paid) VALUES
  (1, 1, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 7 DAY), '09:00:00'), 150.00),
  (2, 1, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 7 DAY), '09:30:00'), 150.00),
  (3, 1, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 7 DAY), '10:00:00'), 150.00),
  (1, 1, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 7 DAY), '10:30:00'), 150.00),
  (2, 1, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 7 DAY), '11:00:00'), 150.00),
  (3, 1, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 7 DAY), '11:30:00'), 150.00),
  (1, 1, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 7 DAY), '12:00:00'), 150.00),
  (2, 1, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 7 DAY), '12:30:00'), 150.00),
  (3, 1, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 7 DAY), '13:00:00'), 150.00),
  (1, 1, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 7 DAY), '13:30:00'), 150.00),
  (2, 1, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 7 DAY), '14:00:00'), 150.00),
  (3, 1, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 7 DAY), '14:30:00'), 150.00);

-- A few ordinary bookings for the other doctor.
INSERT INTO appointments (patient_id, doctor_id, appointment_datetime, amount_paid) VALUES
  (2, 2, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 1 DAY), '10:00:00'), 100.00),
  (3, 2, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 1 DAY), '11:00:00'), 100.00),
  (1, 2, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 2 DAY), '09:30:00'), 100.00);

-- One past-style cancellation kept for refund history (50% refund example).
INSERT INTO appointments (patient_id, doctor_id, appointment_datetime, amount_paid,
                          status, refund_amount, cancelled_at) VALUES
  (1, 1, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 3 DAY), '15:00:00'), 150.00,
   'cancelled', 75.00, NOW());
