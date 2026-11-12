import raw from './plates.config.json';

/** Tile font, character set and plate layout: the single place to change them. */
export interface PlateConfig {
  font: { file: string; sha256: string; name: string; license: string };
  /** Characters printed on tiles; recognition only considers these. */
  charset: string;
  /** Number of tile slots in the plate frame. */
  slots: number;
  /** Width / height of the light tile area inside the frame (used to straighten plates). */
  plateAspect: number;
  /** Text of the built-in level 1 plate (generated from the tile font). */
  sampleText: string;
  colors: { frame: string; tile: string; seam: string; character: string };
}

export const plateConfig: PlateConfig = raw;
