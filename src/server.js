const app = require('./app');
const redis = require('./config/redis');

const PORT = Number(process.env.PORT || 3000);

// Warm up the Redis connection (queues are used by booking/cancellation).
redis.getClient();

app.listen(PORT, () => {
  console.log(`MediBook API listening on http://localhost:${PORT}`);
  console.log(`Feedback page:      http://localhost:${PORT}/feedback`);
});
