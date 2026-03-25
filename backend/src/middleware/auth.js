const { supabaseAdmin } = require('../services/supabase');
const prisma = require('../db/prisma');

/**
 * requireHost – verifies a Supabase JWT from the Authorization header.
 * Attaches req.user = { id, email } on success.
 */
async function requireHost(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = { id: data.user.id, email: data.user.email };
  next();
}

/**
 * requireGuest – validates our own short-lived guest session token.
 * Attaches req.session = { id, propertyId } on success.
 */
async function requireGuest(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing guest session token' });
  }

  const token = authHeader.slice(7);
  const session = await prisma.session.findUnique({
    where: { guestToken: token },
  });

  if (!session) {
    return res.status(401).json({ error: 'Invalid session token' });
  }
  if (session.checkedOutAt) {
    return res.status(401).json({ error: 'Session has been checked out' });
  }
  if (new Date() > session.expiresAt) {
    return res.status(401).json({ error: 'Session has expired' });
  }

  req.session = { id: session.id, propertyId: session.propertyId };
  next();
}

/**
 * requireHostOrGuest – allows either a host JWT or a guest session token.
 * Used on annotation read endpoints so both roles can fetch.
 */
async function requireHostOrGuest(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }

  const token = authHeader.slice(7);

  // Try Supabase JWT first
  const { data } = await supabaseAdmin.auth.getUser(token);
  if (data?.user) {
    req.user = { id: data.user.id, email: data.user.email };
    return next();
  }

  // Fall back to guest session token
  const session = await prisma.session.findUnique({ where: { guestToken: token } });
  if (session && !session.checkedOutAt && new Date() <= session.expiresAt) {
    req.session = { id: session.id, propertyId: session.propertyId };
    return next();
  }

  return res.status(401).json({ error: 'Invalid or expired credentials' });
}

module.exports = { requireHost, requireGuest, requireHostOrGuest };
