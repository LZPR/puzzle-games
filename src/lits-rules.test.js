import assert from "node:assert/strict";
import test from "node:test";
import { checkLits, litsShape } from "./lits-rules.js";

function readBoard(rows) {
  const cells = rows.join("").split("");
  return [
    cells.map(cell => cell.toLowerCase()),
    rows.length,
    cells.map(cell => cell === cell.toUpperCase() ? 1 : 2),
  ];
}

test("identifies rotations and reflections and rejects squares and disconnected cells", () => {
  assert.equal(litsShape([0, 1, 2, 3], 6), "I");
  assert.equal(litsShape([0, 6, 12, 13], 6), "L");
  assert.equal(litsShape([0, 1, 2, 6], 6), "L");
  assert.equal(litsShape([0, 1, 2, 7], 6), "T");
  assert.equal(litsShape([0, 1, 7, 8], 6), "S");
  assert.equal(litsShape([1, 2, 6, 7], 6), "S");
  assert.equal(litsShape([0, 1, 6, 7], 6), null);
  assert.equal(litsShape([0, 1, 6, 13], 6), null);
});

test("accepts a connected board with differently shaped touching pieces", () => {
  const board = readBoard(["AAAAB", "aaabB", "aabBB", "aabbb", "aabbb"]);
  assert.equal(checkLits(...board).solved, true);
  board[2][0] = 0;
  assert.match(checkLits(...board).message, /恰好/);
});

test("rejects a square made from differently shaped pieces", () => {
  assert.match(checkLits(...readBoard(["AAAB", "aABB", "aabB", "abbb"])).message, /2×2/);
});

test("rejects touching copies of the same shape and disconnected pieces", () => {
  assert.match(checkLits(...readBoard(["AAAAB", "aaabB", "aaabB", "aaabB", "aabbb"])).message, /相同/);
  assert.match(checkLits(...readBoard(["AAAA", "aabb", "abBb", "aBBB"])).message, /一片/);
});
