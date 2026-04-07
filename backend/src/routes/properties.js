const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { body, param, validationResult } = require('express-validator');
const { requireHost } = require('../middleware/auth');
const prisma = require('../db/prisma');

const router = express.Router();

// ── Local file storage ────────────────────────────────────────────────────────

const UPLOADS_DIR = path.join(__dirname, '../../uploads');

function diskStorage(subfolder, allowedExts) {
  return multer({
    storage: multer.diskStorage({
      destination(req, file, cb) {
        const dir = path.join(UPLOADS_DIR, req.user.id, req.params.id, subfolder);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename(_req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase() || '.bin';
        cb(null, subfolder + ext);
      },
    }),
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter(_req, file, cb) {
      if (!allowedExts) return cb(null, true);
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, allowedExts.includes(ext));
    },
  });
}

function fileUrl(req, userId, propertyId, subfolder, filename) {
  const protocol = req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}/uploads/${userId}/${propertyId}/${subfolder}/${filename}`;
}

// ── Validation helper ─────────────────────────────────────────────────────────

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/properties
router.get('/', requireHost, async (req, res, next) => {
  try {
    const properties = await prisma.property.findMany({
      where: { hostId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(properties);
  } catch (err) { next(err); }
});

// GET /api/properties/:id
router.get('/:id', requireHost, param('id').isUUID(), validate, async (req, res, next) => {
  try {
    const property = await prisma.property.findFirstOrThrow({
      where: { id: req.params.id, hostId: req.user.id },
      include: { _count: { select: { annotations: true } } },
    });
    res.json(property);
  } catch (err) { next(err); }
});

// POST /api/properties
router.post('/',
  requireHost,
  body('name').trim().notEmpty().withMessage('name is required'),
  body('address').optional().trim(),
  validate,
  async (req, res, next) => {
    try {
      const property = await prisma.property.create({
        data: { hostId: req.user.id, name: req.body.name, address: req.body.address || null },
      });
      res.status(201).json(property);
    } catch (err) { next(err); }
  }
);

// PUT /api/properties/:id
router.put('/:id',
  requireHost,
  param('id').isUUID(),
  body('name').optional().trim().notEmpty(),
  body('address').optional().trim(),
  validate,
  async (req, res, next) => {
    try {
      await prisma.property.findFirstOrThrow({ where: { id: req.params.id, hostId: req.user.id } });
      const updated = await prisma.property.update({
        where: { id: req.params.id },
        data: {
          ...(req.body.name     && { name: req.body.name }),
          ...(req.body.address !== undefined && { address: req.body.address }),
        },
      });
      res.json(updated);
    } catch (err) { next(err); }
  }
);

// DELETE /api/properties/:id
router.delete('/:id', requireHost, param('id').isUUID(), validate, async (req, res, next) => {
  try {
    await prisma.property.findFirstOrThrow({ where: { id: req.params.id, hostId: req.user.id } });
    await prisma.property.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

// POST /api/properties/:id/floor-plan
router.post('/:id/floor-plan',
  requireHost,
  param('id').isUUID(),
  validate,
  diskStorage('floor-plan', ['.jpg', '.jpeg', '.png', '.webp']).single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      await prisma.property.findFirstOrThrow({ where: { id: req.params.id, hostId: req.user.id } });

      const ext = path.extname(req.file.originalname).toLowerCase() || '.png';
      const url = fileUrl(req, req.user.id, req.params.id, 'floor-plan', `floor-plan${ext}`);
      const updated = await prisma.property.update({
        where: { id: req.params.id },
        data: { floorPlanUrl: url },
      });
      res.json({ floorPlanUrl: updated.floorPlanUrl });
    } catch (err) { next(err); }
  }
);

// POST /api/properties/:id/model
router.post('/:id/model',
  requireHost,
  param('id').isUUID(),
  validate,
  diskStorage('model', ['.glb', '.gltf']).single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const ext = path.extname(req.file.originalname).toLowerCase();
      if (!['.glb', '.gltf'].includes(ext))
        return res.status(400).json({ error: 'Only .glb and .gltf files are accepted' });

      await prisma.property.findFirstOrThrow({ where: { id: req.params.id, hostId: req.user.id } });

      const url = fileUrl(req, req.user.id, req.params.id, 'model', `model${ext}`);
      const updated = await prisma.property.update({
        where: { id: req.params.id },
        data: { modelUrl: url },
      });
      res.json({ modelUrl: updated.modelUrl });
    } catch (err) { next(err); }
  }
);

module.exports = router;
