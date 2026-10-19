// Stops NoSQL injection such as {"email": {"$gt": ""}} by removing keys that start with "$" or contain "."
const clean = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) delete obj[key];
    else clean(obj[key]);
  }
  return obj;
};
export const noSqlSanitize = (req, res, next) => {
  clean(req.body); clean(req.params); clean(req.query);
  next();
};

export const notFound = (req, res) => res.status(404).json({ success: false, message: 'Route not found.' });

export const errorHandler = (err, req, res, next) => { // eslint-disable-line
  let status = err.status || 500, message = err.message;
  if (err.name === 'ValidationError') { status = 400; message = Object.values(err.errors).map((e) => e.message).join(' '); }
  else if (err.name === 'CastError') { status = 400; message = 'Invalid identifier.'; }
  else if (err.code === 11000) { status = 409; message = 'That value is already in use.'; }
  else if (err.code === 'LIMIT_FILE_SIZE') { status = 400; message = 'File is too large (max 10 MB).'; }
  if (status >= 500) { console.error(err); message = 'Something went wrong on our side. Please try again.'; }
  res.status(status).json({ success: false, message });
};
