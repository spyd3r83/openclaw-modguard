import { Tokenizer } from './dist/tokenizer.js';
import { Vault } from './dist/vault.js';
import { PatternType } from './dist/types.js';

async function test() {
  const vault = new Vault(':memory:', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
  const tokenizer = new Tokenizer(vault);
  const session = tokenizer.generateSessionId();
  
  console.log('PatternType.EMAIL:', PatternType.EMAIL);
  console.log('PatternType.API_KEY:', PatternType.API_KEY);
  console.log('PatternType.CREDIT_CARD:', PatternType.CREDIT_CARD);
  
  try {
    const token = await tokenizer.tokenize('user@example.com', 'email', session);
    console.log('Token created:', token);
    const result = await tokenizer.detokenize(token, session);
    console.log('Detokenized:', result);
  } catch (e) {
    console.error('Error:', e.message);
    console.error('Context:', e.context);
    console.error('Stack:', e.stack);
  }
  
  vault.close();
}

test();
