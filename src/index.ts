import { Vault } from './vault.js';
import { Detector } from './detector.js';
import { Tokenizer, isValidToken as validateToken } from './tokenizer.js';
import { registerModGuardStatus } from './cli/status.js';
import { registerModGuardDetect } from './cli/detect.js';
import { VaultError } from './errors.js';

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
  AgentEndHandler,
  ToolResultPersistContext,
  ToolResultMessage,
  ToolResultPersistHandler,
  BeforeToolResultContext,
  DryRunContext,
  BeforeToolResultHandler,
  DryRunHandler,
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

type BeforeAgentStartHandler = (context: BeforeAgentStartContext) => Promise<{ prependContext?: string; replacePrompt?: string } | void>;
type MessageSendingHandler = (context: MessageSendingContext) => Promise<{ content?: string } | void>;
type AgentEndHandler = (context: AgentEndContext) => Promise<void>;

/**
 * OpenClaw's actual tool_result_persist hook context.
 * Fires synchronously when a tool result is about to be written to the session transcript.
 * Handlers must be synchronous — returning a Promise is an error.
 */
interface ToolResultPersistContext {
  /** The toolResult AgentMessage about to be persisted. */
  message: ToolResultMessage;
  toolName?: string;
  toolCallId?: string;
  isSynthetic?: boolean;
}

/** Minimal shape of the ToolResultMessage from @mariozechner/pi-agent-core. */
interface ToolResultMessage {
  role: 'toolResult';
  toolCallId: string;
  toolName: string;
  content: Array<{ type: string; text?: string }>;
  isError: boolean;
  timestamp: number;
  [key: string]: unknown;
}

interface BeforeToolResultContext {
  sessionId: string;
  toolName: string;
  toolOutput: string;
  dialogueHistory: string[];
  userGoal: string;
}

interface DryRunContext {
  sessionId: string;
  userInput: string;
  mediatorContent: string;
  record: boolean;
}

/**
 * Synchronous handler for tool_result_persist.
 * Must NOT return a Promise. Return { message } to replace the persisted message.
 */
type ToolResultPersistHandler = (
  event: ToolResultPersistContext,
  ctx: { agentId?: string; sessionKey?: string; toolName?: string; toolCallId?: string },
) => { message?: ToolResultMessage } | void;

type BeforeToolResultHandler = (context: BeforeToolResultContext) => Promise<{ toolOutput?: string; cancel?: boolean } | void>;
type DryRunHandler = (context: DryRunContext) => Promise<{ proposedAction: import('./agent-sentry/types.js').ProposedAction } | void>;

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
  on(event: 'tool_result_persist', handler: ToolResultPersistHandler): void;
  on(event: 'before_tool_result', handler: BeforeToolResultHandler): void;
  on(event: 'dry_run', handler: DryRunHandler): void;
  on(event: string, handler: (...args: unknown[]) => unknown): void;
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
let hooksRegistered = false;

const guardPlugin = {
  id: 'modguard',
  name: 'OpenClaw ModGuard',
  version: '0.1.0',
  description: 'Secure PII masking and vault storage plugin for OpenClaw',
  configSchema: {
    safeParse(value: unknown) {
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

      const allowedKeys = ['vaultPath', 'masterKey', 'agentSentry'];
      const extraKeys = Object.keys(config).filter(k => !allowedKeys.includes(k));
      if (extraKeys.length > 0) {
        return { success: false, error: `Unknown config properties: ${extraKeys.join(', ')}` };
      }

      try {
        initializeModGuardState(vaultPath, masterKey);
        
        // Register hooks after successful initialization
        if (apiRef) {
          if (state.initialized && !hooksRegistered) {
            registerHooks(apiRef, state);
            hooksRegistered = true;
            apiRef.logger.info('ModGuard hooks registered successfully');
          }
        }
        
        return { success: true, data: { vaultPath, masterKey } };
      } catch (error) {
        if (error instanceof VaultError) {
          return { success: false, error: 'Failed to initialize vault' };
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
        },
        agentSentry: {
          type: 'object',
          description: 'AgentSentry IPI detection configuration',
          properties: {
            enabled: { type: 'boolean' },
            K: { type: 'number' },
            windowSize: { type: 'number' },
            gamma: { type: 'number' },
            diagnosticProbe: { type: 'string' },
            dryRunTimeoutMs: { type: 'number' },
          },
        }
      }
    }
  },
  register(api: OpenClawPluginApi, _config?: unknown): void {
    apiRef = api;
    api.logger.info('OpenClaw ModGuard plugin registered');

    // Initialize from environment variables (OpenClaw standard pattern)
    const vaultPath = process.env.MODGUARD_VAULT_PATH;
    const masterKey = process.env.MODGUARD_MASTER_KEY;
    
    if (!vaultPath) {
      api.logger.warn('ModGuard not initialized - MODGUARD_VAULT_PATH environment variable not set');
      return;
    }

    if (masterKey) {
      try {
        initializeModGuardState(vaultPath, masterKey);
        
        if (state.initialized && !hooksRegistered) {
          registerHooks(api, state);
          hooksRegistered = true;
          api.logger.info('ModGuard hooks registered successfully');
        }
      } catch (error) {
        const safeMsg = error instanceof VaultError ? error.message : 'Initialization failed';
        api.logger.error(`ModGuard initialization failed: ${safeMsg}`);
      }
    } else {
      api.logger.warn('ModGuard not initialized - MODGUARD_MASTER_KEY environment variable not set');
    }

    registerModGuardStatus(api);
    registerModGuardDetect(api);
  }
};

export default guardPlugin;
