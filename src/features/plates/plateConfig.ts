import raw from './plates.config.json' with { type: 'json' };

/** Tile font, character set and plate layout: the single place to change them. */
export interface PlateConfig {
  font: { file: string; sha256: string; name: string; license: string };
  /** Characters printed on tiles; recognition only considers these. */
  charset: string;
  /** Number of tile slots in the plate frame. */
  slots: number;
  /** Plate geometry in any unit: tile size, gap between tiles, frame border, letter height. */
  tile: { width: number; height: number; seam: number; border: number; capHeight: number };
  /** Text of the built-in level 1 plate (generated from the tile font). */
  sampleText: string;
  colors: { frame: string; tile: string; seam: string; character: string };
}

export const plateConfig: PlateConfig = raw;

/** Width / height of the light tile area inside the frame (what "Znajdź tablicę" finds). */
export function plateAspect(config: PlateConfig = plateConfig) {
  const { width, height, seam } = config.tile;
  return (config.slots * width + (config.slots - 1) * seam) / height;
}
