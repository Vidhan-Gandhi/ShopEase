// Starts an in-memory MongoDB, seeds it, then runs the real backend on port 5000.
const path = require('path');
const { spawnSync } = require('child_process');
const { MongoMemoryServer } = require('mongodb-memory-server');

const backend = path.join(__dirname, '..', '..', 'backend', 'src');
let mongod;

async function shutdown() {
  try { if (mongod) await mongod.stop(); } catch (e) { /* ignore */ }
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri('shopease');
  const env = {
    ...process.env,
    MONGODB_URI: uri,
    JWT_SECRET: 'test_secret',
    PORT: '5000',
    CORS_ORIGIN: 'http://localhost:5173',
    TRUST_PROXY: 'true', // E2E tests send X-Forwarded-For so the FR-033 limiter never blocks unrelated logins
    NODE_ENV: 'test',
  };
  const seed = spawnSync(process.execPath, [path.join(backend, 'seed.js')], { env, cwd: __dirname, stdio: 'inherit' });
  if (seed.status !== 0) { console.error('seed failed'); await shutdown(); return; }
  // run the API inside this process, so stopping this process stops everything (no orphaned server on Windows)
  Object.assign(process.env, env);
  require(path.join(backend, 'server.js'));
})().catch((e) => { console.error(e); process.exit(1); });
setInterval(() => {}, 1 << 30);
