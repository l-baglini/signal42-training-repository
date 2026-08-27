/**
 * Minimal type declarations for `js-aruco2` (v2.0.0), which ships no types.
 * Only the surface we use is declared. See node_modules/js-aruco2/src/aruco.js.
 */
declare module 'js-aruco2' {
  export interface ArucoCorner {
    x: number;
    y: number;
  }

  export interface ArucoMarker {
    id: number;
    /** Four corners in image-pixel space, clockwise. */
    corners: ArucoCorner[];
  }

  /** An ImageData-like input (DOM ImageData satisfies this). */
  export interface ArucoImageLike {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }

  export class ArucoDetector {
    constructor(config?: {
      dictionaryName?: string;
      maxHammingDistance?: number;
    });
    detect(image: ArucoImageLike): ArucoMarker[];
  }

  export class ArucoDictionary {
    constructor(dicName: string);
    /** Printable SVG (string) for marker `id`. */
    generateSVG(id: number): string;
    codeList: unknown[];
  }

  export const AR: {
    Detector: typeof ArucoDetector;
    Dictionary: typeof ArucoDictionary;
    DICTIONARIES: Record<string, unknown>;
    Marker: unknown;
  };
}
