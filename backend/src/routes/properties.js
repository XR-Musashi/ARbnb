const express = require('express');
const { body, param, validationResult } = require('express-validator');
const multer = require('multer');
const { requireHost } = require('../middleware/auth');
const { supabaseAdmin } = require('../services/supabase');
const prisma = require('../db/prisma');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const uploadModel = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
}

// GET /api/properties – list all properties owned by the authenticated host
router.get('/', requireHost, async (req, res, next) => {
  try {
    const properties = await prisma.property.findMany({
      where: { hostId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(properties);
  } catch (err) {
    next(err);
  }
});

// GET /api/properties/:id – get a single property (host must own it)
router.get(
  '/:id',
  requireHost,
  param('id').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const property = await prisma.property.findFirstOrThrow({
        where: { id: req.params.id, hostId: req.user.id },
        include: { _count: { select: { annotations: true } } },
      });
      res.json(property);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/properties – create a property
router.post(
  '/',
  requireHost,
  body('name').trim().notEmpty().withMessage('name is required'),
  body('address').optional().trim(),
  validate,
  async (req, res, next) => {
    try {
      const property = await prisma.property.create({
        data: {
          hostId: req.user.id,
          name: req.body.name,
          address: req.body.address || null,
        },
      });
      res.status(201).json(property);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/properties/:id – update name or address
router.put(
  '/:id',
  requireHost,
  param('id').isUUID(),
  body('name').optional().trim().notEmpty(),
  body('address').optional().trim(),
  validate,
  async (req, res, next) => {
    try {
      // Verify ownership before update
      await prisma.property.findFirstOrThrow({
        where: { id: req.params.id, hostId: req.user.id },
      });
      const updated = await prisma.property.update({
        where: { id: req.params.id },
        data: {
          ...(req.body.name && { name: req.body.name }),
          ...(req.body.address !== undefined && { address: req.body.address }),
        },
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/properties/:id – delete property and cascade annotations/sessions
router.delete(
  '/:id',
  requireHost,
  param('id').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      await prisma.property.findFirstOrThrow({
        where: { id: req.params.id, hostId: req.user.id },
      });
      await prisma.property.delete({ where: { id: req.params.id } });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/properties/:id/floor-plan – upload floor plan image to Supabase Storage
router.post(
  '/:id/floor-plan',
  requireHost,
  param('id').isUUID(),
  validate,
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      await prisma.property.findFirstOrThrow({
        where: { id: req.params.id, hostId: req.user.id },
      });

      const ext = req.file.mimetype.split('/')[1] || 'png';
      const path = `${req.user.id}/${req.params.id}/floor-plan.${ext}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from(process.env.STORAGE_BUCKET)
        .upload(path, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabaseAdmin.storage
        .from(process.env.STORAGE_BUCKET)
        .getPublicUrl(path);

      const updated = await prisma.property.update({
        where: { id: req.params.id },
        data: { floorPlanUrl: urlData.publicUrl },
      });

      res.json({ floorPlanUrl: updated.floorPlanUrl });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/properties/:id/model – upload a 3D model (GLB/GLTF, max 100 MB)
router.post(
  '/:id/model',
  requireHost,
  param('id').isUUID(),
  validate,
  uploadModel.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const allowedTypes = ['model/gltf-binary', 'model/gltf+json', 'application/octet-stream'];
      const allowedExts = ['.glb', '.gltf'];
      const ext = '.' + req.file.originalname.split('.').pop().toLowerCase();
      if (!allowedExts.includes(ext)) {
        return res.status(400).json({ error: 'Only .glb and .gltf files are accepted' });
      }

      await prisma.property.findFirstOrThrow({
        where: { id: req.params.id, hostId: req.user.id },
      });

      const path = `${req.user.id}/${req.params.id}/model${ext}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from(process.env.STORAGE_BUCKET)
        .upload(path, req.file.buffer, {
          contentType: req.file.mimetype || 'model/gltf-binary',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabaseAdmin.storage
        .from(process.env.STORAGE_BUCKET)
        .getPublicUrl(path);

      const updated = await prisma.property.update({
        where: { id: req.params.id },
        data: { modelUrl: urlData.publicUrl },
      });

      res.json({ modelUrl: updated.modelUrl });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
