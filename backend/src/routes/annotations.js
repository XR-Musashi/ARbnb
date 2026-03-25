const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { requireHost, requireHostOrGuest } = require('../middleware/auth');
const prisma = require('../db/prisma');

const router = express.Router({ mergeParams: true });

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
}

// Verify the caller has access to this property (host owns it, or guest session matches)
async function verifyPropertyAccess(req, res, next) {
  try {
    const property = await prisma.property.findUnique({
      where: { id: req.params.propertyId },
    });
    if (!property) return res.status(404).json({ error: 'Property not found' });

    // Host must own it
    if (req.user && property.hostId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    // Guest session must be scoped to this property
    if (req.session && req.session.propertyId !== req.params.propertyId) {
      return res.status(403).json({ error: 'Session not valid for this property' });
    }

    req.property = property;
    next();
  } catch (err) {
    next(err);
  }
}

// GET /api/properties/:propertyId/annotations
// Returns all annotations for a property (host or guest with valid session)
router.get(
  '/',
  requireHostOrGuest,
  param('propertyId').isUUID(),
  validate,
  verifyPropertyAccess,
  async (req, res, next) => {
    try {
      const annotations = await prisma.annotation.findMany({
        where: { propertyId: req.params.propertyId },
        include: { cloudAnchor: true },
        orderBy: { createdAt: 'asc' },
      });
      res.json(annotations);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/properties/:propertyId/annotations – host creates an annotation
router.post(
  '/',
  requireHost,
  param('propertyId').isUUID(),
  body('title').trim().notEmpty().withMessage('title is required'),
  body('content').optional({ checkFalsy: false }).trim(),
  body('floorX').optional().isFloat({ min: 0, max: 1 }),
  body('floorY').optional().isFloat({ min: 0, max: 1 }),
  body('worldX').optional().isFloat(),
  body('worldY').optional().isFloat(),
  body('worldZ').optional().isFloat(),
  body('roomLabel').optional().trim(),
  validate,
  verifyPropertyAccess,
  async (req, res, next) => {
    try {
      const annotation = await prisma.annotation.create({
        data: {
          propertyId: req.params.propertyId,
          title: req.body.title,
          content: req.body.content ?? '',
          floorX: req.body.floorX ?? null,
          floorY: req.body.floorY ?? null,
          worldX: req.body.worldX ?? null,
          worldY: req.body.worldY ?? null,
          worldZ: req.body.worldZ ?? null,
          roomLabel: req.body.roomLabel ?? null,
        },
      });
      res.status(201).json(annotation);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/annotations/:id – host updates an annotation's text or floor position
router.put(
  '/:id',
  requireHost,
  param('id').isUUID(),
  body('title').optional().trim().notEmpty(),
  body('content').optional().trim().notEmpty(),
  body('floorX').optional().isFloat({ min: 0, max: 1 }),
  body('floorY').optional().isFloat({ min: 0, max: 1 }),
  body('worldX').optional().isFloat(),
  body('worldY').optional().isFloat(),
  body('worldZ').optional().isFloat(),
  body('roomLabel').optional().trim(),
  validate,
  async (req, res, next) => {
    try {
      // Verify host owns the annotation's property
      const existing = await prisma.annotation.findFirstOrThrow({
        where: { id: req.params.id },
        include: { property: true },
      });
      if (existing.property.hostId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const { title, content, floorX, floorY, worldX, worldY, worldZ, roomLabel } = req.body;
      const updated = await prisma.annotation.update({
        where: { id: req.params.id },
        data: {
          ...(title !== undefined && { title }),
          ...(content !== undefined && { content }),
          ...(floorX !== undefined && { floorX }),
          ...(floorY !== undefined && { floorY }),
          ...(worldX !== undefined && { worldX }),
          ...(worldY !== undefined && { worldY }),
          ...(worldZ !== undefined && { worldZ }),
          ...(roomLabel !== undefined && { roomLabel }),
        },
        include: { cloudAnchor: true },
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/annotations/:id – host deletes an annotation (cascades cloud anchor)
router.delete(
  '/:id',
  requireHost,
  param('id').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const existing = await prisma.annotation.findFirstOrThrow({
        where: { id: req.params.id },
        include: { property: true },
      });
      if (existing.property.hostId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
      await prisma.annotation.delete({ where: { id: req.params.id } });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
