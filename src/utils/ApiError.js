// Application-level error carrying an HTTP status code.
// Thrown anywhere in controllers/models, rendered by the central error handler.
class ApiError extends Error {
  constructor(statusCode, message, extra = {}) {
    super(message);
    this.statusCode = statusCode;
    this.extra = extra;
  }
}

module.exports = ApiError;
