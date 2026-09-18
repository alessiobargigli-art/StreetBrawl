const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function pngSize(filePath) {
  const buffer = fs.readFileSync(filePath);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(buffer.subarray(0, 8).compare(signature), 0, filePath + ' must be a PNG');
  return { w: buffer.readUInt32BE(16), h: buffer.readUInt32BE(20) };
}

test('hero and enemy PNG dimensions match their atlas metadata', () => {
  const groups = [
    { dir: 'public/assets/fighters/coop', names: ['alex', 'matt', 'elisa', 'gaga'] },
    { dir: 'public/assets/fighters/enemies', names: ['thug', 'ripper', 'heavy'] },
  ];

  for (const group of groups) {
    for (const name of group.names) {
      const jsonPath = path.join(root, group.dir, name + '.json');
      const pngPath = path.join(root, group.dir, name + '.png');
      const atlas = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      assert.deepEqual(
        pngSize(pngPath),
        atlas.atlasSize,
        name + ' PNG dimensions must match atlas metadata'
      );
    }
  }
});
