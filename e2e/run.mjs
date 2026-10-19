// Runs every end-to-end check in sequence against a running server (npm run dev or npm start).
// Start the server with FAST_ROUNDS=1 so the match tests finish quickly.
import { spawnSync } from 'node:child_process';
const tests = ['practice', 'combat', 'settings', 'online', 'reconnect', 'match', 'spectate'];
let failed = 0;
for (const t of tests) {
  const r = spawnSync('node', [`e2e/${t}.mjs`], { stdio: 'inherit' });
  if (r.status !== 0) { failed++; console.log(`  → ${t} FAILED`); }
}
console.log(failed ? `\n${failed} e2e file(s) had failures` : '\nAll e2e checks passed');
process.exit(failed ? 1 : 0);
