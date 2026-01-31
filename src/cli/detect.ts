import { Detector } from '../detector.js';
import type { DetectionResult } from '../types.js';
import { getGuardState, isGuardInitialized } from '../index.js';

interface OpenClawPluginApi {
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


interface DetectResult {
  detected: boolean;
  detections: DetectionResult[];
  tokens: string[];
  message: string;
}

export function registerGuardDetect(api: OpenClawPluginApi): void {
  api.registerCommand({
    name: 'guard-detect',
    description: 'Detect PII in text and show what tokens would be generated',
    handler: async (args) => {
      const text = args.text;

      if (!text || typeof text !== 'string') {
        return {
          success: false,
          error: 'Missing or invalid text argument. Usage: /guard-detect <text>',
          output: ''
        };
      }

      if (text.trim().length === 0) {
        return {
          success: false,
          error: 'Text cannot be empty. Usage: /guard-detect <text>',
          output: ''
        };
      }

      if (!isGuardInitialized()) {
        return {
          success: false,
          error: 'Guard plugin not initialized. Please configure vaultPath and masterKey.',
          output: ''
        };
      }

      const state = getGuardState();

      if (!state.detector) {
        return {
          success: false,
          error: 'Detector not available',
          output: ''
        };
      }

      const detections = state.detector.detect(text);

      if (detections.length === 0) {
        const message = '✓ No PII detected in the provided text.';
        return {
          success: true,
          output: message
        };
      }

      const result = formatDetectResults(text, detections);
      const jsonResult = formatDetectResultsJSON(detections);

      const output = `${result}\n\nJSON Format:\n\`\`\`json\n${jsonResult}\n\`\`\``;

      return {
        success: true,
        output
      };
    }
  });
}

function formatDetectResults(text: string, detections: DetectionResult[]): string {
  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push(`PII Detection Results (${detections.length} item(s) found)`);
  lines.push('='.repeat(60));
  lines.push('');

  detections.forEach((detection, index) => {
    lines.push(`${index + 1}. ${detection.pattern.toUpperCase()}`);
    lines.push(`   Category: ${detection.category}`);
    lines.push(`   Confidence: ${Math.round(detection.confidence * 100)}%`);
    lines.push(`   Matched Text: "${detection.match}"`);
    lines.push(`   Position: ${detection.start} - ${detection.end}`);
    lines.push(`   Would Generate Token: ${detection.pattern.toUpperCase()}_XXXXXXXX`);
    lines.push('');
  });

  lines.push('='.repeat(60));

  return lines.join('\n');
}

function formatDetectResultsJSON(detections: DetectionResult[]): string {
  const results = detections.map(detection => ({
    pattern: detection.pattern,
    category: detection.category,
    confidence: detection.confidence,
    match: detection.match,
    start: detection.start,
    end: detection.end,
    wouldGenerateToken: `${detection.pattern.toUpperCase()}_XXXXXXXX`
  }));

  return JSON.stringify({ detections: results }, null, 2);
}
