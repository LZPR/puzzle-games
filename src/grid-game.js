export const MARKS = { fill: 1, cross: 2, erase: 0 };
export const MARK_NAMES = ["空白", "已填充", "已标叉"];

export class GridGame extends HTMLElement {
  listenForGridInput() {
    this.addEventListener("pointerdown", this.startStroke);
    this.addEventListener("pointermove", this.moveStroke);
    this.addEventListener("pointerup", this.finishStroke);
    this.addEventListener("pointercancel", this.finishStroke);
    this.addEventListener("lostpointercapture", this.finishStroke);
    this.addEventListener("contextmenu", event => event.preventDefault());
    this.addEventListener("keydown", this.handleKey);
  }

  bindGrid() {
    this.grid = this.querySelector('[role="grid"]');
    this.cells = [...this.grid.querySelectorAll("[data-cell]")];
    this.strokeCount = this.querySelector(".ng-stroke-count");
    this.focusIndex = 0;
  }

  focusCell(index) {
    this.cells[this.focusIndex].tabIndex = -1;
    this.focusIndex = index;
    this.cells[index].tabIndex = 0;
    this.cells[index].focus({ preventScroll: true });
  }

  startStroke = event => {
    const cell = event.target.closest("[data-cell]");
    if (!cell || this.stroke || this.request || this.won || (event.button !== 0 && event.button !== 2)) return;
    event.preventDefault();
    const index = Number(cell.dataset.cell);
    const mark = event.button === 2 ? MARKS.cross : MARKS[this.tool];
    this.stroke = {
      pointer: event.pointerId,
      mark: this.board[index] === mark ? 0 : mark,
      start: index,
      x: event.clientX,
      y: event.clientY,
      axis: null,
      end: index,
      indices: [index],
    };
    this.focusCell(index);
    this.setPointerCapture(event.pointerId);
    this.paint();
  };

  moveStroke = event => {
    const stroke = this.stroke;
    if (stroke?.pointer !== event.pointerId) return;
    const size = this.puzzle.size;
    const rect = this.grid.getBoundingClientRect();
    const slot = (coordinate, origin, length) =>
      Math.min(size - 1, Math.max(0, Math.floor((coordinate - origin) * size / length)));
    const row = slot(event.clientY, rect.top, rect.height);
    const column = slot(event.clientX, rect.left, rect.width);
    const startRow = Math.floor(stroke.start / size);
    const startColumn = stroke.start % size;
    const axis = stroke.axis ?? (Math.abs(event.clientX - stroke.x) >= Math.abs(event.clientY - stroke.y) ? "row" : "column");
    const end = axis === "row" ? startRow * size + column : row * size + startColumn;
    if (end === stroke.end) return;

    stroke.axis = axis;
    stroke.end = end;
    const stride = axis === "row" ? 1 : size;
    const first = Math.min(stroke.start, end);
    const count = (Math.max(stroke.start, end) - first) / stride + 1;
    stroke.indices = Array.from({ length: count }, (_, offset) => first + offset * stride);
    this.strokeCount.hidden = count < 2;
    this.strokeCount.textContent = count > 1 ? `${count} 格` : "";
    this.paint();
  };

  finishStroke = event => {
    if (!this.stroke || (event && this.stroke.pointer !== event.pointerId)) return;
    const released = event?.type === "pointerup";
    if (released) this.moveStroke(event);
    const { indices, mark, pointer } = this.stroke;
    this.stroke = null;
    this.strokeCount.hidden = true;
    this.strokeCount.textContent = "";
    if (this.hasPointerCapture(pointer)) this.releasePointerCapture(pointer);
    if (!released) {
      this.paint();
      return;
    }
    const before = [...this.board];
    this.applyMarks(indices, mark);
    this.commit(before);
  };

  displayedBoard() {
    if (!this.stroke) return this.board;
    const preview = [...this.board];
    for (const index of this.stroke.indices) preview[index] = this.stroke.mark;
    return preview;
  }

  handleKey = event => {
    const cell = event.target.closest("[data-cell]");
    if (!cell || this.request || event.altKey) return;
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
      if (this.won || this.stroke) return;
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
    this.mistakes?.clear();
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

  seconds() {
    return (this.elapsed ?? 0) + (this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1000) : 0);
  }
}
