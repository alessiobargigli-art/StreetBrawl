const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const enemies = ['thug', 'ripper', 'heavy'];

const overlapArea = (a, b) => {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return w * h;
};

test('enemy atlases are identity-specific and contain all gameplay states', () => {
  for (const enemy of enemies) {
    const atlasPath = path.join(root, 'public/assets/fighters/enemies', enemy + '.json');
    const atlas = JSON.parse(fs.readFileSync(atlasPath, 'utf8'));
    assert.equal(atlas.character, enemy);
    assert.equal(atlas.image, enemy + '.png');
    assert.equal(atlas.frames.length, 10);
    for (const required of ['idle', 'walk', 'punch', 'hurt', 'ko', 'jump']) {
      assert.ok(atlas.animations[required], enemy + ' missing ' + required);
    }
    assert.equal(atlas.animations.walk.frames.length, 4, enemy + ' must have four walk frames');
    assert.equal(new Set(atlas.animations.walk.frames).size, 4, enemy + ' walk frames must be distinct');
    for (const frame of atlas.frames) {
      const r = frame.rect;
      assert.ok(r.x >= 0 && r.y >= 0 && r.w > 0 && r.h > 0);
      assert.ok(r.x + r.w <= atlas.atlasSize.w, enemy + ' frame outside atlas width');
      assert.ok(r.y + r.h <= atlas.atlasSize.h, enemy + ' frame outside atlas height');
    }
    for (let i = 0; i < atlas.frames.length; i++) {
      for (let j = i + 1; j < atlas.frames.length; j++) {
        assert.equal(overlapArea(atlas.frames[i].rect, atlas.frames[j].rect), 0, enemy + ' crop overlap ' + i + '/' + j);
      }
    }
  }
});

test('renderer does not map Heavy combat to Thug artwork', () => {
  const source = fs.readFileSync(path.join(root, 'src/online/CoopGame.ts'), 'utf8');
  assert.match(source, /enemy\.kind === 'heavy' \? 'heavy'/);
  assert.match(source, /const enemyKey: EnemyAtlasKey = enemy\.kind === 'ripper' \? 'ripper' : enemy\.kind === 'heavy' \? 'heavy' : 'thug';/);
  assert.doesNotMatch(source, /enemy\.kind === 'heavy'\s*\?\s*'thug'/);
  assert.doesNotMatch(source, /enemy\.kind === 'heavy'[^;\n]*drawLegacy\('thug'/);
  assert.match(source, /drawEnemyAtlas\(enemyKey/);
});
