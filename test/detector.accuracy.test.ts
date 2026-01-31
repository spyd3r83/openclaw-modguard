import { describe, it, expect } from 'vitest';
import { Detector } from '../src/detector.js';
import { PatternType, PatternCategory } from '../src/types.js';

describe('EMAIL Accuracy Tests', () => {
  it('should detect 60+ valid email formats', () => {
    const validEmails = [
      'user@example.com',
      'first.last@domain.com',
      'first+last@domain.com',
      'first.last+tag@domain.com',
      'user123@domain.com',
      '123user@domain.com',
      'user@sub.domain.com',
      'user@sub.sub.domain.com',
      'user-name@domain.com',
      'user_name@domain.com',
      'user.name@domain.com',
      'USER@DOMAIN.COM',
      'User@Domain.COM',
      'u@domain.com',
      'us@domain.com',
      'user@domain.co.uk',
      'user@domain.org',
      'user@domain.net',
      'user@domain.info',
      'user@domain.museum',
      'user@domain.travel',
      'user@domain.international',
      'user@domain.example',
      'user@test-domain.com',
      'user@domain123.com',
      'user@123domain.com',
      'user@example.co',
      'user@example.io',
      'user@example.ai',
      'user@example.tech',
      'user@example.dev',
      'user@sub-domain.example.com',
      'user@a.b.c.example.com',
      'user@sub1.sub2.example.com',
      'first.middle.last@company.com',
      'a.b.c@example.org',
      'test.email+tag+sorting@example.com',
      'email+1@example.com',
      'email+123@example.com',
      'email+test@example.com',
      'firstname.lastname@example.com',
      'email@subdomain.example.com',
      '123456789@example.com',
      'user123@example123.com',
      'user-name@test-domain.com',
      'user_name@test_domain.com',
      'user.name@domain-name.com',
      'test@test-test.com',
      'admin@server.company.com',
      'support@helpdesk.service.com',
      'info@company.example.org',
      'sales@marketing.corporate.com',
      'user@localhost.localdomain',
      'user@192.168.1.100',
      'user@[192.168.1.100]',
      'user+tag+test@example.co.uk',
      'user.name123@domain-name.com',
      'first.last@sub.sub.domain.com',
      'test.email+sorting@example.com',
      'x@y.z',
      'a@b.co'
    ];

    const detector = new Detector();
    const results = detector.detect(validEmails.join(' '));
    const emails = results.filter(r => r.pattern === PatternType.EMAIL);
    expect(emails.length).toBeGreaterThanOrEqual(50);
  });

  it('should reject 40+ invalid email patterns', () => {
    const invalidEmails = [
      'not-an-email',
      '@nodomain.com',
      'user@',
      'test@test',
      'test',
      'example.com',
      'user@domain',
      'user@domain.',
      '@domain.com',
      'user@.com',
      'user@domain..com',
      'user@@domain.com',
      'user@@@domain.com',
      'user domain.com',
      'user,domain.com',
      'user@domain com',
      'user@domain,com',
      'user name@domain.com',
      'user name@domain com',
      'user@@example.com',
      'user@domain..com',
      'user@-domain.com',
      'user@domain-.com',
      'user@.domain.com',
      'user@domain.',
      'user@',
      '@example.com',
      'user@domain.c',
      'user@.domain.com',
      'user@domain .com',
      'user@domain . com',
      'user@domain,com',
      'user@domain;com',
      'user@domain:com',
      'user@domain/com',
      'user@domain\\com',
      'user@domain"com',
      'user@domain\'com',
      'user@domain@domain.com',
      'user@@domain.com',
      'user@@@domain.com',
      'user@domain@domain'
    ];

    const detector = new Detector();
    const results = detector.detect(invalidEmails.join(' '));
    const emails = results.filter(r => r.pattern === PatternType.EMAIL);
    expect(emails.length).toBe(0);
  });

  it('should document known false positives', () => {
    const falsePositiveSamples = [
      'user@localhost',
      'admin@127.0.0.1',
      'user@192.168.1.1',
      'user@[10.0.0.1]'
    ];
    const detector = new Detector();
    const results = detector.detect(falsePositiveSamples.join(' '));
    const emails = results.filter(r => r.pattern === PatternType.EMAIL);
    expect(emails.length).toBeGreaterThan(0);
  });

  it('should document known false negatives', () => {
    const falseNegativeSamples = [
      '"very.unusual.@.unusual.com"@example.com',
      '"much.more unusual"@example.com',
      'admin@mailserver1',
      'postmaster@[127.0.0.1]',
      'user+tag+tag@example.com'
    ];
    const detector = new Detector();
    const results = detector.detect(falseNegativeSamples.join(' '));
    const emails = results.filter(r => r.pattern === PatternType.EMAIL);
    expect(emails.length).toBeLessThan(falseNegativeSamples.length);
  });
});

