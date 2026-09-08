import { createDeck, shuffleDeck } from "./domino-data.js";
import { orientTile, hasAnyMove, blockedWinner } from "./game-logic.js";
import { createVisualPlacement, availableOrientations } from "./board-layout.js";

export function createDemoGame() {
  const deck = shuffleDeck(createDeck());
  return {
    code: "DEMO01",
    role: "p1",
    room: {
      status: "playing",
      players: {
        p1: { name: "Jogador 1", connected: true },
        p2: { name: "Jogador 2 (demo)", connected: true }
      },
      game: {
        hand1: deck.slice(0, 14), hand2: deck.slice(14), table: [], turn: "p1",
        consecutivePasses: 0, moveNumber: 0, winner: null, finishReason: null
      }
    }
  };
}

export function demoPlay(room, role, tileId, side, visualOrientation) {
  const handKey = role === "p1" ? "hand1" : "hand2";
  const hand = room.game[handKey];
  const index = hand.findIndex((tile) => tile.id === tileId);
  if (index < 0) throw new Error("Peça não encontrada.");
  if (!["horizontal", "vertical"].includes(visualOrientation)) {
    throw new Error("Escolha a orientação da peça.");
  }

  const table = room.game.table || [];
  const safeSide = table.length ? (side === "left" ? "left" : "right") : "right";
  const tile = orientTile(hand[index], table, safeSide);
  const visual = createVisualPlacement(table, safeSide, visualOrientation);
  if (!visual) throw new Error("Essa orientação não cabe fisicamente nessa ponta da mesa.");

  tile.visual = visual;
  tile.playedBy = role;
  tile.move = ++room.game.moveNumber;
  room.game[handKey] = hand.filter((_, i) => i !== index);
  if (safeSide === "left" && table.length) room.game.table.unshift(tile);
  else room.game.table.push(tile);
  room.game.consecutivePasses = 0;

  if (!room.game[handKey].length) {
    room.game.winner = role;
    room.game.finishReason = "empty-hand";
    room.status = "finished";
  } else room.game.turn = role === "p1" ? "p2" : "p1";
}

export function demoPass(room, role) {
  const hand = role === "p1" ? room.game.hand1 : room.game.hand2;
  if (hasAnyMove(hand, room.game.table)) {
    throw new Error("Ainda existe pelo menos uma jogada válida. Observe novamente as equivalências.");
  }
  room.game.consecutivePasses += 1;
  if (room.game.consecutivePasses >= 2) {
    room.game.winner = blockedWinner(room.game.hand1, room.game.hand2);
    room.game.finishReason = "blocked";
    room.status = "finished";
  } else room.game.turn = role === "p1" ? "p2" : "p1";
}

/** Jogada automática simples do oponente no modo demonstração. */
export function demoOpponentTurn(room) {
  if (room.status !== "playing" || room.game.turn !== "p2") return;
  const hand = room.game.hand2;
  const table = room.game.table || [];
  const sides = table.length ? ["left", "right"] : ["right"];

  for (const tile of hand) {
    for (const side of sides) {
      for (const orientation of availableOrientations(table, side)) {
        try {
          demoPlay(room, "p2", tile.id, side, orientation);
          return;
        } catch (_) { /* tenta outra combinação */ }
      }
    }
  }
  demoPass(room, "p2");
}
