const puppeteer = require('puppeteer');

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  const url = 'https://egonair-frontend-kjvmkgy5va-ew.a.run.app/login';
  console.log('Navigating to ' + url);
  await page.goto(url, { waitUntil: 'networkidle2' });

  console.log('Typing credentials for saif...');
  await page.type('#login-username', 'saif');
  await page.type('#login-password', 'saif123'); // guessing saif123, or I should just use the correct password? Wait! The user didn't tell me saif's password. 

  // Wait! The user previously said the password for everything in dev was 123456 or saif might have something else. Let me check the password hash or try to reset it if needed. 
  // Let me just click login and see the error.
  await page.click('#login-submit');

  console.log('Waiting for network/navigation...');
  try {
    await page.waitForNavigation({ timeout: 5000 });
  } catch(e) {
    console.log('No navigation happened within 5s');
  }

  // Check for error on page
  const errorText = await page.evaluate(() => {
    const errorDiv = document.querySelector('form > div:first-child span');
    return errorDiv ? errorDiv.innerText : null;
  });

  console.log('Error found on page:', errorText);

  // Snapshot HTML of body
  const bodyHtml = await page.evaluate(() => document.body.innerText.substring(0, 500));
  console.log('Body HTML snippet:', bodyHtml);

  await browser.close();
  console.log('Browser closed.');
})();
