// All SQL for the patients table lives here — controllers never touch the DB.
const pool = require('../config/db');

async function create({ name, email, phone }) {
  const [result] = await pool.query(
    'INSERT INTO patients (name, email, phone) VALUES (?, ?, ?)',
    [name, email, phone]
  );
  return findById(result.insertId);
}

async function findAll() {
  const [rows] = await pool.query(
    'SELECT id, name, email, phone, created_at FROM patients ORDER BY id'
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(
    'SELECT id, name, email, phone, created_at FROM patients WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

// Column names are whitelisted below; only values are bound as parameters.
async function update(id, fields) {
  const allowed = ['name', 'email', 'phone'];
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
    `UPDATE patients SET ${sets.join(', ')} WHERE id = ?`,
    values
  );
  return result.affectedRows > 0 ? findById(id) : null;
}

async function remove(id) {
  const [result] = await pool.query('DELETE FROM patients WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

module.exports = { create, findAll, findById, update, remove };
