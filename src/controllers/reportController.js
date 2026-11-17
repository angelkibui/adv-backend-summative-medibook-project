const reportModel = require('../models/reportModel');
const { asyncHandler } = require('../middleware/errorHandler');

// C.5 — every doctor's totals, including doctors with zero appointments.
const doctors = asyncHandler(async (req, res) => {
  res.json(await reportModel.doctorsReport());
});

// C.6 — every (doctor, date) above 80% of the 12-slot daily capacity.
const busyDays = asyncHandler(async (req, res) => {
  res.json(await reportModel.busyDaysReport());
});

module.exports = { doctors, busyDays };