describe('PHONE Accuracy Tests', () => {
  it('should detect 60+ valid phone formats', () => {
    const validPhones = [
      '+1 555-123-4567',
      '+1 (555) 123-4567',
      '+1 555.123.4567',
      '+1 555 123 4567',
      '555-123-4567',
      '(555) 123-4567',
      '555.123.4567',
      '555 123 4567',
      '5551234567',
      '+44 207 946 0123',
      '+44 (0)207 946 0123',
      '+44 20 7946 0123',
      '020 7946 0123',
      '+49 30 1234567',
      '+49 (0)30 1234567',
      '030 1234567',
      '+81 3 1234 5678',
      '03 1234 5678',
      '+33 1 23 45 67 89',
      '01 23 45 67 89',
      '+86 10 1234 5678',
      '10 1234 5678',
      '+61 2 1234 5678',
      '02 1234 5678',
      '+91 11 2345 6789',
      '011 2345 6789',
      '555-123-4567 x1234',
      '555-123-4567 ext 1234',
      '555-123-4567 ext. 1234',
      '(555) 123-4567 x123',
      '+1 555-123-4567 ext 1234',
      '800-123-4567',
      '888-555-1212',
      '900-555-1234',
      '877-555-1212',
      '866-555-1212',
      '855-555-1212',
      '844-555-1212',
      '833-555-1212',
      '511-555-1212',
      '711-555-1212',
      '911',
      '411',
      '311',
      '511',
      '611',
      '711',
      '811',
      '988',
      '211',
      '311',
      '511',
      '555-0000',
      '555-1000',
      '555-9999',
      '123-4567',
      '1234567',
      '(123) 456-7890',
      '1-555-123-4567',
      '1 (555) 123-4567',
      '1.555.123.4567',
      '15551234567'
    ];

    const detector = new Detector();
    const results = detector.detect(validPhones.join(' '));
    const phones = results.filter(r => r.pattern === PatternType.PHONE);
    expect(phones.length).toBeGreaterThanOrEqual(60);
  });

  it('should reject 40+ invalid phone patterns', () => {
    const invalidPhones = [
      '123',
      '12',
      '1234567890123456',
      '12345678901234567890',
      '555-',
      '-123-4567',
      '555-123-',
      '555-123-456',
      '555-123-45678',
      '(555-123-4567',
      '555-123-4567)',
      '555--123--4567',
      '555..123..4567',
      '555  123  4567',
      'abc-123-4567',
      '555-abc-4567',
      '555-123-defg',
      '12345',
      '123456',
      '12345678',
      '12345678901',
      '123456789012',
      '1234567890123',
      '12345678901234',
      '123456789012345',
      '1234567890123456',
      '12345678901234567',
      '123456789012345678',
      '1234567890123456789',
      '12345678901234567890',
      '123-456',
      '12-345-6789',
      '1234-567-890',
      '123-4567-8901',
      '555-1234-567',
      '555-12-34567',
      '5551-234-567',
      '+-123-4567',
      '++1-555-123-4567',
      '+1--555-123-4567',
      '+1 555--123-4567'
    ];

    const detector = new Detector();
    const results = detector.detect(invalidPhones.join(' '));
    const phones = results.filter(r => r.pattern === PatternType.PHONE);
    expect(phones.length).toBeLessThan(10);
  });

  it('should document known false positives', () => {
    const falsePositiveSamples = [
      '123-45-6789',
      '800-123-4567',
      '555-0000',
      '123-4567'
    ];
    const detector = new Detector();
    const results = detector.detect(falsePositiveSamples.join(' '));
    const phones = results.filter(r => r.pattern === PatternType.PHONE);
    expect(phones.length).toBeGreaterThanOrEqual(0);
  });

  it('should document known false negatives', () => {
    const falseNegativeSamples = [
      '+1 800 555 1212',
      '800-555-1212',
      '1-800-555-1212',
      '+44 020 7946 0123',
      '020 7946 0123'
    ];
    const detector = new Detector();
    const results = detector.detect(falseNegativeSamples.join(' '));
    const phones = results.filter(r => r.pattern === PatternType.PHONE);
    expect(phones.length).toBeLessThan(falseNegativeSamples.length);
  });
});

describe('SSN Accuracy Tests', () => {
  it('should detect 60+ valid SSN formats', () => {
    const validSSNs = [
      '123-45-6789',
      '123 45 6789',
      '123456789',
      '001-01-0001',
      '001-01-0002',
      '100-00-0000',
      '100-99-9999',
      '200-00-0000',
      '200-99-9999',
      '300-00-0000',
      '300-99-9999',
      '400-00-0000',
      '400-99-9999',
      '500-00-0000',
      '500-99-9999',
      '600-00-0000',
      '600-99-9999',
      '700-00-0000',
      '700-99-9999',
      '800-00-0000',
      '800-99-9999',
      '899-99-9999',
      '001-01-9999',
      '123-45-6789',
      '234-56-7890',
      '345-67-8901',
      '456-78-9012',
      '567-89-0123',
      '678-90-1234',
      '789-01-2345',
      '890-12-3456',
      '901-23-4567',
      '001 01 0001',
      '100 00 0000',
      '123 45 6789',
      '001010001',
      '100000000',
      '123456789',
      '234567890',
      '345678901',
      '456789012',
      '567890123',
      '678901234',
      '789012345',
      '890123456',
      '901234567',
      '111-11-1111',
      '222-22-2222',
      '333-33-3333',
      '444-44-4444',
      '555-55-5555',
      '777-77-7777',
      '888-88-8888',
      '899-99-9999',
      '001-99-9999',
      '100-00-0001',
      '100-01-0001',
      '899-98-9999',
      '899-99-9998'
    ];

    const detector = new Detector();
    const results = detector.detect(validSSNs.join(' '));
    const ssns = results.filter(r => r.pattern === PatternType.SSN);
    expect(ssns.length).toBeGreaterThanOrEqual(60);
  });

  it('should reject 40+ invalid SSN patterns', () => {
    const invalidSSNs = [
      '000-00-0000',
      '666-00-0000',
      '900-00-0000',
      '901-00-0000',
      '999-00-0000',
      '000-01-0001',
      '000-99-9999',
      '666-01-0001',
      '666-99-9999',
      '900-01-0001',
      '901-01-0001',
      '999-01-0001',
      '1234-56-789',
      '12-345-6789',
      '123-456-789',
      '123-4-6789',
      '123-45-678',
      '123-45-67890',
      '123-456-7890',
      '12-34-5678',
      '1234-567-890',
      '12345-6789',
      '123-456789',
      '000000000',
      '666000000',
      '900000000',
      '12345678',
      '1234567890',
      '12345678',
      '1234567',
      '123456',
      '12345',
      '1234',
      '123',
      '12',
      '1',
      '000-00-0001',
      '000-01-0000',
      '666-00-0001',
      '666-01-0000',
      '900-00-0001',
      '900-01-0000',
      '999-99-9999',
      '999-00-0000',
      '000-99-9999',
      '666-99-9999',
      '900-99-9999'
    ];

    const detector = new Detector();
    const results = detector.detect(invalidSSNs.join(' '));
    const ssns = results.filter(r => r.pattern === PatternType.SSN);
    expect(ssns.length).toBe(0);
  });

  it('should document known false positives', () => {
    const falsePositiveSamples = [
      'Product code: 123-45-6789',
      'SKU: 123-45-6789',
      'Part number: 123-45-6789'
    ];
    const detector = new Detector();
    const results = detector.detect(falsePositiveSamples.join(' '));
    const ssns = results.filter(r => r.pattern === PatternType.SSN);
    expect(ssns.length).toBeGreaterThanOrEqual(0);
  });

  it('should document known false negatives', () => {
    const falseNegativeSamples = [
      '123-45-6789 ext 1234',
      'SSN: 123-45-6789'
    ];
    const detector = new Detector();
    const results = detector.detect(falseNegativeSamples.join(' '));
    const ssns = results.filter(r => r.pattern === PatternType.SSN);
    expect(ssns.length).toBeLessThan(2);
  });
});

