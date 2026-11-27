import assert from "node:assert/strict";
import test from "node:test";

globalThis.HTMLElement = class {};
const { GridGame } = await import("./grid-game.js");

function setup() {
  const game = new GridGame();
  Object.assign(game, {
    board: Array(25).fill(0),
    puzzle: { size: 5 },
    grid: { getBoundingClientRect: () => ({ left: 100, top: 50, width: 50, height: 50 }) },
    strokeCount: { hidden: true, textContent: "" },
    past: [],
    moves: 0,
    tool: "fill",
    paint() {},
    finishMove() {},
    focusCell() {},
    setPointerCapture() {},
    hasPointerCapture: () => false,
  });
  return game;
}

function pointer(type, row, column, extra = {}) {
  return {
    type,
    clientX: 105 + column * 10,
    clientY: 55 + row * 10,
    pointerId: 1,
    button: 0,
    target: { closest: () => ({ dataset: { cell: row * 5 + column } }) },
    preventDefault() {},
    ...extra,
  };
}

function marked(board, mark = 1) {
  return board.flatMap((value, index) => value === mark ? [index] : []);
}

test("locks a horizontal drag, rewinds the live preview, and commits one undo entry", () => {
  const game = setup();
  game.startStroke(pointer("pointerdown", 2, 1));
  game.moveStroke(pointer("pointermove", 1, 4));
  assert.deepEqual(marked(game.displayedBoard()), [11, 12, 13, 14]);
  assert.deepEqual(marked(game.board), []);
  assert.equal(game.strokeCount.textContent, "4 格");

  game.moveStroke(pointer("pointermove", 4, 2));
  assert.deepEqual(marked(game.displayedBoard()), [11, 12]);
  assert.equal(game.strokeCount.textContent, "2 格");
  game.moveStroke(pointer("pointermove", 4, 1));
  assert.equal(game.strokeCount.hidden, true);

  game.finishStroke(pointer("pointerup", 4, 3));
  assert.deepEqual(marked(game.board), [11, 12, 13]);
  assert.equal(game.moves, 1);
  assert.deepEqual(game.past, [Array(25).fill(0)]);
  assert.equal(game.strokeCount.hidden, true);
});

test("locks a vertical right-click drag and clamps the release to the grid", () => {
  const game = setup();
  game.startStroke(pointer("pointerdown", 3, 2, { button: 2 }));
  game.moveStroke(pointer("pointermove", 1, 1));
  assert.deepEqual(marked(game.displayedBoard(), 2), [7, 12, 17]);
  game.finishStroke(pointer("pointerup", -3, -9));
  assert.deepEqual(marked(game.board, 2), [2, 7, 12, 17]);
  assert.equal(game.moves, 1);
  assert.equal(game.strokeCount.hidden, true);
});

test("drops a cancelled erase preview and preserves existing marks and history", () => {
  const game = setup();
  game.board[11] = 1;
  game.board[12] = 2;
  game.mistakes = new Set([12]);
  game.message = "existing check";
  game.startStroke(pointer("pointerdown", 2, 1));
  game.moveStroke(pointer("pointermove", 2, 3));
  assert.deepEqual(marked(game.displayedBoard()), []);
  assert.deepEqual(marked(game.displayedBoard(), 2), []);
  game.finishStroke(pointer("pointercancel", 2, 3));
  assert.deepEqual(marked(game.board), [11]);
  assert.deepEqual(marked(game.board, 2), [12]);
  assert.deepEqual(game.mistakes, new Set([12]));
  assert.equal(game.message, "existing check");
  assert.equal(game.moves, 0);
  assert.equal(game.past.length, 0);
  assert.equal(game.strokeCount.hidden, true);
});

function touch(type, row, column, extra = {}) {
  return pointer(type, row, column, { pointerType: "touch", ...extra });
}

test("touch taps fill or clear filled cells regardless of the selected mouse tool", ({ mock }) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const game = setup();
  game.tool = "cross";
  game.board[7] = 2;
  game.startStroke(touch("pointerdown", 1, 2));
  game.finishStroke(touch("pointerup", 1, 2));
  assert.equal(game.board[7], 1);

  game.startStroke(touch("pointerdown", 1, 2));
  game.finishStroke(touch("pointerup", 1, 2));
  mock.timers.tick(400);
  assert.equal(game.board[7], 0);
  assert.equal(game.moves, 2);
});

test("touch motion fixes the fill gesture even after returning to the starting cell", ({ mock }) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const game = setup();
  game.startStroke(touch("pointerdown", 2, 1));
  game.moveStroke(touch("pointermove", 2, 4));
  game.moveStroke(touch("pointermove", 2, 1));
  mock.timers.tick(500);
  assert.equal(game.displayedBoard()[11], 1);
  game.finishStroke(touch("pointerup", 2, 2));
  assert.deepEqual(marked(game.board), [11, 12]);
  assert.equal(game.moves, 1);
});

test("a touch hold tolerates small motion, then crosses or clears a straight segment", ({ mock }) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const game = setup();
  game.startStroke(touch("pointerdown", 2, 1));
  game.moveStroke(touch("pointermove", 2, 1, { clientX: 121 }));
  mock.timers.tick(400);
  assert.deepEqual(marked(game.displayedBoard(), 2), [11]);
  assert.deepEqual(marked(game.board, 2), []);
  game.moveStroke(touch("pointermove", 2, 3));
  assert.deepEqual(marked(game.displayedBoard(), 2), [11, 12, 13]);
  game.finishStroke(touch("pointerup", 2, 3));
  assert.deepEqual(marked(game.board, 2), [11, 12, 13]);
  assert.equal(game.moves, 1);

  game.startStroke(touch("pointerdown", 2, 1));
  mock.timers.tick(400);
  game.finishStroke(touch("pointerup", 2, 2));
  assert.deepEqual(marked(game.board, 2), [13]);
});

test("cancelled touches cannot mark a board or change a subsequent stroke", ({ mock }) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const game = setup();
  game.startStroke(touch("pointerdown", 2, 1));
  mock.timers.tick(200);
  game.finishStroke(touch("pointercancel", 2, 1));
  game.startStroke(touch("pointerdown", 3, 1));
  game.moveStroke(touch("pointermove", 0, 0, { pointerId: 2 }));
  mock.timers.tick(200);
  assert.deepEqual(marked(game.displayedBoard()), [16]);
  assert.deepEqual(marked(game.board), []);
  game.finishStroke();
  mock.timers.tick(400);
  assert.deepEqual(marked(game.displayedBoard(), 2), []);
  assert.equal(game.moves, 0);
});
