import fs from 'node:fs';
import path from 'node:path';
import charactersFile from '../config/characters.json' with { type: 'json' };
import scenesFile from '../config/scenes.json' with { type: 'json' };
import { APP_ROOT, MODEL } from './config.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(`角色配置错误：${message}`);
}
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function uniqueIds(items, label) {
  const ids = items.map(item => item.id);
  assert(ids.every(id => typeof id === 'string' && /^[a-z][a-z0-9_-]*$/.test(id)), `${label} ID 格式无效`);
  assert(new Set(ids).size === ids.length, `${label} ID 重复`);
}
function deepFreeze(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') deepFreeze(child);
  return Object.freeze(value);
}

// Validate at startup, so a broken mapping never silently falls back to the default voice.
export function validateCatalog(charactersData, scenesData) {
  assert(charactersData.schemaVersion === 1 && scenesData.schemaVersion === 1, '不支持的 schemaVersion');
  const { characters, voices } = charactersData;
  const { scenes } = scenesData;
  assert(Array.isArray(characters) && characters.length > 0 && Array.isArray(scenes) && scenes.length > 0, '角色与场景不可为空');
  assert(Array.isArray(voices) && voices.length > 0, '音色目录不可为空');
  uniqueIds(characters, '角色'); uniqueIds(scenes, '场景');
  assert(new Set(voices.map(voice => voice.id)).size === voices.length, '音色 ID 重复');
  for (const voice of voices) {
    assert(text(voice.id) && voice.model === MODEL && ['female', 'male'].includes(voice.gender), `音色 ${voice.id} 的模型或性别无效`);
    assert(voice.languages?.includes('en') && text(voice.source), `音色 ${voice.id} 缺少英语支持或来源`);
  }
  for (const character of characters) {
    const id = character.id;
    assert(Number.isInteger(character.version) && character.version > 0, `${id} 缺少档案版本`);
    for (const field of ['name', 'genderLabel', 'pronouns', 'occupation', 'bio', 'background', 'nativeLanguage']) assert(text(character[field]), `${id} 缺少 ${field}`);
    assert(Number.isInteger(character.age) && character.age >= 18, `${id} 必须为成人角色`);
    assert(['male', 'female'].includes(character.gender), `${id} 性别无效`);
    assert(character.genderLabel === (character.gender === 'male' ? '男' : '女'), `${id} 性别标签不一致`);
    assert(Array.isArray(character.interests) && character.interests.length > 0 && character.interests.every(text), `${id} 缺少爱好`);
    assert(Array.isArray(character.personality?.tags) && character.personality.tags.length > 0 && character.personality.tags.every(text) && text(character.personality.instruction), `${id} 缺少性格`);
    assert(text(character.speakingStyle?.label) && text(character.speakingStyle?.instruction), `${id} 缺少表达风格`);
    const voice = voices.find(item => item.id === character.voiceId);
    assert(voice && voice.gender === character.gender, `${id} 音色不存在或性别不匹配`);
    const art = character.appearance;
    assert(text(art?.image) && art.image.startsWith('/assets/') && path.posix.normalize(art.image) === art.image && /\.(jpg|jpeg|png|webp)$/.test(art.image) && [0, 50, 100].includes(art.spriteX) && [0, 100].includes(art.spriteY) && text(art.description), `${id} 图片映射无效`);
  }
  for (const scene of scenes) {
    assert(characters.some(character => character.id === scene.characterId), `${scene.id} 引用了不存在的角色`);
    assert(Number.isFinite(scene.displayOrder), `${scene.id} 缺少展示顺序 displayOrder`);
    for (const field of ['title', 'english', 'description', 'roleInstruction']) assert(text(scene[field]), `${scene.id} 缺少 ${field}`);
    assert(Array.isArray(scene.tasks) && scene.tasks.length > 0 && scene.tasks.every(text), `${scene.id} 缺少练习目标`);
  }
  return true;
}

validateCatalog(charactersFile, scenesFile);
export const CHARACTERS = deepFreeze(Object.fromEntries(charactersFile.characters.map(character => [character.id, {
  ...character, voice: charactersFile.voices.find(voice => voice.id === character.voiceId),
}])));
export const SCENE_CATALOG = deepFreeze(scenesFile.scenes.map(scene => {
  const character = CHARACTERS[scene.characterId];
  const { image, spriteX, spriteY } = character.appearance;
  return { ...scene, character, partner: character.name, role: character.occupation, image, spriteX, spriteY };
}));
export const SCENE_BY_ID = Object.freeze(Object.fromEntries(SCENE_CATALOG.map(scene => [scene.id, scene])));
export function characterForScene(sceneId) {
  const scene = SCENE_BY_ID[sceneId];
  if (!Object.hasOwn(SCENE_BY_ID, sceneId) || !scene) throw new Error('角色对应的场景不存在');
  return scene.character;
}
export function characterSnapshot(sceneId) {
  const character = characterForScene(sceneId);
  return { id: character.id, name: character.name, version: character.version, voiceId: character.voice.id };
}
export function verifyCatalogAssets() {
  for (const scene of SCENE_CATALOG) {
    assert(fs.existsSync(path.join(APP_ROOT, 'public', scene.image)), `${scene.id} 网页图片不存在`);
    assert(fs.existsSync(path.join(APP_ROOT, 'miniprogram', scene.image)), `${scene.id} 小程序图片不存在`);
  }
}
