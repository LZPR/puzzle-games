import { GridGame, MARK_NAMES, MARKS } from "./grid-game.js";
import { checkLits, litsNeighbors, litsShape } from "./lits-rules.js";

const SAVE_KEY = "lits-progress-v1";
const DEFAULT_SIZE = 6;
const DEFAULT_DIFFICULTY = "normal";
const SIZES = [6, 8];
const DIFFICULTIES = ["normal", "hard"];

function readProgress() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY));
  } catch {
    return null;
  }
}

function validMarks(marks, size) {
  return Array.isArray(marks) && marks.length === size ** 2 &&
    marks.every(mark => mark === 0 || mark === 1 || mark === 2);
}

function validPuzzle(puzzle) {
  if (!puzzle || !SIZES.includes(puzzle.size) || !DIFFICULTIES.includes(puzzle.difficulty) ||
    !Number.isInteger(puzzle.seed) || puzzle.seed < 0 || puzzle.seed > 0xffffffff) return false;
  const { size, regions, solution } = puzzle;
  if (!Array.isArray(regions) || regions.length !== size ** 2 ||
    !regions.every(region => Number.isSafeInteger(region) && region >= 0) ||
    !validMarks(solution, size) || solution.includes(2)) return false;

  const neighbors = litsNeighbors(size);
  const visited = new Set();
  const seenRegions = new Set();
  for (const [index, region] of regions.entries()) {
    if (visited.has(index)) continue;
    if (seenRegions.has(region)) return false;
    seenRegions.add(region);
    const pending = [index];
    visited.add(index);
    for (const cell of pending) {
      for (const neighbor of neighbors[cell]) {
        if (regions[neighbor] !== region || visited.has(neighbor)) continue;
        visited.add(neighbor);
        pending.push(neighbor);
      }
    }
  }
  return checkLits(regions, size, solution).solved;
}

function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

class LitsGame extends GridGame {
  connectedCallback() {
    if (!this.initialized) {
      this.initialized = true;
      const saved = readProgress();
      this.tool = Object.hasOwn(MARKS, saved?.tool) ? saved.tool : "fill";
      if (validPuzzle(saved?.puzzle)) this.load(saved.puzzle, nonnegativeInteger(saved.index), saved);
      this.listenForGridInput();
    }
    if (this.moves && !this.won) this.startedAt ??= Date.now();
    this.tick = setInterval(() => {
      if (this.startedAt) this.publish();
    }, 1000);
    queueMicrotask(() => {
      if (!this.isConnected) return;
      if (!this.puzzle && !this.request) this.newPuzzle(this.size, this.difficulty);
      else this.publish();
    });
  }

  disconnectedCallback() {
    clearInterval(this.tick);
    if (this.request) this.message = "";
    this.stopGeneration();
    this.finishStroke();
    this.elapsed = this.seconds();
    this.startedAt = null;
    if (this.puzzle) this.publish();
  }

  get size() {
    return this.request?.size ?? this.puzzle?.size ?? this.attempt?.size ?? DEFAULT_SIZE;
  }

  get difficulty() {
    return this.request?.difficulty ?? this.puzzle?.difficulty ?? this.attempt?.difficulty ?? DEFAULT_DIFFICULTY;
  }

  load(puzzle, index, saved) {
    const { size, regions } = puzzle;
    this.puzzle = puzzle;
    this.puzzleIndex = index;
    this.neighbors = litsNeighbors(size);
    this.regionNumbers = new Map();
    for (const region of regions) {
      if (!this.regionNumbers.has(region)) this.regionNumbers.set(region, this.regionNumbers.size + 1);
    }
    const resume = validMarks(saved?.board, size) ? saved : null;
    this.board = resume?.board ?? Array(size ** 2).fill(0);
    this.past = Array.isArray(resume?.past) ? resume.past.filter(board => validMarks(board, size)) : [];
    this.future = Array.isArray(resume?.future) ? resume.future.filter(board => validMarks(board, size)) : [];
    this.moves = nonnegativeInteger(resume?.moves);
    this.elapsed = nonnegativeInteger(resume?.elapsed);
    this.won = this.check().solved;
    this.startedAt = this.moves && !this.won ? Date.now() : null;
    this.mistakes = new Set();
    this.message = this.won ? "恭喜过关！" : "";
    this.draw();
  }

  newPuzzle(size, difficulty) {
    if (!this.isConnected || !SIZES.includes(size) || !DIFFICULTIES.includes(difficulty)) return;
    this.finishStroke();
    this.stopGeneration();

    const randomSeed = crypto.getRandomValues(new Uint32Array(1))[0];
    const seed = randomSeed === this.puzzle?.seed ? (randomSeed + 1) >>> 0 : randomSeed;
    const request = { size, difficulty, seed };
    this.attempt = request;
    this.request = request;
    this.message = "正在生成谜题…";
    this.setAttribute("aria-busy", "true");
    if (!this.puzzle) this.innerHTML = '<p class="lits-placeholder">正在生成谜题…</p>';
    this.publish();
    if (this.request !== request) return;

    const fail = () => {
      if (this.request !== request) return;
      this.stopGeneration();
      this.message = "谜题生成失败，请重试。";
      if (!this.puzzle) this.querySelector(".lits-placeholder").textContent = this.message;
      this.publish();
    };
    try {
      const worker = new Worker(new URL("./lits-worker.js", import.meta.url), { type: "module" });
      this.worker = worker;
      worker.onerror = fail;
      worker.onmessageerror = fail;
      worker.onmessage = ({ data }) => {
        if (this.request !== request) return;
        const puzzle = data?.puzzle;
        if (!validPuzzle(puzzle) || puzzle.size !== size || puzzle.difficulty !== difficulty || puzzle.seed !== seed) {
          fail();
          return;
        }
        this.stopGeneration();
        this.load(puzzle, this.puzzle ? this.puzzleIndex + 1 : 0);
        this.publish();
      };
      worker.postMessage(request);
    } catch {
      fail();
    }
  }

