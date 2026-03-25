# Browser Automation Tools

Tools for browser automation, headless browsing, web scraping, and anti-detection.

## Playwright Stack

## playwright

- **Package**: `npm install playwright` / `pip install playwright` then `playwright install`
- **Purpose**: Browser automation framework supporting Chromium, Firefox, and WebKit with a single API
- **Use when**: You need to automate browser interactions, run end-to-end tests, scrape dynamic sites, or generate PDFs/screenshots
- **Quick start**:
  - `const { chromium } = require('playwright'); const browser = await chromium.launch(); const page = await browser.newPage();`
  - `await page.goto('https://example.com'); await page.screenshot({ path: 'shot.png' });`
  - `npx playwright codegen https://example.com`
- **Auth**: None
- **Docs**: <https://playwright.dev/docs/intro>

## @playwright/cli

- **Package**: `npm install @playwright/cli`
- **Purpose**: Playwright CLI for code generation, test running, and browser management
- **Use when**: You need to generate automation scripts interactively, manage browser installs, or run Playwright tests from the command line
- **Quick start**:
  - `npx playwright codegen https://example.com`
  - `npx playwright test`
  - `npx playwright install chromium`
- **Auth**: None
- **Docs**: `npx playwright --help` or <https://playwright.dev/docs/test-cli>

## playwright-extra

- **Package**: `npm install playwright-extra`
- **Purpose**: Playwright with plugin support for extending functionality (stealth, captcha solving, etc.)
- **Use when**: You need Playwright with additional plugins such as stealth mode or ad blocking
- **Quick start**:
  - `const { chromium } = require('playwright-extra'); const StealthPlugin = require('playwright-extra-plugin-stealth');`
  - `chromium.use(StealthPlugin()); const browser = await chromium.launch();`
- **Auth**: None
- **Docs**: <https://github.com/nicedayfor/playwright-extra>

## playwright-extra-plugin-stealth

- **Package**: `npm install playwright-extra-plugin-stealth`
- **Purpose**: Stealth plugin that patches Playwright to avoid bot detection by sites
- **Use when**: Target sites detect and block automated browsers; you need to appear as a real user
- **Quick start**:
  - `const StealthPlugin = require('playwright-extra-plugin-stealth');`
  - `chromium.use(StealthPlugin());`
  - `const browser = await chromium.launch({ headless: true });`
- **Auth**: None
- **Docs**: <https://github.com/nicedayfor/playwright-extra/tree/master/packages/playwright-extra-plugin-stealth>

## playwright-stealth

- **Package**: `pip install playwright-stealth`
- **Purpose**: Python stealth plugin for Playwright to bypass bot detection
- **Use when**: You are using Playwright in Python and need to evade bot detection mechanisms
- **Quick start**:
  - `from playwright.sync_api import sync_playwright; from playwright_stealth import stealth_sync`
  - `with sync_playwright() as p: browser = p.chromium.launch(); page = browser.new_page(); stealth_sync(page)`
  - `page.goto('https://example.com')`
- **Auth**: None
- **Docs**: <https://github.com/nicedayfor/playwright-stealth>

## Puppeteer Stack

## puppeteer

- **Package**: `npm install puppeteer`
- **Purpose**: Chrome/Chromium automation via the DevTools Protocol for scraping, testing, and PDF generation
- **Use when**: You need Chrome-specific automation, PDF rendering, or DevTools Protocol access
- **Quick start**:
  - `const puppeteer = require('puppeteer'); const browser = await puppeteer.launch(); const page = await browser.newPage();`
  - `await page.goto('https://example.com'); await page.pdf({ path: 'page.pdf', format: 'A4' });`
  - `await page.screenshot({ path: 'screenshot.png', fullPage: true });`
- **Auth**: None
- **Docs**: <https://pptr.dev/>

## puppeteer-extra

- **Package**: `npm install puppeteer-extra`
- **Purpose**: Puppeteer with plugin support for stealth, ad blocking, captcha solving, and more
- **Use when**: You need Puppeteer with additional capabilities beyond the base API
- **Quick start**:
  - `const puppeteer = require('puppeteer-extra'); const StealthPlugin = require('puppeteer-extra-plugin-stealth');`
  - `puppeteer.use(StealthPlugin()); const browser = await puppeteer.launch();`
- **Auth**: None
- **Docs**: <https://github.com/nicedayfor/puppeteer-extra>

## puppeteer-extra-plugin-stealth

- **Package**: `npm install puppeteer-extra-plugin-stealth`
- **Purpose**: Stealth plugin that patches Puppeteer to evade bot detection
- **Use when**: sites detect Puppeteer as a bot; you need to pass automation checks
- **Quick start**:
  - `const StealthPlugin = require('puppeteer-extra-plugin-stealth');`
  - `puppeteer.use(StealthPlugin());`
  - `const browser = await puppeteer.launch({ headless: 'new' });`
- **Auth**: None
- **Docs**: <https://github.com/nicedayfor/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth>

## Anti-Detection

## undetected-chromedriver

