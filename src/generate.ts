/**
 * Lake layout generation. Grid is [row][col]; row 0 is the start shore and
 * row lakeRows+1 the far shore. `true` means the tile starts as a hole.
 */
export type HoleGrid = boolean[][];

export function hasPath(grid: HoleGrid): boolean {
  const rows = grid.length;
  const cols = grid[0].length;
  const seen = grid.map((r) => r.map(() => false));
  const queue: [number, number][] = [];
  for (let c = 0; c < cols; c++) {
    if (!grid[0][c]) {
      seen[0][c] = true;
      queue.push([0, c]);
    }
  }
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (queue.length) {
    const [r, c] = queue.shift()!;
    if (r === rows - 1) return true;
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (seen[nr][nc] || grid[nr][nc]) continue;
      seen[nr][nc] = true;
      queue.push([nr, nc]);
    }
  }
  return false;
}

export function generateHoles(
  cols: number,
  lakeRows: number,
  chance: number,
  rng: () => number = Math.random,
  maxTries = 200,
): HoleGrid {
  const rows = lakeRows + 2;
  let grid: HoleGrid = [];
  for (let attempt = 0; attempt < maxTries; attempt++) {
    grid = [];
    for (let r = 0; r < rows; r++) {
      const shore = r === 0 || r === rows - 1;
      grid.push(Array.from({ length: cols }, () => !shore && rng() < chance));
    }
    if (hasPath(grid)) return grid;
  }
  // Fallback (very unlikely): carve a meandering path through the last grid.
  let c = Math.floor(cols / 2);
  for (let r = 1; r < rows - 1; r++) {
    grid[r][c] = false;
    const step = Math.floor(rng() * 3) - 1;
    const nc = Math.min(cols - 1, Math.max(0, c + step));
    grid[r][nc] = false;
    c = nc;
  }
  return grid;
}
