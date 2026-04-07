require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const errorHandler = require('./middleware/errorHandler');

const propertiesRouter = require('./routes/properties');
const annotationsRouter = require('./routes/annotations');
const anchorsRouter = require('./routes/anchors');
const sessionsRouter = require('./routes/sessions');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',');
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

// Serve uploaded files (floor plans, 3D models)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Login – no password, just pick a user
const LOCAL_USERS = { 'user-1': 'User 1', 'user-2': 'User 2' };
app.post('/api/auth/login', (req, res) => {
  const { userId } = req.body;
  if (!LOCAL_USERS[userId]) return res.status(400).json({ error: 'Unknown user' });
  res.json({ userId, name: LOCAL_USERS[userId] });
});

// Health check – no auth required
app.get('/health', async (req, res) => {
  const prisma = require('./db/prisma');
  let db = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    db = e.message;
  }
  res.status(db === 'ok' ? 200 : 503).json({ status: db === 'ok' ? 'ok' : 'degraded', db, ts: new Date().toISOString() });
});

// API routes
app.use('/api/properties', propertiesRouter);
app.use('/api/properties/:propertyId/annotations', annotationsRouter);
app.use('/api/annotations', annotationsRouter);
app.use('/api/anchors', anchorsRouter);
app.use('/api/sessions', sessionsRouter);

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
