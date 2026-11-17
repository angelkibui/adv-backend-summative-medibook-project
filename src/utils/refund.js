// Pure refund calculator — no DB, no Redis, unit-testable in isolation.
//
// Documented refund policy (notice = time between cancellation and the appointment):
//   notice >  48 hours  -> 100% refund
//   24 <= notice <= 48  ->  50% refund   (so EXACTLY 48h and EXACTLY 24h both refund 50%)
//   notice <  24 hours  ->   0% refund   (including appointments in the past)

const HOUR_MS = 60 * 60 * 1000;

function calculateRefund(amountPaid, appointmentDatetime, now = new Date()) {
  const appt =
    appointmentDatetime instanceof Date
      ? appointmentDatetime
      : new Date(appointmentDatetime);
  if (Number.isNaN(appt.getTime())) {
    throw new TypeError('calculateRefund: invalid appointment datetime');
  }

  const noticeHours = (appt.getTime() - now.getTime()) / HOUR_MS;

  let refundPercent;
  if (noticeHours > 48) refundPercent = 100;
  else if (noticeHours >= 24) refundPercent = 50;
  else refundPercent = 0;

  // Round to 2 decimal places to avoid floating-point artefacts on money.
  const refundAmount =
    Math.round(((Number(amountPaid) * refundPercent) / 100) * 100) / 100;

  return {
    refundAmount,
    refundPercent,
    noticeHours: Math.round(noticeHours * 100) / 100,
  };
}

module.exports = { calculateRefund };
