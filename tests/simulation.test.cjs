const test = require('node:test');
const assert = require('node:assert/strict');
const { AuthoritativeSimulation } = require('../.test-dist/simulation.js');

function started(continues = 0) {
  const sim = new AuthoritativeSimulation('TEST01', continues);
  sim.addPlayer(0, 'A');
  sim.reserveCharacter(0, 'alex');
  sim.setReady(0, true);
  assert.equal(sim.start(), true);
  return sim;
}

test('hurt cancels an active attack and queued actions', () => {
  const sim = started(0);
  const rt = sim.players.get(0);
  rt.attack = { kind: 'punch', tick: 4, hitEnemyIds: new Set() };
  rt.queuedPunch = rt.queuedKick = rt.queuedJump = true;
  sim.damagePlayer(0, 1);
  assert.equal(sim.state.players[0].state, 'hurt');
  assert.equal(rt.attack, undefined);
  assert.equal(rt.queuedPunch, false);
  assert.equal(rt.queuedKick, false);
  assert.equal(rt.queuedJump, false);
});

test('KO cancels an active attack when no continues remain', () => {
  const sim = started(0);
  const rt = sim.players.get(0);
  rt.attack = { kind: 'punch', tick: 4, hitEnemyIds: new Set() };
  sim.damagePlayer(0, 999);
  assert.equal(sim.state.players[0].state, 'ko');
  assert.equal(rt.attack, undefined);
});

test('continue path enters down and cannot retain an attack', () => {
  const sim = started(1);
  const rt = sim.players.get(0);
  rt.attack = { kind: 'kick', tick: 4, hitEnemyIds: new Set() };
  sim.damagePlayer(0, 999);
  assert.equal(sim.state.players[0].state, 'down');
  assert.equal(sim.state.players[0].continues, 0);
  assert.equal(rt.attack, undefined);
  for (let i = 0; i < 31; i++) sim.tick();
  assert.ok(['getup', 'idle'].includes(sim.state.players[0].state));
});
