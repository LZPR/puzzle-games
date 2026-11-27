import { GridGame, MARK_NAMES, MARKS } from "./grid-game.js";
import { cluesFor, matches, PUZZLES } from "./puzzles.js";

const SAVE_KEY = "nonogram-progress-v1";
const DEFAULT_SIZE = 10;
const DEFAULT_DIFFICULTY = "easy";
const SIZES = [5, 10, 15];
const DIFFICULTIES = ["easy", "medium", "hard"];

function readProgress() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY));
  } catch {
    return null;
  }
}

function validBoard(board, size) {
  return Array.isArray(board) && board.length === size ** 2 &&
    board.every(mark => mark === 0 || mark === 1 || mark === 2);
}

function validPuzzle(puzzle) {
  return puzzle && typeof puzzle.id === "string" && puzzle.id.length > 0 &&
    SIZES.includes(puzzle.size) && DIFFICULTIES.includes(puzzle.difficulty) &&
    validBoard(puzzle.solution, puzzle.size) && puzzle.solution.every(mark => mark !== 2) &&
    puzzle.solution.includes(1) && puzzle.solution.includes(0);
}

class NonogramGame extends GridGame {
  connectedCallback() {
    if (!this.initialized) {
      this.initialized = true;
      const saved = readProgress();
      this.tool = Object.hasOwn(MARKS, saved?.tool) ? saved.tool : "fill";
      const legacyIndex = PUZZLES.findIndex(puzzle => puzzle.id === saved?.puzzle);
      if (saved?.puzzle === saved?.definition?.id && validPuzzle(saved?.definition)) {
        const index = Number.isSafeInteger(saved.index) && saved.index >= 0 ? saved.index : 0;
        this.load(saved.definition, index, saved);
      } else if (legacyIndex >= 0) {
        this.load({ ...PUZZLES[legacyIndex], difficulty: DEFAULT_DIFFICULTY }, legacyIndex, saved);
      }
      this.listenForGridInput();
    }
    this.tick = setInterval(() => {
      if (this.startedAt) this.publish();
    }, 1000);
    queueMicrotask(() => {
      if (!this.isConnected) return;
      if (!this.puzzle && !this.request) this.newPuzzle(DEFAULT_SIZE, DEFAULT_DIFFICULTY);
      else this.publish();
    });
  }

  disconnectedCallback() {
    clearInterval(this.tick);
    if (this.request) this.message = "";
    this.stopGeneration(true);
    this.finishStroke();
    if (this.puzzle) this.publish();
  }

  load(puzzle, puzzleIndex, saved) {
    this.puzzleIndex = puzzleIndex;
    this.puzzle = puzzle;
    const { size, id } = this.puzzle;
    const resume = saved?.puzzle === id ? saved : null;
    this.board = validBoard(resume?.board, size) ? resume.board : Array(size ** 2).fill(0);
    this.past = Array.isArray(resume?.past) ? resume.past.filter(board => validBoard(board, size)) : [];
    this.future = Array.isArray(resume?.future) ? resume.future.filter(board => validBoard(board, size)) : [];
    this.moves = Number.isSafeInteger(resume?.moves) && resume.moves >= 0 ? resume.moves : 0;
    this.elapsed = Number.isSafeInteger(resume?.elapsed) && resume.elapsed >= 0 ? resume.elapsed : 0;
    this.won = matches(this.board, this.puzzle.solution);
    this.startedAt = this.moves && !this.won ? Date.now() : null;
    this.mistakes = new Set();
    this.message = this.won ? "恭喜过关！" : "";
    this.draw();
  }

  newPuzzle(size, difficulty) {
    if (!this.isConnected || !SIZES.includes(size) || !DIFFICULTIES.includes(difficulty)) return;
    this.finishStroke();
    this.stopGeneration();

    const request = { size, difficulty };
    this.request = request;
    this.message = "正在生成谜题…";
    this.setAttribute("aria-busy", "true");
    if (!this.puzzle) {
      this.innerHTML = '<p class="ng-placeholder">正在生成谜题…</p>';
    }
    this.publish();
    if (this.request !== request) return;

    const fail = () => {
      if (this.request !== request) return;
      this.stopGeneration(true);
      this.message = "谜题生成失败，请重试。";
      if (!this.puzzle) this.querySelector(".ng-placeholder").textContent = this.message;
      this.publish();
    };
    try {
      this.worker ??= new Worker(new URL("./generation-worker.js", import.meta.url), { type: "module" });
      this.worker.onerror = fail;
      this.worker.onmessageerror = fail;
      this.worker.onmessage = ({ data }) => {
        if (this.request !== request) return;
        const puzzle = data?.puzzle;
        if (!validPuzzle(puzzle) || puzzle.size !== size || puzzle.difficulty !== difficulty) {
          fail();
          return;
        }
        this.request = null;
        this.removeAttribute("aria-busy");
        this.load(puzzle, this.puzzle ? this.puzzleIndex + 1 : 0);
        this.publish();
      };
      this.worker.postMessage({ size, difficulty, previousId: this.puzzle?.id });
    } catch {
      fail();
    }
  }

