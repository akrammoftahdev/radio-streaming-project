const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3000/login');
  
  await page.type('input[name="username"]', 'saif');
  await page.type('input[name="password"]', 'saif');
  await page.click('button[type="submit"]');
  
  await page.waitForNavigation();
  console.log('Logged in, current URL:', page.url());

  // Get directDjRadioId
  const radios = await page.evaluate(async () => {
    const res = await fetch('/api/presenter/direct-dj/radios');
    return await res.json();
  });
  console.log('Direct DJ Radios:', radios);

  if (radios.radios && radios.radios.length > 0) {
    const radioId = radios.radios[0].id;
    console.log('Using radio ID:', radioId);

    // Fetch Token
    const tokenRes = await page.evaluate(async (id) => {
      const res = await fetch('/api/internal/audio-token/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directDjRadioId: id })
      });
      return await res.json();
    }, radioId);

    console.log('Token Create Response:', tokenRes);

    if (tokenRes.token) {
      // Validate Token
      const validateRes = await page.evaluate(async (tok) => {
        const res = await fetch('/api/internal/audio-token/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tok })
        });
        return await res.json();
      }, tokenRes.token);

      console.log('Token Validate Response:', validateRes);
    }
  }

  await browser.close();
})();
