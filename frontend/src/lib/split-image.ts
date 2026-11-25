export type Tile = { x: number; y: number; w: number; h: number; row: number; col: number; order: number };

/**
 * Cut a cols x rows layout of `tw x th` tiles. `order` is the posting order:
 * Instagram shows the newest post top-left, so the bottom-right tile goes up first.
 */
export function splitTiles(cols: number, rows: number, tw: number, th: number): Tile[] {
  const total = cols * rows;
  const tiles: Tile[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      tiles.push({ x: col * tw, y: row * th, w: tw, h: th, row, col, order: total - (row * cols + col) });
    }
  }
  return tiles;
}
