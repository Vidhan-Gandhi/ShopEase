const ApiError = require('../utils/ApiError');

function formatIssues(error) {
  const seen = new Set();
  const errors = [];
  for (const issue of error.issues) {
    const field = issue.path.join('.') || '_';
    if (seen.has(field)) continue;
    seen.add(field);
    errors.push({ field, message: issue.message });
  }
  return errors;
}

/** Parse `data` with a zod schema; throws ApiError(400) with per-field messages. */
function parse(schema, data) {
  const result = schema.safeParse(data === undefined ? {} : data);
  if (!result.success) throw new ApiError(400, 'Validation failed', formatIssues(result.error));
  return result.data;
}

module.exports = { parse, formatIssues };