- **Package**: `pip install undetected-chromedriver`
- **Purpose**: Selenium ChromeDriver that patches itself to avoid bot detection by Cloudflare, Distil, etc.
- **Use when**: You need Selenium-based automation that bypasses advanced bot protection services
- **Quick start**:
  - `import undetected_chromedriver as uc; driver = uc.Chrome()`
  - `driver.get('https://example.com')`
  - `driver = uc.Chrome(headless=True, version_main=120)`
- **Auth**: None
- **Docs**: <https://github.com/nicedayfor/undetected-chromedriver>

## nodriver

- **Package**: `pip install nodriver`
- **Purpose**: Advanced browser automation without detection, successor to undetected-chromedriver
- **Use when**: You need the most up-to-date anti-detection browser automation in Python
- **Quick start**:
  - `import nodriver as nd; browser = await nd.start()`
  - `page = await browser.get('https://example.com')`
  - `element = await page.find('input[name=q]'); await element.send_keys('search term')`
- **Auth**: None
- **Docs**: <https://github.com/nicedayfor/nodriver>

## browserforge

- **Package**: `pip install browserforge`
- **Purpose**: Generate realistic browser fingerprints (headers, TLS, navigator properties) for anti-detection
- **Use when**: You need to generate convincing browser fingerprints to pair with automation tools
- **Quick start**:
  - `from browserforge.headers import HeaderGenerator; gen = HeaderGenerator(); headers = gen.generate()`
  - `from browserforge.fingerprints import FingerprintGenerator; fg = FingerprintGenerator(); fp = fg.generate()`
  - `print(headers)`
- **Auth**: None
- **Docs**: <https://github.com/nicedayfor/browserforge>

## Headless Browsers

## firefox-esr

- **Package**: `apt install firefox-esr`
- **Purpose**: Firefox Extended Support Release for headless browsing and Selenium/Playwright automation
- **Use when**: You need a Firefox browser for headless automation, testing, or when Chromium is not suitable
- **Quick start**:
  - `firefox-esr --headless --screenshot screenshot.png https://example.com`
  - `firefox-esr --headless --print-to-pdf output.pdf https://example.com`
  - Use with Playwright: `const browser = await firefox.launch();`
- **Auth**: None
- **Docs**: `man firefox-esr` or <https://www.mozilla.org/en-US/firefox/enterprise/>

## Chromium (via Playwright)

- **Package**: Bundled with Playwright — `npx playwright install chromium`
- **Purpose**: Chromium browser managed by Playwright for headless automation
- **Use when**: You need a Chromium instance for headless browsing, screenshots, or PDF generation
- **Quick start**:
  - `npx playwright install chromium`
  - `const { chromium } = require('playwright'); const browser = await chromium.launch({ headless: true });`
  - `const page = await browser.newPage(); await page.goto('https://example.com');`
- **Auth**: None
- **Docs**: <https://playwright.dev/docs/browsers>

## VNC Stack (GUI Browser Sessions)

## xvfb

- **Package**: `apt install xvfb`
- **Purpose**: Virtual framebuffer providing a headless X11 display for GUI applications without a physical monitor
- **Use when**: You need to run GUI applications (browsers, desktop tools) in a headless environment
- **Quick start**:
  - `Xvfb :99 -screen 0 1920x1080x24 &`
  - `export DISPLAY=:99`
  - `xvfb-run --auto-servernum chromium --no-sandbox https://example.com`
- **Auth**: None
- **Docs**: `man Xvfb`

## x11vnc

- **Package**: `apt install x11vnc`
- **Purpose**: VNC server that shares an existing X11 display for remote viewing
- **Use when**: You need to remotely view or interact with a GUI application running in Xvfb
- **Quick start**:
  - `x11vnc -display :99 -nopw -forever -rfbport 5900 &`
  - `x11vnc -display :99 -passwd mypass -rfbport 5900 &`
- **Auth**: None (optional VNC password via `-passwd`)
- **Docs**: `man x11vnc`

## novnc

- **Package**: `apt install novnc`
- **Purpose**: Browser-based VNC client using HTML5 WebSockets (access via port 6080)
- **Use when**: You need to view the VNC display from a web browser without installing a VNC client
- **Quick start**:
  - `websockify --web /usr/share/novnc 6080 localhost:5900 &`
  - Open `http://localhost:6080/vnc.html` in a browser
  - Combine with Xvfb + x11vnc for full headless GUI access
- **Auth**: None (inherits VNC server authentication)
- **Docs**: <https://novnc.com/> or `man websockify`

## fluxbox

- **Package**: `apt install fluxbox`
- **Purpose**: Lightweight window manager for X11, providing window decorations and basic desktop functionality
- **Use when**: You need a minimal window manager for GUI applications running in Xvfb/VNC
- **Quick start**:
  - `export DISPLAY=:99 && fluxbox &`
  - Typically started after Xvfb: `Xvfb :99 -screen 0 1920x1080x24 & sleep 1 && DISPLAY=:99 fluxbox &`
- **Auth**: None
- **Docs**: `man fluxbox` or <https://fluxbox.org/>