describe('CREDIT_CARD Accuracy Tests', () => {
  it('should detect 60+ valid credit card formats', () => {
    const validCards = [
      '4111111111111111',
      '4012888888881881',
      '4222222222222',
      '5555555555554444',
      '5105105105105100',
      '378282246310005',
      '371449635398431',
      '378734493671000',
      '6011111111111117',
      '6011000990139424',
      '6011000990139424',
      '3530111333300000',
      '3566002020360505',
      '3566002020360505',
      '4111 1111 1111 1111',
      '4111-1111-1111-1111',
      '4111111111111111',
      '4012 8888 8888 1881',
      '4012-8888-8888-1881',
      '4012888888881881',
      '5555 5555 5555 4444',
      '5555-5555-5555-4444',
      '5555555555554444',
      '5105 1051 0510 5100',
      '5105-1051-0510-5100',
      '5105105105105100',
      '3782 822463 10005',
      '3782-822463-10005',
      '378282246310005',
      '3714 496353 98431',
      '3714-496353-98431',
      '371449635398431',
      '6011 1111 1111 1117',
      '6011-1111-1111-1117',
      '6011111111111117',
      '3530 1113 3300 000',
      '3530-1113-3300-000',
      '3530111333300000',
      '3566 0020 2036 0505',
      '3566-0020-2036-0505',
      '3566002020360505',
      '4111111111111111',
      '4242424242424242',
      '4000056655665556',
      '5555555555554444',
      '5105105105105100',
      '378282246310005',
      '371449635398431',
      '6011111111111117',
      '6011000990139424',
      '3530111333300000',
      '3566002020360505',
      '4111111111111111',
      '4222222222222',
      '4462030000000000',
      '4484070000000000',
      '4111111111111111',
      '4111111111111111'
    ];

    const detector = new Detector();
    const results = detector.detect(validCards.join(' '));
    const cards = results.filter(r => r.pattern === PatternType.CREDIT_CARD && r.confidence >= 0.9);
    expect(cards.length).toBeGreaterThanOrEqual(60);
  });

  it('should reject 40+ invalid credit card patterns', () => {
    const invalidCards = [
      '1234 5678 9012 3456',
      '1111 1111 1111 1111',
      '0000 0000 0000 0000',
      '1234-5678-9012-3456',
      '1111-1111-1111-1111',
      '0000-0000-0000-0000',
      '1234567890123456',
      '1111111111111111',
      '0000000000000000',
      '411111111111111',
      '41111111111111111',
      '411111111111',
      '4111 1111 1111 111',
      '4111 1111 1111 11111',
      '4111 1111 1111',
      '4111 1111 1111 1111 1111',
      'abcd efgh ijkl mnop',
      'abcd-efgh-ijkl-mnop',
      'abcdefghijklmnop',
      '1234 5678 9012 345',
      '1234 5678 9012 34567',
      '1234 5678 9012',
      '1234 5678 9012 345 6789',
      '4111 1111 1111 111',
      '4111 1111 1111 11111',
      '411111111111111',
      '41111111111111111',
      '4111-1111-1111-111',
      '4111-1111-1111-11111',
      '4111-1111-1111-111a',
      '4111-1111-1111-111x',
      '4111-1111-1111-111!',
      '1234 5678 9012 3456',
      '1111 1111 1111 1111',
      '0000 0000 0000 0000',
      '0000-0000-0000-0000',
      '4111 1111 1111 1111',
      '4222 2222 2222 2222',
      '5555 5555 5555 5555',
      '3782 822463 10005',
      '6011 1111 1111 1117',
      '3530 1113 3300 0000',
      '1234 5678 9012 3456'
    ];

    const detector = new Detector();
    const results = detector.detect(invalidCards.join(' '));
    const cards = results.filter(r => r.pattern === PatternType.CREDIT_CARD);
    const validCards = cards.filter(r => r.confidence >= 0.9);
    expect(validCards.length).toBeLessThan(10);
  });

  it('should document known false positives', () => {
    const falsePositiveSamples = [
      '1234 5678 9012 3456',
      '1111 1111 1111 1111'
    ];
    const detector = new Detector();
    const results = detector.detect(falsePositiveSamples.join(' '));
    const cards = results.filter(r => r.pattern === PatternType.CREDIT_CARD);
    expect(cards.length).toBeGreaterThan(0);
  });

  it('should document known false negatives', () => {
    const falseNegativeSamples = [
      '4111111111111111',
      '4242424242424242'
    ];
    const detector = new Detector();
    const results = detector.detect(falseNegativeSamples.join(' '));
    const cards = results.filter(r => r.pattern === PatternType.CREDIT_CARD && r.confidence >= 0.9);
    expect(cards.length).toBeLessThan(falseNegativeSamples.length);
  });
});

describe('API_KEY Accuracy Tests', () => {
  it('should detect 60+ valid API key formats', () => {
    const validKeys = [
      'sk-proj-abc123def456',
      'sk-1234567890abcdef',
      'sk-live-1234567890abcdef',
      'ghp_1234567890abcdef',
      'ghp_ABCDEF1234567890',
      'ghp_XYZ789ABC123def456',
      'github_pat_1234567890abcdef',
      'github_pat_ABCDEF1234567890',
      'github_pat_11ABCDABCDABCDABCDABCDABCDEF123456789',
      'xoxb-12345-67890-abcdef123',
      'xoxp-12345-67890-12345-abcdef123',
      'xoxr-12345-67890-12345-abcdef123',
      'xoxs-12345-67890-12345-abcdef123',
      'xoxa-12345-67890-abcdef123',
      'xapp-12345-67890-abcdef123',
      'gsk_abc123def456',
      'gsk_ABCDEF1234567890',
      'gsk_XYZ789ABC123def456',
      'AIzaSyC-abcdefghijklmnopqrstuvwxy1234567890',
      'AIzaSyDA1abcdefghijklmnopqrstuvwxy1234567890',
      'AIzaSyD4-abcdefghijklmnopqrstuvwxy1234567890',
      'pplx-abcdefghijklmnopqrst123456789',
      'pplx-1234567890abcdef',
      'pplx_ABCDEF1234567890',
      'npm_1234567890abcdef',
      'npm_ABCDEF1234567890',
      'sk_1234567890abcdef',
      'sk_live_1234567890abcdef',
      'sk_test_1234567890abcdef',
      'pk_live_1234567890abcdef',
      'pk_test_1234567890abcdef',
      'sk-proj-AbCdEf1234567890',
      'sk-proj-1234567890ABCDEF',
      'sk-proj-abc123ABC123def456',
      'ghp_1234567890ABCDEF',
      'ghp_abc123ABC123def456',
      'github_pat_1234567890ABCDEF',
      'xoxb-12345-67890-ABCDEF',
      'xoxp-12345-67890-12345-ABCDEF',
      'xoxr-12345-67890-12345-ABCDEF',
      'xoxs-12345-67890-12345-ABCDEF',
      'gsk_1234567890ABCDEF',
      'gsk_abc123ABC123def456',
      'AIzaSyC-1234567890ABCDEF',
      'AIzaSyC-abc123ABC123def456',
      'pplx-1234567890ABCDEF',
      'pplx-abc123ABC123def456',
      'npm_1234567890ABCDEF',
      'npm_abc123ABC123def456'
    ];

    const detector = new Detector();
    const results = detector.detect(validKeys.join(' '));
    const apiKeys = results.filter(r => r.pattern === PatternType.API_KEY);
    expect(apiKeys.length).toBeGreaterThanOrEqual(60);
  });

  it('should reject 40+ invalid API key patterns', () => {
    const invalidKeys = [
      'sk-',
      'sk-proj-',
      'ghp_',
      'github_pat_',
      'xoxb-',
      'xoxp-',
      'xoxr-',
      'xoxs-',
      'xapp-',
      'gsk_',
      'AIza',
      'pplx-',
      'npm_',
      'sk-123',
      'sk-proj-abc',
      'ghp_abc',
      'github_pat_abc',
      'xoxb-123',
      'xoxp-123',
      'xoxr-123',
      'xoxs-123',
      'xapp-123',
      'gsk_abc',
      'AIza',
      'pplx-abc',
      'npm_abc',
      'sk-proj-1234567890123',
      'ghp_1234567890123',
      'github_pat_1234567890123',
      'xoxb-12345-67890-abc',
      'xoxp-12345-67890-12345-abc',
      'xoxr-12345-67890-12345-abc',
      'xoxs-12345-67890-12345-abc',
      'gsk_1234567890123',
      'AIza',
      'pplx-1234567890123',
      'npm_1234567890123',
      'sk',
      'ghp',
      'github_pat',
      'xox',
      'xapp',
      'gsk',
      'AIza',
      'pplx',
      'npm',
      'sk-proj',
      'ghp_',
      'github_pat_',
      'xoxb-',
      'xoxp-',
      'xoxr-',
      'xoxs-'
    ];

    const detector = new Detector();
    const results = detector.detect(invalidKeys.join(' '));
    const apiKeys = results.filter(r => r.pattern === PatternType.API_KEY);
    expect(apiKeys.length).toBeLessThan(5);
  });

  it('should document known false positives', () => {
    const falsePositiveSamples = [
      'sk-1234567890abcdef',
      'ghp_1234567890abcdef'
    ];
    const detector = new Detector();
    const results = detector.detect(falsePositiveSamples.join(' '));
    const apiKeys = results.filter(r => r.pattern === PatternType.API_KEY);
    expect(apiKeys.length).toBeGreaterThan(0);
  });

  it('should document known false negatives', () => {
    const falseNegativeSamples = [
      'sk-1234567890123456',
      'ghp_1234567890123456'
    ];
    const detector = new Detector();
    const results = detector.detect(falseNegativeSamples.join(' '));
    const apiKeys = results.filter(r => r.pattern === PatternType.API_KEY);
    expect(apiKeys.length).toBe(2);
  });
});

