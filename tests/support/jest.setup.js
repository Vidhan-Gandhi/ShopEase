// Runs for every API test file: in-memory MongoDB + seed + backend env.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret';
process.env.TRUST_PROXY = 'true'; // read when app.js loads: lets tests choose the client IP via X-Forwarded-For
process.env.CORS_ORIGIN = 'http://localhost:5173';
delete process.env.LOGIN_RATE_LIMIT_WINDOW_MS;
delete process.env.LOGIN_RATE_LIMIT_MAX;

const path = require('path');
const { spawnSync } = require('child_process');
// IMPORTANT: use the backend's own mongoose instance (a second instance would hang every query)
const mongoose = require('../../backend/node_modules/mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
const SEED = path.join(__dirname, '..', '..', 'backend', 'src', 'seed.js');

// backend/src/seed.js is a script (no exported function), so it is run as a child process.
global.runSeed = (uri = process.env.MONGODB_URI) => {
  const r = spawnSync(process.execPath, [SEED], {
    env: { ...process.env, MONGODB_URI: uri },
    cwd: __dirname,
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error('seed failed: ' + r.stdout + r.stderr);
  return r;
};
global.SEED_PATH = SEED;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri('shopease');
  process.env.MONGODB_URI = uri;
  global.runSeed(uri);
  // Jest cannot run the driver's dynamic import('os'), which empties the handshake metadata
  // ("Missing required sub-document 'driver'"); pass the os adapter explicitly.
  await mongoose.connect(uri, { runtimeAdapters: { os: require('os') } });
}, 180000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});
