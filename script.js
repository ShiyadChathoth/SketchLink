const socketMetaUrl = document.querySelector('meta[name="socket-url"]')?.content?.trim();
const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const socketUrl =
  window.NEXT_PUBLIC_SOCKET_URL ||
  window.__ENV__?.NEXT_PUBLIC_SOCKET_URL ||
  socketMetaUrl ||
  (isLocalHost ? "http://localhost:3001" : "");

const socket = io(socketUrl || window.location.origin, {
  autoConnect: false,
  transports: ["websocket", "polling"],
});

const loginOverlay = document.getElementById("loginOverlay");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const nameInput = document.getElementById("nameInput");
const roomInput = document.getElementById("roomInput");
const loginButton = loginForm.querySelector("button[type='submit']");

const canvas = document.getElementById("board");
const drawingNowEl = document.getElementById("drawingNow");
const wordHintEl = document.getElementById("wordHint");
const timerEl = document.getElementById("timer");
const playerListEl = document.getElementById("playerList");
const penToolBtn = document.getElementById("penTool");
const eraserToolBtn = document.getElementById("eraserTool");

const messagesEl = document.getElementById("messages");
const guessForm = document.getElementById("guessForm");
const guessInput = document.getElementById("guessInput");
const quickReactions = document.getElementById("quickReactions");

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
  joinPending: false,
  tool: "pen",
};

const confettiContainer = document.getElementById("confettiContainer");
const themeToggleBtn = document.getElementById("themeToggle");

function initialsFromName(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function createConfettiBurst() {
  if (!confettiContainer) return;

  const count = 40;
  for (let i = 0; i < count; i += 1) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";

    const left = Math.random() * 100; // viewport %
    const delay = Math.random() * 0.35;
    const duration = 0.9 + Math.random() * 0.7;

    piece.style.left = `${left}vw`;
    piece.style.top = `${-10 - Math.random() * 20}px`;
    piece.style.animationDelay = `${delay}s`;
    piece.style.animationDuration = `${duration}s`;

    confettiContainer.appendChild(piece);

    setTimeout(() => {
      piece.remove();
    }, (delay + duration + 0.2) * 1000);
  }
}

/* Theme handling */

const THEME_KEY = "sketchlink-theme";

function applyTheme(theme) {
  if (theme === "dark") {
    document.body.classList.add("dark-mode");
  } else {
    document.body.classList.remove("dark-mode");
  }
  if (themeToggleBtn) {
    themeToggleBtn.textContent = document.body.classList.contains("dark-mode")
      ? "Light mode"
      : "Dark mode";
  }
}

function initTheme() {
  const saved = window.localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initial = saved || (prefersDark ? "dark" : "light");
  applyTheme(initial);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const next = document.body.classList.contains("dark-mode") ? "light" : "dark";
      window.localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    });
  }
}

initTheme();

function setJoinPending(value) {
  state.joinPending = value;
  loginButton.disabled = value;
}

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
  // Chat should always be available, even when drawing
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

    // Avatar
    const avatarWrap = document.createElement("div");
    avatarWrap.className = "player-avatar";
    const avatar = document.createElement("div");
    avatar.className = "avatar-circle";
    avatar.textContent = initialsFromName(player.name);
    avatarWrap.appendChild(avatar);

    // Main info
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

    li.append(avatarWrap, playerMain, roleEl);
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

