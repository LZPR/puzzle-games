import { litsNeighbors, litsShape } from "./lits-rules.js";

const catalogs = new Map();
const sizes = [6, 8];
const difficulties = ["normal", "hard"];
// A branch is a search step with more than one remaining placement for the
// most constrained region. Hard boards need at least four such steps.
const hardBranchThreshold = 4;

// Certified starting layouts let generation vary region boundaries even when
// growing a new connected solution happens to yield too many alternatives.
const startingLayouts = {
  6: {
    normal: `
000000000200000222111242313244333334
333311441112401122400022400000444400
003333500313511112514112514412544222
333332344432334422300021001221011111
033333000444010004114444122554222255
111144130044133004132004522222555555
111000441002411002411002400002333333
333055340055441055411022441002441002`,
    hard: `
222222444121543111543110543300553300
111000211000222300242330244430443330
000000300111333121313121411122444442
444444400000211105211155233355222333
333344134444133004100044102000002222
233311232331222011020014000114444444
311111331112341022440024400024444444
344444330004330114000011002000022200`,
  },
  8: {
    normal: `
6663355564433533144433331112332371122229700009997070088977778899
8888999984999979445557794555279905112773051223330511222201166662
3307778630027786300228863111255631122566314225563442955634999956
aa777999a6667799a6622755a362244533222445310004883111000833118888
4444999947744969774449662774116322211333822033358800335588003335
8877771588877115448811554448005522220555922200659933306599930066
9999666095966000959611015557111184577771844333728844437288333322
6655888766588877645441176444110744442009433320994232200922222299`,
    hard: `
9977488897744438979933389993355509233355002222660111122601166666
7773000177331001733111115551222295111242956444489966648896664448
6773333367733223675541226775411266554111655544405589940088889900
7770002275500222755500885511100851133088663334446333449963344999
9991233391112388111224881162244800662444077666550777655500077777
0888888400002244111022241511226415511366555333365755939957779999
88866666488667774446027754000222500999235511192351111993aaaa1933
3332288893924884999244449911455591155557900557779066667690000666`,
  },
};

