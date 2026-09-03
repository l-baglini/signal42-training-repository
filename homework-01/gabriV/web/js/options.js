// In-game options / pause overlay. Pointer lock can only be (re)acquired by a
// user click, so releasing the mouse (Esc) is the natural pause moment: once the
// player has locked at least once, any unlock shows this panel; re-locking hides
// it. It carries the mouse-sensitivity slider, shared with the lobby via settings.
import { CONFIG } from './config.js';
import { settings } from './settings.js';

export function createOptions({ container, dom }) {
  const panel = document.createElement('div');
  panel.id = 'options';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="options-card">
      <h2>Paused</h2>
      <label for="opt-sens">Mouse sensitivity</label>
      <input id="opt-sens" type="range"
             min="${CONFIG.sensMin}" max="${CONFIG.sensMax}" step="0.0001">
      <button id="opt-resume" type="button">Resume</button>
    </div>`;
  container.appendChild(panel);

  const slider = panel.querySelector('#opt-sens');
  slider.value = settings.sensitivity;
  slider.addEventListener('input', () => settings.setSensitivity(slider.value));
  panel.querySelector('#opt-resume').addEventListener('click', () => dom.requestPointerLock());

  let hasLocked = false;
  let enabled = true;
  document.addEventListener('pointerlockchange', () => {
    if (!enabled) { panel.hidden = true; return; }
    const locked = document.pointerLockElement === dom;
    if (locked) hasLocked = true;
    panel.hidden = !(hasLocked && !locked); // only after the first lock, only while unlocked
    if (!panel.hidden) slider.value = settings.sensitivity; // reflect lobby-side changes
  });

  // disable() retires the pause overlay for good (called at game over, where the
  // game-over screen owns the unlocked-mouse state instead).
  return { disable() { enabled = false; panel.hidden = true; } };
}
