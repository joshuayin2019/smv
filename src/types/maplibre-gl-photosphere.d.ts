// src/types/maplibre-gl-photosphere.d.ts
// The package ships plain JS without typings, so this teaches TypeScript what it exports.
declare module 'maplibre-gl-photosphere' {
  import type { Map } from 'maplibre-gl';

  export interface PhotosphereView {
    center: [number, number];
    zoom: number;
    pitch: number;
    bearing: number;
  }

  export interface PhotosphereOptions {
    lngLat: [number, number];
    imageUrl: string;
    exitView?: PhotosphereView;
    onEnter?: () => void;
    onExit?: () => void;
  }

  export class Photosphere {
    constructor(map: Map, options: PhotosphereOptions);
    enter(): void;
    exit(): void;
    zoomFov(deltaDeg: number): void;
  }
}