function seededRandom(seed) {
  let state = 2166136261;
  for (const character of String(seed)) state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(items, random) {
  return items[Math.floor(random() * items.length)];
}

function getCatalog(size) {
  if (catalogs.has(size)) return catalogs.get(size);
  const neighbors = litsNeighbors(size);
  const bits = neighbors.map((_, cell) => 1n << BigInt(cell));
  const squares = [];
  for (let row = 0; row < size - 1; row += 1) {
    for (let column = 0; column < size - 1; column += 1) {
      const cell = row * size + column;
      squares.push(bits[cell] | bits[cell + 1] | bits[cell + size] | bits[cell + size + 1]);
    }
  }

  // Grow and deduplicate every connected placement of four cells.
  let groups = bits.map((mask, cell) => [mask, [cell]]);
  for (let count = 1; count < 4; count += 1) {
    const next = new Map();
    for (const [mask, cells] of groups) {
      for (const cell of cells) {
        for (const neighbor of neighbors[cell]) {
          if (mask & bits[neighbor]) continue;
          const expanded = mask | bits[neighbor];
          if (!next.has(expanded)) next.set(expanded, [...cells, neighbor]);
        }
      }
    }
    groups = next;
  }

  const placements = [];
  for (const [mask, cells] of groups) {
    const shape = litsShape(cells, size, neighbors);
    if (!shape) continue;
    let border = 0n;
    for (const cell of cells) {
      for (const neighbor of neighbors[cell]) border |= bits[neighbor];
    }
    placements.push({ mask, cells, shape, border: border & ~mask, squares: squares.filter(square => square & mask) });
  }
  const atCell = neighbors.map((_, cell) => placements.filter(piece => piece.mask & bits[cell]));
  const catalog = { neighbors, bits, placements, atCell };
  catalogs.set(size, catalog);
  return catalog;
}

function formsSquare(piece, filled) {
  const combined = piece.mask | filled;
  return piece.squares.some(square => (square & combined) === square);
}

function partitionsFor(size, random, difficulty) {
  const { neighbors, placements, bits, atCell } = getCatalog(size);
  const regions = Array(size ** 2).fill(-1);
  const solution = Array(size ** 2).fill(0);
  const shapes = { L: 0n, I: 0n, T: 0n, S: 0n };
  let filled = 0n;
  const target = size === 6 ? 6 : 11;
  const masks = [];
  let count = 0;
  for (; count < target; count += 1) {
    const options = placements.filter(piece => !(piece.mask & filled) &&
      (!filled || (filled & piece.border)) &&
      !(piece.border & shapes[piece.shape]) && !formsSquare(piece, filled));
    if (!options.length) break;
    const piece = pick(options, random);
    masks.push(piece.mask);
    filled |= piece.mask;
    shapes[piece.shape] |= piece.mask;
    for (const cell of piece.cells) {
      regions[cell] = count;
      solution[cell] = 1;
    }
  }
  if (count < target - 1) return null;

  // Grow each region from its shaded tetromino. Favor cells that introduce
  // fewer alternate placements, with more variation on hard boards.
  const counts = Array(count).fill(4);
  const frontier = new Map();
  function addFrontier(cell, region) {
    for (const neighbor of neighbors[cell]) {
      if (regions[neighbor] === -1) frontier.set(neighbor * count + region, [neighbor, region]);
    }
  }
  for (let cell = 0; cell < regions.length; cell += 1) {
    if (regions[cell] !== -1) addFrontier(cell, regions[cell]);
  }
  while (frontier.size) {
    let best;
    let bestScore = Infinity;
    for (const [cell, region] of frontier.values()) {
      const mask = masks[region] | bits[cell];
      const newCandidates = atCell[cell].filter(piece => (piece.mask & mask) === piece.mask).length;
      const score = newCandidates + counts[region] * 0.15 + random() * (difficulty === "normal" ? 2 : 4);
      if (score < bestScore) {
        best = [cell, region, mask];
        bestScore = score;
      }
    }
    const [cell, region, mask] = best;
    for (let other = 0; other < count; other += 1) frontier.delete(cell * count + other);
    regions[cell] = region;
    masks[region] = mask;
    counts[region] += 1;
    addFrontier(cell, region);
  }
  return { regions, solution };
}

function isConnected(filled, bits, neighbors) {
  if (!filled) return false;
  const first = bits.findIndex(bit => bit & filled);
  const queue = [first];
  let reachable = bits[first];
  for (const cell of queue) {
    for (const neighbor of neighbors[cell]) {
      const bit = bits[neighbor];
      if ((filled & bit) && !(reachable & bit)) {
        reachable |= bit;
        queue.push(neighbor);
      }
    }
  }
  return reachable === filled;
}

export function solveLits(regions, size, limit = 2) {
  const { placements, bits, neighbors } = getCatalog(size);
  const byRegion = new Map([...new Set(regions)].map(region => [region, []]));
  for (const piece of placements) {
    const region = regions[piece.cells[0]];
    if (piece.cells.every(cell => regions[cell] === region)) byRegion.get(region).push(piece);
  }

  const solutions = [];
  let branches = 0;
  function search(domains, filled, shapes) {
    if (!domains.length) {
      if (isConnected(filled, bits, neighbors)) {
        solutions.push(bits.map(bit => Number(Boolean(filled & bit))));
      }
      return;
    }

    let smallest = 0;
    const viable = domains.map(domain => domain.filter(piece =>
      !(piece.border & (shapes[piece.shape] ?? 0n)) && !formsSquare(piece, filled)));
    if (viable.some(domain => !domain.length)) return;
    const possible = viable.map(domain => domain.reduce((mask, piece) => mask | piece.mask, 0n));
    let allPossible = filled;
    for (const mask of possible) allPossible |= mask;
    if (filled || viable.length > 1) {
      for (let index = 0; index < viable.length; index += 1) {
        const outside = allPossible & ~possible[index];
        viable[index] = viable[index].filter(piece => piece.border & outside);
        if (!viable[index].length) return;
      }
    }
    for (let index = 1; index < viable.length; index += 1) {
      if (viable[index].length < viable[smallest].length) smallest = index;
    }
    const [choices] = viable.splice(smallest, 1);
    if (choices.length > 1) branches += 1;
    for (const piece of choices) {
      const nextShapes = { ...shapes, [piece.shape]: (shapes[piece.shape] ?? 0n) | piece.mask };
      search(viable, filled | piece.mask, nextShapes);
      if (solutions.length === limit) break;
    }
  }
  search([...byRegion.values()], 0n, {});
  return { solutions, branches };
}

function moveBoundary(regions, size, random, canMove) {
  const { neighbors, bits } = getCatalog(size);
  const candidates = [];
  const masks = new Map();
  for (let cell = 0; cell < regions.length; cell += 1) {
    const region = regions[cell];
    masks.set(region, (masks.get(region) ?? 0n) | bits[cell]);
  }
  for (let cell = 0; cell < regions.length; cell += 1) {
    if (!canMove(cell)) continue;
    const from = regions[cell];
    const touching = new Set(neighbors[cell].map(neighbor => regions[neighbor]));
    touching.delete(from);
    if (!touching.size || !isConnected(masks.get(from) ^ bits[cell], bits, neighbors)) continue;
    for (const to of touching) candidates.push([cell, to]);
  }
  if (!candidates.length) return null;
  const [cell, to] = pick(candidates, random);
  const moved = regions.slice();
  moved[cell] = to;
  return moved;
}

function matchesDifficulty(result, difficulty) {
  const hard = result.branches >= hardBranchThreshold;
  return result.solutions.length === 1 && hard === (difficulty === "hard");
}

function varyLayout(size, difficulty, random) {
  const encoded = pick(startingLayouts[size][difficulty].trim().split("\n"), random);
  let regions = Array.from(encoded, digit => parseInt(digit, 16));
  let result = solveLits(regions, size);
  if (!matchesDifficulty(result, difficulty)) throw new Error("无法验证初始棋盘。");
  for (let step = 0; step < 24; step += 1) {
    const moved = moveBoundary(regions, size, random, () => true);
    if (!moved) break;
    const next = solveLits(moved, size);
    if (!matchesDifficulty(next, difficulty)) continue;
    regions = moved;
    result = next;
  }
  return { regions, solution: result.solutions[0] };
}

function orientLayout(puzzle, size, random) {
  const rotate = Math.floor(random() * 4);
  const mirror = random() < 0.5;
  const regionIds = new Map();
  const regions = [];
  const solution = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      let y = row;
      let x = mirror ? size - column - 1 : column;
      for (let turn = 0; turn < rotate; turn += 1) [y, x] = [x, size - y - 1];
      const source = y * size + x;
      const region = puzzle.regions[source];
      if (!regionIds.has(region)) regionIds.set(region, regionIds.size);
      regions.push(regionIds.get(region));
      solution.push(puzzle.solution[source]);
    }
  }
  return { regions, solution };
}

