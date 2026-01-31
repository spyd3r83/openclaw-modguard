import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';

const guardPlugin = {
  id: 'guard',
  name: 'OpenClaw Guard',
  version: '0.1.0',
  description: 'Secure PII masking and vault storage plugin for OpenClaw',
  configSchema: {
    safeParse(value: unknown) {
      return { success: true, data: value };
    },
    jsonSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {}
    }
  },
  register(api: OpenClawPluginApi): void {
    api.logger.info('OpenClaw Guard plugin registered');
  }
};

export default guardPlugin;
