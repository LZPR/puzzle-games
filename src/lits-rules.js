export function litsNeighbors(size) {
  return Array.from({ length: size ** 2 }, (_, index) => {
    const neighbors = [];
    if (index >= size) neighbors.push(index - size);
    if (index < size * (size - 1)) neighbors.push(index + size);
    if (index % size !== 0) neighbors.push(index - 1);
    if (index % size !== size - 1) neighbors.push(index + 1);
    return neighbors;
  });
}

function connected(cells, neighbors) {
  const available = new Set(cells);
  const pending = [cells[0]];
  available.delete(cells[0]);
  for (const cell of pending) {
    for (const neighbor of neighbors[cell]) {
      if (available.delete(neighbor)) pending.push(neighbor);
    }
  }
  return available.size === 0;
}

export function litsShape(cells, size, neighbors = litsNeighbors(size)) {
  if (cells.length !== 4 || !connected(cells, neighbors)) return null;
  const rows = new Map();
  const columns = new Map();
  for (const cell of cells) {
    const row = Math.floor(cell / size);
    const column = cell % size;
    rows.set(row, (rows.get(row) || 0) + 1);
    columns.set(column, (columns.get(column) || 0) + 1);
  }
  if (rows.size === 1 || columns.size === 1) return "I";
  if (rows.size === 2 && columns.size === 2) return null;
  const filled = new Set(cells);
  if (cells.some(cell => neighbors[cell].filter(neighbor => filled.has(neighbor)).length === 3)) return "T";
  if ([...rows.values(), ...columns.values()].includes(3)) return "L";
  return "S";
}

export function checkLits(regions, size, marks) {
  const neighbors = litsNeighbors(size);
  const grouped = new Map();
  const filled = [];
  for (let index = 0; index < regions.length; index += 1) {
    if (!grouped.has(regions[index])) grouped.set(regions[index], []);
    if (marks[index] === 1) {
      grouped.get(regions[index]).push(index);
      filled.push(index);
    }
  }

  const invalid = message => ({ solved: false, message });
  if (!grouped.size || [...grouped.values()].some(cells => cells.length !== 4)) {
    return invalid("每个区域必须恰好填黑四格。");
  }

  const shapes = new Map();
  for (const [region, cells] of grouped) {
    const shape = litsShape(cells, size, neighbors);
    if (!shape) return invalid("每个区域的黑格必须连成 L、I、T 或 S 形。");
    shapes.set(region, shape);
  }

  for (const index of filled) {
    if (index % size < size - 1 && marks[index + 1] === 1 &&
      marks[index + size] === 1 && marks[index + size + 1] === 1) {
      return invalid("黑格不能组成 2×2 的方块。");
    }
    for (const neighbor of neighbors[index]) {
      if (marks[neighbor] === 1 && regions[index] !== regions[neighbor] &&
        shapes.get(regions[index]) === shapes.get(regions[neighbor])) {
        return invalid("相同形状的四连块不能共边。");
      }
    }
  }

  if (!connected(filled, neighbors)) return invalid("所有黑格必须通过共边连成一片。");
  return { solved: true, message: "解答正确！" };
}
