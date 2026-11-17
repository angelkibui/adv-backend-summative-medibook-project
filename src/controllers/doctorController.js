const doctorModel = require('../models/doctorModel');
const reportModel = require('../models/reportModel');
const ApiError = require('../utils/ApiError');
const { asyncHandler } = require('../middleware/errorHandler');

function validate(body, { partial } = { partial: false }) {
  const errors = [];
  const check = (field, present, ok, message) => {
    if (present && !ok) errors.push(message);
    if (!partial && !present) errors.push(`${field} is required`);
  };
  check('name', body.name !== undefined,
    typeof body.name === 'string' && body.name.trim().length >= 2 && body.name.length <= 100,
    'name must be a string of 2–100 characters');
  check('specialty', body.specialty !== undefined,
    typeof body.specialty === 'string' && body.specialty.trim().length >= 2,
    'specialty must be a non-empty string');
  check('consultation_fee', body.consultation_fee !== undefined,
    typeof body.consultation_fee === 'number' && Number.isFinite(body.consultation_fee) && body.consultation_fee >= 0,
    'consultation_fee must be a number >= 0');
  check('room', body.room !== undefined,
    typeof body.room === 'string' && body.room.trim().length >= 1 && body.room.length <= 20,
    'room must be a string of 1–20 characters');
  if (partial && Object.keys(body).length === 0) errors.push('at least one field is required');
  return errors;
}

const create = asyncHandler(async (req, res) => {
  const errors = validate(req.body);
  if (errors.length) throw new ApiError(400, errors.join('; '));
  const doctor = await doctorModel.create(req.body);
  res.status(201).json(doctor);
});

const list = asyncHandler(async (req, res) => {
  res.json(await doctorModel.findAll());
});

const getOne = asyncHandler(async (req, res) => {
  const doctor = await doctorModel.findById(req.params.id);
  if (!doctor) throw new ApiError(404, 'Doctor not found');
  res.json(doctor);
});

const update = asyncHandler(async (req, res) => {
  const errors = validate(req.body, { partial: true });
  if (errors.length) throw new ApiError(400, errors.join('; '));
  const doctor = await doctorModel.update(req.params.id, req.body);
  if (!doctor) throw new ApiError(404, 'Doctor not found');
  res.json(doctor);
});

const remove = asyncHandler(async (req, res) => {
  const removed = await doctorModel.remove(req.params.id);
  if (!removed) throw new ApiError(404, 'Doctor not found');
  res.status(204).end();
});

// C.4 — per-doctor statistics.
const stats = asyncHandler(async (req, res) => {
  const doctor = await doctorModel.findById(req.params.id);
  if (!doctor) throw new ApiError(404, 'Doctor not found');
  const stats = await reportModel.doctorStats(req.params.id);
  res.json({ doctor: { id: doctor.id, name: doctor.name, specialty: doctor.specialty }, ...stats });
});

module.exports = { create, list, getOne, update, remove, stats };