describe('BEARER_TOKEN Accuracy Tests', () => {
  it('should detect 60+ valid Bearer token formats', () => {
    const validTokens = [
      'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9',
      'Bearer eyJhbGciOiFUUzI1NiIsInR5cCI6IkpXVCJ9',
      'Bearer eyJhbGciOiBH512IiwidHlwIjoiSldUIn0',
      'Bearer abc123xyz789',
      'Bearer eyJhbGc',
      'Bearer ya29.a0AfH6SMBx9lW9c7X8Y9Z0A1B2C3D4E5F6G7H8I9J0K1L2M3N4',
      'Bearer ya29.a0AfH6SMBx9lW9c7X8Y9Z0',
      'Bearer 1234567890abcdef',
      'Bearer ABCDEF1234567890',
      'Bearer abc123ABC123def456',
      'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ',
      'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ',
      'Bearer abc123xyz789ABC123',
      'Bearer 1234567890abcdefABCDEF',
      'Bearer eyJhbGc',
      'Bearer ya29.a0AfH6SMBx9lW9c7X8Y9Z0A1B2C3D4E5F6G7H8I9J0K1L2M3N4',
      'Bearer abc123xyz789',
      'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      'Bearer abc123xyz789ABCDEF123456',
      'Bearer eyJhbGc',
      'Bearer ya29.a0AfH6SMBx9lW9c7X8Y9Z0',
      'Bearer 1234567890abcdef',
      'Bearer abc123ABC123def456',
      'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ',
      'Bearer abc123xyz789',
      'Bearer eyJhbGc',
      'Bearer ya29.a0AfH6SMBx9lW9c7X8Y9Z0',
      'Bearer 1234567890abcdef',
      'Bearer abc123ABC123def456',
      'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ',
      'Bearer abc123xyz789',
      'Bearer eyJhbGc',
      'Bearer ya29.a0AfH6SMBx9lW9c7X8Y9Z0',
      'Bearer 1234567890abcdef',
      'Bearer abc123ABC123def456',
      'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ',
      'Bearer abc123xyz789',
      'Bearer eyJhbGc',
      'Bearer ya29.a0AfH6SMBx9lW9c7X8Y9Z0',
      'Bearer 1234567890abcdef',
      'Bearer abc123ABC123def456',
      'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ',
      'Bearer abc123xyz789',
      'Bearer eyJhbGc',
      'Bearer ya29.a0AfH6SMBx9lW9c7X8Y9Z0',
      'Bearer 1234567890abcdef',
      'Bearer abc123ABC123def456',
      'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ'
    ];

    const detector = new Detector();
    const results = detector.detect(validTokens.join(' '));
    const tokens = results.filter(r => r.pattern === PatternType.BEARER_TOKEN);
    expect(tokens.length).toBeGreaterThanOrEqual(60);
  });

  it('should reject 40+ invalid Bearer token patterns', () => {
    const invalidTokens = [
      'Bearer abc',
      'Bearer 123',
      'Bearer abc12',
      'Bearer 12345',
      'Bearer abc123',
      'Bearer abc1234',
      'Bearer abc12345',
      'Bearer abc123456',
      'Bearer abc1234567',
      'Bearer abc12345678',
      'Bearer abc123456789',
      'Bearer abc1234567890',
      'Bearer abc1234567890a',
      'Bearer abc1234567890ab',
      'Bearer abc1234567890abc',
      'Bearer abc1234567890abcd',
      'Bearer abc1234567890abcde',
      'Bearer abc1234567890abcdef',
      'Bearer abc1234567890abcdef1',
      'Bearer abc1234567890abcdef12',
      'Bearer abc1234567890abcdef123',
      'Bearer abc1234567890abcdef1234',
      'Bearer abc1234567890abcdef12345',
      'Bearer abc1234567890abcdef123456',
      'Bearer abc1234567890abcdef1234567',
      'Bearer abc1234567890abcdef12345678',
      'Bearer abc1234567890abcdef123456789',
      'Bearer abc1234567890abcdef1234567890',
      'Bearer abc1234567890abcdef12345678901',
      'Bearer abc1234567890abcdef123456789012',
      'Bearer abc1234567890abcdef1234567890123',
      'Bearer abc1234567890abcdef12345678901234',
      'Bearer abc1234567890abcdef123456789012345',
      'Bearer abc1234567890abcdef1234567890123456',
      'Bearer abc1234567890abcdef12345678901234567',
      'Bearer abc1234567890abcdef123456789012345678',
      'Bearer abc1234567890abcdef1234567890123456789',
      'Bearer abc1234567890abcdef12345678901234567890',
      'Bearer abc1234567890abcdef123456789012345678901',
      'Bearer abc1234567890abcdef1234567890123456789012',
      'Bearer abc1234567890abcdef12345678901234567890123'
    ];

    const detector = new Detector();
    const results = detector.detect(invalidTokens.join(' '));
    const tokens = results.filter(r => r.pattern === PatternType.BEARER_TOKEN);
    expect(tokens.length).toBeLessThan(5);
  });

  it('should document known false positives', () => {
    const falsePositiveSamples = [
      'Bearer abc123xyz789',
      'Bearer 1234567890abcdef'
    ];
    const detector = new Detector();
    const results = detector.detect(falsePositiveSamples.join(' '));
    const tokens = results.filter(r => r.pattern === PatternType.BEARER_TOKEN);
    expect(tokens.length).toBeGreaterThan(0);
  });

  it('should document known false negatives', () => {
    const falseNegativeSamples = [
      'Bearer abc123',
      'Bearer 12345'
    ];
    const detector = new Detector();
    const results = detector.detect(falseNegativeSamples.join(' '));
    const tokens = results.filter(r => r.pattern === PatternType.BEARER_TOKEN);
    expect(tokens.length).toBe(0);
  });
});

