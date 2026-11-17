// Central error-handling middleware: every thrown/forwarded error in the app
// ends up here and is rendered as a consistent JSON body.
const ApiError = require('../utils/ApiError');

// Wraps async route handlers so rejections reach the error middleware.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function notFound(req, res) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Malformed JSON body from express.json()
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message, ...err.extra });
  }

  // MySQL errors we translate for the API consumer.
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'A record with these unique values already exists' });
  }
  if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
    return res.status(409).json({
      error: 'This record is referenced by existing appointments and cannot be deleted',
    });
  }
  if (err.code === 'ECONNREFUSED') {
    return res.status(503).json({ error: 'A required backing service is unavailable' });
  }

  console.error('[error]', err);
  return res.status(500).json({ error: 'Internal server error' });
}

module.exports = { asyncHandler, notFound, errorHandler };
