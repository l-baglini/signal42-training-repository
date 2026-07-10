// Per-browser player preferences, persisted in localStorage and shared by the
// lobby and the in-game options overlay: mouse sensitivity and preferred colour.
// Values are cached in memory so the hot path (mousemove) never touches storage.
import { CONFIG } from './config.js';

const SENS_KEY = 'quakelite.sensitivity';
const COLOR_KEY = 'quakelite.color';

const clampSens = (v) =>
  Math.min(CONFIG.sensMax, Math.max(CONFIG.sensMin, v));

let sensitivity = CONFIG.mouseSensitivity;
const storedSens = parseFloat(localStorage.getItem(SENS_KEY));
if (!Number.isNaN(storedSens)) sensitivity = clampSens(storedSens);

// preferred colour: stored choice if it's still a valid palette entry, else the
// first palette colour so a player always has a sensible default.
let color = localStorage.getItem(COLOR_KEY);
if (!CONFIG.palette.includes(color)) color = CONFIG.palette[0];

export const settings = {
  get sensitivity() { return sensitivity; },
  setSensitivity(v) {
    const n = Number(v);
    sensitivity = clampSens(Number.isNaN(n) ? CONFIG.mouseSensitivity : n);
    localStorage.setItem(SENS_KEY, String(sensitivity));
    return sensitivity;
  },

  get color() { return color; },
  setColor(v) {
    if (!CONFIG.palette.includes(v)) return color; // ignore unknown colours
    color = v;
    localStorage.setItem(COLOR_KEY, color);
    return color;
  },
};
