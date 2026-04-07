const prisma = require('../db/prisma');

const LOCAL_USERS = {
  'user-1': { id: 'user-1', name: 'User 1' },
  'user-2': { id: 'user-2', name: 'User 2' },
};

function extractBearer(req) {
  const h = req.headers.authorization;
  return h && h.startsWith('Bearer ') ? h.slice(7) : null;
}

/**
 * requireHost – checks for a local user token (Bearer user-1 or user-2).
 * Attaches req.user = { id, name } on success.
 */
function requireHost(req, res, next) {
  const token = extractBearer(req);
  const user = token && LOCAL_USERS[token];
  if (!user) return res.status(401).json({ error: 'Invalid or missing host token' });
  req.user = user;
  next();
}

/**
 * requireGuest – validates a short-lived guest session token from local DB.
 * Attaches req.session = { id, propertyId } on success.
 */
async function requireGuest(req, res, next) {
  const token = extractBearer(req);
  if (!token) return res.status(401).json({ error: 'Missing guest session token' });

  const session = await prisma.session.findUnique({ where: { guestToken: token } });
  if (!session)              return res.status(401).json({ error: 'Invalid session token' });
  if (session.checkedOutAt)  return res.status(401).json({ error: 'Session has been checked out' });
  if (new Date() > session.expiresAt) return res.status(401).json({ error: 'Session has expired' });

  req.session = { id: session.id, propertyId: session.propertyId };
  next();
}

/**
 * requireHostOrGuest – accepts either a local user token or a guest session token.
 */
async function requireHostOrGuest(req, res, next) {
  const token = extractBearer(req);
  if (!token) return res.status(401).json({ error: 'Authorization required' });

  // Local host?
  if (LOCAL_USERS[token]) {
    req.user = LOCAL_USERS[token];
    return next();
  }

  // Guest session?
  const session = await prisma.session.findUnique({ where: { guestToken: token } });
  if (session && !session.checkedOutAt && new Date() <= session.expiresAt) {
    req.session = { id: session.id, propertyId: session.propertyId };
    return next();
  }

  return res.status(401).json({ error: 'Invalid or expired credentials' });
}

module.exports = { requireHost, requireGuest, requireHostOrGuest };
