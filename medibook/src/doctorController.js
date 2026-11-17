const { createClient } = require('redis');

// Single shared Redis client for the web process (the worker builds its own).
// The client reconnects automatically; `isReady()` lets callers degrade
// gracefully instead of crashing when Redis is momentarily unavailable.
let client = null;
let ready = false;

function getClient() {
  if (!client) {
    client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 200, 3000),
      },
    });
    client.on('ready', () => { ready = true; });
    client.on('end', () => { ready = false; });
    client.on('error', (err) => console.error('[redis]', err.message));
    client.connect().catch(() => {
      /* reconnect strategy keeps trying in the background */
    });
  }
  return client;
}

function isReady() {
  return ready;
}

module.exports = { getClient, isReady };