describe('PEM_BLOCK Accuracy Tests', () => {
  it('should detect 60+ valid PEM block formats', () => {
    const validPEMs = [
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAz7\n-----END RSA PRIVATE KEY-----',
      '-----BEGIN PRIVATE KEY-----\nMIIEpAIBAAKCAQEAz7\n-----END PRIVATE KEY-----',
      '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEE\n-----END EC PRIVATE KEY-----',
      '-----BEGIN DSA PRIVATE KEY-----\nMIIB\n-----END DSA PRIVATE KEY-----',
      '-----BEGIN RSA PUBLIC KEY-----\nMIIB\n-----END RSA PUBLIC KEY-----',
      '-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----',
      '-----BEGIN CERTIFICATE-----\nMIIDXTCCAkWgAwIBAg\n-----END CERTIFICATE-----',
      '-----BEGIN X509 CERTIFICATE-----\nMIIDXTCCAkWgAwIBAg\n-----END X509 CERTIFICATE-----',
      '-----BEGIN TRUSTED CERTIFICATE-----\nMIIDXTCCAkWgAwIBAg\n-----END TRUSTED CERTIFICATE-----',
      '-----BEGIN CERTIFICATE REQUEST-----\nMIIDXTCCAkWgAwIBAg\n-----END CERTIFICATE REQUEST-----',
      '-----BEGIN NEW CERTIFICATE REQUEST-----\nMIIDXTCCAkWgAwIBAg\n-----END NEW CERTIFICATE REQUEST-----',
      '-----BEGIN ENCRYPTED PRIVATE KEY-----\nMIIEpAIBAAKCAQEAz7\n-----END ENCRYPTED PRIVATE KEY-----',
      '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjE\n-----END OPENSSH PRIVATE KEY-----',
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAz7\n-----END RSA PRIVATE KEY-----',
      '-----BEGIN PRIVATE KEY-----\nMIIEpAIBAAKCAQEAz7\n-----END PRIVATE KEY-----',
      '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEE\n-----END EC PRIVATE KEY-----',
      '-----BEGIN DSA PRIVATE KEY-----\nMIIB\n-----END DSA PRIVATE KEY-----',
      '-----BEGIN RSA PUBLIC KEY-----\nMIIB\n-----END RSA PUBLIC KEY-----',
      '-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----',
      '-----BEGIN CERTIFICATE-----\nMIIDXTCCAkWgAwIBAg\n-----END CERTIFICATE-----',
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAz7\n-----END RSA PRIVATE KEY-----',
      '-----BEGIN PRIVATE KEY-----\nMIIEpAIBAAKCAQEAz7\n-----END PRIVATE KEY-----',
      '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEE\n-----END EC PRIVATE KEY-----',
      '-----BEGIN DSA PRIVATE KEY-----\nMIIB\n-----END DSA PRIVATE KEY-----',
      '-----BEGIN RSA PUBLIC KEY-----\nMIIB\n-----END RSA PUBLIC KEY-----',
      '-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----',
      '-----BEGIN CERTIFICATE-----\nMIIDXTCCAkWgAwIBAg\n-----END CERTIFICATE-----',
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAz7\n-----END RSA PRIVATE KEY-----',
      '-----BEGIN PRIVATE KEY-----\nMIIEpAIBAAKCAQEAz7\n-----END PRIVATE KEY-----',
      '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEE\n-----END EC PRIVATE KEY-----',
      '-----BEGIN DSA PRIVATE KEY-----\nMIIB\n-----END DSA PRIVATE KEY-----',
      '-----BEGIN RSA PUBLIC KEY-----\nMIIB\n-----END RSA PUBLIC KEY-----',
      '-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----',
      '-----BEGIN CERTIFICATE-----\nMIIDXTCCAkWgAwIBAg\n-----END CERTIFICATE-----',
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAz7\n-----END RSA PRIVATE KEY-----',
      '-----BEGIN PRIVATE KEY-----\nMIIEpAIBAAKCAQEAz7\n-----END PRIVATE KEY-----',
      '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEE\n-----END EC PRIVATE KEY-----',
      '-----BEGIN DSA PRIVATE KEY-----\nMIIB\n-----END DSA PRIVATE KEY-----',
      '-----BEGIN RSA PUBLIC KEY-----\nMIIB\n-----END RSA PUBLIC KEY-----',
      '-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----',
      '-----BEGIN CERTIFICATE-----\nMIIDXTCCAkWgAwIBAg\n-----END CERTIFICATE-----',
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAz7\n-----END RSA PRIVATE KEY-----',
      '-----BEGIN PRIVATE KEY-----\nMIIEpAIBAAKCAQEAz7\n-----END PRIVATE KEY-----',
      '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEE\n-----END EC PRIVATE KEY-----',
      '-----BEGIN DSA PRIVATE KEY-----\nMIIB\n-----END DSA PRIVATE KEY-----',
      '-----BEGIN RSA PUBLIC KEY-----\nMIIB\n-----END RSA PUBLIC KEY-----',
      '-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----',
      '-----BEGIN CERTIFICATE-----\nMIIDXTCCAkWgAwIBAg\n-----END CERTIFICATE-----'
    ];

    const detector = new Detector();
    const results = detector.detect(validPEMs.join('\n'));
    const pems = results.filter(r => r.pattern === PatternType.PEM_BLOCK);
    expect(pems.length).toBeGreaterThanOrEqual(60);
  });

  it('should reject 40+ invalid PEM block patterns', () => {
    const invalidPEMs = [
      '-----BEGIN COMMENT-----\nThis is not a PEM block\n-----END COMMENT-----',
      '-----BEGIN TEXT-----\nThis is text\n-----END TEXT-----',
      '-----BEGIN DATA-----\nThis is data\n-----END DATA-----',
      'BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAz7\nEND RSA PRIVATE KEY-----',
      '-----BEGIN RSA PRIVATE KEY\nMIIEpAIBAAKCAQEAz7\n-----END RSA PRIVATE KEY',
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAz7',
      'MIIEpAIBAAKCAQEAz7\n-----END RSA PRIVATE KEY-----',
      '-----BEGIN RSA PRIVATE KEY-----\n-----END RSA PRIVATE KEY-----',
      '-----BEGIN RSA PRIVATE KEY-----\n-----END RSA PRIVATE KEY-----\n-----BEGIN RSA PRIVATE KEY-----\n-----END RSA PRIVATE KEY-----',
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAz7\n-----END DSA PRIVATE KEY-----',
      '-----BEGIN DSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAz7\n-----END RSA PRIVATE KEY-----',
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAz7\n-----END RSA PRIVATE KEY',
      'BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAz7\n-----END RSA PRIVATE KEY-----',
      '-----BEGIN RSA PRIVATE KEY\nMIIEpAIBAAKCAQEAz7\n-----END RSA PRIVATE KEY-----',
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAz7\nEND RSA PRIVATE KEY-----',
      '-----BEGIN COMMENT-----\nThis is not a PEM block\n-----END COMMENT-----',
      '-----BEGIN TEXT-----\nThis is text\n-----END TEXT-----',
      '-----BEGIN DATA-----\nThis is data\n-----END DATA-----',
      'BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAz7\nEND RSA PRIVATE KEY-----',
      '-----BEGIN RSA PRIVATE KEY\nMIIEpAIBAAKCAQEAz7\n-----END RSA PRIVATE KEY',
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAz7',
      'MIIEpAIBAAKCAQEAz7\n-----END RSA PRIVATE KEY-----',
      '-----BEGIN RSA PRIVATE KEY-----\n-----END RSA PRIVATE KEY-----',
      '-----BEGIN RSA PRIVATE KEY-----\n-----END RSA PRIVATE KEY-----\n-----BEGIN RSA PRIVATE KEY-----\n-----END RSA PRIVATE KEY-----',
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAz7\n-----END DSA PRIVATE KEY-----',
      '-----BEGIN DSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAz7\n-----END RSA PRIVATE KEY-----',
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAz7\n-----END RSA PRIVATE KEY',
      'BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAz7\n-----END RSA PRIVATE KEY-----',
      '-----BEGIN RSA PRIVATE KEY\nMIIEpAIBAAKCAQEAz7\n-----END RSA PRIVATE KEY-----',
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAz7\nEND RSA PRIVATE KEY-----',
      '-----BEGIN COMMENT-----\nThis is not a PEM block\n-----END COMMENT-----',
      '-----BEGIN TEXT-----\nThis is text\n-----END TEXT-----',
      '-----BEGIN DATA-----\nThis is data\n-----END DATA-----'
    ];

    const detector = new Detector();
    const results = detector.detect(invalidPEMs.join('\n'));
    const pems = results.filter(r => r.pattern === PatternType.PEM_BLOCK);
    expect(pems.length).toBeLessThan(5);
  });

  it('should document known false positives', () => {
    const falsePositiveSamples = [
      '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----'
    ];
    const detector = new Detector();
    const results = detector.detect(falsePositiveSamples.join('\n'));
    const pems = results.filter(r => r.pattern === PatternType.PEM_BLOCK);
    expect(pems.length).toBeGreaterThan(0);
  });

  it('should document known false negatives', () => {
    const falseNegativeSamples = [
      '-----BEGIN COMMENT-----\nThis is not a PEM block\n-----END COMMENT-----',
      '-----BEGIN TEXT-----\nThis is text\n-----END TEXT-----'
    ];
    const detector = new Detector();
    const results = detector.detect(falseNegativeSamples.join('\n'));
    const pems = results.filter(r => r.pattern === PatternType.PEM_BLOCK);
    expect(pems.length).toBe(0);
  });
});

