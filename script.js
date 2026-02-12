const socketMetaUrl = document.querySelector('meta[name="socket-url"]')?.content?.trim();
const socketUrl =
  window.NEXT_PUBLIC_SOCKET_URL ||
  window.__ENV__?.NEXT_PUBLIC_SOCKET_URL ||
  socketMetaUrl ||
  "http://localhost:3001";

const socket = io(socketUrl, {
  autoConnect: false,
  transports: ["websocket", "polling"],
});

const loginOverlay = document.getElementById("loginOverlay");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const nameInput = document.getElementById("nameInput");
const roomInput = document.getElementById("roomInput");

const canvas = document.getElementById("board");
const drawingNowEl = document.getElementById("drawingNow");
const wordHintEl = document.getElementById("wordHint");
const timerEl = document.getElementById("timer");
const playerListEl = document.getElementById("playerList");

const messagesEl = document.getElementById("messages");
const guessForm = document.getElementById("guessForm");
const guessInput = document.getElementById("guessInput");

const ctx = canvas.getContext("2d");

const state = {
  playerID: null,
  playerName: "",
  roomID: "",
  players: [],
  currentDrawer: null,
  roundEndsAt: null,
  wordLength: 0,
  secretWord: "",
  canDraw: false,
  isDrawing: false,
  lastPoint: null,
  timerHandle: null,
};