  stopGeneration(discardWorker = false) {
    if (this.request || discardWorker) {
      this.worker?.terminate();
      this.worker = null;
    }
    this.request = null;
    this.removeAttribute("aria-busy");
  }

  draw() {
    const { rows, columns } = cluesFor(this.puzzle);
    const { size } = this.puzzle;
    const header = Math.max(3, ...rows.map(clue => clue.length), ...columns.map(clue => clue.length));
    this.style.setProperty("--size", size);
    this.style.setProperty("--board-track", `${size}fr`);
    this.style.setProperty("--ng-header", `${header}fr`);
    this.style.setProperty("--ng-slot-count", size + header);
    const clues = (groups, axis) => groups.map((group, index) => `
      <div class="ng-clue ng-clue--${axis}" role="img" aria-label="第 ${index + 1} ${axis === "row" ? "行" : "列"}提示：${group.join("、")}">
        ${group.map(n => `<span>${n}</span>`).join("")}
      </div>`).join("");
    this.innerHTML = `
      <div class="ng-corner" aria-hidden="true">
        <span class="ng-motif">${"010111010".split("").map(pixel => `<i class="ng-pixel ng-pixel--${pixel}"></i>`).join("")}</span>
        <span class="ng-stroke-count" hidden></span>
      </div>
      <div class="ng-columns">${clues(columns, "column")}</div>
      <div class="ng-rows">${clues(rows, "row")}</div>
      <div class="ng-cells" role="grid" aria-label="${size} × ${size} 数织棋盘">
        ${rows.map((_, row) => `<div class="ng-cell-row" role="row">${columns.map((_, column) => {
          const index = row * size + column;
          return `<div class="ng-cell" role="gridcell" tabindex="${index ? -1 : 0}" data-cell="${index}"></div>`;
        }).join("")}</div>`).join("")}
      </div>`;
    this.bindGrid();
    this.paint();
  }

  paint() {
    const { size } = this.puzzle;
    const marks = this.displayedBoard();
    this.cells.forEach((cell, index) => {
      const row = Math.floor(index / size);
      const column = index % size;
      cell.dataset.mark = marks[index];
      cell.classList.toggle("ng-error", this.mistakes.has(index));
      cell.setAttribute("aria-label", `第 ${row + 1} 行，第 ${column + 1} 列，${MARK_NAMES[marks[index]]}`);
    });
    this.toggleAttribute("data-won", this.won);
  }

  finishMove() {
    this.won = matches(this.board, this.puzzle.solution);
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
    if (!this.puzzle || this.request) return;
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
    } else if (action === "next") {
      this.newPuzzle(this.puzzle.size, this.puzzle.difficulty);
      return;
    } else if (action === "check") {
      this.mistakes = new Set(this.board.flatMap((mark, index) => {
        const expected = this.puzzle.solution[index];
        return (mark === 1 && !expected) || (mark === 2 && expected) ? [index] : [];
      }));
      this.message = this.won ? "恭喜过关！" : this.mistakes.size ?
        `有 ${this.mistakes.size} 格需要调整。` : "目前标记正确，继续解谜吧！";
      this.paint();
    }
    this.publish();
  }

  publish() {
    const elapsed = this.seconds();
    const detail = {
      size: this.request?.size ?? this.puzzle?.size ?? DEFAULT_SIZE,
      difficulty: this.request?.difficulty ?? this.puzzle?.difficulty ?? DEFAULT_DIFFICULTY,
      generating: Boolean(this.request),
      elapsed,
      moves: this.moves ?? 0,
      tool: this.tool,
      canUndo: Boolean(this.past?.length),
      canRedo: Boolean(this.future?.length),
      won: Boolean(this.won),
      filled: this.board?.filter(mark => mark === 1).length ?? 0,
      total: this.puzzle?.solution.filter(Boolean).length ?? 0,
      puzzleIndex: this.puzzleIndex ?? 0,
      message: this.message,
    };
    if (this.puzzle && !this.stroke) {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({
          puzzle: this.puzzle.id, board: this.board, past: this.past, future: this.future,
          definition: this.puzzle, index: this.puzzleIndex, moves: this.moves, elapsed, tool: this.tool,
        }));
      } catch {
        // Keep playing if persistent storage is unavailable.
      }
    }
    this.dispatchEvent(new CustomEvent("game-state", { bubbles: true, detail }));
  }
}

customElements.define("nonogram-game", NonogramGame);
