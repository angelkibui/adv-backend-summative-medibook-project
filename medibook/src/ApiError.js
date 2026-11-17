// All SQL for the doctors table lives here — controllers never touch the DB.
const pool = require('../config/db');

const COLUMNS = 'id, name, specialty, consultation_fee, room, created_at';

async function create({ name, specialty, consultation_fee, room }) {
  const [result] = await pool.query(
    'INSERT INTO doctors (name, specialty, consultation_fee, room) VALUES (?, ?, ?, ?)',
    [name, specialty, consultation_fee, room]
  );
  return findById(result.insertId);
}

async function findAll() {
  const [rows] = await pool.query(`SELECT ${COLUMNS} FROM doctors ORDER BY id`);
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(`SELECT ${COLUMNS} FROM doctors WHERE id = ?`, [id]);
  return rows[0] || null;
}

// Column names are whitelisted below; only values are bound as parameters.
async function update(id, fields) {
  const allowed = ['name', 'specialty', 'consultation_fee', 'room'];
  const sets = [];
  const values = [];
  for (const col of allowed) {
    if (fields[col] !== undefined) {
      sets.push(`${col} = ?`);
      values.push(fields[col]);
    }
  }
  if (sets.length === 0) return findById(id);
  values.push(id);
  const [result] = await pool.query(
    `UPDATE doctors SET ${sets.join(', ')} WHERE id = ?`,
    values
  );
  return result.affectedRows > 0 ? findById(id) : null;
}

async function remove(id) {
  const [result] = await pool.query('DELETE FROM doctors WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

module.exports = { create, findAll, findById, update, remove };
