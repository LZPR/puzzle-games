import assert from "node:assert/strict";
import test from "node:test";
import { generateLits, solveLits } from "./lits-generator.js";
import { checkLits, litsNeighbors } from "./lits-rules.js";

function assertConnectedRegions(regions, size) {
  const neighbors = litsNeighbors(size);
  const ids = [...new Set(regions)].sort((a, b) => a - b);
  assert.deepEqual(ids, ids.map((_, index) => index));
  for (const id of ids) {
    const cells = regions.flatMap((region, cell) => region === id ? [cell] : []);
    const seen = new Set([cells[0]]);
    for (const cell of seen) {
      for (const neighbor of neighbors[cell]) {
        if (regions[neighbor] === id) seen.add(neighbor);
      }
    }
    assert.deepEqual([...seen].sort((a, b) => a - b), cells);
  }
}

test("generates replayable, varied, uniquely solvable boards at each size and difficulty", () => {
  for (const size of [6, 8]) {
    for (const difficulty of ["normal", "hard"]) {
      const signatures = new Set();
      for (const seed of [5647, 58038, 110429, "lits"]) {
        const puzzle = generateLits(size, difficulty, seed);
        assert.deepEqual(puzzle, generateLits(size, difficulty, seed));
        assert.equal(puzzle.seed, seed);
        assert.equal(puzzle.regions.length, size ** 2);
        assertConnectedRegions(puzzle.regions, size);
        assert.equal(checkLits(puzzle.regions, size, puzzle.solution).solved, true);
        const { solutions, branches } = solveLits(puzzle.regions, size);
        assert.deepEqual(solutions, [puzzle.solution]);
        assert.equal(branches >= 4, difficulty === "hard");
        signatures.add(puzzle.regions.join(","));
      }
      assert.equal(signatures.size, 4);
    }
  }
});

test("solver distinguishes an impossible board from one with multiple solutions", () => {
  assert.equal(solveLits([0, 0, 0, 0], 2).solutions.length, 0);
  assert.equal(solveLits(Array(9).fill(0), 3).solutions.length, 2);
});

test("a generated seed is an unsigned integer that can replay the board", () => {
  const puzzle = generateLits(6, "normal");
  assert.equal(puzzle.seed >>> 0, puzzle.seed);
  assert.deepEqual(generateLits(6, "normal", puzzle.seed), puzzle);
});
