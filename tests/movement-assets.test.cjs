const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifestPath = path.join(root, 'public/assets/fighters/movement/movement.json');
const movementDir = path.dirname(manifestPath);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

function pngSize(buffer) {
  const signature = Buffer.from([137,80,78,71,13,10,26,10]);
  assert.equal(buffer.subarray(0, 8).compare(signature), 0, 'movement image must be a PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function overlapArea(a, b) {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return w * h;
}

test('movement atlases expose eight walk in-betweens and one jump per fighter', () => {
  const required = ['alex', 'matt', 'elisa', 'gaga', 'thug', 'ripper', 'heavy'];
  assert.deepEqual(Object.keys(manifest.atlases).sort(), [...required].sort());

  for (const key of required) {
    const atlas = manifest.atlases[key];
    assert.equal(atlas.character, key);
    assert.equal(atlas.image, key + '_walk_jump.png');
    assert.deepEqual(atlas.atlasSize, { w: 1254, h: 1254 });

    const png = fs.readFileSync(path.join(movementDir, atlas.image));
    const { width, height } = pngSize(png);
    assert.deepEqual({ width, height }, { width: atlas.atlasSize.w, height: atlas.atlasSize.h });

    assert.equal(atlas.frames.length, 9, key + ' must expose exactly nine movement frames');
    assert.deepEqual(atlas.animations.walk.frames, [0,1,2,3,4,5,6,7], key + ' must expose eight ordered walk frames');
    assert.deepEqual(atlas.animations.jump.frames, [8], key + ' jump must be frame 8');
    assert.deepEqual(atlas.animations.walk.durationsMs, [90,90,90,90,90,90,90,90], key + ' walk timing must be constant');
    assert.equal(new Set(atlas.animations.walk.frames).size, 8, key + ' walk frames must be unique');

    for (const frame of atlas.frames) {
      const { x, y, w, h } = frame.rect;
      assert.ok(Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(w) && Number.isInteger(h));
      assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0, key + ' frame bounds must be positive');
      assert.ok(x + w <= width && y + h <= height, key + ' frame must stay inside the PNG');
      assert.deepEqual(frame.sourceSize, { w: 418, h: 418 }, key + ' logical frame cell must stay stable');
      assert.ok(frame.trimOffset.x >= 0 && frame.trimOffset.y >= 0, key + ' trim offset must be positive');
      assert.ok(frame.trimOffset.x + w <= 418 && frame.trimOffset.y + h <= 418, key + ' trim must stay inside logical cell');
      assert.ok(frame.pivot.x >= 0 && frame.pivot.x <= 1, key + ' pivot x must be normalized');
      assert.ok(frame.pivot.y >= 0 && frame.pivot.y <= 1, key + ' pivot y must be normalized');
    }

    for (let i = 0; i < atlas.frames.length; i++) {
      for (let j = i + 1; j < atlas.frames.length; j++) {
        assert.equal(overlapArea(atlas.frames[i].rect, atlas.frames[j].rect), 0, key + ' crop overlap ' + i + '/' + j);
      }
    }
  }
});
