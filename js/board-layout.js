/**
 * Geometria visual da mesa de dominó.
 *
 * A lógica matemática continua sendo uma lista linear. Cada peça jogada recebe
 * metadados `visual` com a posição de suas metades na grade. Assim a escolha
 * horizontal/vertical do aluno fica sincronizada entre os dois aparelhos sem
 * interferir na equivalência entre frações e decimais.
 */

const AXIS = {
  horizontal: [{ x: 1, y: 0 }, { x: -1, y: 0 }],
  vertical: [{ x: 0, y: 1 }, { x: 0, y: -1 }]
};

function key(cell) { return `${cell.x},${cell.y}`; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
function vector(from, to) { return { x: to.x - from.x, y: to.y - from.y }; }
function axisOf(v) { return v.x !== 0 ? "horizontal" : "vertical"; }

/** Fallback para salas abertas antes da versão com orientação escolhida. */
export function visualForTile(tile, index = 0) {
  if (tile?.visual?.left && tile?.visual?.right) return tile.visual;
  return {
    orientation: "horizontal",
    left: { x: index * 2, y: 0 },
    right: { x: index * 2 + 1, y: 0 }
  };
}

function occupiedCells(table) {
  const cells = new Set();
  table.forEach((tile, index) => {
    const visual = visualForTile(tile, index);
    cells.add(key(visual.left));
    cells.add(key(visual.right));
  });
  return cells;
}

function allCells(table, extra = []) {
  const cells = [];
  table.forEach((tile, index) => {
    const visual = visualForTile(tile, index);
    cells.push(visual.left, visual.right);
  });
  cells.push(...extra);
  return cells;
}

function bounds(cells) {
  if (!cells.length) return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 1, height: 1 };
  const xs = cells.map((cell) => cell.x);
  const ys = cells.map((cell) => cell.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function candidateScore(table, cells) {
  const current = bounds(allCells(table));
  const next = bounds(allCells(table, cells));
  const currentCenter = { x: (current.minX + current.maxX) / 2, y: (current.minY + current.maxY) / 2 };
  const tip = cells[cells.length - 1];
  const outwardDistance = Math.abs(tip.x - currentCenter.x) + Math.abs(tip.y - currentCenter.y);
  // Prefere crescer para fora da corrente e, em empate, usar menos área.
  return outwardDistance * 100 - next.width * next.height;
}

/**
 * Calcula a posição física da próxima peça sem validar a matemática da jogada.
 * Retorna null quando a orientação escolhida não cabe fisicamente naquela ponta.
 */
export function createVisualPlacement(table, side, orientation) {
  if (!AXIS[orientation]) return null;

  if (!table?.length) {
    return orientation === "horizontal"
      ? { orientation, left: { x: 0, y: 0 }, right: { x: 1, y: 0 } }
      : { orientation, left: { x: 0, y: 0 }, right: { x: 0, y: 1 } };
  }

  const safeSide = side === "left" ? "left" : "right";
  const firstVisual = visualForTile(table[0], 0);
  const lastVisual = visualForTile(table[table.length - 1], table.length - 1);
  const endCell = safeSide === "right" ? lastVisual.right : firstVisual.left;
  const outward = safeSide === "right"
    ? vector(lastVisual.left, lastVisual.right)
    : vector(firstVisual.right, firstVisual.left);

  const connectingCell = add(endCell, outward);
  const occupied = occupiedCells(table);
  if (occupied.has(key(connectingCell))) return null;

  let extensionVectors;
  if (axisOf(outward) === orientation) {
    extensionVectors = [outward];
  } else {
    extensionVectors = AXIS[orientation];
  }

  const candidates = extensionVectors
    .map((direction) => {
      const outerCell = add(connectingCell, direction);
      if (occupied.has(key(outerCell))) return null;

      const visual = safeSide === "right"
        ? { orientation, left: connectingCell, right: outerCell }
        : { orientation, left: outerCell, right: connectingCell };

      return { visual, score: candidateScore(table, [connectingCell, outerCell]) };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.visual || null;
}

/** Orientações fisicamente possíveis na ponta escolhida. */
export function availableOrientations(table, side) {
  return ["horizontal", "vertical"].filter((orientation) => Boolean(createVisualPlacement(table, side, orientation)));
}

/** Métricas para deslocar coordenadas negativas e montar a grade CSS. */
export function boardMetrics(table) {
  const cells = allCells(table || []);
  const box = bounds(cells);
  return {
    ...box,
    offsetX: -box.minX,
    offsetY: -box.minY,
    columns: Math.max(1, box.width),
    rows: Math.max(1, box.height)
  };
}
