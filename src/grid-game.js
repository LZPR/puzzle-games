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
