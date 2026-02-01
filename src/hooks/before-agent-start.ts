import { Detector } from '../detector.js';
import { Tokenizer, SessionId } from '../tokenizer.js';
import { SessionManager } from '../session-manager.js';
import type { BeforeAgentStartContext } from '../index.js';
import { DetectionError } from '../errors.js';

interface BeforeAgentStartOptions {
  detector: Detector;
  tokenizer: Tokenizer;
  sessionManager: SessionManager;
}

export async function handleBeforeAgentStart(
  context: BeforeAgentStartContext,
  options: BeforeAgentStartOptions
): Promise<{ prependContext?: string }> {
  const { detector, tokenizer, sessionManager } = options;
  const { prompt, sessionId } = context;

  if (!prompt || prompt.length === 0) {
    return {};
  }

  const session = sessionId ?? tokenizer.generateSessionId();
  sessionManager.createSession(session);

  try {
    const detections = detector.detect(prompt);

    if (detections.length === 0) {
      return {};
    }

    const masked = await maskText(prompt, detections, tokenizer, session);

    return {
      prependContext: masked
    };
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error in before_agent_start hook: ${error.message}`);
    }
    throw new DetectionError('Failed to mask PII in message', { sessionId: session });
  }
}

async function maskText(
  text: string,
  detections: unknown[],
  tokenizer: Tokenizer,
  session: SessionId
): Promise<string> {
  if (!Array.isArray(detections) || detections.length === 0) {
    return text;
  }

  const segments: Array<{ start: number; end: number; text: string; token?: string }> = [];
  let lastEnd = 0;

  for (const detection of detections as Array<{ start: number; end: number; match: string; pattern: string }>) {
    if (detection.start > lastEnd) {
      segments.push({
        start: lastEnd,
        end: detection.start,
        text: text.substring(lastEnd, detection.start)
      });
    }

    const token = await tokenizer.tokenize(detection.match, detection.pattern as any, session);
    segments.push({
      start: detection.start,
      end: detection.end,
      text: text.substring(detection.start, detection.end),
      token
    });

    lastEnd = detection.end;
  }

  if (lastEnd < text.length) {
    segments.push({
      start: lastEnd,
      end: text.length,
      text: text.substring(lastEnd)
    });
  }

  segments.sort((a, b) => a.start - b.start);

  let result = '';
  let pos = 0;

  for (const segment of segments) {
    if (segment.start > pos) {
      result += text.substring(pos, segment.start);
    }

    result += segment.token ?? segment.text;
    pos = segment.end;
  }

  return result;
}
