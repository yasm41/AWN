/**
 * Send a successful response
 */
const success = (res, data = {}, message = "Success", statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

/**
 * Send an error response
 */
const error = (res, message = "Something went wrong", statusCode = 500, errors = null) => {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(statusCode).json(body);
};

module.exports = { success, error };
