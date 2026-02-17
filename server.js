const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT) || 3001;
const ROUND_DURATION_MS = Number(process.env.ROUND_DURATION_MS) || 90_000;

const rawOrigins =
  process.env.ALLOWED_ORIGINS ||
  process.env.CORS_ORIGIN ||
  process.env.VERCEL_URL ||
  "";

const ALLOWED_ORIGINS = rawOrigins
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map((origin) => {
    if (origin === "*") return origin;
    if (/^https?:\/\//i.test(origin)) return origin;
    return `https://${origin}`;
  });

const CATEGORIES = {
  animals: [
    "elephant",
    "giraffe",
    "lion",
    "tiger",
    "monkey",
    "penguin",
    "koala",
    "dinosaur",
    "shark",
    "whale",
    "octopus",
    "butterfly",
    "spider",
    "dog",
    "cat",
    "rabbit",
    "zebra",
    "bear",
  ],
  foods: [
    "apple",
    "banana",
    "grapes",
    "watermelon",
    "pineapple",
    "strawberry",
    "orange",
    "lemon",
    "burger",
    "pizza",
    "noodles",
    "sandwich",
    "coffee",
    "teacup",
    "bottle",
    "ice cream",
    "donut",
  ],
  places: [
    "mountain",
    "desert",
    "island",
    "ocean",
    "river",
    "waterfall",
    "forest",
    "castle",
    "bridge",
    "lighthouse",
    "school",
    "hospital",
    "market",
    "playground",
    "library",
    "kitchen",
    "bedroom",
    "bathroom",
    "classroom",
  ],
  objects: [
    "backpack",
    "notebook",
    "pencil",
    "clock",
    "calendar",
    "mirror",
    "ladder",
    "parachute",
    "kite",
    "helmet",
    "sunglasses",
    "umbrella",
    "suitcase",
    "balloon",
    "bicycle",
    "motorcycle",
    "car",
    "bus",
    "train",
  ],
  tech: [
    "laptop",
    "keyboard",
    "headphones",
    "camera",
    "rocket",
    "spaceship",
    "astronaut",
    "robot",
    "phone",
    "drone",
  ],
  fantasy: [
    "pirate",
    "treasure",
    "dragon",
    "unicorn",
    "wizard",
    "fairy",
    "ghost",
    "zombie",
    "superhero",
    "magic wand",
  ],
  nature: [
    "rainbow",
    "sunflower",
    "rose",
    "cactus",
    "treehouse",
    "snowman",
    "fireworks",
    "volcano",
    "thunder",
    "snowflake",
    "raincoat",
    "cloud",
    "moon",
    "star",
  ],
  sports: [
    "football",
    "cricket",
    "basketball",
    "tennis",
    "goalkeeper",
    "stadium",
  ],
  music: [
    "guitar",
    "piano",
    "drums",
    "microphone",
    "stage",
    "headphones",
  ],
};

const WORDS = Object.values(CATEGORIES).flat();

const rooms = {};
const socketRoomMap = new Map();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (
        !origin ||
        ALLOWED_ORIGINS.length === 0 ||
        ALLOWED_ORIGINS.includes("*") ||
        ALLOWED_ORIGINS.includes(origin)
      ) {
        callback(null, true);
        return;
      }
      callback(new Error("CORS blocked by server configuration."));
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

function normalize(text) {
  return String(text || "").trim().toLowerCase();
}

function oneEditAway(a, b) {
  if (a === b) return false;
  const lenDiff = Math.abs(a.length - b.length);
  if (lenDiff > 1) return false;

  let i = 0;
  let j = 0;
  let edits = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }

    edits += 1;
    if (edits > 1) return false;

    if (a.length > b.length) {
      i += 1;
    } else if (b.length > a.length) {
      j += 1;
    } else {
      i += 1;
      j += 1;
    }
  }

  if (i < a.length || j < b.length) edits += 1;
  return edits === 1;
}

