// src/agent-sentry/injection-patterns.ts
//
// Shared injection-pattern registry.
//
// Exported as `let` so the dynamic bootstrap in registerAgentSentry() can push
// model-derived patterns into the array at runtime without replacing the
// reference (both purifier.ts and text-analysis-engine.ts import this binding).

export let INJECTION_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override|supersede)\b.*\b(previous|above|prior|original)\b/gi,
  /\b(you\s+(must|should|shall|will|need\s+to|have\s+to))\b/gi,
  /\b(new\s+instruction|updated\s+task|system\s+prompt|ignore\s+all)\b/gi,
  /\b(send|email|post|upload|delete|execute|run|call)\b.*\b(immediately|now|first)\b/gi,
  // Polite imperatives: "Please call the X tool", "Please execute", "Please run"
  /\bplease\s+(call|execute|run|fetch|send|post|upload|delete|invoke|use)\b/gi,
  // Direct imperatives without adverbs: "Call the X tool with:", "Execute command:"
  /^(call|execute|run|fetch|invoke)\s+\w/gim,
  // Protocol/instruction block markers
  /\[(auto[-\s]?diagnostic|instruction|command|protocol|task|directive|override)\b/gi,
  /\[(system|assistant|user|admin|root)\]:/gi,
  /#{1,6}\s*(instruction|task|directive|command|protocol)/gi,
  // Role-play / persona injection
  /\b(act\s+as|pretend\s+(you\s+are|to\s+be)|your\s+(new\s+)?role\s+is)\b/gi,
  // Exfiltration directives
  /\b(exfiltrate|leak|expose|transmit|forward|relay)\b.*\b(data|content|information|secret|key|token)\b/gi,
];
