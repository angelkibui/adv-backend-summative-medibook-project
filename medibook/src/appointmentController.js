const mysql = require('mysql2/promise');

// A connection pool. mysql2 connects lazily — the first query opens connections,
// so the web server can boot even while MySQL is still starting.
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'medibook',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Return DATETIME/DATE columns as 'YYYY-MM-DD hh:mm:ss' strings in server
  // local time instead of JS Date objects — keeps API responses unambiguous
  // and avoids UTC/local drift when deriving queue keys.
  dateStrings: true,
});

module.exports = pool;
