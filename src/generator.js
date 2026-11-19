const SIZES = [5, 10, 15];
const DIFFICULTIES = ["easy", "medium", "hard"];
const ATTEMPT_LIMIT = 400;
const RECENT_LIMIT = 128;
const domainTables = new Map();
const recentPuzzles = new Map();

function clueKey(mask) {
  let key = 0;
  let streak = 0;
  while (mask) {
    if (mask & 1) {
      streak += 1;
    } else if (streak) {
      key = (key << 4) | streak;
      streak = 0;
    }
    mask >>>= 1;
  }
  return streak ? (key << 4) | streak : key;
}

function domainsFor(size) {
  if (!domainTables.has(size)) {
    const table = new Map();
    for (let mask = 0; mask < 1 << size; mask += 1) {
      const key = clueKey(mask);
      if (!table.has(key)) table.set(key, []);
      table.get(key).push(mask);
    }
    domainTables.set(size, table);
  }
  return domainTables.get(size);
}

function transpose(rows, size) {
  const columns = Array(size).fill(0);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      columns[column] |= ((rows[row] >>> column) & 1) << row;
    }
  }
  return columns;
}

function deductionRounds(rows, size, domains) {
  const full = (1 << size) - 1;
  const rowDomains = rows.map(mask => domains.get(clueKey(mask)));
  const columnDomains = transpose(rows, size).map(mask => domains.get(clueKey(mask)));
  let rowFills = Array(size).fill(0);
  let rowBlanks = Array(size).fill(0);

  // One round applies all row and column deductions against the same board.
  // A cell becomes known only when every compatible line placement agrees.
  for (let round = 1; ; round += 1) {
    const nextFills = rowFills.slice();
    const nextBlanks = rowBlanks.slice();
    const columnFills = transpose(rowFills, size);
    const columnBlanks = transpose(rowBlanks, size);
    for (let index = 0; index < size; index += 1) {
      let allFills = full;
      let anyFill = 0;
      for (const mask of rowDomains[index]) {
        if ((mask & rowFills[index]) !== rowFills[index] || (mask & rowBlanks[index])) continue;
        allFills &= mask;
        anyFill |= mask;
      }
      nextFills[index] |= allFills;
      nextBlanks[index] |= full ^ anyFill;

      allFills = full;
      anyFill = 0;
      for (const mask of columnDomains[index]) {
        if ((mask & columnFills[index]) !== columnFills[index] || (mask & columnBlanks[index])) continue;
        allFills &= mask;
        anyFill |= mask;
      }
      for (let row = 0; row < size; row += 1) {
        nextFills[row] |= ((allFills >>> row) & 1) << index;
        nextBlanks[row] |= (((full ^ anyFill) >>> row) & 1) << index;
      }
    }
    // The sampled solution is always in the domains. If deductions settle
    // every cell, any solution to the clues must agree with that sample.
    if (nextFills.every((mask, row) => (mask | nextBlanks[row]) === full)) return round;
    if (nextFills.every((mask, row) => mask === rowFills[row] && nextBlanks[row] === rowBlanks[row])) return null;
    rowFills = nextFills;
    rowBlanks = nextBlanks;
  }
}

function randomRows(size, random) {
  const density = 0.41 + random() * 0.39;
  let filled = 0;
  const rows = [];
  for (let row = 0; row < size; row += 1) {
    let mask = 0;
    for (let column = 0; column < size; column += 1) {
      if (random() < density) {
        mask |= 1 << column;
        filled += 1;
      }
    }
    rows.push(mask);
  }
  return filled < size || filled > size * (size - 1) ? null : rows;
}

// Counts the propagation chain a player has to follow. Larger grids need
// their own cutoffs because more clues can interact before they stabilize.
const roundLimits = {
  5: [2, 4],
  10: [3, 6],
  15: [4, 8],
};

export function generatePuzzle(size, difficulty, random = Math.random) {
  if (!SIZES.includes(size) || !DIFFICULTIES.includes(difficulty)) {
    throw new RangeError("Unsupported nonogram size or difficulty");
  }
  const domains = domainsFor(size);
  const [easyMax, mediumMax] = roundLimits[size];
  const group = `${size}-${difficulty}`;
  const recent = recentPuzzles.get(group) ?? [];
  recentPuzzles.set(group, recent);
  for (let attempt = 0; attempt < ATTEMPT_LIMIT; attempt += 1) {
    const rows = randomRows(size, random);
    if (!rows) continue;
    const rounds = deductionRounds(rows, size, domains);
    if (rounds === null) continue;
    const rating = rounds <= easyMax ? "easy" : rounds <= mediumMax ? "medium" : "hard";
    if (difficulty !== rating) continue;
    const id = `random-${size}-${rows.map(mask => mask.toString(36)).join("-")}`;
    if (recent.includes(id)) continue;
    recent.push(id);
    if (recent.length > RECENT_LIMIT) recent.shift();
    return {
      id,
      size,
      difficulty,
      rounds,
      solution: rows.flatMap(mask => Array.from({ length: size }, (_, column) => (mask >>> column) & 1)),
    };
  }
  throw new Error("Could not generate a nonogram within the attempt limit");
}
