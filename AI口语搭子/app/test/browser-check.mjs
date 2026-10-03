// Optional browser integration check. Uses only a local fake provider and fake microphone.
// Run with Playwright installed or PLAYWRIGHT_MODULE pointing to its index.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { APP_ROOT } from '../server/config.mjs';
import { fixture, PCM, USAGE } from './fixtures.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const configured = await fixture(null);
const missing = await fixture(null, { missing: ['DASHSCOPE_API_KEY', 'DASHSCOPE_WORKSPACE_ID'] });
const output = path.join(APP_ROOT, '.local/verification');
fs.mkdirSync(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(missing.base + '/?view=call');
  await page.waitForFunction(() => document.querySelector('#service-state').textContent === '千问待配置');
  assert.equal(await page.locator('#start-button').isDisabled(), true);
  assert.equal(await page.locator('#setup-banner').isVisible(), true);
  await page.screenshot({ path: path.join(output, 'browser-desktop.png'), fullPage: true });
  await page.locator('#settings-open').click();
  assert.equal(await page.locator('#settings-dialog').isVisible(), true);
  assert.equal(await page.locator('#copy-access-token').isVisible(), true);
  await page.locator('.close-button').click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(output, 'browser-mobile.png'), fullPage: true });

  await page.goto(configured.base + '/?view=call');
  await page.waitForFunction(() => !document.querySelector('#start-button').disabled);
  await page.locator('#start-button').click();
  await page.waitForFunction(() => document.querySelector('#state-label').textContent === '正在聆听');
  const provider = configured.connections.at(-1);
  const packet = await provider.inbox.wait('input_audio_buffer.append');
  assert.equal(Buffer.from(packet.audio, 'base64').length, 1280);
  provider.send({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'u-browser', transcript: 'Hello from the test.' });
  provider.send({ type: 'response.created', response: { id: 'browser-response' } });
  provider.send({ type: 'response.audio_transcript.done', response_id: 'browser-response', item_id: 'a-browser', transcript: '<script>window.injected=true</script> Hello!' });
  provider.send({ type: 'response.audio.delta', response_id: 'browser-response', delta: PCM });
  await page.waitForFunction(() => document.querySelector('#transcript').textContent.includes('Hello from the test.'));
  assert.equal(await page.evaluate(() => window.injected), undefined);
  await page.locator('#interrupt-button').click();
  await provider.inbox.wait('response.cancel');
  provider.send({ type: 'response.audio.delta', response_id: 'browser-response', delta: PCM });
  provider.send({ type: 'response.done', response: { id: 'browser-response', usage: USAGE, status: 'cancelled' } });
  await page.waitForFunction(() => document.querySelector('#session-cost').textContent === '¥0.0124');
  provider.send({ type: 'conversation.item.input_audio_transcription.failed' });
  await page.waitForFunction(() => document.querySelector('#call-error').textContent.includes('语音对话可以继续'));
  assert.equal(await page.locator('#mute-button').isDisabled(), false);
  await page.locator('#mute-button').click();
  assert.equal(await page.locator('#mute-button').getAttribute('aria-pressed'), 'true');
  await page.locator('#start-button').click();
  await page.waitForFunction(() => document.querySelector('#state-label').textContent === '本次已结束');
  await page.waitForFunction(() => !document.querySelector('#start-button').classList.contains('ending'));

  const denied = await browser.newPage();
  await denied.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); };
  });
  let reserved = false;
  denied.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/sessions')) reserved = true; });
  await denied.goto(configured.base + '/?view=call');
  await denied.waitForFunction(() => !document.querySelector('#start-button').disabled);
  await denied.locator('#start-button').click();
  await denied.waitForFunction(() => document.querySelector('#call-error').textContent.includes('麦克风权限未开启'));
  assert.equal(reserved, false);
  assert.deepEqual(errors, []);
  console.log('Browser check passed: missing-config UI, responsive layout, fake PCM streaming, subtitles/XSS, interruption, cost, nonfatal error, mute, end, microphone denial. No cloud calls.');
} finally {
  await browser.close();
  await configured.close();
  await missing.close();
}
