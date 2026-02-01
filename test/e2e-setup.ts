import { beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Global test directory for E2E tests
export let testDir: string;
export let vaultPath: string;
export let auditPath: string;

beforeAll(async () => {
  // Create isolated test directory for each E2E test run
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openclaw-modguard-e2e-'));
  vaultPath = path.join(testDir, 'vault.db');
  auditPath = path.join(testDir, 'audit.jsonl');

  // Set environment variables
  process.env.GUARD_VAULT_PATH = vaultPath;
  process.env.GUARD_MASTER_KEY = 'e2e-test-master-key-' + Date.now();
});

afterAll(async () => {
  // Cleanup test directory
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});