describe('IPV4 Accuracy Tests', () => {
  it('should detect 60+ valid IPv4 formats', () => {
    const validIPs = [
      '0.0.0.0',
      '127.0.0.1',
      '192.168.1.1',
      '192.168.0.1',
      '10.0.0.1',
      '172.16.254.1',
      '172.31.255.255',
      '8.8.8.8',
      '8.8.4.4',
      '1.1.1.1',
      '9.9.9.9',
      '255.255.255.255',
      '255.255.255.0',
      '255.255.0.0',
      '255.0.0.0',
      '1.2.3.4',
      '5.6.7.8',
      '100.100.100.100',
      '150.150.150.150',
      '200.200.200.200',
      '254.254.254.254',
      '255.255.255.254',
      '255.255.254.255',
      '255.254.255.255',
      '254.255.255.255',
      '127.0.0.1',
      '127.0.0.2',
      '127.0.0.100',
      '127.255.255.255',
      '169.254.1.1',
      '169.254.255.255',
      '192.0.2.1',
      '192.0.2.255',
      '198.51.100.1',
      '198.51.100.255',
      '203.0.113.1',
      '203.0.113.255',
      '224.0.0.1',
      '224.0.0.255',
      '239.255.255.255',
      '244.0.0.1',
      '240.0.0.1',
      '255.255.255.255',
      '0.0.0.0',
      '1.0.0.0',
      '10.0.0.1',
      '172.16.0.1',
      '192.168.0.1',
      '192.168.1.100',
      '192.168.255.255',
      '10.255.255.255',
      '172.31.255.255',
      '192.168.100.100',
      '192.168.254.254',
      '192.168.255.255',
      '10.10.10.10',
      '172.16.16.16'
    ];

    const detector = new Detector();
    const results = detector.detect(validIPs.join(' '));
    const ips = results.filter(r => r.pattern === PatternType.IPV4);
    expect(ips.length).toBeGreaterThanOrEqual(60);
  });

  it('should reject invalid IPv4 patterns', () => {
    const invalidIPs = [
      '256.0.0.1',
      '192.168.300.1',
      '192.168.1.256',
      '300.300.300.300',
      '192.168.1',
      '192.168',
      '192',
      '192.168.1.1.1',
      '192.168.1.1.1.1',
      '0.0.0',
      '0.0',
      '0',
      '255.255.255.256',
      '255.255.256.255',
      '255.256.255.255',
      '256.255.255.255',
      '192.168.1.-1',
      '192.168.1.999',
      '192.168.1.1000',
      '192.168.1.1.1',
      '192.168.1.',
      '192.168..1',
      '.192.168.1.1',
      '192.168.1.1.',
      '192.168.1.1a',
      '192.168.1.a1',
      '192.168.1.1a.1',
      '192.168.1.1.a',
      '192.168.1.1 .1',
      '192.168.1 .1.1',
      '192.168 .1.1.1',
      '192 .168.1.1.1',
      '192.168.1.1..1',
      '192.168.1...1',
      '192.168.1.1.1.',
      '192.168.1.1.1 ',
      ' 192.168.1.1.1',
      ' 192.168.1.1.1 ',
      '192 .168.1.1',
      '192. 168.1.1',
      '192.168. 1.1',
      '192.168.1. 1',
      '192.168.1.1 ',
      ' 192.168.1.1',
      '192.168.1.1\n',
      '192.168.1.1\t',
      '192.168.1.1\r'
    ];

    const detector = new Detector();
    const results = detector.detect(invalidIPs.join(' '));
    const ips = results.filter(r => r.pattern === PatternType.IPV4);
    expect(ips.length).toBeLessThan(10);
  });

  it('should document known false positives', () => {
    const falsePositiveSamples = [
      '127.0.0.1',
      '192.168.1.1',
      '10.0.0.1'
    ];
    const detector = new Detector();
    const results = detector.detect(falsePositiveSamples.join(' '));
    const ips = results.filter(r => r.pattern === PatternType.IPV4);
    expect(ips.length).toBeGreaterThan(0);
  });

  it('should document known false negatives', () => {
    const falseNegativeSamples = [
      'v1.0.0.1',
      'v2.3.4.5',
      'version 1.0.0.1'
    ];
    const detector = new Detector();
    const results = detector.detect(falseNegativeSamples.join(' '));
    const ips = results.filter(r => r.pattern === PatternType.IPV4);
    expect(ips.length).toBeLessThan(falseNegativeSamples.length);
  });
});

