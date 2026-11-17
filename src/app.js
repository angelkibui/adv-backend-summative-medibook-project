require('dotenv').config();
const express = require('express');
const apiRoutes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const feedbackController = require('./controllers/feedbackController');
const pool = require('./config/db');
const redis = require('./config/redis');

const app = express();
app.use(express.json());

// Liveness/readiness probe.
app.get('/health', async (req, res) => {
  let db = 'down';
  try {
    await pool.query('SELECT 1');
    db = 'up';
  } catch (_) {
    /* reported below */
  }
  res.status(db === 'up' ? 200 : 503).json({ status: db === 'up' ? 'ok' : 'degraded', db, redis: redis.isReady() ? 'up' : 'down' });
});

// Part G — localised feedback page.
app.get('/feedback', feedbackController.renderForm);
app.post('/feedback', express.urlencoded({ extended: false }), feedbackController.handleSubmit);

app.use('/api', apiRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
