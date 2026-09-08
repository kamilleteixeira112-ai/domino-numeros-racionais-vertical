import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { getDatabase, ref, get, set, update, onValue, onDisconnect, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";
import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";
import { createDeck, shuffleDeck } from "./domino-data.js";
import { hasAnyMove, orientTile, blockedWinner } from "./game-logic.js";

let app;
let auth;
let db;
let currentUid = null;

function assertConfigured() {
  if (!isFirebaseConfigured()) throw new Error("Firebase ainda não foi configurado neste projeto.");
}

export async function initializeFirebase() {
  assertConfigured();
  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);
  }
  if (!auth.currentUser) await signInAnonymously(auth);
  currentUid = auth.currentUser.uid;
  return currentUid;
}

export function isOnlineBackendReady() { return isFirebaseConfigured(); }

export function generateRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function roomRef(code) { return ref(db, `rooms/${code}`); }
function gameRef(code) { return ref(db, `rooms/${code}/game`); }
function playerRef(code, role) { return ref(db, `rooms/${code}/players/${role}`); }

function newGameState() {
  const deck = shuffleDeck(createDeck());
  return {
    hand1: deck.slice(0, 14), hand2: deck.slice(14), table: [], turn: "p1",
    consecutivePasses: 0, moveNumber: 0, winner: null, finishReason: null
  };
}

export async function createRoom() {
  const uid = await initializeFirebase();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateRoomCode();
    const target = roomRef(code);
    if ((await get(target)).exists()) continue;
    await set(target, {
      version: 2,
      createdAt: Date.now(),
      expiresAt: Date.now() + 4 * 60 * 60 * 1000,
      status: "waiting",
      players: { p1: { uid, name: "Jogador 1", connected: true, joinedAt: Date.now() } },
      game: newGameState()
    });
    await configurePresence(code, "p1");
    return { code, role: "p1", uid };
  }
  throw new Error("Não foi possível gerar uma sala. Tente novamente.");
}

export async function joinRoom(code) {
  const uid = await initializeFirebase();
  const normalized = code.trim().toUpperCase();
  const target = roomRef(normalized);
  const initialSnapshot = await get(target);
  if (!initialSnapshot.exists()) throw new Error("Sala não encontrada. Confira o código.");

  const initialRoom = initialSnapshot.val();
  if (initialRoom.expiresAt && initialRoom.expiresAt < Date.now()) throw new Error("Esta sala expirou.");
  if (initialRoom.players?.p1?.uid === uid) {
    await configurePresence(normalized, "p1");
    return { code: normalized, role: "p1", uid };
  }
  if (initialRoom.players?.p2?.uid === uid) {
    await configurePresence(normalized, "p2");
    return { code: normalized, role: "p2", uid };
  }

  let occupiedByAnotherPlayer = false;
  const p2Target = playerRef(normalized, "p2");
  const player2 = { uid, name: "Jogador 2", connected: true, joinedAt: Date.now() };
  const claimResult = await runTransaction(p2Target, (currentPlayer) => {
    if (currentPlayer && currentPlayer.uid !== uid) {
      occupiedByAnotherPlayer = true;
      return;
    }
    if (currentPlayer?.uid === uid) return currentPlayer;
    return player2;
  }, { applyLocally: false });

  if (!claimResult.committed) {
    if (occupiedByAnotherPlayer) throw new Error("A sala já possui dois jogadores.");
    throw new Error("Não foi possível reservar a vaga do Jogador 2. Tente novamente.");
  }

  await update(target, { status: "playing" });
  await configurePresence(normalized, "p2");
  return { code: normalized, role: "p2", uid };
}

async function configurePresence(code, role) {
  const presence = playerRef(code, role);
  await update(presence, { connected: true, lastSeenAt: serverTimestamp() });
  await onDisconnect(presence).update({ connected: false, lastSeenAt: serverTimestamp() });
}

export function subscribeRoom(code, callback, onError) {
  return onValue(roomRef(code), (snapshot) => callback(snapshot.val()), onError);
}

