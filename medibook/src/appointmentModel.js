const patientModel = require('../models/patientModel');
const ApiError = require('../utils/ApiError');
const { asyncHandler } = require('../middleware/errorHandler');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-() ]{7,20}$/;

function validate(body, { partial } = { partial: false }) {
  const errors = [];
  const check = (field, present, ok, message) => {
    if (present && !ok) errors.push(message);
    if (!partial && !present) errors.push(`${field} is required`);
  };
  check('name', body.name !== undefined,
    typeof body.name === 'string' && body.name.trim().length >= 2 && body.name.length <= 100,
    'name must be a string of 2–100 characters');
  check('email', body.email !== undefined,
    typeof body.email === 'string' && EMAIL_RE.test(body.email),
    'email must be a valid email address');
  check('phone', body.phone !== undefined,
    typeof body.phone === 'string' && PHONE_RE.test(body.phone),
    'phone must be 7–20 characters (digits, spaces, +, -, parentheses)');
  if (partial && Object.keys(body).length === 0) errors.push('at least one field is required');
  return errors;
}

const create = asyncHandler(async (req, res) => {
  const errors = validate(req.body);
  if (errors.length) throw new ApiError(400, errors.join('; '));
  try {
    const patient = await patientModel.create({
      name: req.body.name.trim(),
      email: req.body.email.trim().toLowerCase(),
      phone: req.body.phone.trim(),
    });
    res.status(201).json(patient);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new ApiError(409, 'A patient with this email already exists');
    }
    throw err;
  }
});

const list = asyncHandler(async (req, res) => {
  res.json(await patientModel.findAll());
});

const getOne = asyncHandler(async (req, res) => {
  const patient = await patientModel.findById(req.params.id);
  if (!patient) throw new ApiError(404, 'Patient not found');
  res.json(patient);
});

const update = asyncHandler(async (req, res) => {
  const errors = validate(req.body, { partial: true });
  if (errors.length) throw new ApiError(400, errors.join('; '));
  try {
    const patient = await patientModel.update(req.params.id, req.body);
    if (!patient) throw new ApiError(404, 'Patient not found');
    res.json(patient);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new ApiError(409, 'A patient with this email already exists');
    }
    throw err;
  }
});

const remove = asyncHandler(async (req, res) => {
  const removed = await patientModel.remove(req.params.id);
  if (!removed) throw new ApiError(404, 'Patient not found');
  res.status(204).end();
});

module.exports = { create, list, getOne, update, remove };
