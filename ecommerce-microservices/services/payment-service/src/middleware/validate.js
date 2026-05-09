const { validationResult } = require('express-validator');
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ status: 'error', message: 'Validation failed', errors: errors.array().map(e => ({ field: e.path, message: e.msg })) });
  }
  next();
};
module.exports = { validate };
