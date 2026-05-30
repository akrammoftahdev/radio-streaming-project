/**
 * sync-translations.mjs
 * Copies the structure of ar.json to all other locale files,
 * keeping existing translations and using Arabic values as fallback for missing keys.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const messagesDir = join(__dirname, '..', 'messages');

const ar = JSON.parse(readFileSync(join(messagesDir, 'ar.json'), 'utf-8'));

const locales = ['en', 'fr', 'tr', 'pt', 'es', 'de'];

function deepMerge(source, existing) {
  const result = {};
  for (const key of Object.keys(source)) {
    if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
      result[key] = deepMerge(source[key], existing?.[key] || {});
    } else {
      // Use existing translation if available, otherwise use Arabic as placeholder
      result[key] = existing?.[key] ?? source[key];
    }
  }
  return result;
}

for (const locale of locales) {
  const filePath = join(messagesDir, `${locale}.json`);
  let existing = {};
  try {
    existing = JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (e) {
    console.log(`Creating new file for ${locale}`);
  }
  
  const merged = deepMerge(ar, existing);
  writeFileSync(filePath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
  
  const totalKeys = countKeys(merged);
  const existingKeys = countKeys(existing);
  const newKeys = totalKeys - existingKeys;
  console.log(`${locale}.json: ${totalKeys} total keys (${newKeys} new from ar.json)`);
}

function countKeys(obj, count = 0) {
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      count = countKeys(obj[key], count);
    } else {
      count++;
    }
  }
  return count;
}