export function generateLits(size, difficulty, seed = Math.floor(Math.random() * 2 ** 32)) {
  if (!sizes.includes(size) || !difficulties.includes(difficulty)) throw new Error("不支持此棋盘设置。");
  const random = seededRandom(seed);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const puzzle = partitionsFor(size, random, difficulty);
    if (!puzzle) continue;
    const { solution } = puzzle;
    let { regions } = puzzle;
    let result = solveLits(regions, size, 12);
    for (let step = 0; step < 24; step += 1) {
      if (matchesDifficulty(result, difficulty)) {
        const oriented = orientLayout({ regions, solution }, size, random);
        if (matchesDifficulty(solveLits(oriented.regions, size), difficulty)) {
          return { size, difficulty, ...oriented, seed };
        }
      }
      const alternatives = result.solutions.filter(candidate => candidate.some((cell, index) => cell !== solution[index]));
      const alternate = pick(alternatives, random);
      const moved = moveBoundary(regions, size, random, cell => !solution[cell] && (!alternate || alternate[cell])) ??
        moveBoundary(regions, size, random, cell => !solution[cell]);
      if (!moved) break;
      const next = solveLits(moved, size, 12);
      if (next.solutions.length <= result.solutions.length || random() < 0.12) {
        regions = moved;
        result = next;
      }
    }
  }
  const varied = varyLayout(size, difficulty, random);
  const oriented = orientLayout(varied, size, random);
  const puzzle = matchesDifficulty(solveLits(oriented.regions, size), difficulty) ? oriented : varied;
  return { size, difficulty, ...puzzle, seed };
}
