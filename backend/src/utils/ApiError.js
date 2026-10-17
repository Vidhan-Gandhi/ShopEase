class ApiError extends Error {
  constructor(status, message, errors, extra = {}, headers = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
    this.extra = extra;
    this.headers = headers;
    this.isApiError = true;
  }
}
module.exports = ApiError;
