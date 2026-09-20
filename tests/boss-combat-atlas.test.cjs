const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const bosses = ['roxy', 'switch', 'rivet', 'crane'];

function pngSize(filePath) {
  const buffer = fs.readFileSync(filePath);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(buffer.subarray(0, 8).compare(signature), 0, filePath + ' must be a PNG');
  return { w: buffer.readUInt32BE(16), h: buffer.readUInt32BE(20) };
}

const overlapArea = (a, b) => {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return w * h;
};

test('boss combat atlases have non-overlapping in-bounds crops matching their PNG', () => {
  for (const boss of bosses) {
    const dir = 'public/assets/fighters/bosses';
    const atlasPath = path.join(root, dir, boss + '.json');
    const pngPath = path.join(root, dir, boss + '.png');
    const atlas = JSON.parse(fs.readFileSync(atlasPath, 'utf8'));

    assert.equal(atlas.character, boss);
    assert.equal(atlas.image, boss + '.png');
    assert.ok(atlas.atlasSize?.w > 0 && atlas.atlasSize?.h > 0);
    assert.deepEqual(pngSize(pngPath), atlas.atlasSize, boss + ' PNG dimensions must match atlas metadata');
    assert.equal(atlas.frames.length, 8);

    for (const frame of atlas.frames) {
      const { x, y, w, h } = frame.rect;
      assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0, boss + ' frame ' + frame.index + ' has invalid bounds');
      assert.ok(x + w <= atlas.atlasSize.w, boss + ' frame ' + frame.index + ' exceeds atlas width');
      assert.ok(y + h <= atlas.atlasSize.h, boss + ' frame ' + frame.index + ' exceeds atlas height');
    }

    for (let i = 0; i < atlas.frames.length; i++) {
      for (let j = i + 1; j < atlas.frames.length; j++) {
        assert.equal(
          overlapArea(atlas.frames[i].rect, atlas.frames[j].rect),
          0,
          boss + ' frame ' + i + ' overlaps frame ' + j + ' (crop bleed onto a neighbouring pose)'
        );
      }
    }

    const requiredAnimations = ['idle', 'walk', 'punch', 'specialTell', 'hurt', 'ko', 'getup'];
    for (const name of requiredAnimations) {
      assert.ok(atlas.animations[name], boss + ' missing animation ' + name);
      for (const frameIndex of atlas.animations[name].frames) {
        assert.ok(frameIndex >= 0 && frameIndex < atlas.frames.length, boss + ' ' + name + ' references invalid frame');
      }
    }
  }
});
