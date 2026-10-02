import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const p = await b.newPage({ viewport: { width: 1250, height: 1600 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('http://localhost:4200/sheet.html'); await p.waitForFunction(() => window.done, null, { timeout: 15000 });
await p.screenshot({ path: 'shots/scenes-sheet.png', fullPage: true }); await b.close();
