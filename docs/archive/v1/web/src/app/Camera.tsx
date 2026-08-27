/**
 * Camera: device enumeration, the live <video>, and the picker.
 *
 * Privacy (PRD §7): the stream is attached to a <video> and processed in memory
 * only. Nothing is recorded, uploaded, or persisted — only the chosen deviceId
 * string is saved so the same camera is preselected next time.
 */

import { useEffect, useState, type RefObject } from 'react';
import { useStore } from './store';

/**
 * Open a camera stream for `deviceId` (or the default device when null) and
 * attach it to the video element. Re-runs when the deviceId changes; always
 * stops the previous stream's tracks. Reports failures via `onError`.
 *
 * When opened with no specific device, it backfills the store's deviceId from
 * the active track so the picker reflects (and persists) the actual camera.
 */
export function useCameraStream(
  videoRef: RefObject<HTMLVideoElement>,
  deviceId: string | null,
  onError: (message: string | null) => void,
): void {
  const setDeviceId = useStore((s) => s.setDeviceId);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    // Capture the (stable) DOM node so cleanup doesn't read a possibly-changed ref.
    const videoEl = videoRef.current;

    const constraints: MediaStreamConstraints = {
      video: deviceId ? { deviceId: { exact: deviceId } } : true,
      audio: false,
    };

    navigator.mediaDevices
      .getUserMedia(constraints)
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        onError(null);
        if (videoEl) {
          videoEl.srcObject = s;
          void videoEl.play().catch(() => {
            /* autoplay may require a user gesture; ignored */
          });
        }
        // Backfill the actual device id when we opened the default device.
        if (!deviceId) {
          const settings = s.getVideoTracks()[0]?.getSettings();
          if (settings?.deviceId) setDeviceId(settings.deviceId);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : 'Could not open camera';
        onError(
          `Camera error: ${msg}. Grant camera permission and ensure the device is available.`,
        );
      });

    return () => {
      cancelled = true;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (videoEl) videoEl.srcObject = null;
    };
  }, [deviceId, videoRef, onError, setDeviceId]);
}

interface CameraVideoProps {
  videoRef: RefObject<HTMLVideoElement>;
  /** Called with the video's intrinsic aspect ratio once known. */
  onAspectRatio: (ratio: number) => void;
}

/** The live video element. Reports its intrinsic aspect ratio for layout. */
export function CameraVideo({ videoRef, onAspectRatio }: CameraVideoProps) {
  return (
    <video
      ref={videoRef}
      className="stage-video"
      playsInline
      muted
      onLoadedMetadata={(e) => {
        const v = e.currentTarget;
        if (v.videoWidth > 0 && v.videoHeight > 0) {
          onAspectRatio(v.videoWidth / v.videoHeight);
        }
      }}
    />
  );
}

/** Dropdown to choose among available video input devices. */
export function CameraPicker() {
  const deviceId = useStore((s) => s.deviceId);
  const setDeviceId = useStore((s) => s.setDeviceId);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      navigator.mediaDevices
        .enumerateDevices()
        .then((list) => {
          if (cancelled) return;
          setDevices(list.filter((d) => d.kind === 'videoinput'));
        })
        .catch(() => {
          /* enumeration unavailable; leave list empty */
        });
    };
    refresh();
    navigator.mediaDevices.addEventListener('devicechange', refresh);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener('devicechange', refresh);
    };
    // Re-enumerate once a device is selected: labels populate after permission.
  }, [deviceId]);

  return (
    <label className="field">
      <span>Camera</span>
      <select
        value={deviceId ?? ''}
        onChange={(e) => setDeviceId(e.target.value || null)}
      >
        {devices.length === 0 && <option value="">Default camera</option>}
        {devices.map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId}>
            {d.label || `Camera ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}
