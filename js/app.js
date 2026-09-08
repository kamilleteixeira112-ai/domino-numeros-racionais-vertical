import {
  isOnlineBackendReady, createRoom, joinRoom, subscribeRoom, playTile,
  passTurn, restartGame, resignGame, markConnected, markDisconnected
} from "./firebase-service.js";
import { canPlayTile, validSides, hasAnyMove } from "./game-logic.js";
import { createDemoGame, demoPlay, demoPass, demoOpponentTurn } from "./demo-service.js";
import { boardPlacement, boardDimensions } from "./board-layout.js";

const $ = (id) => document.getElementById(id);
const els = {
  setup: $("setup-screen"), game: $("game-screen"), warning: $("configuration-warning"),
  create: $("create-room-btn"), join: $("join-room-btn"), input: $("room-code-input"), demo: $("demo-mode-btn"),
  roomCode: $("room-code-display"), copyCode: $("copy-code-btn"), leave: $("leave-room-btn"),
  p1Name: $("p1-name"), p2Name: $("p2-name"), p1You: $("p1-you"), p2You: $("p2-you"),
  p1Presence: $("p1-presence"), p2Presence: $("p2-presence"), status: $("status-banner"),
  scoreP1: $("score-p1"), scoreP2: $("score-p2"), tableCount: $("table-count"), turn: $("turn-label"),
  hint: $("hint-btn"), rules: $("rules-btn"), pass: $("pass-btn"),
  tableEmpty: $("table-empty"), chain: $("domino-chain"), hand: $("hand-area"),
  left: $("play-left-btn"), right: $("play-right-btn"), teacherNote: $("teacher-note"),
  messageDialog: $("message-dialog"), messageTitle: $("message-title"), messageBody: $("message-body"),
  rulesDialog: $("rules-dialog"), leaveDialog: $("leave-dialog"), confirmResign: $("confirm-resign-btn"),
  resultDialog: $("result-dialog"), resultIcon: $("result-icon"), resultTitle: $("result-title"),
  resultBody: $("result-body"), resultSummary: $("result-summary"), resultRestart: $("result-restart-btn"),
  confetti: $("confetti-layer")
};

let state = {
  code: null, role: null, uid: null, room: null, unsubscribe: null,
  selectedTileId: null, demoMode: false, busy: false,
  announcedResultKey: null, suppressResult: false
};

function showMessage(title, message) {
  els.messageTitle.textContent = title;
  els.messageBody.textContent = message;
  els.messageDialog.showModal();
}

function setBusy(busy) {
  state.busy = busy;
  els.create.disabled = busy;
  els.join.disabled = busy;
}

