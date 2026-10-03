import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fixture } from './fixtures.mjs';
import { SCENES, validateOptions } from '../server/prompt.mjs';
import { SCENE_CATALOG, validateCatalog, verifyCatalogAssets, characterSnapshot } from '../server/catalog.mjs';
import charactersData from '../config/characters.json' with { type: 'json' };
import scenesData from '../config/scenes.json' with { type: 'json' };

const require = createRequire(import.meta.url);
const miniScenes = require('../miniprogram/utils/scenes.js');
const browserContext = {};
vm.runInNewContext(fs.readFileSync(new URL('../public/scenes.js', import.meta.url), 'utf8'), browserContext);
const browserScenes = JSON.parse(JSON.stringify(browserContext.SpeakingScenes));

test('browser and mini-program catalogs describe the same server-supported scenes', () => {
  assert.deepEqual(browserScenes, miniScenes);
  assert.deepEqual(browserScenes.map(scene => scene.id).sort(), Object.keys(SCENES).sort());
  for (const scene of browserScenes) {
    assert.equal(validateOptions({ scene: scene.id }).scene, scene.id);
    assert.equal(SCENES[scene.id].label, scene.title);
    assert.match(SCENES[scene.id].instruction, new RegExp(scene.partner));
    const source = SCENE_CATALOG.find(item => item.id === scene.id);
    assert.equal(scene.character.id, source.character.id);
    assert.equal(scene.character.name, source.character.name);
    assert.equal(scene.character.voice.id, source.character.voice.id);
    assert.deepEqual(scene.character.appearance, source.character.appearance);
    assert.equal(scene.partner, scene.character.name);
    assert.equal(scene.image, scene.character.appearance.image);
    assert.equal(scene.spriteX, scene.character.appearance.spriteX);
    assert.equal(scene.spriteY, scene.character.appearance.spriteY);
    assert.equal(scene.description, source.description, 'portrait description must not overwrite scene description');
    assert.deepEqual(scene.character.personality.tags, source.character.personality.tags);
    assert.equal(scene.character.speakingStyle.label, source.character.speakingStyle.label);
  }
  verifyCatalogAssets();
  assert.equal(new Set(browserScenes.map(scene => scene.character.voice.id)).size, 6);
  assert.equal(new Set(browserScenes.map(scene => `${scene.spriteX},${scene.spriteY}`)).size, 6);
});

test('invalid character references and mismatched voices fail instead of silently using one default', () => {
  const people = () => structuredClone(charactersData);
  let bad = people(); bad.characters[1].voiceId = bad.characters[0].voiceId;
  assert.throws(() => validateCatalog(bad, scenesData), /性别不匹配/);
  bad = people(); bad.characters[0].voiceId = 'Unknown';
  assert.throws(() => validateCatalog(bad, scenesData), /音色不存在/);
  bad = people(); bad.characters[1].id = bad.characters[0].id;
  assert.throws(() => validateCatalog(bad, scenesData), /ID 重复/);
  const badScenes = structuredClone(scenesData); badScenes.scenes[0].characterId = 'missing';
  assert.throws(() => validateCatalog(people(), badScenes), /不存在的角色/);
});

test('each scenario selection reaches the voice provider with its own role and restrictions', async t => {
  const roles = {
    daily: /Mia, a new friend/,
    coffee: /Alex, a barista/,
    restaurant: /Leo, a food truck vendor/,
    shopping: /Emma, a clothing store assistant/,
    travel: /Noah, a friendly local/,
    hotel: /Olivia, a hotel receptionist/,
  };
  for (const scene of browserScenes) {
    await t.test(scene.id, async t => {
      const f = await fixture(t, { voice: 'Tina' });
      const call = await f.connect({ scene: scene.id, level: 'basic', correction: 'after_session', instructions: 'CUSTOM_ROLE_OVERRIDE', voice: 'Tina', characterId: 'unknown', character: { name: 'Wrong character' } });
      const { session } = await call.provider.inbox.wait('session.update');
      const character = SCENE_CATALOG.find(item => item.id === scene.id).character;
      assert.equal(session.audio.output.voice, character.voice.id);
      assert.deepEqual(call.ready.character, characterSnapshot(scene.id));
      assert.ok(session.instructions.includes(character.background));
      assert.ok(session.instructions.includes(character.personality.instruction));
      assert.ok(session.instructions.includes(character.speakingStyle.instruction));
      assert.ok(session.instructions.includes(`${character.age} years old, ${character.gender}`));
      assert.doesNotMatch(session.instructions, /Wrong character/);
      assert.match(session.instructions, roles[scene.id]);
      if (scene.id !== 'daily') assert.doesNotMatch(session.instructions, roles.daily);
      assert.match(session.instructions, /at most ONE question/);
      assert.match(session.instructions, /Keep your assigned role and setting/);
      assert.match(session.instructions, /invented for practice/);
      assert.match(session.instructions, /Save unsolicited corrections for later/);
      assert.doesNotMatch(session.instructions, /CUSTOM_ROLE_OVERRIDE/);
      assert.deepEqual(session.tools, []);
      assert.equal(session.enable_search, false);
      call.send({ type: 'session.stop' });
      assert.deepEqual((await call.inbox.wait('session.ended')).character, call.ready.character);
    });
  }
});
