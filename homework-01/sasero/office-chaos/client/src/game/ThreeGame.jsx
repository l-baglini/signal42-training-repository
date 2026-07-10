import { useEffect, useRef, useState } from 'react';
import OfficeScene3D from './three/Scene.js';

export default function ThreeGame({ map, socket, meId, workspaceId, bridge }) {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!canvasRef.current || sceneRef.current) return;
    let scene;
    try {
      scene = new OfficeScene3D({ canvas: canvasRef.current, map, socket, meId, workspaceId, bridge });
      sceneRef.current = scene;
    } catch (err) {
      // e.g. WebGL unavailable on very old hardware — don't take down the page
      console.error('Failed to start 3D scene', err);
      setError("Your browser couldn't start WebGL. Office Chaos needs hardware-accelerated graphics — try Chrome/Firefox with acceleration enabled.");
      return;
    }

    const onResize = () => scene.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      scene.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-6 z-20">
          <div className="panel p-6 max-w-sm text-center">
            <p className="text-3xl mb-2">🖥️💥</p>
            <p className="text-sm text-slate-300">{error}</p>
          </div>
        </div>
      )}
    </>
  );
}
