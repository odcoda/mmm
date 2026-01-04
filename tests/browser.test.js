const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const puppeteer = require('puppeteer');
const { createServer } = require('http');
const { readFileSync } = require('fs');
const { join } = require('path');

// Simple static file server
function startServer(port) {
  const server = createServer((req, res) => {
    let filePath = req.url === '/' ? '/index.html' : req.url;
    const fullPath = join(__dirname, '..', filePath);

    try {
      const content = readFileSync(fullPath);
      const ext = filePath.split('.').pop();
      const contentType = {
        'html': 'text/html',
        'js': 'application/javascript',
        'css': 'text/css'
      }[ext] || 'text/plain';

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch (e) {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

describe('MMIX Web Interface', () => {
  let browser;
  let page;
  let server;
  const PORT = 3456;
  const URL = `http://localhost:${PORT}`;

  before(async () => {
    server = await startServer(PORT);
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();

    // Capture console logs from the page
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('Browser console error:', msg.text());
      }
    });
  });

  after(async () => {
    if (browser) await browser.close();
    if (server) server.close();
  });

  test('should load the page without errors', async () => {
    const response = await page.goto(URL, { waitUntil: 'networkidle0' });
    assert.strictEqual(response.status(), 200);

    // Check page title
    const title = await page.title();
    assert.strictEqual(title, 'MMIX Emulator');
  });

  test('should display the main heading', async () => {
    await page.goto(URL, { waitUntil: 'networkidle0' });

    const heading = await page.$eval('h1', el => el.textContent);
    assert.strictEqual(heading, 'MMIX Emulator');
  });

  test('should have canvas element', async () => {
    await page.goto(URL, { waitUntil: 'networkidle0' });

    const canvas = await page.$('#gameCanvas');
    assert.ok(canvas, 'Canvas element should exist');

    const dimensions = await page.$eval('#gameCanvas', el => ({
      width: el.width,
      height: el.height
    }));
    assert.strictEqual(dimensions.width, 800);
    assert.strictEqual(dimensions.height, 500);
  });

  test('should initialize MMIX with zeroed registers', async () => {
    await page.goto(URL, { waitUntil: 'networkidle0' });

    // Check that mmix object exists and registers are initialized
    const reg0 = await page.evaluate(() => mmix.getReg(0).toString());
    assert.strictEqual(reg0, '0');
  });

  test('should load example data when button is clicked', async () => {
    await page.goto(URL, { waitUntil: 'networkidle0' });

    // Click the Load Example button
    await page.click('button.primary');

    // Wait a bit for the data to load
    await page.waitForFunction(() => mmix.getReg(0) !== 0n);

    // Verify the example data was loaded
    const reg0 = await page.evaluate(() => formatHex(mmix.getReg(0), 16));
    assert.strictEqual(reg0, '0123456789ABCDEF');

    // Verify memory was written
    const memValue = await page.evaluate(() =>
      formatHex(mmix.mem.read(1000n, Width.OCTA), 16)
    );
    assert.strictEqual(memValue, '0123456789ABCDEF');

    // Verify PC was set
    const pc = await page.evaluate(() => formatHex(mmix.pc, 16));
    assert.strictEqual(pc, '0000000000000100');
  });

  test('should reset MMIX when Reset button is clicked', async () => {
    await page.goto(URL, { waitUntil: 'networkidle0' });

    // First load example
    await page.click('button.primary');
    await page.waitForFunction(() => mmix.getReg(0) !== 0n);

    // Then reset
    await page.click('button:nth-of-type(2)');  // Reset button

    // Verify registers are cleared
    const reg0 = await page.evaluate(() => mmix.getReg(0).toString());
    assert.strictEqual(reg0, '0');
  });

  test('should inspect register via inspector input', async () => {
    await page.goto(URL, { waitUntil: 'networkidle0' });

    // Load example data first
    await page.click('button.primary');
    await page.waitForFunction(() => mmix.getReg(0) !== 0n);

    // Type in the inspector input
    await page.type('#inspectInput', '$0');

    // Click inspect button
    await page.click('.inspector button');

    // Check the result
    const result = await page.$eval('#inspectResult', el => el.textContent);
    assert.ok(result.includes('0123456789ABCDEF'), 'Should display register value in hex');
  });

  test('should inspect memory via inspector input', async () => {
    await page.goto(URL, { waitUntil: 'networkidle0' });

    // Load example data first
    await page.click('button.primary');
    await page.waitForFunction(() => mmix.getReg(0) !== 0n);

    // Clear and type memory address
    await page.$eval('#inspectInput', el => el.value = '');
    await page.type('#inspectInput', '#3E8');  // 1000 in hex

    // Click inspect button
    await page.click('.inspector button');

    // Check the result shows octa value
    const result = await page.$eval('#inspectResult', el => el.textContent);
    assert.ok(result.includes('0123456789ABCDEF'), 'Should display memory value');
  });

  test('should display registers in sidebar', async () => {
    await page.goto(URL, { waitUntil: 'networkidle0' });

    // Load example
    await page.click('button.primary');
    await page.waitForFunction(() => mmix.getReg(0) !== 0n);

    // Check registers panel has items
    const registerItems = await page.$$('#registers .register-item');
    assert.strictEqual(registerItems.length, 16, 'Should display 16 registers');

    // Check first register value
    const firstRegValue = await page.$eval('#registers .register-item:first-child .register-value',
      el => el.textContent);
    assert.strictEqual(firstRegValue, '0123456789ABCDEF');
  });

  test('should display memory in sidebar', async () => {
    await page.goto(URL, { waitUntil: 'networkidle0' });

    // Load example
    await page.click('button.primary');
    await page.waitForFunction(() => mmix.getReg(0) !== 0n);

    // Check memory view has entries
    const memoryRows = await page.$$('#memoryView .memory-row');
    assert.ok(memoryRows.length > 0, 'Should display memory entries');
  });

  test('should handle Enter key in inspector input', async () => {
    await page.goto(URL, { waitUntil: 'networkidle0' });

    // Load example
    await page.click('button.primary');
    await page.waitForFunction(() => mmix.getReg(0) !== 0n);

    // Type and press Enter
    await page.type('#inspectInput', '$1');
    await page.keyboard.press('Enter');

    // Check result appeared
    const result = await page.$eval('#inspectResult', el => el.textContent);
    assert.ok(result.includes('Register $1'), 'Should display register info after Enter');
  });

  test('should show error for invalid register', async () => {
    await page.goto(URL, { waitUntil: 'networkidle0' });

    // Type invalid register
    await page.type('#inspectInput', '$999');
    await page.click('.inspector button');

    // Check error is shown
    const result = await page.$eval('#inspectResult', el => el.textContent);
    assert.ok(result.includes('Error'), 'Should display error for invalid register');
  });

  test('should update canvas visualization', async () => {
    await page.goto(URL, { waitUntil: 'networkidle0' });

    // Get initial canvas state
    const initialData = await page.evaluate(() => {
      const canvas = document.getElementById('gameCanvas');
      return canvas.toDataURL().slice(0, 100);
    });

    // Load example and randomize
    await page.click('button.primary');
    await page.waitForFunction(() => mmix.getReg(0) !== 0n);

    // Wait for a render cycle
    await new Promise(resolve => setTimeout(resolve, 100));

    // Get new canvas state
    const newData = await page.evaluate(() => {
      const canvas = document.getElementById('gameCanvas');
      return canvas.toDataURL().slice(0, 100);
    });

    // Canvas should have changed (data loaded)
    assert.notStrictEqual(initialData, newData, 'Canvas should update after loading data');
  });

  test('should display FPS counter', async () => {
    await page.goto(URL, { waitUntil: 'networkidle0' });

    // Wait for at least one FPS update (1 second)
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Check FPS is displayed and non-zero
    const fps = await page.$eval('#fps', el => parseInt(el.textContent));
    assert.ok(fps > 0, 'FPS should be greater than 0');
  });

  test('should display PC value', async () => {
    await page.goto(URL, { waitUntil: 'networkidle0' });

    // Initial PC should be 0
    let pcValue = await page.$eval('#pcValue', el => el.textContent);
    assert.strictEqual(pcValue, '0000000000000000');

    // Load example (sets PC to 0x100)
    await page.click('button.primary');
    await page.waitForFunction(() => mmix.pc !== 0n);

    pcValue = await page.$eval('#pcValue', el => el.textContent);
    assert.strictEqual(pcValue, '0000000000000100');
  });
});
