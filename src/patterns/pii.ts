import { Pattern, PatternType, PatternCategory } from '../types.js';

export function luhnCheck(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');
  
  if (digits.length < 13 || digits.length > 19) {
    return false;
  }

  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

export const piiPatterns: Pattern[] = [
  {
    type: PatternType.EMAIL,
    category: PatternCategory.PII,
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    confidence: 0.95,
    description: 'Email address',
    examples: ['user@example.com', 'first.last+tag@sub.domain.org', 'test.email+tag+sorting@example.com']
  },
  {
    type: PatternType.PHONE,
    category: PatternCategory.PII,
    regex: /\b(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})(?: *x(\d+))?\b/g,
    confidence: 0.85,
    description: 'International phone number',
    examples: ['+1 555-123-4567', '(555) 123-4567', '555.123.4567', '5551234567']
  },
  {
    type: PatternType.SSN,
    category: PatternCategory.PII,
    regex: /\b(?!000|666|9\d{2})\d{3}[- ]?(?!00)\d{2}[- ]?(?!0000)\d{4}\b/g,
    confidence: 0.95,
    description: 'Social Security Number',
    examples: ['123-45-6789', '123 45 6789', '123456789']
  },
  {
    type: PatternType.CREDIT_CARD,
    category: PatternCategory.PII,
    regex: /\b(?:\d[ -]*?){13,19}\b/g,
    confidence: 0.3,
    description: 'Credit card number (validates with Luhn)',
    examples: ['4111 1111 1111 1111', '378282246310005', '5555 5555 5555 4444'],
    validator: (match: string) => {
      const isValid = luhnCheck(match);
      return { valid: isValid, confidenceMultiplier: isValid ? 3.0 : 0 };
    }
  }
];
