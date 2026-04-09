import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const SCRYPT_COST = 16384;

export class Encryptor {
  private readonly derivedKey: Buffer;

  constructor(passphrase: string, salt?: Buffer) {
    const usedSalt = salt || randomBytes(SALT_LENGTH);
    this.derivedKey = scryptSync(passphrase, usedSalt, KEY_LENGTH, {
      N: SCRYPT_COST,
      r: 8,
      p: 1,
    });
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.derivedKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    const combined = Buffer.concat([iv, tag, encrypted]);
    return combined.toString('base64');
  }

  decrypt(ciphertext: string): string {
    const combined = Buffer.from(ciphertext, 'base64');

    if (combined.length < IV_LENGTH + TAG_LENGTH) {
      throw new Error('Invalid ciphertext: too short');
    }

    const iv = combined.subarray(0, IV_LENGTH);
    const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, this.derivedKey, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }
}