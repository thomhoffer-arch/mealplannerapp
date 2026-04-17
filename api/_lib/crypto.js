'use strict';

const crypto = require('crypto');
const ALGORITHM = 'aes-256-gcm';

// ENCRYPTION_KEY must be a 64-char hex string (32 bytes).
// Generate with: openssl rand -hex 32
function getKey() {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) throw new Error('ENCRYPTION_KEY must be a 64-char hex string');
  return Buffer.from(hex, 'hex');
}

function encrypt(plaintext) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Store as iv:tag:ciphertext — all hex
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(blob) {
  const [ivHex, tagHex, encHex] = blob.split(':');
  const iv        = Buffer.from(ivHex,  'hex');
  const tag       = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encHex, 'hex');
  const decipher  = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