function formatTime(msLeft) {
  const totalSeconds = Math.max(0, Math.ceil(msLeft / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function startTimer(roundEndsAt) {
  if (state.timerHandle) {
    clearInterval(state.timerHandle);
    state.timerHandle = null;
  }

  if (!roundEndsAt) {
    timerEl.textContent = "--:--";
    return;
  }

  const tick = () => {
    const msLeft = roundEndsAt - Date.now();
    timerEl.textContent = formatTime(msLeft);
  };

  tick();
  state.timerHandle = setInterval(tick, 1000);
}

function getPlayerNameById(playerID) {
  const player = state.players.find((p) => p.id === playerID);
  return player ? player.name : "-";
}

function wordMask(length) {
  if (!length || length < 1) return "-";
  return "_ ".repeat(length).trim();
}

function updateWordHint() {
  if (!state.currentDrawer) {
    wordHintEl.textContent = "Word: -";
    return;
  }

  if (state.canDraw) {
    if (state.secretWord) {
      wordHintEl.textContent = `Your word: ${state.secretWord}`;
      return;
    }
    wordHintEl.textContent = "Your word: (waiting...)";
    return;
  }

  wordHintEl.textContent = `Word: ${wordMask(state.wordLength)}`;
}

function updateDrawingLock() {
  state.canDraw = Boolean(state.playerID && state.currentDrawer === state.playerID);
  canvas.classList.toggle("locked", !state.canDraw);
  guessInput.disabled = state.canDraw;
  guessForm.querySelector("button").disabled = state.canDraw;
  updateWordHint();
}

function renderPlayers() {
  playerListEl.innerHTML = "";

  if (state.players.length === 0) {
    const empty = document.createElement("li");
    empty.className = "player-item";
    empty.textContent = "No players yet.";
    playerListEl.appendChild(empty);
    return;
  }

  state.players.forEach((player) => {
    const li = document.createElement("li");
    li.className = "player-item";
    if (player.id === state.currentDrawer) {
      li.classList.add("active-drawer");
    }

    const you = player.id === state.playerID ? " (You)" : "";
    const drawingLabel = player.id === state.currentDrawer ? "Drawing Now" : "";

    const playerMain = document.createElement("div");
    playerMain.className = "player-main";

    const nameEl = document.createElement("span");
    nameEl.className = "name";
    nameEl.textContent = `${player.name}${you}`;

    const scoreEl = document.createElement("span");
    scoreEl.className = "score";
    scoreEl.textContent = String(player.score);

    const roleEl = document.createElement("span");
    roleEl.className = "role";
    roleEl.textContent = drawingLabel;

    playerMain.append(nameEl, scoreEl);
    li.append(playerMain, roleEl);
    playerListEl.appendChild(li);
  });
}

function updateRoundHeader() {
  const drawerName = getPlayerNameById(state.currentDrawer);
  drawingNowEl.textContent = `Drawing Now: ${drawerName}`;
  drawingNowEl.classList.toggle("is-you", state.canDraw);
}

function drawSegment(from, to, color = "#1f2937", lineWidth = 4) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

function clearCanvas() {
  const { width, height } = canvas.getBoundingClientRect();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;

  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  clearCanvas();
}

function getCanvasPoint(evt) {
  const rect = canvas.getBoundingClientRect();
  const x = evt.clientX - rect.left;
  const y = evt.clientY - rect.top;
  return {
    x,
    y,
    nx: rect.width > 0 ? x / rect.width : 0,
    ny: rect.height > 0 ? y / rect.height : 0,
  };
}

function denormalizePoint(nx, ny) {
  const rect = canvas.getBoundingClientRect();
  if (nx <= 1 && ny <= 1) {
    return {
      x: nx * rect.width,
      y: ny * rect.height,
    };
  }

  return { x: nx, y: ny };
}

function addMessage(kind, text) {
  const item = document.createElement("div");
  item.className = `message ${kind}`;
  item.textContent = text;
  messagesEl.appendChild(item);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function handleRoundState({ players, currentDrawer, roundEndsAt, wordLength }) {
  if (Array.isArray(players)) {
    state.players = players;
  }
  if (typeof currentDrawer === "string") {
    state.currentDrawer = currentDrawer;
  }
  if (typeof roundEndsAt === "number") {
    state.roundEndsAt = roundEndsAt;
  }
  if (typeof wordLength === "number") {
    state.wordLength = wordLength;
  }

  if (!state.canDraw) {
    state.secretWord = "";
  }

  updateDrawingLock();
  renderPlayers();
  updateRoundHeader();
  startTimer(state.roundEndsAt);
}

canvas.addEventListener("pointerdown", (evt) => {
  if (!state.canDraw) return;

  state.isDrawing = true;
  state.lastPoint = getCanvasPoint(evt);
  canvas.setPointerCapture(evt.pointerId);
});

canvas.addEventListener("pointermove", (evt) => {
  if (!state.canDraw || !state.isDrawing || !state.lastPoint) return;

  const nextPoint = getCanvasPoint(evt);
  drawSegment(state.lastPoint, nextPoint);

  socket.emit("draw-data", {
    x0: state.lastPoint.nx,
    y0: state.lastPoint.ny,
    x1: nextPoint.nx,
    y1: nextPoint.ny,
    color: "#1f2937",
    lineWidth: 4,
  });

  state.lastPoint = nextPoint;
});

function stopDrawing(evt) {
  if (evt?.pointerId !== undefined && canvas.hasPointerCapture(evt.pointerId)) {
    canvas.releasePointerCapture(evt.pointerId);
  }
  state.isDrawing = false;
  state.lastPoint = null;
}

canvas.addEventListener("pointerup", stopDrawing);
canvas.addEventListener("pointercancel", stopDrawing);
canvas.addEventListener("pointerleave", stopDrawing);

guessForm.addEventListener("submit", (evt) => {
  evt.preventDefault();

  const guess = guessInput.value.trim();
  if (!guess || state.canDraw) return;

  socket.emit("submit-guess", { guess });
  guessInput.value = "";
});

loginForm.addEventListener("submit", (evt) => {
  evt.preventDefault();
  loginError.textContent = "";

  const name = nameInput.value.trim();
  const roomID = roomInput.value.trim();

  if (!name || !roomID) {
    loginError.textContent = "Name and Room ID are required.";
    return;
  }

  state.playerName = name;
  state.roomID = roomID;

  const join = () => socket.emit("join-room", { name, roomID });

  if (socket.connected) {
    join();
    return;
  }

  socket.once("connect", join);
  socket.connect();
});

socket.on("joined-room", ({ playerID, roomID }) => {
  state.playerID = playerID;
  state.roomID = roomID;
  loginOverlay.classList.add("hidden");
  addMessage("system", `You joined room "${roomID}".`);
});

socket.on("join-error", ({ message }) => {
  loginError.textContent = message || "Unable to join room.";
});

socket.on("room-state", handleRoundState);

socket.on("round-start", ({ currentDrawer, currentDrawerName, roundEndsAt, wordLength }) => {
  state.currentDrawer = currentDrawer;
  state.roundEndsAt = roundEndsAt;
  state.wordLength = wordLength;
  state.secretWord = "";
  updateDrawingLock();
  updateRoundHeader();
  startTimer(roundEndsAt);

  addMessage("system", `${currentDrawerName} is drawing now.`);
});

socket.on("your-word", ({ secretWord }) => {
  state.secretWord = secretWord || "";
  updateWordHint();
});

socket.on("render-line", ({ x0, y0, x1, y1, color, lineWidth }) => {
  const from = denormalizePoint(x0, y0);
  const to = denormalizePoint(x1, y1);
  drawSegment(from, to, color, lineWidth);
});

socket.on("clear-canvas", () => {
  clearCanvas();
});

socket.on("correct-guess", ({ guesserName, drawerName, secretWord }) => {
  addMessage("system", `${guesserName} guessed "${secretWord}" correctly. ${drawerName} gets bonus points.`);
});

socket.on("guess-feedback", ({ message }) => {
  addMessage("hint", message || "Close guess.");
});

socket.on("guess-message", ({ playerName, guess }) => {
  if (!guess) return;
  addMessage("guess", `${playerName}: ${guess}`);
});

socket.on("system-message", ({ message }) => {
  if (!message) return;
  addMessage("system", message);
});

socket.on("round-timeout", ({ secretWord, message }) => {
  addMessage("system", `${message} Word was "${secretWord}".`);
});

socket.on("disconnect", () => {
  addMessage("system", "Disconnected from server.");
});

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
