import * as THREE from 'three';

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A camera-facing text label baked onto a canvas texture. Used for floating
// damage numbers, room names, and combo banners.
export function makeTextSprite(text, { color = '#ffd166', fontSize = 48, bg = null, scale = 1 } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.font = font;
  const pad = 24;
  const textW = ctx.measureText(text).width;
  canvas.width = Math.ceil(textW + pad * 2);
  canvas.height = Math.ceil(fontSize + pad * 2);

  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (bg) {
    ctx.fillStyle = bg;
    roundRect(ctx, 4, 4, canvas.width - 8, canvas.height - 8, 14);
    ctx.fill();
  }
  ctx.lineWidth = fontSize * 0.14;
  ctx.strokeStyle = 'rgba(15,23,32,0.9)';
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  const aspect = canvas.width / canvas.height;
  sprite.scale.set(aspect * scale, scale, 1);
  return sprite;
}
