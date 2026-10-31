// Runs the release guards against dist/ and fails if dist/ is missing. Works the same on Windows, macOS and Linux.
import { spawnSync } from 'node:child_process';

const r = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'tests/dist.test.ts'], {
  stdio: 'inherit',
  env: { ...process.env, REQUIRE_DIST: '1' },
});
process.exit(r.status ?? 1);
