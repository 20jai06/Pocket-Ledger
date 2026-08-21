const jwt = require('jsonwebtoken');
require('dotenv').config();

const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 24) throw new Error('Set JWT_SECRET to a random value of at least 24 characters.');

function issueToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name }, secret, { expiresIn: '7d' });
}

function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Authentication required.' });
    req.user = jwt.verify(token, secret);
    next();
  } catch { return res.status(401).json({ error: 'Invalid or expired session.' }); }
}

module.exports = { issueToken, requireAuth };
