import 'dotenv/config';
import { encrypt, decrypt } from './src/lib/encryption';

const secret = 'sonicpanel_password_123';
const encrypted = encrypt(secret);
const decrypted = decrypt(encrypted);

console.log('Original:', secret);
console.log('Encrypted:', encrypted);
console.log('Decrypted:', decrypted);
console.log('Success:', secret === decrypted);