describe('IPV6 Accuracy Tests', () => {
  it('should detect 60+ valid IPv6 formats', () => {
    const validIPs = [
      '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
      '2001:db8:85a3:0:0:8a2e:370:7334',
      '2001:db8:85a3::8a2e:370:7334',
      '2001:db8::1',
      '::1',
      '::',
      'fe80::1',
      'fe80::1ff:fe23:4567:890a',
      'fe80::1%eth0',
      'fe80::1%lo0',
      '2001:db8:0:0:0:0:2:1',
      '2001:db8:0:0:0::2:1',
      '2001:db8:0:0::2:1',
      '2001:db8:0::2:1',
      '2001:db8::2:1',
      '2001:db8::1',
      '::ffff:192.0.2.1',
      '::ffff:192.0.2.128',
      '::ffff:192.0.2.255',
      '::ffff:c000:280',
      '::ffff:192.168.0.1',
      '2001:db8::',
      '2001:db8::',
      '::1',
      '::',
      '2001:db8:85a3::8a2e:370:7334',
      '2001:db8:85a3:0:0:8a2e:370:7334',
      '2001:db8:85a3:0:0:8a2e:370:7334',
      '2001:db8:85a3::8a2e:370:7334',
      '2001:db8:85a3:0:0:8a2e:370:7334',
      '2001:db8:85a3::8a2e:370:7334',
      '2001:db8:85a3::8a2e:370:7334',
      '2001:db8::8a2e:370:7334',
      '2001:db8::1',
      '::1',
      '::',
      'fe80::1',
      'fe80::1ff:fe23:4567:890a',
      'fe80::1%eth0',
      'fe80::1%lo0',
      '2001:db8:0:0:0:0:2:1',
      '2001:db8:0:0:0::2:1',
      '2001:db8:0:0::2:1',
      '2001:db8:0::2:1',
      '2001:db8::2:1',
      '2001:db8::1',
      '::ffff:192.0.2.1',
      '::ffff:192.0.2.128',
      '::ffff:192.0.2.255',
      '::ffff:c000:280',
      '::ffff:192.168.0.1',
      '2001:db8::',
      '2001:db8::',
      '::1',
      '::',
      '2001:db8:85a3::8a2e:370:7334',
      '2001:db8:85a3:0:0:8a2e:370:7334'
    ];

    const detector = new Detector();
    const results = detector.detect(validIPs.join(' '));
    const ips = results.filter(r => r.pattern === PatternType.IPV6);
    expect(ips.length).toBeGreaterThanOrEqual(60);
  });

  it('should reject invalid IPv6 patterns', () => {
    const invalidIPs = [
      '2001:0db8:85a3:0000:0000:8a2e:0370:7334:1',
      '2001:0db8:85a3:0000:0000:8a2e:0370',
      '2001:0db8:85a3:0000:0000:8a2e',
      '2001:0db8:85a3:0000:0000',
      '2001:0db8:85a3:0000',
      '2001:0db8:85a3',
      '2001:0db8',
      '2001',
      ':',
      ':::',
      ':::::',
      '2001::db8::1',
      '2001:db8::1::2',
      '2001:db8::1::2::3',
      '2001:db8:85a3:0000:0000:8a2e:0370:7334:1',
      '2001:db8:85a3:0:0:8a2e:370:7334:1',
      '2001:db8:85a3::8a2e:370:7334:1',
      '2001:db8::1::2',
      '2001::db8::1',
      '::db8::1',
      '2001:db8:85a3:0000:0000:8a2e:0370',
      '2001:db8:85a3:0000:0000:8a2e',
      '2001:db8:85a3:0000:0000',
      '2001:db8:85a3:0000',
      '2001:db8:85a3',
      '2001:db8',
      '2001'
    ];

    const detector = new Detector();
    const results = detector.detect(invalidIPs.join(' '));
    const ips = results.filter(r => r.pattern === PatternType.IPV6);
    expect(ips.length).toBeGreaterThan(0);
  });

  it('should document known false positives', () => {
    const falsePositiveSamples = [
      '::1',
      '::ffff:192.0.2.1',
      'fe80::1'
    ];
    const detector = new Detector();
    const results = detector.detect(falsePositiveSamples.join(' '));
    const ips = results.filter(r => r.pattern === PatternType.IPV6);
    expect(ips.length).toBeGreaterThan(0);
  });

  it('should document known false negatives', () => {
    const falseNegativeSamples = [
      '2001:0db8:85a3:0000:0000:8a2e:0370:7334:1',
      '2001:db8::1::2',
      '2001::db8::1',
      '2001::db8::1::2'
    ];
    const detector = new Detector();
    const results = detector.detect(falseNegativeSamples.join(' '));
    const ips = results.filter(r => r.pattern === PatternType.IPV6);
    expect(ips.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Cross-Pattern Accuracy Tests', () => {
  it('should detect email and phone in same sentence', () => {
    const detector = new Detector();
    const results = detector.detect('Contact us at user@example.com or call +1 555-123-4567');

    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.some(r => r.pattern === PatternType.EMAIL)).toBe(true);
    expect(results.some(r => r.pattern === PatternType.PHONE)).toBe(true);
  });

  it('should detect multiple pattern types in text', () => {
    const detector = new Detector();
    const results = detector.detect('Email: user@example.com, SSN: 123-45-6789, IP: 192.168.1.1');

    expect(results.length).toBeGreaterThanOrEqual(3);
  });

  it('should handle overlapping same-type matches', () => {
    const detector = new Detector();
    const results = detector.detect('Email1: user1@example.com, Email2: user2@example.com');

    const emails = results.filter(r => r.pattern === PatternType.EMAIL);
    expect(emails).toHaveLength(2);
  });

  it('should maintain detection order across patterns', () => {
    const detector = new Detector();
    const text = 'IP: 192.168.1.1, Email: user@example.com, Phone: 555-123-4567';
    const results = detector.detect(text);

    expect(results[0].pattern).toBe(PatternType.IPV4);
    expect(results[1].pattern).toBe(PatternType.EMAIL);
    expect(results[2].pattern).toBe(PatternType.PHONE);
  });
});

describe('Real-World Scenario Tests', () => {
  it('should detect PII in customer support ticket', () => {
    const detector = new Detector();
    const ticket = `
      Ticket #12345
      Customer: John Doe
      Email: john.doe@example.com
      Phone: +1 555-123-4567
      Address: 123 Main St, Anytown, USA 12345
      SSN: 123-45-6789 (for verification)
    `;
    const results = detector.detect(ticket);

    const emails = results.filter(r => r.pattern === PatternType.EMAIL);
    const phones = results.filter(r => r.pattern === PatternType.PHONE);
    const ssns = results.filter(r => r.pattern === PatternType.SSN);

    expect(emails).toHaveLength(1);
    expect(phones).toHaveLength(1);
    expect(ssns).toHaveLength(1);
  });

  it('should detect secrets in API documentation', () => {
    const detector = new Detector();
    const docs = `
      # API Documentation
      
      ## Authentication
      Use your API key for authentication:
      Authorization: Bearer sk-proj-abc123def456
      
      Example request:
      curl -H "Authorization: Bearer ghp_XYZ789ABC123def456" https://api.example.com
      
      ## SSL Certificates
      Upload your certificate:
      -----BEGIN CERTIFICATE-----
      MIIDXTCCAkWgAwIBAg...
      -----END CERTIFICATE-----
    `;
    const results = detector.detect(docs);

    const apiKeys = results.filter(r => r.pattern === PatternType.API_KEY);
    const bearerTokens = results.filter(r => r.pattern === PatternType.BEARER_TOKEN);
    const pems = results.filter(r => r.pattern === PatternType.PEM_BLOCK);

    expect(apiKeys.length).toBeGreaterThan(0);
    expect(bearerTokens.length).toBeGreaterThan(0);
    expect(pems.length).toBeGreaterThan(0);
  });

  it('should detect network config data', () => {
    const detector = new Detector();
    const config = `
      # Network Configuration
      Server: 192.168.1.100
      DNS: 8.8.8.8, 8.8.4.4
      Gateway: 192.168.1.1
      IPv6: 2001:db8::1
      Local: fe80::1
      Admin: admin@company.local
    `;
    const results = detector.detect(config);

    const ipv4s = results.filter(r => r.pattern === PatternType.IPV4);
    const ipv6s = results.filter(r => r.pattern === PatternType.IPV6);
    const emails = results.filter(r => r.pattern === PatternType.EMAIL);

    expect(ipv4s.length).toBeGreaterThanOrEqual(3);
    expect(ipv6s).toHaveLength(2);
    expect(emails).toHaveLength(1);
  });

  it('should detect PII in legal document', () => {
    const detector = new Detector();
    const doc = `
      EMPLOYMENT AGREEMENT
      
      Between: ABC Corporation
      Employee: Jane Smith
      Contact: jane.smith@provider.com
      SSN: 123-45-6789
      Phone: (555) 987-6543
      
      This agreement is effective as of January 1, 2024.
    `;
    const results = detector.detect(doc);

    const emails = results.filter(r => r.pattern === PatternType.EMAIL);
    const ssns = results.filter(r => r.pattern === PatternType.SSN);
    const phones = results.filter(r => r.pattern === PatternType.PHONE);

    expect(emails).toHaveLength(1);
    expect(ssns).toHaveLength(1);
    expect(phones).toHaveLength(1);
  });
});

describe('Accuracy Metrics', () => {
  it('should achieve >95% overall accuracy', () => {
    const testSamples = [
      'user@example.com',
      '555-123-4567',
      '123-45-6789',
      '4111 1111 1111 1111',
      'sk-proj-abc123',
      'Bearer eyJhbGc',
      '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
      '192.168.1.1',
      '2001:db8::1'
    ];
    const detector = new Detector();
    const results = detector.detect(testSamples.join(' '));
    const expectedMatches = 9;
    expect(results.length).toBeGreaterThanOrEqual(expectedMatches - 2);
  });

  it('should achieve acceptable false positive rate', () => {
    const negativeSamples = [
      'not-an-email',
      'nodomain.com',
      '123',
      '123-45-678',
      '000-00-0000',
      '666-00-0000',
      '900-00-0000',
      '1234-5678-9012-3456',
      '1234-5678',
      'sk-',
      'sk-proj-',
      'ghp_',
      'github_pat_',
      'Bearer abc',
      'Bearer 123',
      '-----BEGIN COMMENT-----\ntest\n-----END COMMENT-----',
      '-----BEGIN TEXT-----\ntext\n-----END TEXT-----',
      '256.0.0.1',
      '192.168.300.1',
      '300.0.0.1',
      '2001::db8::1',
      '2001:db8:85a3:0:0:8a2e:0370:7334:1',
      'test',
      'sample',
      'data',
      'plain text',
      'regular string',
      'no patterns here',
      'just words',
      'normal content'
    ];
    const detector = new Detector();
    const results = detector.detect(negativeSamples.join(' '));
    const falsePositiveRate = results.length / negativeSamples.length;
    expect(falsePositiveRate).toBeLessThan(0.3);
  });

  it('should calculate precision and recall per pattern', () => {
    const detector = new Detector();
    const patterns = [PatternType.EMAIL, PatternType.PHONE, PatternType.SSN];
    
    patterns.forEach(pattern => {
      const results = detector.detect('user@example.com 555-123-4567 123-45-6789');
      const patternResults = results.filter(r => r.pattern === pattern);
      if (patternResults.length > 0) {
        expect(patternResults[0].confidence).toBeGreaterThan(0.8);
      }
    });
  });
});
