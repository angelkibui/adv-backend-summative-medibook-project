-- ============================================================================
-- MediBook — database schema (Part B.1)
-- Fully normalized (3NF), exactly 3 tables. Requires MySQL 8.0.16+ (or
-- MariaDB 10.2+) so that CHECK constraints are enforced.
-- Runs cleanly on a fresh server:  mysql -u root -p < database/schema.sql
-- ============================================================================

CREATE DATABASE IF NOT EXISTS medibook
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE medibook;

DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS doctors;
DROP TABLE IF EXISTS patients;

-- ---------------------------------------------------------------------------
-- patients
-- ---------------------------------------------------------------------------
CREATE TABLE patients (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  name        VARCHAR(100)  NOT NULL,
  email       VARCHAR(255)  NOT NULL,
  phone       VARCHAR(30)   NOT NULL,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pk_patients   PRIMARY KEY (id),
  CONSTRAINT uq_patients_email UNIQUE (email)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------------
-- doctors
-- ---------------------------------------------------------------------------
CREATE TABLE doctors (
  id                INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  name              VARCHAR(100)   NOT NULL,
  specialty         VARCHAR(100)   NOT NULL,
  consultation_fee  DECIMAL(10, 2) NOT NULL,
  room              VARCHAR(20)    NOT NULL,
  created_at        TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pk_doctors PRIMARY KEY (id),
  CONSTRAINT chk_doctors_fee CHECK (consultation_fee >= 0)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------------
-- appointments
--
-- Business rules enforced by the database itself:
--   * chk_slot_boundary / chk_working_hours : 30-minute slots, 09:00-16:30
--     starts (last slot ends at 17:00).
--   * uq_doctor_slot : a doctor can never hold two CONFIRMED appointments at
--     the same date/time. MySQL unique indexes treat NULLs as distinct, so
--     the generated column `active_slot` is 1 for confirmed rows and NULL
--     for cancelled rows -> any number of historical cancellations may share
--     a slot, but only one confirmed booking. This is what makes a cancelled
--     slot bookable again while the cancellation record is kept for refund
--     history, and it closes the race between two simultaneous booking
--     requests at the storage-engine level.
--   * FKs ON DELETE RESTRICT : a patient/doctor with appointment history
--     cannot be deleted (the API turns this into a 409).
-- ---------------------------------------------------------------------------
CREATE TABLE appointments (
  id                   INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  patient_id           INT UNSIGNED   NOT NULL,
  doctor_id            INT UNSIGNED   NOT NULL,
  appointment_datetime DATETIME       NOT NULL,
  amount_paid          DECIMAL(10, 2) NOT NULL,
  status               ENUM('confirmed', 'cancelled') NOT NULL DEFAULT 'confirmed',
  refund_amount        DECIMAL(10, 2) NULL,
  cancelled_at         DATETIME       NULL,
  booked_at            TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- 1 while the appointment occupies its slot, NULL once cancelled
  active_slot TINYINT GENERATED ALWAYS AS (
    CASE WHEN status = 'confirmed' THEN 1 ELSE NULL END
  ) STORED,

  CONSTRAINT pk_appointments PRIMARY KEY (id),
  CONSTRAINT fk_appt_patient FOREIGN KEY (patient_id)
    REFERENCES patients (id) ON DELETE RESTRICT,
  CONSTRAINT fk_appt_doctor FOREIGN KEY (doctor_id)
    REFERENCES doctors (id) ON DELETE RESTRICT,
  CONSTRAINT uq_doctor_slot UNIQUE (doctor_id, appointment_datetime, active_slot),
  CONSTRAINT chk_appt_amount  CHECK (amount_paid >= 0),
  CONSTRAINT chk_appt_refund  CHECK (refund_amount IS NULL OR refund_amount >= 0),
  CONSTRAINT chk_slot_boundary CHECK (
    MINUTE(appointment_datetime) IN (0, 30) AND SECOND(appointment_datetime) = 0
  ),
  CONSTRAINT chk_working_hours CHECK (
    TIME(appointment_datetime) >= '09:00:00'
    AND TIME(appointment_datetime) <= '16:30:00'
  ),

  INDEX idx_appt_doctor_day (doctor_id, appointment_datetime),
  INDEX idx_appt_patient (patient_id)
) ENGINE = InnoDB;
