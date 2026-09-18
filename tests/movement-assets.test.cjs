const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifestPath = path.join(root, 'public/assets/fighters/movement/movement.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const pngPath = path.join(path.dirname(manifestPath), manifest.image);
const png = fs.readFileSync(pngPath);

function pngSize(buffer) {
  const signature = Buffer.from([137,80,78,71,13,10,26,10]);
  assert.equal(buffer.subarray(0, 8).compare(signature), 0, 'movement image must be a PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('movement atlas has four precise walk frames and one jump frame for every required fighter', () => {
  const { width, height } = pngSize(png);
  assert.deepEqual({ width, height }, { width: 435, height: 864 });

  const required = ['alex', 'matt', 'elisa', 'gaga', 'thug', 'ripper', 'heavy'];
  assert.deepEqual(Object.keys(manifest.atlases).sort(), [...required].sort());

  for (const key of required) {
    const atlas = manifest.atlases[key];
    assert.equal(atlas.character, key);
    assert.equal(atlas.frames.length, 5, key + ' must expose exactly five movement frames');
    assert.equal(atlas.animations.walk.frames.length, 4, key + ' must expose four walk frames');
    assert.equal(atlas.animations.jump.frames.length, 1, key + ' must expose one jump frame');
    assert.equal(new Set(atlas.animations.walk.frames).size, 4, key + ' walk frames must be unique');
    assert.ok(!atlas.animations.walk.frames.includes(atlas.animations.jump.frames[0]), key + ' jump must be a distinct frame');

    const rects = new Set();
    for (const frame of atlas.frames) {
      const { x, y, w, h } = frame.rect;
      assert.ok(Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(w) && Number.isInteger(h));
      assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0, key + ' frame bounds must be positive');
      assert.ok(x + w <= width && y + h <= height, key + ' frame must stay inside the PNG');
      assert.ok(frame.pivot.x >= 0 && frame.pivot.x <= 1, key + ' pivot x must be normalized');
      assert.ok(frame.pivot.y >= 0 && frame.pivot.y <= 1, key + ' pivot y must be normalized');
      const signature = [x, y, w, h].join(':');
      assert.ok(!rects.has(signature), key + ' frame rectangles must be unique');
      rects.add(signature);
    }
  }
});
