import { Vault } from './vault.js';
import { Detector } from './detector.js';
import { Tokenizer, isValidToken as validateToken } from './tokenizer.js';
import { registerGuardStatus } from './cli/status.js';
import { registerGuardDetect } from './cli/detect.js';

// Re-export security utilities
export {
  secureZero,
  secureZeroUint8Array,
  timingSafeEqual,
  timingSafeStringEqual,
  secureRandomBytes,
  secureRandomHex,
  withSecureBuffer,
  withTempSecureBuffer
} from './security.js';

// Re-export backup/restore functionality
export {
  vaultBackup,
  vaultRestore,
  vaultRepair,
  verifyBackup,
  type BackupMetadata,
  type BackupEntry,
  type BackupOptions,
  type BackupResult,
  type RestoreOptions,
  type RestoreResult,
  type RepairOptions,
  type RepairResult,
  type VerifyBackupResult
} from './backup.js';

// Re-export performance utilities
export {
  PerformanceMonitor,
  calculateLatencyMetrics,
  benchmark,
  formatBenchmarkResult,
  getGlobalPerformanceMonitor,
  resetGlobalPerformanceMonitor,
  type PerformanceMetrics,
  type LatencyMetrics,
  type BenchmarkResult
} from './performance.js';

interface OpenClawPluginApi {
  logger: {
    info(message: string): void;
  };
  registerCommand(command: {
    name: string;
    description: string;
    handler: (args: any) => Promise<{
      success: boolean;
      output: string;
      error?: string;
    }>;
  }): void;
}


interface GuardState {
  vault: Vault | null;
  detector: Detector | null;
  tokenizer: Tokenizer | null;
  initialized: boolean;
}

const state: GuardState = {
  vault: null,
  detector: null,
  tokenizer: null,
  initialized: false
};

export function initializeGuardState(vaultPath: string, masterKey: string): void {
  state.vault = new Vault(vaultPath, masterKey);
  state.detector = new Detector();
  state.tokenizer = new Tokenizer(state.vault);
  state.initialized = true;
}

export function getGuardState(): GuardState {
  return state;
}

export function isGuardInitialized(): boolean {
  return state.initialized;
}


export function isValidToken(token: unknown): token is import('./tokenizer.js').Token {
  return validateToken(token);
}

const guardPlugin = {
  id: 'guard',
  name: 'OpenClaw Guard',
  version: '0.1.0',
  description: 'Secure PII masking and vault storage plugin for OpenClaw',
  configSchema: {
    safeParse(value: unknown) {
      const vaultPath = (value as any)?.vaultPath || ':memory:';
      const masterKey = (value as any)?.masterKey || 'default-master-key';

      if (!vaultPath || !masterKey) {
        return { success: false, error: 'vaultPath and masterKey are required' };
      }

      try {
        initializeGuardState(vaultPath, masterKey);
        return { success: true, data: value };
      } catch (error) {
        return { success: false, error: `Failed to initialize guard: ${error}` };
      }
    },
    jsonSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        vaultPath: {
          type: 'string',
          description: 'Path to vault database file'
        },
        masterKey: {
          type: 'string',
          description: 'Master encryption key for vault'
        }
      }
    }
  },
  register(api: OpenClawPluginApi): void {
    api.logger.info('OpenClaw Guard plugin registered');

    registerGuardStatus(api);
    registerGuardDetect(api);
  }
};

export default guardPlugin;
