import * as crypto from 'node:crypto';

/**
 * Securely zeros a buffer to prevent sensitive data from remaining in memory.
 * Uses Buffer.fill(0) which overwrites the memory contents.
 *
 * Note: Due to JavaScript's garbage collection, this cannot guarantee the data
 * is removed from all memory locations, but it prevents the buffer from being
 * readable after zeroing.
 */
export function secureZero(buffer: Buffer): void {
  if (!Buffer.isBuffer(buffer)) {
    return;
  }
  buffer.fill(0);
}

/**
 * Securely zeros a Uint8Array to prevent sensitive data from remaining in memory.
 */
export function secureZeroUint8Array(array: Uint8Array): void {
  if (!(array instanceof Uint8Array)) {
    return;
  }
  array.fill(0);
}

/**
 * Performs a constant-time comparison of two buffers.
 * Uses crypto.timingSafeEqual to prevent timing attacks.
 *
 * If buffers have different lengths, returns false without revealing
 * which bytes differ through timing.
 */
export function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    return false;
  }

  if (a.length !== b.length) {
    // Perform a dummy comparison to maintain constant time
    // even when lengths differ
    const dummy = Buffer.alloc(a.length);
    crypto.timingSafeEqual(a, dummy);
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}

/**
 * Performs a constant-time comparison of two strings.
 * Converts strings to buffers and uses timingSafeEqual.
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  try {
    return timingSafeEqual(bufA, bufB);
  } finally {
    secureZero(bufA);
    secureZero(bufB);
  }
}

/**
 * Generates cryptographically secure random bytes.
 * Wrapper around crypto.randomBytes for consistent API.
 */
export function secureRandomBytes(length: number): Buffer {
  return crypto.randomBytes(length);
}

/**
 * Generates a cryptographically secure random hex string.
 */
export function secureRandomHex(byteLength: number): string {
  return crypto.randomBytes(byteLength).toString('hex');
}

/**
 * Executes a function with a sensitive buffer, then zeros the buffer.
 * Ensures cleanup happens even if the function throws.
 */
export async function withSecureBuffer<T>(
  buffer: Buffer,
  fn: (buffer: Buffer) => T | Promise<T>
): Promise<T> {
  try {
    return await fn(buffer);
  } finally {
    secureZero(buffer);
  }
}

/**
 * Creates a temporary buffer, executes a function with it, then zeros it.
 */
export async function withTempSecureBuffer<T>(
  size: number,
  fn: (buffer: Buffer) => T | Promise<T>
): Promise<T> {
  const buffer = Buffer.alloc(size);
  try {
    return await fn(buffer);
  } finally {
    secureZero(buffer);
  }
}
