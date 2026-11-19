import assert from "node:assert/strict";
import test from "node:test";

import { cluesFor, matches, PUZZLES, runs } from "./puzzles.js";

function possibleLines(size, clues) {
  const clueKey = clues.join(",");
  return Array.from({ length: 2 ** size }, (_, mask) =>
    Array.from({ length: size }, (_, index) => (mask >> index) & 1))
    .filter(line => runs(line).join(",") === clueKey);
}

function countSolutions({ size, ...puzzle }) {
  const { rows, columns } = cluesFor({ size, ...puzzle });
  const rowOptions = rows.map(clue => possibleLines(size, clue));
  const columnOptions = columns.map(clue => possibleLines(size, clue));

  function countFrom(row, options) {
    if (row === size) return 1;
    let count = 0;
    for (const line of rowOptions[row]) {
      const next = options.map((column, index) => column.filter(marks => marks[row] === line[index]));
      if (next.every(column => column.length)) count += countFrom(row + 1, next);
      if (count > 1) break;
    }
    return count;
  }

  return countFrom(0, columnOptions);
}

test("counts filled runs and gives blank lines a zero clue", () => {
  assert.deepEqual(runs([1, 1, 0, 1, 0, 1, 1, 1]), [2, 1, 3]);
  assert.deepEqual(runs([0, 0]), [0]);
});

test("matches the filled picture with or without crosses in blank cells", () => {
  assert.equal(matches([1, 0, 2, 1], [1, 0, 0, 1]), true);
  assert.equal(matches([2, 0, 0, 1], [1, 0, 0, 1]), false);
  assert.equal(matches([1, 1, 0, 1], [1, 0, 0, 1]), false);
});

for (const puzzle of PUZZLES) {
  test(`${puzzle.id} describes a square picture with a unique solution`, () => {
    assert.equal(puzzle.solution.length, puzzle.size ** 2);
    assert.equal(countSolutions(puzzle), 1);
  });
}