  stopGeneration() {
    this.worker?.terminate();
    this.worker = null;
    this.request = null;
    this.removeAttribute("aria-busy");
  }

  draw() {
    const { size, regions } = this.puzzle;
    this.style.setProperty("--lits-size", size);
    this.innerHTML = `
      <div class="lits-grid" role="grid" aria-label="${size} × ${size} LITS 棋盘">
        ${Array.from({ length: size }, (_, row) => `
          <div class="lits-row" role="row">
            ${Array.from({ length: size }, (_, column) => {
              const index = row * size + column;
              const right = column < size - 1 && regions[index] !== regions[index + 1];
              const bottom = row < size - 1 && regions[index] !== regions[index + size];
              return `<div class="lits-cell${right ? " lits-region-right" : ""}${bottom ? " lits-region-bottom" : ""}"
                role="gridcell" tabindex="${index ? -1 : 0}" data-cell="${index}"></div>`;
            }).join("")}
          </div>`).join("")}
      </div>`;
    this.cells = [...this.querySelectorAll("[data-cell]")];
    this.focusIndex = 0;
    this.paint();
  }

  paint() {
    const { size, regions } = this.puzzle;
    const filledByRegion = new Map();
    for (const [index, mark] of this.board.entries()) {
      if (mark !== 1) continue;
      const region = regions[index];
      if (!filledByRegion.has(region)) filledByRegion.set(region, []);
      filledByRegion.get(region).push(index);
    }
    const shapes = new Map([...filledByRegion].map(([region, filled]) =>
      [region, litsShape(filled, size, this.neighbors)]));
    this.cells.forEach((cell, index) => {
      const row = Math.floor(index / size) + 1;
      const column = index % size + 1;
      const region = this.regionNumbers.get(regions[index]);
      const mark = this.board[index];
      const shape = mark === 1 ? shapes.get(regions[index]) : null;
      cell.dataset.mark = mark;
      if (shape) cell.dataset.shape = shape;
      else delete cell.dataset.shape;
      const mistake = this.mistakes.has(index);
      cell.classList.toggle("lits-error", mistake);
      const feedback = mistake ? "，所在区域填充过多" : shape ? `，${shape} 形四连块` : "";
      cell.setAttribute("aria-label", `第 ${row} 行，第 ${column} 列，区域 ${region}，${MARK_NAMES[mark]}${feedback}`);
    });
    this.toggleAttribute("data-won", this.won);
  }

  check() {
    return checkLits(this.puzzle.regions, this.puzzle.size, this.board);
  }

  finishMove() {
    this.won = this.check().solved;
    if (this.won) {
      this.elapsed = this.seconds();
      this.startedAt = null;
      this.message = "恭喜过关！";
    } else {
      this.startedAt ??= Date.now();
    }
    this.paint();
    this.publish();
  }

  command(action) {
    if (this.request) return;
    if (action === "next") {
      this.newPuzzle(this.size, this.difficulty);
      return;
    }
    if (!this.puzzle) return;
    this.finishStroke();
    if (Object.hasOwn(MARKS, action)) {
      this.tool = action;
    } else if (action === "undo" || action === "redo") {
      const source = action === "undo" ? this.past : this.future;
      const target = action === "undo" ? this.future : this.past;
      if (!source.length) return;
      target.push(this.board);
      this.board = source.pop();
      this.mistakes.clear();
      this.message = "";
      this.finishMove();
      return;
    } else if (action === "reset") {
      this.load(this.puzzle, this.puzzleIndex);
      this.message = "棋盘已重置。";
    } else if (action === "check") {
      this.mistakes.clear();
      const counts = new Map([...this.regionNumbers.keys()].map(region => [region, 0]));
      this.puzzle.regions.forEach((region, index) => {
        if (this.board[index] === 1) counts.set(region, counts.get(region) + 1);
      });
      const overfilled = [...counts].find(([, count]) => count > 4);
      const incomplete = [...counts].filter(([, count]) => count < 4).length;
      if (overfilled) {
        const [region, count] = overfilled;
        this.puzzle.regions.forEach((cellRegion, index) => {
          if (cellRegion === region && this.board[index] === 1) this.mistakes.add(index);
        });
        this.message = `标出的区域已填充 ${count} 格，每个区域必须恰好填充四格。`;
      } else if (incomplete) {
        this.message = `还有 ${incomplete} 个区域未填满四格。`;
      } else {
        this.message = this.check().message;
      }
      this.paint();
    }
    this.publish();
  }

  publish() {
    const elapsed = this.seconds();
    if (this.puzzle && !this.stroke) {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({
          puzzle: this.puzzle, board: this.board, past: this.past, future: this.future,
          index: this.puzzleIndex, moves: this.moves, elapsed, tool: this.tool,
        }));
      } catch {
        // Keep playing if persistent storage is unavailable.
      }
    }
    this.dispatchEvent(new CustomEvent("game-state", {
      bubbles: true,
      detail: {
        size: this.size,
        difficulty: this.difficulty,
        generating: Boolean(this.request),
        elapsed,
        moves: this.moves ?? 0,
        tool: this.tool,
        canUndo: Boolean(this.past?.length),
        canRedo: Boolean(this.future?.length),
        won: Boolean(this.won),
        filled: this.board?.filter(mark => mark === 1).length ?? 0,
        total: (this.regionNumbers?.size ?? 0) * 4,
        puzzleIndex: this.puzzleIndex ?? 0,
        message: this.message,
      },
    }));
  }
}

customElements.define("lits-game", LitsGame);
