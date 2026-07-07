const fs = require('fs');
const path = require('path');

const dir = '/Users/apple/Downloads/Akram_Developments/radio_streaming_project/frontend/messages/';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

const enData = JSON.parse(fs.readFileSync(path.join(dir, 'en.json'), 'utf8'));

function deepMergeMissing(target, source) {
  for (const key in source) {
    if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {};
      deepMergeMissing(target[key], source[key]);
    } else {
      if (target[key] === undefined) {
        target[key] = source[key];
      }
    }
  }
}

for (const file of files) {
  if (file === 'en.json' || file === 'ar.json') continue; // We manually translated ar.json already
  
  const p = path.join(dir, file);
  let data = JSON.parse(fs.readFileSync(p, 'utf8'));
  
  deepMergeMissing(data, enData);
  
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

// Ensure ar.json also gets any missing keys from en.json just in case
const arPath = path.join(dir, 'ar.json');
let arData = JSON.parse(fs.readFileSync(arPath, 'utf8'));
deepMergeMissing(arData, enData);
fs.writeFileSync(arPath, JSON.stringify(arData, null, 2));

console.log("Merged missing translations from en.json to all other language files.");
