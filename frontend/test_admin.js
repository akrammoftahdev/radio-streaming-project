const puppeteer = require('puppeteer');

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  const url = 'https://egonair-frontend-kjvmkgy5va-ew.a.run.app/login';
  console.log('Navigating to ' + url);
  await page.goto(url, { waitUntil: 'networkidle2' });

  console.log('Typing credentials for admin...');
  await page.type('#login-username', 'admin');
  await page.type('#login-password', '123456'); // assuming admin is 123456 based on typical setups

  await page.click('#login-submit');

  console.log('Waiting for navigation to admin...');
  try {
    await page.waitForNavigation({ timeout: 10000 });
  } catch(e) {
    console.log('No navigation happened within 10s');
    // Check for login error
    const errorText = await page.evaluate(() => {
      const errorDiv = document.querySelector('form > div:first-child span');
      return errorDiv ? errorDiv.innerText : null;
    });
    console.log('Login error:', errorText);
    await browser.close();
    return;
  }

  console.log('Current URL:', page.url());
  
  // Now navigate to /admin/live
  console.log('Going to /admin/live');
  await page.goto('https://egonair-frontend-kjvmkgy5va-ew.a.run.app/admin/live', { waitUntil: 'networkidle2' });

  console.log('Monitoring for auto-refresh loop for 10 seconds...');
  let refreshCount = 0;
  
  // Listen for request events to see if it refreshes
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      refreshCount++;
      console.log('Frame navigated to:', frame.url());
    }
  });

  await new Promise(r => setTimeout(r, 10000));
  console.log('Total refreshes observed:', refreshCount);

  // Snapshot HTML of body
  const bodyHtml = await page.evaluate(() => document.body.innerText.substring(0, 500));
  console.log('Body HTML snippet:', bodyHtml);

  await browser.close();
  console.log('Browser closed.');
})();
