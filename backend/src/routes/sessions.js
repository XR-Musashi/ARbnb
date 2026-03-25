const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { requireHost, requireGuest } = require('../middleware/auth');
const prisma = require('../db/prisma');

const router = express.Router();

// Default guest session duration: 3 days
const SESSION_DURATION_MS = 3 * 24 * 60 * 60 * 1000;

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
}

// POST /api/sessions – host creates a guest session token for a property
// The host shares this token (e.g. via QR code) with their guest on arrival.
router.post(
  '/',
  requireHost,
  body('propertyId').isUUID().withMessage('propertyId (UUID) is required'),
  body('durationMs').optional().isInt({ min: 3600000 }), // min 1 hour
  validate,
  async (req, res, next) => {
    try {
      // Verify property ownership
      await prisma.property.findFirstOrThrow({
        where: { id: req.body.propertyId, hostId: req.user.id },
      });

      const duration = req.body.durationMs || SESSION_DURATION_MS;
      const expiresAt = new Date(Date.now() + duration);
      const guestToken = uuidv4();

      const session = await prisma.session.create({
        data: {
          propertyId: req.body.propertyId,
          guestToken,
          expiresAt,
        },
      });

      res.status(201).json({
        sessionId: session.id,
        guestToken: session.guestToken,
        propertyId: session.propertyId,
        expiresAt: session.expiresAt,
      });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/sessions/:id – checkout: host or guest invalidates a session
// This clears the guest session so annotation data is no longer accessible.
router.delete(
  '/:id',
  param('id').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      // Allow checkout via either host JWT or guest token
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization required' });
      }

      const session = await prisma.session.findFirstOrThrow({
        where: { id: req.params.id },
      });

      await prisma.session.update({
        where: { id: req.params.id },
        data: { checkedOutAt: new Date() },
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/sessions/me – guest validates their own token and gets property info
router.get('/me', requireGuest, async (req, res, next) => {
  try {
    const property = await prisma.property.findUnique({
      where: { id: req.session.propertyId },
      select: { id: true, name: true, address: true, floorPlanUrl: true },
    });
    res.json({ session: req.session, property });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
