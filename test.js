const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.error('Browser ERROR:', msg.text());
        } else {
            console.log('Browser LOG:', msg.text());
        }
    });

    page.on('pageerror', error => {
        console.error('Browser EXCEPTION:', error.message);
    });

    try {
        await page.goto('http://localhost:8080', { waitUntil: 'networkidle2' });
        console.log('Page loaded successfully.');
        
        // Wait just in case the error is slightly delayed.
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        await browser.close();
    } catch (e) {
        console.error('Puppeteer Script Error:', e);
        await browser.close();
    }
})();
