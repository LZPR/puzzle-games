import { cluesFor, matches, PUZZLES } from "./puzzles.js";

const SAVE_KEY = "nonogram-progress-v1";
const MARKS = { fill: 1, cross: 2, erase: 0 };
const MARK_NAMES = ["空白", "已填充", "已标叉"];

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

class NonogramGame extends HTMLElement {
  connectedCallback() {
    if (!this.cells) {
      const saved = readProgress();
      const puzzleIndex = PUZZLES.findIndex(puzzle => puzzle.id === saved?.puzzle);
      this.tool = Object.hasOwn(MARKS, saved?.tool) ? saved.tool : "fill";
      this.load(puzzleIndex < 0 ? 0 : puzzleIndex, saved);
      this.addEventListener("pointerdown", this.startStroke);
      this.addEventListener("pointermove", this.moveStroke);
      this.addEventListener("pointerup", this.finishStroke);
      this.addEventListener("pointercancel", this.finishStroke);
      this.addEventListener("lostpointercapture", this.finishStroke);
      this.addEventListener("contextmenu", event => event.preventDefault());
      this.addEventListener("keydown", this.handleKey);
    }
    this.tick = setInterval(() => {
      if (this.startedAt) this.publish();
    }, 1000);
    queueMicrotask(() => this.publish());
  }

  disconnectedCallback() {
    clearInterval(this.tick);
    this.finishStroke();
  }

  load(puzzleIndex, saved) {
    this.puzzleIndex = puzzleIndex;
    this.puzzle = PUZZLES[puzzleIndex];
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

  draw() {
    const { rows, columns } = cluesFor(this.puzzle);
    const { size } = this.puzzle;
    const rowHeader = Math.max(3, ...rows.map(clue => clue.length));
    const columnHeader = Math.max(3, ...columns.map(clue => clue.length));
    this.style.setProperty("--size", size);
    this.style.setProperty("--board-track", `${size}fr`);
    this.style.setProperty("--row-header", `${rowHeader}fr`);
    this.style.setProperty("--column-header", `${columnHeader}fr`);
    const clues = (groups, axis) => groups.map((group, index) => `
      <div class="ng-clue ng-clue--${axis}" role="img" aria-label="第 ${index + 1} ${axis === "row" ? "行" : "列"}提示：${group.join("、")}">
        ${group.map(n => `<span>${n}</span>`).join("")}
      </div>`).join("");
    this.innerHTML = `
      <div class="ng-corner" aria-hidden="true">
        <span class="ng-motif">${"010111010".split("").map(pixel => `<i class="ng-pixel ng-pixel--${pixel}"></i>`).join("")}</span>
      </div>
      <div class="ng-columns">${clues(columns, "column")}</div>
      <div class="ng-rows">${clues(rows, "row")}</div>
      <div class="ng-cells" role="grid" aria-label="${size} × ${size} 数织棋盘">
        ${rows.map((_, row) => `<div class="ng-cell-row" role="row">${columns.map((_, column) => {
          const index = row * size + column;
          return `<div class="ng-cell" role="gridcell" tabindex="${index ? -1 : 0}" data-cell="${index}"></div>`;
        }).join("")}</div>`).join("")}
      </div>`;
    this.cells = [...this.querySelectorAll("[data-cell]")];
    this.focusIndex = 0;
    this.paint();
  }

  paint() {
    const { size } = this.puzzle;
    this.cells.forEach((cell, index) => {
      const row = Math.floor(index / size);
      const column = index % size;
      cell.dataset.mark = this.board[index];
      cell.classList.toggle("ng-error", this.mistakes.has(index));
      cell.setAttribute("aria-label", `第 ${row + 1} 行，第 ${column + 1} 列，${MARK_NAMES[this.board[index]]}`);
    });
    this.toggleAttribute("data-won", this.won);
  }

  focusCell(index) {
    this.cells[this.focusIndex].tabIndex = -1;
    this.focusIndex = index;
    this.cells[index].tabIndex = 0;
    this.cells[index].focus({ preventScroll: true });
  }

  startStroke = event => {
    const cell = event.target.closest("[data-cell]");
    if (!cell || this.stroke || this.won || (event.button !== 0 && event.button !== 2)) return;
    event.preventDefault();
    const index = Number(cell.dataset.cell);
    const mark = event.button === 2 ? MARKS.cross : MARKS[this.tool];
    this.stroke = {
      pointer: event.pointerId,
      before: [...this.board],
      mark: this.board[index] === mark ? 0 : mark,
      previous: index,
    };
    this.focusCell(index);
    this.setPointerCapture(event.pointerId);
    this.applyMarks([index], this.stroke.mark);
  };

  moveStroke = event => {
    if (this.stroke?.pointer !== event.pointerId) return;
    const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-cell]");
    if (!cell || !this.contains(cell)) {
      this.stroke.previous = null;
      return;
    }
    const index = Number(cell.dataset.cell);
    const previous = this.stroke.previous ?? index;
    this.stroke.previous = index;
    const size = this.puzzle.size;
    const row = Math.floor(previous / size);
    const column = previous % size;
    const rowDelta = Math.floor(index / size) - row;
    const columnDelta = index % size - column;
    const steps = Math.max(1, Math.abs(rowDelta), Math.abs(columnDelta));
    const indices = Array.from({ length: steps }, (_, step) => {
      const ratio = (step + 1) / steps;
      return Math.round(row + rowDelta * ratio) * size + Math.round(column + columnDelta * ratio);
    });
    this.applyMarks(indices, this.stroke.mark);
  };