function pickWord() {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function getOrCreateRoom(roomID) {
  if (!rooms[roomID]) {
    rooms[roomID] = {
      players: [],
      currentDrawer: null,
      currentDrawerIndex: -1,
      secretWord: "",
      roundEndsAt: null,
      roundTimer: null,
    };
  }
  return rooms[roomID];
}

function emitRoomState(roomID) {
  const room = rooms[roomID];
  if (!room) return;

  io.to(roomID).emit("room-state", {
    players: room.players,
    currentDrawer: room.currentDrawer,
    roundEndsAt: room.roundEndsAt,
    wordLength: room.secretWord ? room.secretWord.length : 0,
  });
}

function clearRoomTimer(room) {
  if (room.roundTimer) {
    clearTimeout(room.roundTimer);
    room.roundTimer = null;
  }
}

function startRound(roomID, forcedIndex) {
  const room = rooms[roomID];
  if (!room || room.players.length === 0) return;

  clearRoomTimer(room);

  if (typeof forcedIndex === "number") {
    room.currentDrawerIndex = forcedIndex % room.players.length;
  } else {
    room.currentDrawerIndex = (room.currentDrawerIndex + 1) % room.players.length;
  }

  const drawer = room.players[room.currentDrawerIndex];
  room.currentDrawer = drawer.id;
  room.secretWord = pickWord();
  room.roundEndsAt = Date.now() + ROUND_DURATION_MS;

  io.to(roomID).emit("clear-canvas");
  io.to(roomID).emit("round-start", {
    currentDrawer: room.currentDrawer,
    currentDrawerName: drawer.name,
    roundEndsAt: room.roundEndsAt,
    wordLength: room.secretWord.length,
  });
  io.to(room.currentDrawer).emit("your-word", { secretWord: room.secretWord });

  room.roundTimer = setTimeout(() => {
    const activeRoom = rooms[roomID];
    if (!activeRoom) return;

    io.to(roomID).emit("round-timeout", {
      secretWord: activeRoom.secretWord,
      message: "Time is up. Rotating drawer.",
    });
    startRound(roomID);
  }, ROUND_DURATION_MS);

  emitRoomState(roomID);
}

function removeSocketFromRoom(socket) {
  const roomID = socketRoomMap.get(socket.id);
  if (!roomID) return;

  const room = rooms[roomID];
  socketRoomMap.delete(socket.id);
  if (!room) return;

  const removedIndex = room.players.findIndex((p) => p.id === socket.id);
  if (removedIndex === -1) return;

  const wasDrawer = room.currentDrawer === socket.id;
  room.players.splice(removedIndex, 1);

  if (room.players.length === 0) {
    clearRoomTimer(room);
    delete rooms[roomID];
    return;
  }

  if (removedIndex < room.currentDrawerIndex) {
    room.currentDrawerIndex -= 1;
  }

  if (wasDrawer) {
    const nextIndex = removedIndex % room.players.length;
    startRound(roomID, nextIndex);
  } else {
    emitRoomState(roomID);
  }
}

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, rooms: Object.keys(rooms).length });
});

app.get("/:asset", (req, res, next) => {
  const allowedAssets = new Set(["script.js", "style.css", "env.js"]);
  const asset = String(req.params.asset || "");
  if (!allowedAssets.has(asset)) {
    next();
    return;
  }

  res.sendFile(path.join(__dirname, asset));
});

io.on("connection", (socket) => {
  socket.on("join-room", (payload = {}) => {
    const { name, roomID } = payload;
    const cleanName = String(name || "").trim();
    const cleanRoomID = String(roomID || "").trim();

    if (!cleanName || !cleanRoomID) {
      socket.emit("join-error", {
        message: "Both name and roomID are required.",
      });
      return;
    }

    removeSocketFromRoom(socket);

    const room = getOrCreateRoom(cleanRoomID);
    room.players.push({
      id: socket.id,
      name: cleanName,
      score: 0,
    });

    socketRoomMap.set(socket.id, cleanRoomID);
    socket.join(cleanRoomID);

    socket.emit("joined-room", {
      roomID: cleanRoomID,
      playerID: socket.id,
    });
    io.to(cleanRoomID).emit("system-message", {
      message: `${cleanName} joined the room.`,
    });

    if (!room.currentDrawer || room.currentDrawerIndex < 0) {
      startRound(cleanRoomID, 0);
    } else {
      emitRoomState(cleanRoomID);
    }
  });

  socket.on("draw-data", (payload = {}) => {
    const roomID = socketRoomMap.get(socket.id);
    if (!roomID) return;

    const room = rooms[roomID];
    if (!room || room.currentDrawer !== socket.id) return;

    const { x0, y0, x1, y1, color = "#1f2937", lineWidth = 4 } = payload;
    socket.to(roomID).emit("render-line", { x0, y0, x1, y1, color, lineWidth });
  });

  socket.on("submit-guess", (payload = {}) => {
    const { guess } = payload;
    const roomID = socketRoomMap.get(socket.id);
    if (!roomID) return;

    const room = rooms[roomID];
    if (!room || !room.secretWord) return;
    if (room.currentDrawer === socket.id) return;

    const guesser = room.players.find((p) => p.id === socket.id);
    if (!guesser) return;

    const normalizedGuess = normalize(guess);
    const normalizedSecret = normalize(room.secretWord);

    if (!normalizedGuess) return;

    if (normalizedGuess === normalizedSecret) {
      const drawer = room.players.find((p) => p.id === room.currentDrawer);
      if (!drawer) return;

      guesser.score += 100;
      drawer.score += 50;

      io.to(roomID).emit("correct-guess", {
        guesserID: guesser.id,
        guesserName: guesser.name,
        drawerID: drawer.id,
        drawerName: drawer.name,
        secretWord: room.secretWord,
      });

      emitRoomState(roomID);
      startRound(roomID);
      return;
    }

    if (oneEditAway(normalizedGuess, normalizedSecret)) {
      socket.emit("guess-feedback", {
        message: "You're so close!",
      });
    }

    io.to(roomID).emit("guess-message", {
      playerID: guesser.id,
      playerName: guesser.name,
      guess: String(guess || "").trim(),
    });
  });

  socket.on("disconnect", () => {
    removeSocketFromRoom(socket);
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`SketchLink socket server running on port ${PORT}`);
});
