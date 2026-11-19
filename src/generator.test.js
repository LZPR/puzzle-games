import assert from "node:assert/strict";
import test from "node:test";

import { generatePuzzle } from "./generator.js";
import { cluesFor, runs } from "./puzzles.js";

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function solveWithLineClues(puzzle) {
  const { size } = puzzle;
  const { rows, columns } = cluesFor(puzzle);
  const patterns = new Map();
  for (let mask = 0; mask < 2 ** size; mask += 1) {
    const line = Array.from({ length: size }, (_, index) => (mask >>> index) & 1);
    const clue = runs(line).join(",");
    if (!patterns.has(clue)) patterns.set(clue, []);
    patterns.get(clue).push(line);
  }

  const cells = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => row * size + column));
  const lines = [...cells, ...cells.map((_, column) => cells.map(row => row[column]))];
  let candidates = [...rows, ...columns].map(clue => patterns.get(clue.join(",")));
  let known = Array(size ** 2).fill(null);

  for (let round = 1; round <= known.length; round += 1) {
    const next = known.slice();
    candidates = candidates.map((placements, line) => {
      const valid = placements.filter(placement =>
        lines[line].every((cell, offset) => known[cell] === null || known[cell] === placement[offset]));
      assert.ok(valid.length);
      lines[line].forEach((cell, offset) => {
        if (valid.every(placement => placement[offset] === valid[0][offset])) {
          next[cell] = valid[0][offset];
        }
      });
      return valid;
    });
    if (next.every(cell => cell !== null)) return { solution: next, rounds: round };
    assert.notDeepEqual(next, known, "Puzzle must not stall under line deduction");
    known = next;
  }
  assert.fail("Puzzle did not reach a forced solution");
}

for (const [size, easyMax, mediumMax] of [[5, 2, 4], [10, 3, 6], [15, 4, 8]]) {
  test(`generates forced ${size} × ${size} solutions across all difficulty levels`, () => {
    const random = seededRandom(size);
    const levels = [
      ["easy", 1, easyMax],
      ["medium", easyMax + 1, mediumMax],
      ["hard", mediumMax + 1, size ** 2],
    ];
    for (const [difficulty, minimum, maximum] of levels) {
      const puzzle = generatePuzzle(size, difficulty, random);
      assert.equal(puzzle.size, size);
      assert.equal(puzzle.difficulty, difficulty);
      assert.deepEqual(solveWithLineClues(puzzle), { solution: puzzle.solution, rounds: puzzle.rounds });
      assert.ok(puzzle.rounds >= minimum && puzzle.rounds <= maximum);
    }
  });
}

test("generates varied 5 × 5 puzzles across many rounds", () => {
  const random = seededRandom(31251);
  const ids = new Set(Array.from({ length: 120 }, () => generatePuzzle(5, "hard", random).id));
  assert.equal(ids.size, 120);
});

test("validates inputs and bounds retries when randomness cannot yield a puzzle", () => {
  assert.throws(() => generatePuzzle(6, "easy"), RangeError);
  assert.throws(() => generatePuzzle(5, "expert"), RangeError);
  assert.throws(() => generatePuzzle(5, "hard", () => 0), /attempt limit/);
});
