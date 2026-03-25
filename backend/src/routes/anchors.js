const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { requireHostOrGuest } = require('../middleware/auth');
const prisma = require('../db/prisma');

const router = express.Router();

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
}

// POST /api/anchors
// Called by the Unity app after successfully hosting a Google Cloud Anchor.
// Associates the cloud anchor ID with an annotation and stores the resolved 3D world position.
router.post(
  '/',
  requireHostOrGuest,
  body('annotationId').isUUID().withMessage('annotationId (UUID) is required'),
  body('cloudAnchorId').trim().notEmpty().withMessage('cloudAnchorId is required'),
  body('worldX').isFloat().withMessage('worldX is required'),
  body('worldY').isFloat().withMessage('worldY is required'),
  body('worldZ').isFloat().withMessage('worldZ is required'),
  body('expiresAt').optional().isISO8601(),
  validate,
  async (req, res, next) => {
    try {
      const { annotationId, cloudAnchorId, worldX, worldY, worldZ, expiresAt } = req.body;

      // Verify the caller can access this annotation's property
      const annotation = await prisma.annotation.findFirstOrThrow({
        where: { id: annotationId },
        include: { property: true },
      });

      if (req.session && req.session.propertyId !== annotation.propertyId) {
        return res.status(403).json({ error: 'Session not valid for this annotation' });
      }
      if (req.user && annotation.property.hostId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Upsert – if a cloud anchor already exists for this annotation, replace it
      const anchor = await prisma.cloudAnchor.upsert({
        where: { annotationId },
        update: {
          cloudAnchorId,
          createdAt: new Date(),
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
        create: {
          annotationId,
          cloudAnchorId,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
      });

      // Also persist the resolved 3D world position back to the annotation
      await prisma.annotation.update({
        where: { id: annotationId },
        data: { worldX, worldY, worldZ },
      });

      res.status(201).json(anchor);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/anchors/:annotationId – fetch cloud anchor for a given annotation
router.get(
  '/:annotationId',
  requireHostOrGuest,
  param('annotationId').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const anchor = await prisma.cloudAnchor.findFirstOrThrow({
        where: { annotationId: req.params.annotationId },
      });
      res.json(anchor);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
