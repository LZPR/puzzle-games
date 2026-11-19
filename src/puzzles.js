const drawings = [
  [
    "...####...",
    "..######..",
    ".########.",
    ".##.##.##.",
    ".########.",
    ".###..###.",
    ".########.",
    ".########.",
    ".###..###.",
    ".##....##.",
  ],
  [
    "....#.....",
    "...###....",
    "..#####...",
    ".#######..",
    "#########.",
    "..#####...",
    ".#######..",
    "#########.",
    "...###....",
    "...###....",
  ],
  [
    "..##..##..",
    ".####.###.",
    ".########.",
    "##########",
    "##########",
    ".########.",
    "..######..",
    "...####...",
    "....##....",
    ".....#....",
  ],
];

export const PUZZLES = drawings.map((drawing, index) => ({
  id: `picture-${index + 1}`,
  size: drawing.length,
  solution: [...drawing.join("")].map(pixel => Number(pixel === "#")),
}));

export function runs(line) {
  const counts = [];
  let run = 0;
  for (const value of [...line, 0]) {
    if (value) {
      run += 1;
    } else if (run) {
      counts.push(run);
      run = 0;
    }
  }
  return counts.length ? counts : [0];
}

export function cluesFor({ size, solution }) {
  const columns = [];
  const rows = [];
  for (let index = 0; index < size; index += 1) {
    rows.push(runs(solution.slice(index * size, (index + 1) * size)));
    columns.push(runs(Array.from({ length: size }, (_, row) => solution[row * size + index])));
  }
  return { rows, columns };
}

export function matches(board, solution) {
  return board.length === solution.length &&
    board.every((mark, index) => Number(mark === 1) === solution[index]);
}
