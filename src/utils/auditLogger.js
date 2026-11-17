// Audit logger built on the async fs API (Part D).
//
// - Every successful booking / cancellation / notification is appended as one
//   JSON line to logs/audit.log.
// - Only async, non-blocking calls are used (fs.promises.*) — no *Sync calls.
// - The logs/ directory is created on first use.
// - Logging failures are swallowed (and reported to stderr) so a disk problem
//   can never fail the user's HTTP request.

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'audit.log');

// Memoised promise so concurrent requests share one mkdir attempt.
let dirPromise = null;
function ensureLogDir() {
  if (!dirPromise) {
    dirPromise = fs.promises.mkdir(LOG_DIR, { recursive: true }).catch((err) => {
      dirPromise = null; // allow a later retry
      throw err;
    });
  }
  return dirPromise;
}

function audit(event, details = {}) {
  const line =
    JSON.stringify({ timestamp: new Date().toISOString(), event, ...details }) + '\n';
  ensureLogDir()
    .then(() => fs.promises.appendFile(LOG_FILE, line, 'utf8'))
    .catch((err) => console.error('[audit] write failed:', err.message));
}

module.exports = { audit, LOG_FILE };
