/**
 * Layout visual em "serpentina" para até 28 peças.
 *
 * A regra matemática continua sendo uma lista linear. Este módulo cuida apenas
 * de transformar essa lista em uma mesa visual com trechos horizontais e
 * conectores verticais, aproximando o jogo digital de um dominó físico.
 *
 * Cada metade de uma peça ocupa uma célula da grade. Trechos horizontais usam
 * duas células lado a lado; nas curvas usamos uma peça vertical com duas
 * células empilhadas. Assim os encaixes permanecem visualmente contíguos.
 */
const ROWS = [0, 2, 4, 6, 8];
const HORIZONTAL_PER_ROW = 5;

export function boardPlacement(index) {
  let remaining = index;

  for (let rowIndex = 0; rowIndex < ROWS.length; rowIndex += 1) {
    const y = ROWS[rowIndex];
    const movingRight = rowIndex % 2 === 0;
    const hasTurnAfterRow = rowIndex < ROWS.length - 1;

    if (remaining < HORIZONTAL_PER_ROW) {
      const i = remaining;
      return movingRight
        ? { x: i * 2, y, orientation: "horizontal", direction: "right" }
        : { x: 9 - i * 2, y, orientation: "horizontal", direction: "left" };
    }

    remaining -= HORIZONTAL_PER_ROW;

    if (hasTurnAfterRow) {
      if (remaining === 0) {
        return {
          x: movingRight ? 10 : 0,
          y,
          orientation: "vertical",
          direction: "down"
        };
      }
      remaining -= 1;
    }
  }

  return { x: 0, y: 8, orientation: "horizontal", direction: "right" };
}

export function boardDimensions(tileCount) {
  if (!tileCount) return { columns: 11, rows: 1 };
  const last = boardPlacement(tileCount - 1);
  return {
    columns: 11,
    rows: last.y + (last.orientation === "vertical" ? 2 : 1)
  };
}