  finishStroke = event => {
    if (!this.stroke || (event && this.stroke.pointer !== event.pointerId)) return;
    const { before, pointer } = this.stroke;
    this.stroke = null;
    if (this.hasPointerCapture(pointer)) this.releasePointerCapture(pointer);
    this.commit(before);
  };

  handleKey = event => {
    const cell = event.target.closest("[data-cell]");
    if (!cell || event.altKey) return;
    const key = event.key.toLowerCase();
    if (event.ctrlKey || event.metaKey) {
      if (key === "z" || key === "y") {
        event.preventDefault();
        this.command(key === "y" || event.shiftKey ? "redo" : "undo");
      }
      return;
    }
    const index = Number(cell.dataset.cell);
    const size = this.puzzle.size;
    const column = index % size;
    const targets = {
      arrowleft: index - Number(column > 0),
      arrowright: index + Number(column < size - 1),
      arrowup: Math.max(column, index - size),
      arrowdown: Math.min(size * (size - 1) + column, index + size),
      home: index - column,
      end: index - column + size - 1,
    };
    if (Object.hasOwn(targets, key)) {
      event.preventDefault();
      this.focusCell(targets[key]);
    } else if ([" ", "enter", "x", "delete", "backspace"].includes(key)) {
      event.preventDefault();
      if (this.won) return;
      const mark = key === "x" ? MARKS.cross :
        key === "delete" || key === "backspace" ? MARKS.erase : MARKS[this.tool];
      const before = [...this.board];
      this.applyMarks([index], this.board[index] === mark ? 0 : mark);
      this.commit(before);
    }
  };

  applyMarks(indices, mark) {
    const changed = indices.filter(index => this.board[index] !== mark);
    if (!changed.length) return;
    for (const index of changed) this.board[index] = mark;
    this.mistakes.clear();
    this.message = "";
    this.paint();
  }

  commit(before) {
    if (before.every((mark, index) => mark === this.board[index])) return;
    this.past.push(before);
    this.future = [];
    this.moves += 1;
    this.finishMove();
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
      this.load(this.puzzleIndex);
      this.message = "棋盘已重置。";
    } else if (action === "next") {
      this.load((this.puzzleIndex + 1) % PUZZLES.length);
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

  seconds() {
    return this.elapsed + (this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1000) : 0);
  }

  publish() {
    const elapsed = this.seconds();
    const detail = {
      size: this.puzzle.size,
      elapsed,
      moves: this.moves,
      tool: this.tool,
      canUndo: Boolean(this.past.length),
      canRedo: Boolean(this.future.length),
      won: this.won,
      filled: this.board.filter(mark => mark === 1).length,
      total: this.puzzle.solution.filter(Boolean).length,
      puzzleIndex: this.puzzleIndex,
      puzzleCount: PUZZLES.length,
      message: this.message,
    };
    if (!this.stroke) {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({
          puzzle: this.puzzle.id, board: this.board, past: this.past, future: this.future,
          moves: this.moves, elapsed, tool: this.tool,
        }));
      } catch {
        // Keep playing if persistent storage is unavailable.
      }
    }
    this.dispatchEvent(new CustomEvent("game-state", { bubbles: true, detail }));
  }
}

customElements.define("nonogram-game", NonogramGame);
