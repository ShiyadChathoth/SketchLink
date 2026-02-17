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
    "ant",
    "bear",
    "bird",
    "butterfly",
    "camel",
    "cat",
    "chicken",
    "cow",
    "crab",
    "crocodile",
    "deer",
    "dog",
    "dolphin",
    "donkey",
    "dragonfly",
    "duck",
    "eagle",
    "elephant",
    "fish",
    "flamingo",
    "fox",
    "frog",
    "giraffe",
    "goat",
    "gorilla",
    "hamster",
    "hedgehog",
    "hippo",
    "horse",
    "jellyfish",
    "kangaroo",
    "koala",
    "ladybug",
    "leopard",
    "lion",
    "lizard",
    "monkey",
    "mouse",
    "octopus",
    "ostrich",
    "owl",
    "panda",
    "parrot",
    "peacock",
    "penguin",
    "pig",
    "polar bear",
    "rabbit",
    "raccoon",
    "rhino",
    "seahorse",
    "shark",
    "sheep",
    "snail",
    "snake",
    "spider",
    "squid",
    "squirrel",
    "swan",
    "tiger",
    "turtle",
    "walrus",
    "whale",
    "wolf",
    "zebra",
    "dinosaur",
  ],
  foods: [
    "apple",
    "avocado",
    "banana",
    "bread",
    "burger",
    "cake",
    "carrot",
    "cheese",
    "cherry",
    "chocolate",
    "cookie",
    "corn",
    "croissant",
    "cucumber",
    "donut",
    "egg",
    "eggplant",
    "fish stick",
    "fries",
    "grapes",
    "hot dog",
    "ice cream",
    "jam",
    "kiwi",
    "lemon",
    "lollipop",
    "mango",
    "milk",
    "mushroom",
    "noodles",
    "nut",
    "onion",
    "orange",
    "pancakes",
    "peanut butter",
    "pear",
    "peas",
    "pepper",
    "pineapple",
    "pizza",
    "popcorn",
    "pumpkin",
    "rice",
    "salad",
    "sandwich",
    "sausage",
    "spaghetti",
    "spinach",
    "strawberry",
    "sushi",
    "taco",
    "tomato",
    "watermelon",
    "yogurt",
    "coffee",
    "teacup",
    "bottle",
    "juice box",
  ],
  places: [
    "amusement park",
    "airport",
    "bakery",
    "balcony",
    "bank",
    "beach",
    "bedroom",
    "bridge",
    "bus stop",
    "camping tent",
    "castle",
    "classroom",
    "coffee shop",
    "desert",
    "farm",
    "forest",
    "garden",
    "gym",
    "hospital",
    "hotel",
    "ice rink",
    "island",
    "kitchen",
    "library",
    "lighthouse",
    "living room",
    "market",
    "mountain",
    "museum",
    "ocean",
    "park",
    "playground",
    "police station",
    "restaurant",
    "school",
    "stadium",
    "station",
    "supermarket",
    "swimming pool",
    "theater",
    "train station",
    "treehouse",
    "village",
    "volcano",
    "waterfall",
    "zoo",
  ],
  objects: [
    "backpack",
    "balloon",
    "basket",
    "bed",
    "bench",
    "bicycle",
    "binoculars",
    "book",
    "broom",
    "bucket",
    "calculator",
    "calendar",
    "camera",
    "candle",
    "chair",
    "clock",
    "comb",
    "couch",
    "cup",
    "desk",
    "door",
    "drawer",
    "drum",
    "fan",
    "flag",
    "flashlight",
    "fridge",
    "glasses",
    "hammer",
    "hat",
    "helmet",
    "key",
    "kite",
    "ladder",
    "lamp",
    "mirror",
    "mop",
    "paintbrush",
    "pencil",
    "pillow",
    "plug",
    "present",
    "ring",
    "roller skates",
    "rope",
    "ruler",
    "scissors",
    "screwdriver",
    "shoelace",
    "sock",
    "sofa",
    "spoon",
    "suitcase",
    "table",
    "teddy bear",
    "toothbrush",
    "toothpaste",
    "trash can",
    "umbrella",
    "vase",
    "wallet",
    "washing machine",
    "whistle",
    "window",
    "bus",
    "car",
    "train",
    "motorcycle",
  ],
  tech: [
    "battery",
    "camera",
    "charger",
    "computer",
    "controller",
    "drone",
    "earphones",
    "game console",
    "headphones",
    "keyboard",
    "laptop",
    "light bulb",
    "microphone",
    "mouse",
    "phone",
    "printer",
    "projector",
    "remote",
    "robot",
    "rocket",
    "screen",
    "smartwatch",
    "spaceship",
    "tablet",
    "television",
    "usb cable",
    "wifi router",
  ],
  fantasy: [
    "alien",
    "angel",
    "castle tower",
    "crystal ball",
    "dragon",
    "fairy",
    "genie",
    "ghost",
    "giant",
    "goblin",
    "knight",
    "mermaid",
    "magic carpet",
    "magic wand",
    "pirate",
    "princess",
    "robot knight",
    "superhero",
    "treasure chest",
    "unicorn",
    "vampire",
    "wizard",
    "zombie",
  ],
  nature: [
    "beach wave",
    "bush",
    "cactus",
    "cloud",
    "desert dune",
    "flower",
    "forest path",
    "hill",
    "leaf",
    "lightning",
    "moon",
    "mountain peak",
    "mushroom",
    "rainbow",
    "raindrop",
    "river",
    "rock",
    "sandcastle",
    "snowflake",
    "snowman",
    "star",
    "sun",
    "sunflower",
    "tree",
    "tree stump",
    "volcano",
    "waterfall",
    "wind",
  ],
  sports: [
    "badminton",
    "basketball",
    "bowling",
    "boxing glove",
    "cricket bat",
    "fishing rod",
    "football",
    "goalkeeper",
    "gymnast",
    "hockey stick",
    "medal",
    "ping pong",
    "race car",
    "referee",
    "running shoe",
    "scoreboard",
    "skateboard",
    "skiing",
    "stadium",
    "surfboard",
    "swimmer",
    "tennis racket",
    "trophy",
    "whistle",
  ],
  music: [
    "accordion",
    "band stage",
    "cello",
    "drums",
    "guitar",
    "headphones",
    "microphone",
    "piano",
    "radio",
    "singer",
    "stage",
    "trumpet",
    "violin",
    "xylophone",
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
  const categoryNames = Object.keys(CATEGORIES);
  const categoryName = categoryNames[Math.floor(Math.random() * categoryNames.length)];
  const words = CATEGORIES[categoryName] || [];
  if (!words.length) {
    return { word: WORDS[Math.floor(Math.random() * WORDS.length)], category: null };
  }
  const word = words[Math.floor(Math.random() * words.length)];
  return { word, category: categoryName };
}

function getOrCreateRoom(roomID) {
  if (!rooms[roomID]) {
    rooms[roomID] = {
      players: [],
      currentDrawer: null,
      currentDrawerIndex: -1,
      secretWord: "",
      secretCategory: null,
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
    wordCategory: room.secretCategory || null,
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
  const picked = pickWord();
  room.secretWord = picked.word;
  room.secretCategory = picked.category;
  room.roundEndsAt = Date.now() + ROUND_DURATION_MS;

  io.to(roomID).emit("clear-canvas");
  io.to(roomID).emit("round-start", {
    currentDrawer: room.currentDrawer,
    currentDrawerName: drawer.name,
    roundEndsAt: room.roundEndsAt,
    wordLength: room.secretWord.length,
    wordCategory: room.secretCategory,
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

  socket.on("request-new-word", () => {
    const roomID = socketRoomMap.get(socket.id);
    if (!roomID) return;

    const room = rooms[roomID];
    if (!room || room.currentDrawer !== socket.id) return;

    // Start a new round but keep the same drawer index
    startRound(roomID, room.currentDrawerIndex);
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
