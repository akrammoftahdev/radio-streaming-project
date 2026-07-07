const fs = require('fs');
const { translate } = require('@vitalets/google-translate-api');

async function translateText(text) {
  if (typeof text !== 'string' || text.trim() === '') return text;
  
  // Protect variables {name} -> __VAR__
  let variables = text.match(/\{[^}]+\}/g) || [];
  let placeholderText = text;
  variables.forEach((v, i) => {
    placeholderText = placeholderText.replace(v, `__VAR${i}__`);
  });

  try {
    const res = await translate(placeholderText, { to: 'it' });
    let translated = res.text;
    
    // Restore variables
    variables.forEach((v, i) => {
      translated = translated.replace(`__VAR${i}__`, v);
    });
    return translated;
  } catch (err) {
    console.error(`Error translating: ${text}`, err.message);
    return text; // fallback to english
  }
}

async function traverseAndTranslate(obj) {
  if (Array.isArray(obj)) {
    const newArr = [];
    for (let item of obj) {
      newArr.push(await traverseAndTranslate(item));
    }
    return newArr;
  } else if (typeof obj === 'object' && obj !== null) {
    const newObj = {};
    for (const [key, value] of Object.entries(obj)) {
      newObj[key] = await traverseAndTranslate(value);
      // Small delay to prevent rate limit
      await new Promise(r => setTimeout(r, 200));
    }
    return newObj;
  } else if (typeof obj === 'string') {
    console.log(`Translating...`);
    return await translateText(obj);
  }
  return obj;
}

async function main() {
  console.log('Starting translation...');
  const enData = JSON.parse(fs.readFileSync('frontend/messages/en.json', 'utf8'));
  const itData = await traverseAndTranslate(enData);
  fs.writeFileSync('frontend/messages/it.json', JSON.stringify(itData, null, 2));
  console.log('Translation complete!');
}

main();
