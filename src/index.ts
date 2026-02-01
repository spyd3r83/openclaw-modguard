import { Vault } from './vault.js';
import { Detector } from './detector.js';
import { Tokenizer, isValidToken as validateToken } from './tokenizer.js';
import { registerModGuardStatus } from './cli/status.js';
import { registerModGuardDetect } from './cli/detect.js';
import { VaultError } from './errors.js';
import { registerHooks } from './hooks/index.js';

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

// Re-export SessionManager
export {
  SessionManager,
  type SessionContext,
  type SessionManagerOptions
} from './session-manager.js';

// Export hook types
export type {
  BeforeAgentStartContext,
  MessageSendingContext,
  AgentEndContext,
  BeforeAgentStartHandler,
  MessageSendingHandler,
  AgentEndHandler
};

interface BeforeAgentStartContext {
  prompt: string;
  messages?: unknown[];
  sessionId?: string;
}

interface MessageSendingContext {
  content: string;
  channelId: string;
  sessionId?: string;
}

interface AgentEndContext {
  sessionId?: string;
  prompt?: string;
  response?: string;
  error?: string;
}

type BeforeAgentStartHandler = (context: BeforeAgentStartContext) => Promise<{ prependContext?: string } | void>;
type MessageSendingHandler = (context: MessageSendingContext) => Promise<{ content?: string } | void>;
type AgentEndHandler = (context: AgentEndContext) => Promise<void>;

interface OpenClawPluginApi {
  logger: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
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
  on(event: 'before_agent_start', handler: BeforeAgentStartHandler): void;
  on(event: 'message_sending', handler: MessageSendingHandler): void;
  on(event: 'agent_end', handler: AgentEndHandler): void;
}


interface ModGuardState {
  vault: Vault | null;
  detector: Detector | null;
  tokenizer: Tokenizer | null;
  initialized: boolean;
}

const state: ModGuardState = {
  vault: null,
  detector: null,
  tokenizer: null,
  initialized: false
};

export function initializeModGuardState(vaultPath: string, masterKey: string): void {
  state.vault = new Vault(vaultPath, masterKey);
  state.detector = new Detector();
  state.tokenizer = new Tokenizer(state.vault);
  state.initialized = true;
}

export function getModGuardState(): ModGuardState {
  return state;
}

export function isModGuardInitialized(): boolean {
  return state.initialized;
}


export function isValidToken(token: unknown): token is import('./tokenizer.js').Token {
  return validateToken(token);
}

let apiRef: OpenClawPluginApi | null = null;

const guardPlugin = {
  id: 'modguard',
  name: 'OpenClaw ModGuard',
  version: '0.1.0',
  description: 'Secure PII masking and vault storage plugin for OpenClaw',
  configSchema: {
    safeParse(value: unknown) {
      console.log('[ModGuard] safeParse called with:', JSON.stringify(value));
      
      if (typeof value !== 'object' || value === null) {
        return { success: false, error: 'Config must be an object' };
      }

      const config = value as Record<string, unknown>;

      const vaultPath = config.vaultPath;
      if (typeof vaultPath !== 'string') {
        return { success: false, error: 'vaultPath must be a string' };
      }

      const masterKey = config.masterKey;
      if (typeof masterKey !== 'string') {
        return { success: false, error: 'masterKey must be a string' };
      }

      const extraKeys = Object.keys(config).filter(k => k !== 'vaultPath' && k !== 'masterKey');
      if (extraKeys.length > 0) {
        return { success: false, error: `Unknown config properties: ${extraKeys.join(', ')}` };
      }

      try {
        console.log('[ModGuard] Initializing with vault:', vaultPath);
        initializeModGuardState(vaultPath, masterKey);
        console.log('[ModGuard] State initialized:', state.initialized);
        
        // Register hooks after successful initialization
        if (apiRef) {
          console.log('[ModGuard] apiRef exists, registering hooks');
          if (state.initialized) {
            registerHooks(apiRef, state);
            apiRef.logger.info('ModGuard hooks registered successfully');
          } else {
            console.log('[ModGuard] State not initialized after initializeModGuardState');
          }
        } else {
          console.log('[ModGuard] apiRef is null, deferring hook registration');
        }
        
        return { success: true, data: { vaultPath, masterKey } };
      } catch (error) {
        console.error('[ModGuard] Initialization error:', error);
        if (error instanceof VaultError) {
          return { success: false, error: error.message };
        }
        return { success: false, error: 'Failed to initialize modguard' };
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
  register(api: OpenClawPluginApi, config?: unknown): void {
    apiRef = api;
    console.log('[ModGuard] register() called');
    api.logger.info('OpenClaw ModGuard plugin registered');

    // Initialize from environment variables (OpenClaw standard pattern)
    const vaultPath = process.env.MODGUARD_VAULT_PATH || '/home/node/.openclaw/modguard/vault.db';
    const masterKey = process.env.MODGUARD_MASTER_KEY;
    
    console.log('[ModGuard] Env - MODGUARD_VAULT_PATH:', vaultPath);
    console.log('[ModGuard] Env - MODGUARD_MASTER_KEY:', masterKey ? '[REDACTED]' : 'missing');
    
    if (masterKey) {
      try {
        console.log('[ModGuard] Initializing with vault:', vaultPath);
        initializeModGuardState(vaultPath, masterKey);
        console.log('[ModGuard] State initialized:', state.initialized);
        
        if (state.initialized) {
          registerHooks(api, state);
          api.logger.info('ModGuard hooks registered successfully');
        }
      } catch (error) {
        api.logger.error(`ModGuard initialization failed: ${error}`);
        console.error('[ModGuard] Init error:', error);
      }
    } else {
      api.logger.warn('ModGuard not initialized - MODGUARD_MASTER_KEY environment variable not set');
    }

    registerModGuardStatus(api);
    registerModGuardDetect(api);
    
    console.log('[ModGuard] Commands registered, state.initialized =', state.initialized);
  }
};

export default guardPlugin;