export async function markConnected(code, role) {
  if (!db || !code || !role) return;
  await update(playerRef(code, role), { connected: true, lastSeenAt: serverTimestamp() });
}

export async function markDisconnected(code, role) {
  if (!db || !code || !role) return;
  await update(playerRef(code, role), { connected: false, lastSeenAt: serverTimestamp() });
}

async function readPlayableRoom(code, role) {
  const snapshot = await get(roomRef(code));
  if (!snapshot.exists()) throw new Error("A sala não está mais disponível.");
  const room = snapshot.val();
  if (room.players?.[role]?.uid !== currentUid) throw new Error("Este navegador não corresponde ao jogador da sala.");
  return room;
}

export async function playTile(code, role, tileId, side) {
  const room = await readPlayableRoom(code, role);
  if (room.status !== "playing") throw new Error("A partida não está disponível para jogar.");
  if (room.game.turn !== role) throw new Error("Ainda não é a sua vez.");

  const handKey = role === "p1" ? "hand1" : "hand2";
  const hand = room.game[handKey] || [];
  const tileIndex = hand.findIndex((tile) => tile.id === tileId);
  if (tileIndex < 0) throw new Error("A peça selecionada não está mais na sua mão.");

  const oriented = orientTile(hand[tileIndex], room.game.table || [], side);
  oriented.playedBy = role;
  oriented.move = (room.game.moveNumber || 0) + 1;

  const nextGame = {
    ...room.game,
    [handKey]: hand.filter((_, index) => index !== tileIndex),
    table: [...(room.game.table || [])],
    moveNumber: oriented.move,
    consecutivePasses: 0
  };

  if (side === "left" && nextGame.table.length) nextGame.table.unshift(oriented);
  else nextGame.table.push(oriented);

  if (nextGame[handKey].length === 0) {
    nextGame.winner = role;
    nextGame.finishReason = "empty-hand";
    await set(gameRef(code), nextGame);
    await update(roomRef(code), { status: "finished" });
  } else {
    nextGame.turn = role === "p1" ? "p2" : "p1";
    await set(gameRef(code), nextGame);
  }
}

export async function passTurn(code, role) {
  const room = await readPlayableRoom(code, role);
  if (room.status !== "playing") throw new Error("A partida não está disponível.");
  if (room.game.turn !== role) throw new Error("Não é possível passar a vez agora.");

  const hand = role === "p1" ? (room.game.hand1 || []) : (room.game.hand2 || []);
  if (hasAnyMove(hand, room.game.table || [])) throw new Error("Você ainda possui pelo menos uma jogada válida.");

  const nextGame = { ...room.game, consecutivePasses: (room.game.consecutivePasses || 0) + 1 };
  if (nextGame.consecutivePasses >= 2) {
    nextGame.winner = blockedWinner(nextGame.hand1 || [], nextGame.hand2 || []);
    nextGame.finishReason = "blocked";
    await set(gameRef(code), nextGame);
    await update(roomRef(code), { status: "finished" });
  } else {
    nextGame.turn = role === "p1" ? "p2" : "p1";
    await set(gameRef(code), nextGame);
  }
}

/** Registra desistência explícita. Desconexão de rede, sozinha, não causa derrota. */
export async function resignGame(code, role) {
  const room = await readPlayableRoom(code, role);
  if (room.status !== "playing" || !room.players?.p1 || !room.players?.p2) return;

  const winner = role === "p1" ? "p2" : "p1";
  const nextGame = {
    ...room.game,
    winner,
    finishReason: "resignation",
    resignedBy: role
  };
  await set(gameRef(code), nextGame);
  await update(roomRef(code), { status: "finished" });
  await markDisconnected(code, role);
}

export async function restartGame(code, role) {
  if (role !== "p1") throw new Error("Somente o Jogador 1 pode iniciar uma nova rodada.");
  const room = await readPlayableRoom(code, role);
  if (!room.players?.p2) throw new Error("O segundo jogador ainda não entrou.");
  await set(gameRef(code), newGameState());
  await update(roomRef(code), { status: "playing", expiresAt: Date.now() + 4 * 60 * 60 * 1000 });
}