function normalizeCode(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function showGame() {
  els.setup.classList.add("hidden");
  els.game.classList.remove("hidden");
}

function showSetup() {
  els.game.classList.add("hidden");
  els.setup.classList.remove("hidden");
}

function currentHand(room = state.room) {
  if (!room || !state.role) return [];
  return state.role === "p1" ? (room.game.hand1 || []) : (room.game.hand2 || []);
}

function createHalf(label) {
  const half = document.createElement("div");
  half.className = "half";
  half.textContent = label;
  return half;
}

/** Renderiza uma peça da mão ou da mesa. Na mesa a direção pode inverter a leitura visual. */
function renderTile(tile, { selected = false, playable = true, played = false, placement = null } = {}) {
  const el = document.createElement("div");
  el.className = `domino ${played ? "played" : "selectable"} ${selected ? "selected" : ""} ${playable ? "" : "disabled"}`.trim();
  el.dataset.tileId = tile.id;

  let firstLabel = tile.leftLabel;
  let secondLabel = tile.rightLabel;
  if (placement?.direction === "left") {
    firstLabel = tile.rightLabel;
    secondLabel = tile.leftLabel;
  }

  el.append(createHalf(firstLabel), createHalf(secondLabel));

  if (placement) {
    el.classList.add("board-tile", placement.orientation, `direction-${placement.direction}`);
    el.style.gridColumn = `${placement.x + 1} / span ${placement.orientation === "horizontal" ? 2 : 1}`;
    el.style.gridRow = `${placement.y + 1} / span ${placement.orientation === "vertical" ? 2 : 1}`;
  }

  return el;
}

function statusText(room) {
  if (!room) return "Sala indisponível.";
  if (room.status === "waiting") return "Envie o código ao segundo jogador.";
  if (room.status === "finished") {
    if (room.game.winner === "draw") return "Partida encerrada em empate.";
    const winnerName = room.game.winner === "p1" ? "Jogador 1" : "Jogador 2";
    if (room.game.finishReason === "resignation") return `${winnerName} venceu por desistência do adversário.`;
    if (room.game.finishReason === "blocked") return `${winnerName} venceu após bloqueio da mesa.`;
    return `${winnerName} venceu!`;
  }
  if (room.game.turn === state.role) return "Sua vez.";
  return `Vez do ${room.game.turn === "p1" ? "Jogador 1" : "Jogador 2"}.`;
}

function renderBoard(table) {
  els.chain.innerHTML = "";
  const dimensions = boardDimensions(table.length);
  els.chain.style.setProperty("--board-rows", dimensions.rows);

  table.forEach((tile, index) => {
    const placement = boardPlacement(index);
    const tileEl = renderTile(tile, { played: true, placement });
    if (index === 0) tileEl.classList.add("chain-start");
    if (index === table.length - 1) tileEl.classList.add("chain-end");
    els.chain.appendChild(tileEl);
  });
}

function createConfetti() {
  els.confetti.innerHTML = "";
  for (let i = 0; i < 36; i += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.setProperty("--x", `${Math.random() * 100}%`);
    piece.style.setProperty("--delay", `${Math.random() * 0.8}s`);
    piece.style.setProperty("--duration", `${1.6 + Math.random() * 1.3}s`);
    piece.style.setProperty("--rotation", `${Math.floor(Math.random() * 360)}deg`);
    piece.style.setProperty("--hue", `${Math.floor(Math.random() * 360)}`);
    els.confetti.appendChild(piece);
  }
}

function resultKey(room) {
  return `${room.game.winner || "none"}:${room.game.finishReason || "none"}:${room.game.moveNumber || 0}`;
}

/** Mostra feedback positivo sem humilhar quem perdeu e reforça a prática matemática. */
function announceResultIfNeeded(room) {
  if (state.suppressResult || room.status !== "finished" || !state.role) return;
  const key = resultKey(room);
  if (state.announcedResultKey === key) return;
  state.announcedResultKey = key;

  const winner = room.game.winner;
  const isWinner = winner === state.role;
  const isDraw = winner === "draw";
  const myMoves = (room.game.table || []).filter((tile) => tile.playedBy === state.role).length;

  els.resultRestart.classList.toggle("hidden", state.role !== "p1");
  els.confetti.innerHTML = "";

  if (isDraw) {
    els.resultIcon.textContent = "🤝";
    els.resultTitle.textContent = "Empate!";
    els.resultBody.textContent = "A mesa ficou equilibrada. Vocês chegaram muito perto — que tal tentar outra rodada?";
  } else if (isWinner) {
    els.resultIcon.textContent = "🏆";
    els.resultTitle.textContent = "Você venceu!";
    const reason = room.game.finishReason === "resignation"
      ? "Seu colega encerrou a partida, então a vitória ficou com você."
      : "Parabéns! Você reconheceu equivalências e encontrou bons encaixes até o fim.";
    els.resultBody.textContent = reason;
    createConfetti();
  } else {
    els.resultIcon.textContent = "🌱";
    els.resultTitle.textContent = "Poxa, não foi dessa vez!";
    els.resultBody.textContent = "Mas não se preocupe: com a prática você reconhece as equivalências cada vez mais rápido. Continue tentando — não desista! 😊";
  }

  els.resultSummary.textContent = `Você encaixou ${myMoves} ${myMoves === 1 ? "peça" : "peças"} corretamente nesta partida.`;
  els.resultDialog.showModal();
}

function render() {
  const room = state.room;
  if (!room) return;

  els.roomCode.textContent = state.code;
  els.p1Name.textContent = room.players?.p1?.name || "Jogador 1";
  els.p2Name.textContent = room.players?.p2?.name || "Jogador 2";
  els.p1You.textContent = state.role === "p1" ? " (você)" : "";
  els.p2You.textContent = state.role === "p2" ? " (você)" : "";
  els.p1Presence.classList.toggle("online", Boolean(room.players?.p1?.connected));
  els.p2Presence.classList.toggle("online", Boolean(room.players?.p2?.connected));
  els.status.textContent = statusText(room);
  els.scoreP1.textContent = room.game.hand1?.length ?? 0;
  els.scoreP2.textContent = room.game.hand2?.length ?? 0;
  els.tableCount.textContent = `${room.game.table?.length ?? 0}/28`;
  els.turn.textContent = room.status === "playing" ? (room.game.turn === state.role ? "Sua vez" : "Aguarde") : "—";

  const table = room.game.table || [];
  els.tableEmpty.classList.toggle("hidden", table.length > 0);
  els.chain.classList.toggle("hidden", table.length === 0);
  renderBoard(table);

  const hand = currentHand(room);
  const isMyTurn = room.status === "playing" && room.game.turn === state.role;
  els.hand.innerHTML = "";
  hand.forEach((tile) => {
    const playable = isMyTurn && canPlayTile(tile, table);
    const tileEl = renderTile(tile, {
      selected: tile.id === state.selectedTileId,
      playable: isMyTurn ? playable : false
    });
    tileEl.addEventListener("click", () => {
      if (!isMyTurn) return showMessage("Aguarde", "Ainda não é a sua vez.");
      if (!playable) return showMessage("Essa peça não encaixa", "Procure uma peça equivalente a uma das pontas da mesa.");
      state.selectedTileId = state.selectedTileId === tile.id ? null : tile.id;
      render();
    });
    els.hand.appendChild(tileEl);
  });

  const selected = hand.find((tile) => tile.id === state.selectedTileId);
  const sides = selected ? validSides(selected, table) : [];
  els.left.disabled = !selected || !sides.includes("left") || state.busy;
  els.right.disabled = !selected || !sides.includes("right") || state.busy;
  els.right.textContent = !table.length && selected ? "Jogar peça" : "Jogar à direita →";
  els.left.classList.toggle("hidden", !table.length);

  const canPass = isMyTurn && !hasAnyMove(hand, table);
  els.pass.classList.toggle("hidden", !canPass);
  els.pass.disabled = state.busy;

  els.teacherNote.classList.toggle("hidden", !state.demoMode && !(room.status === "finished" && state.role === "p1"));
  if (state.demoMode) {
    els.teacherNote.textContent = "Modo demonstração local: o segundo jogador é automático.";
  } else if (room.status === "finished" && state.role === "p1") {
    els.teacherNote.innerHTML = '<button id="restart-inline" class="btn btn-primary btn-small" type="button">🔄 Nova rodada</button>';
    $("restart-inline").addEventListener("click", handleRestart);
  }
}

async function handleCreate() {
  if (!isOnlineBackendReady()) return showMessage("Firebase ainda não configurado", "Use o modo demonstração por enquanto.");
  try {
    setBusy(true);
    const session = await createRoom();
    state = { ...state, ...session, demoMode: false, selectedTileId: null, announcedResultKey: null, suppressResult: false };
    showGame();
    subscribeCurrentRoom();
  } catch (error) {
    showMessage("Não foi possível criar a sala", error.message);
  } finally { setBusy(false); }
}

async function handleJoin() {
  const code = normalizeCode(els.input.value);
  els.input.value = code;
  if (code.length !== 6) return showMessage("Código incompleto", "Digite os 6 caracteres do código da sala.");
  if (!isOnlineBackendReady()) return showMessage("Firebase ainda não configurado", "As salas online ainda não estão disponíveis.");
  try {
    setBusy(true);
    const session = await joinRoom(code);
    state = { ...state, ...session, demoMode: false, selectedTileId: null, announcedResultKey: null, suppressResult: false };
    showGame();
    subscribeCurrentRoom();
  } catch (error) {
    showMessage("Não foi possível entrar", error.message);
  } finally { setBusy(false); }
}

function subscribeCurrentRoom() {
  state.unsubscribe?.();
  state.unsubscribe = subscribeRoom(state.code, (room) => {
    if (!room) {
      showMessage("Sala encerrada", "A sala não existe mais.");
      return leaveLocal();
    }
    state.room = room;
    if (room.status === "playing") state.announcedResultKey = null;
    if (state.selectedTileId && !currentHand(room).some((tile) => tile.id === state.selectedTileId)) state.selectedTileId = null;
    render();
    announceResultIfNeeded(room);
  }, (error) => showMessage("Erro de sincronização", error.message));
}

async function handlePlay(side) {
  if (!state.selectedTileId || state.busy) return;
  try {
    state.busy = true;
    render();
    if (state.demoMode) {
      demoPlay(state.room, state.role, state.selectedTileId, side);
      state.selectedTileId = null;
      render();
      announceResultIfNeeded(state.room);
      setTimeout(() => {
        demoOpponentTurn(state.room);
        render();
        announceResultIfNeeded(state.room);
      }, 650);
    } else {
      await playTile(state.code, state.role, state.selectedTileId, side);
      state.selectedTileId = null;
    }
  } catch (error) {
    showMessage("Jogada não realizada", error.message);
  } finally {
    state.busy = false;
    render();
  }
}

async function handlePass() {
  try {
    state.busy = true;
    render();
    if (state.demoMode) {
      demoPass(state.room, state.role);
      render();
      announceResultIfNeeded(state.room);
      setTimeout(() => {
        demoOpponentTurn(state.room);
        render();
        announceResultIfNeeded(state.room);
      }, 650);
    } else await passTurn(state.code, state.role);
  } catch (error) {
    showMessage("Não foi possível passar", error.message);
  } finally {
    state.busy = false;
    render();
  }
}

function handleHint() {
  const room = state.room;
  if (!room || room.status !== "playing") return showMessage("Dica", "A partida ainda não começou.");
  if (room.game.turn !== state.role) return showMessage("Dica", "Aguarde sua vez para procurar uma jogada.");
  const playable = currentHand(room).filter((tile) => canPlayTile(tile, room.game.table || []));
  if (!playable.length) return showMessage("Dica", "Você não possui uma jogada válida. Use “Passar a vez”.");
  const first = playable[0];
  showMessage("Dica", `Observe a peça ${first.leftLabel} | ${first.rightLabel}. Pelo menos uma metade é equivalente a uma ponta da mesa.`);
}

async function handleRestart() {
  try {
    els.resultDialog.close();
    if (state.demoMode) {
      const demo = createDemoGame();
      state.room = demo.room;
      state.selectedTileId = null;
      state.announcedResultKey = null;
      render();
    } else await restartGame(state.code, state.role);
  } catch (error) {
    showMessage("Não foi possível reiniciar", error.message);
  }
}

function startDemo() {
  const demo = createDemoGame();
  state = { ...state, code: demo.code, role: demo.role, room: demo.room, demoMode: true, selectedTileId: null, announcedResultKey: null, suppressResult: false };
  showGame();
  render();
}

async function handleLeaveClick() {
  const room = state.room;
  if (!room) return leaveLocal();

  const activeMatch = room.status === "playing" && room.players?.p1 && room.players?.p2;
  if (activeMatch) {
    els.leaveDialog.showModal();
    return;
  }

  try {
    if (!state.demoMode) await markDisconnected(state.code, state.role);
  } catch (_) { /* sair localmente mesmo se a presença falhar */ }
  leaveLocal();
}

async function confirmResignation() {
  try {
    state.suppressResult = true;
    els.confirmResign.disabled = true;
    if (!state.demoMode) await resignGame(state.code, state.role);
    els.leaveDialog.close();
    leaveLocal();
  } catch (error) {
    state.suppressResult = false;
    showMessage("Não foi possível sair", error.message);
  } finally {
    els.confirmResign.disabled = false;
  }
}

function leaveLocal() {
  state.unsubscribe?.();
  if (els.resultDialog.open) els.resultDialog.close();
  if (els.leaveDialog.open) els.leaveDialog.close();
  state = {
    code: null, role: null, uid: null, room: null, unsubscribe: null,
    selectedTileId: null, demoMode: false, busy: false,
    announcedResultKey: null, suppressResult: false
  };
  showSetup();
}

els.create.addEventListener("click", handleCreate);
els.join.addEventListener("click", handleJoin);
els.input.addEventListener("input", () => { els.input.value = normalizeCode(els.input.value); });
els.input.addEventListener("keydown", (event) => { if (event.key === "Enter") handleJoin(); });
els.demo.addEventListener("click", startDemo);
els.copyCode.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(state.code);
    showMessage("Código copiado", `Mostre ${state.code} ao segundo jogador.`);
  } catch (_) { showMessage("Código da sala", state.code); }
});
els.leave.addEventListener("click", handleLeaveClick);
els.confirmResign.addEventListener("click", (event) => { event.preventDefault(); confirmResignation(); });
els.left.addEventListener("click", () => handlePlay("left"));
els.right.addEventListener("click", () => handlePlay("right"));
els.pass.addEventListener("click", handlePass);
els.hint.addEventListener("click", handleHint);
els.rules.addEventListener("click", () => els.rulesDialog.showModal());
els.resultRestart.addEventListener("click", handleRestart);
window.addEventListener("focus", () => {
  if (!state.demoMode) markConnected(state.code, state.role).catch(() => {});
});

if (!isOnlineBackendReady()) {
  els.warning.classList.remove("hidden");
  els.demo.classList.remove("hidden");
}
