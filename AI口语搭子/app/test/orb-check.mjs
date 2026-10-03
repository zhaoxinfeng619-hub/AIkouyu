// Browser acceptance for the voice visual, using a fake microphone and local provider only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { APP_ROOT } from '../server/config.mjs';
import { fixture, USAGE } from './fixtures.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const missing = await fixture(null, { missing: ['DASHSCOPE_API_KEY', 'DASHSCOPE_WORKSPACE_ID'] });
const configured = await fixture(null);
const output = path.join(APP_ROOT, '.local/verification');
fs.mkdirSync(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1160 } });
  const errors = [], sessions = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/sessions')) sessions.push(request.url()); });
  await page.addInitScript(() => {
    let Renderer;
    Object.defineProperty(window, 'VoiceOrb', {
      configurable: true,
      get: () => Renderer,
      set: Base => { Renderer = class extends Base { constructor(...args) { super(...args); window.__testOrb = this; } }; },
    });
  });
  await page.goto(missing.base + '/?view=voice-orb');
  await page.waitForFunction(() => window.__testOrb?.running);
  assert.equal(await page.locator('.avatar,.buddy,.orbit').count(), 0);
  const pixelHash = () => page.evaluate(() => {
    const orb = window.__testOrb, gl = orb.gl;
    orb._draw();
    const pixels = new Uint8Array(orb.canvas.width * orb.canvas.height * 4);
    gl.readPixels(0, 0, orb.canvas.width, orb.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let hash = 0, visible = 0;
    for (let i = 0; i < pixels.length; i += 16) {
      hash = (Math.imul(hash, 31) + pixels[i] + pixels[i + 1] * 3 + pixels[i + 2] * 7) >>> 0;
      if (pixels[i + 3] > 240) visible++;
    }
    return { hash, visible };
  });
  const first = await pixelHash();
  assert.ok(first.visible > 1000, 'The sphere must actually render pixels');
  await page.waitForTimeout(750);
  assert.notEqual((await pixelHash()).hash, first.hash, 'Idle flow changes the rendered image');
  await page.screenshot({ path: path.join(output, 'orb-browser-desktop.png'), fullPage: true });
  await page.locator('#orb-preview-button').click();
  await page.waitForFunction(() => window.__testOrb.mode === 'listening' && window.__testOrb.energy > 0.08);
  assert.equal(sessions.length, 0);
  assert.equal(await page.locator('#transcript .utterance').count(), 0);
  await page.locator('#companion').screenshot({ path: path.join(output, 'orb-browser-listening.png') });
  await page.waitForFunction(() => window.__testOrb.mode === 'thinking');
  await page.waitForFunction(() => window.__testOrb.mode === 'speaking');
  await page.locator('#companion').screenshot({ path: path.join(output, 'orb-browser-speaking.png') });
  await page.locator('#orb-preview-button').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => window.__testOrb.reduced);
  const reduced = await pixelHash();
  await page.waitForTimeout(250);
  assert.equal((await pixelHash()).hash, reduced.hash, 'Reduced motion remains still');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await page.evaluate(() => window.__testOrb.running), false);
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction(() => window.__testOrb.running);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(output, 'orb-browser-mobile.png'), fullPage: true });

  await page.goto(configured.base + '/?view=voice-orb');
  await page.waitForFunction(() => !document.querySelector('#start-button').disabled);
  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__testOrb.mode === 'listening');
  const provider = configured.connections.at(-1);
  await provider.inbox.wait('input_audio_buffer.append');
  const audio = Buffer.alloc(24000 * 3 * 2);
  for (let i = 0; i < audio.length / 2; i++) audio.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 220 / 24000) * 8000), i * 2);
  provider.send({ type: 'response.created', response: { id: 'orb-test' } });
  provider.send({ type: 'response.audio.delta', response_id: 'orb-test', delta: audio.toString('base64') });
  await page.waitForFunction(() => window.__testOrb.mode === 'speaking' && window.__testOrb.outputLevel > 0.2);
  await page.locator('#mute-button').click();
  assert.equal(await page.locator('#mute-button').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => window.__testOrb.mode), 'speaking', 'Muted input does not hide actual output');
  await page.locator('#interrupt-button').click();
  await provider.inbox.wait('response.cancel');
  await page.waitForFunction(() => window.__testOrb.outputLevel === 0 && window.__testOrb.mode === 'muted');
  provider.send({ type: 'response.done', response: { id: 'orb-test', status: 'cancelled', usage: USAGE } });
  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__testOrb.mode === 'ended');
  assert.deepEqual(errors, []);
  console.log('Voice orb verified: real GPU pixels, animated flow, no-call preview, microphone/playback integration, mute/interrupt, reduced motion, visibility pause, mobile layout.');
} finally { await browser.close(); await missing.close(); await configured.close(); }
