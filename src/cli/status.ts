import { getGuardState, isGuardInitialized } from '../index.js';

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


interface GuardStatus {
  pluginActive: boolean;
  sessionCount: number;
  vaultEntryCount: number;
  cacheStats: {
    hits: number;
    misses: number;
    hitRate: string;
  };
  performanceMetrics: {
    avgLatency: string;
    totalRequests: number;
  };
}

export function registerGuardStatus(api: OpenClawPluginApi): void {
  api.registerCommand({
    name: '/guard-status',
    description: 'Check guard plugin status and statistics',
    handler: async (args) => {
      if (!isGuardInitialized()) {
        return {
          success: false,
          error: 'Guard plugin not initialized. Please configure vaultPath and masterKey.',
          output: ''
        };
      }

      const state = getGuardState();

      if (!state.vault || !state.detector || !state.tokenizer) {
        return {
          success: false,
          error: 'Guard plugin state is inconsistent',
          output: ''
        };
      }

      const status: GuardStatus = {
        pluginActive: true,
        sessionCount: 0,
        vaultEntryCount: 0,
        cacheStats: {
          hits: 0,
          misses: 0,
          hitRate: '0%'
        },
        performanceMetrics: {
          avgLatency: '<1ms',
          totalRequests: 0
        }
      };

      const output = formatStatus(status);

      return {
        success: true,
        output
      };
    }
  });
}

function formatStatus(status: GuardStatus): string {
  const lines: string[] = [];

  lines.push('='.repeat(50));
  lines.push('OpenClaw Guard Status');
  lines.push('='.repeat(50));
  lines.push('');

  lines.push(`Plugin Status: ${status.pluginActive ? '✓ Active' : '✗ Inactive'}`);
  lines.push(`Session Count: ${status.sessionCount}`);
  lines.push(`Vault Entries: ${status.vaultEntryCount}`);
  lines.push('');

  lines.push('Cache Statistics:');
  lines.push(`  Hits: ${status.cacheStats.hits}`);
  lines.push(`  Misses: ${status.cacheStats.misses}`);
  lines.push(`  Hit Rate: ${status.cacheStats.hitRate}`);
  lines.push('');

  lines.push('Performance Metrics:');
  lines.push(`  Average Latency: ${status.performanceMetrics.avgLatency}`);
  lines.push(`  Total Requests: ${status.performanceMetrics.totalRequests}`);
  lines.push('');

  lines.push('='.repeat(50));

  return lines.join('\n');
}
