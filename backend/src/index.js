require('dotenv').config();
const app = require('./app');
const prisma = require('./db/prisma');

const PORT = process.env.PORT || 3000;

// Start the server immediately — don't block on DB
app.listen(PORT, () => {
  console.log(`ARbnb API running on http://localhost:${PORT}`);
});

// Try to connect in the background and log the result
prisma.$connect()
  .then(() => console.log('Database connected'))
  .catch((err) => console.error('Database connection failed:', err.message));