function hashNameToColor(name) {
  let hash = 0;
  const str = String(name || "");
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 60%)`;
}

function isMostlyEmoji(text) {
  const str = String(text || "").trim();
  if (!str) return false;
  // Count emoji vs other characters roughly
  const emojiMatches = str.match(/\p{Extended_Pictographic}/gu) || [];
  const nonSpace = str.replace(/\s+/g, "");
  return emojiMatches.length > 0 && emojiMatches.join("").length >= nonSpace.length * 0.6;
}

function appendMultilineText(node, text) {
  const lines = String(text || "").split(/\r?\n/);
  lines.forEach((line, index) => {
    node.appendChild(document.createTextNode(line));
    if (index < lines.length - 1) {
      node.appendChild(document.createElement("br"));
    }
  });
}

function addMessage(kind, payload) {
  const item = document.createElement("div");
  item.className = `message ${kind}`;

  // Guess messages can come as structured payload
  if (kind === "guess" && payload && typeof payload === "object") {
    const { playerName, guess } = payload;

    const nameSpan = document.createElement("span");
    nameSpan.className = "msg-name";
    nameSpan.textContent = playerName;
    nameSpan.style.color = hashNameToColor(playerName);

    const sepSpan = document.createElement("span");
    sepSpan.textContent = ": ";

    const textSpan = document.createElement("span");
    textSpan.className = "msg-text";
    appendMultilineText(textSpan, guess);

    if (isMostlyEmoji(guess)) {
      item.classList.add("emoji-only");
    }

    item.append(nameSpan, sepSpan, textSpan);
  } else {
    const text = typeof payload === "string" ? payload : String(payload || "");
    if (isMostlyEmoji(text)) {
      item.classList.add("emoji-only");
    }
    appendMultilineText(item, text);
  }

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

  const isEraser = state.tool === "eraser";
  const color = isEraser ? "#ffffff" : "#1f2937";
  const lineWidth = isEraser ? 16 : 4;

  drawSegment(state.lastPoint, nextPoint, color, lineWidth);

  socket.emit("draw-data", {
    x0: state.lastPoint.nx,
    y0: state.lastPoint.ny,
    x1: nextPoint.nx,
    y1: nextPoint.ny,
    color,
    lineWidth,
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
  if (!guess) return;

  socket.emit("submit-guess", { guess });
  guessInput.value = "";
});

// Enter to send, Shift+Enter for newline
if (guessInput) {
  guessInput.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter" && !evt.shiftKey) {
      evt.preventDefault();
      guessForm.requestSubmit();
    }
  });
}

if (quickReactions) {
  quickReactions.addEventListener("click", (evt) => {
    const target = evt.target;
    if (!(target instanceof HTMLElement)) return;
    const emoji = target.dataset.emoji;
    if (!emoji || !guessInput) return;

    const start = guessInput.selectionStart ?? guessInput.value.length;
    const end = guessInput.selectionEnd ?? guessInput.value.length;
    const value = guessInput.value;
    guessInput.value = value.slice(0, start) + emoji + value.slice(end);

    const newPos = start + emoji.length;
    guessInput.focus();
    guessInput.selectionStart = guessInput.selectionEnd = newPos;
  });
}

loginForm.addEventListener("submit", (evt) => {
  evt.preventDefault();
  loginError.textContent = "";

  if (!socketUrl) {
    loginError.textContent =
      "Backend URL not configured. Set NEXT_PUBLIC_SOCKET_URL in Vercel to your backend HTTPS URL.";
    return;
  }

  const name = nameInput.value.trim();
  const roomID = roomInput.value.trim();

  if (!name || !roomID) {
    loginError.textContent = "Name and Room ID are required.";
    return;
  }

  state.playerName = name;
  state.roomID = roomID;
  setJoinPending(true);

  const join = () => socket.emit("join-room", { name, roomID });

  if (socket.connected) {
    join();
    return;
  }

  socket.once("connect", join);
  socket.connect();
});

socket.on("joined-room", ({ playerID, roomID }) => {
  setJoinPending(false);
  state.playerID = playerID;
  state.roomID = roomID;
  loginOverlay.classList.add("hidden");
  addMessage("system", `You joined room "${roomID}".`);
});

socket.on("join-error", ({ message }) => {
  setJoinPending(false);
  loginError.textContent = message || "Unable to join room.";
});

socket.on("connect_error", (error) => {
  setJoinPending(false);
  loginError.textContent = `Connection failed: ${error?.message || "socket error"}. Check NEXT_PUBLIC_SOCKET_URL and backend status.`;
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
  addMessage(
    "system",
    `${guesserName} guessed "${secretWord}" correctly. ${drawerName} gets bonus points.`
  );
  createConfettiBurst();
});

socket.on("guess-feedback", ({ message }) => {
  addMessage("hint", message || "Close guess.");
});

socket.on("guess-message", ({ playerName, guess }) => {
  if (!guess) return;
  addMessage("guess", { playerName, guess });

  // Fun confetti when people send celebration emojis
  if (/[🎉🥳]/u.test(guess)) {
    createConfettiBurst();
  }
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

if (penToolBtn && eraserToolBtn) {
  const updateToolButtons = () => {
    penToolBtn.classList.toggle("active", state.tool === "pen");
    eraserToolBtn.classList.toggle("active", state.tool === "eraser");

    canvas.classList.toggle("pen-tool", state.tool === "pen");
    canvas.classList.toggle("eraser-tool", state.tool === "eraser");
  };

  penToolBtn.addEventListener("click", () => {
    state.tool = "pen";
    updateToolButtons();
  });

  eraserToolBtn.addEventListener("click", () => {
    state.tool = "eraser";
    updateToolButtons();
  });

  updateToolButtons();
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
