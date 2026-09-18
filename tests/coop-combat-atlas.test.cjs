const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const heroes = ['alex', 'matt', 'elisa', 'gaga'];

const overlapArea = (a, b) => {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return w * h;
};

test('coop combat atlases have non-overlapping in-bounds crops', () => {
  for (const hero of heroes) {
    const atlasPath = path.join(root, 'public/assets/fighters/coop', hero + '.json');
    const atlas = JSON.parse(fs.readFileSync(atlasPath, 'utf8'));

    assert.equal(atlas.character, hero);
    assert.ok(atlas.atlasSize?.w > 0 && atlas.atlasSize?.h > 0);
    assert.equal(atlas.frames.length, 8);

    for (const frame of atlas.frames) {
      const { x, y, w, h } = frame.rect;
      assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0, hero + ' frame ' + frame.index + ' has invalid bounds');
      assert.ok(x + w <= atlas.atlasSize.w, hero + ' frame ' + frame.index + ' exceeds atlas width');
      assert.ok(y + h <= atlas.atlasSize.h, hero + ' frame ' + frame.index + ' exceeds atlas height');
    }

    for (let i = 0; i < atlas.frames.length; i++) {
      for (let j = i + 1; j < atlas.frames.length; j++) {
        assert.equal(
          overlapArea(atlas.frames[i].rect, atlas.frames[j].rect),
          0,
          hero + ' frame ' + i + ' overlaps frame ' + j
        );
      }
    }

    const requiredAnimations = ['idle', 'punch', 'kick', 'hurt', 'ko', 'getup'];
    for (const name of requiredAnimations) {
      assert.ok(atlas.animations[name], hero + ' missing animation ' + name);
      for (const frameIndex of atlas.animations[name].frames) {
        assert.ok(frameIndex >= 0 && frameIndex < atlas.frames.length, hero + ' ' + name + ' references invalid frame');
      }
    }

    assert.deepEqual(atlas.animations.hurt.frames, [5, 0], hero + ' hurt must use isolated hit frame');
    assert.deepEqual(atlas.animations.ko.frames, [5, 6], hero + ' KO must use hurt then down');
    assert.deepEqual(atlas.animations.getup.frames, [6, 7, 0], hero + ' getup must use down, recovery, idle');
  }
});
