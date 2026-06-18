// Owns the Three.js scene, camera, renderer and the render loop, created once and
// passed to the other modules (CLAUDE.md conventions).
import * as THREE from 'three';
import { loadMap } from './map.js';
import { createPlayer } from './player.js';
import { createRemotePlayers } from './remote.js';
import { createWeapon } from './weapons.js';
import { createHud } from './hud.js';
import { createSound } from './sound.js';
import { createOptions } from './options.js';

export async function startGame({ container, net, welcome }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x10141c);

  const camera = new THREE.PerspectiveCamera(
    75, window.innerWidth / window.innerHeight, 0.1, 200);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x303840, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(20, 40, 10);
  scene.add(sun);

  const map = await loadMap(welcome?.mapUrl ?? '/map.json');
  scene.add(map.group);

  const player = createPlayer({ camera, dom: renderer.domElement, map, spawn: welcome?.you?.pos, net });
  const remotes = createRemotePlayers({ scene, selfId: welcome?.id });
  if (welcome?.players) remotes.applySnapshot(welcome.players);
  const sound = createSound();
  const weapon = createWeapon({ scene, camera, dom: renderer.domElement, net, map, remotes, player, sound });
  const hud = createHud({ container });
  const options = createOptions({ container, dom: renderer.domElement }); // pause overlay + sensitivity slider
  hud.setSelf(welcome?.id);
  if (welcome?.players) hud.update(welcome.players);
  if (welcome?.match) hud.setMatch(welcome.match);

  const events = []; // joined/left trail, handy in devtools
  const stats = { snapshots: 0 };
  net?.on('snapshot', (m) => {
    stats.snapshots++;
    remotes.applySnapshot(m.players);
    hud.update(m.players);
    hud.setMatch(m.match); // timer + waiting/active status (SPEC stretch)
    // own entry is ignored for position but is the truth for HP/score
    game.you = m.players.find((p) => p.id === welcome?.id) ?? game.you;
  });
  net?.on('gameover', (m) => {
    console.log('game over:', m.reason);
    document.exitPointerLock?.(); // free the mouse for the final scoreboard
    options.disable(); // the game-over screen owns the unlocked state now
    player.setAlive(false); // freeze the local player; server closes the socket shortly
    hud.hideDeath(); // in case we died right as the match ended
    hud.showGameOver(m); // server-closed socket then reloads us to the lobby (main.js)
  });
  net?.on('killed', (m) => {
    console.log('killed:', m.victim, 'by', m.killer);
    events.push({ t: 'killed', victim: m.victim, killer: m.killer });
    hud.addKill(m.killer, m.victim); // kill-feed line (SPEC §9.2)
    sound.kill();
    if (m.victim === welcome?.id) {
      player.setAlive(false);
      hud.showDeath(m.killer); // "You Died" screen (names the killer) until respawn
    }
  });
  net?.on('respawned', (m) => {
    if (m.id === welcome?.id) {
      player.respawnAt(m.pos);
      player.setAlive(true);
      hud.hideDeath();
    }
  });
  net?.on('joined', (m) => {
    console.log('player joined:', m.player.name, m.player.id);
    events.push({ t: 'joined', id: m.player.id, name: m.player.name });
  });
  net?.on('left', (m) => {
    console.log('player left:', m.id);
    events.push({ t: 'left', id: m.id });
    remotes.remove(m.id);
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05); // clamp tab-switch dt spikes
    player.update(dt);
    remotes.update(performance.now()); // interpolate remotes toward buffered poses (SPEC §9.1)
    renderer.render(scene, camera);
  });

  const game = { scene, camera, renderer, map, player, remotes, weapon, hud, net, welcome, events, stats };
  window.game = game; // tiny debug handle, allowed by CLAUDE.md
  return game;
}
