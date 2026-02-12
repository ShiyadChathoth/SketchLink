const { io } = require("socket.io-client");

const SERVER_URL = process.env.SOCKET_TEST_URL || "http://127.0.0.1:3001";
const ROOM_ID = `smoke-${Date.now()}`;

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function connectClient(name) {
  const socket = io(SERVER_URL, {
    transports: ["websocket", "polling"],
    reconnection: false,
    timeout: 4000,
  });

  const events = {
    roundStart: null,
    yourWord: null,
  };

  socket.on("round-start", (payload) => {
    events.roundStart = payload;
  });

  socket.on("your-word", (payload) => {
    events.yourWord = payload;
  });

  return withTimeout(
    new Promise((resolve, reject) => {
      socket.once("connect", () => {
        socket.emit("join-room", { name, roomID: ROOM_ID });
      });
      socket.once("joined-room", () => {
        resolve({ socket, events });
      });
      socket.once("connect_error", reject);
    }),
    5000,
    `${name} connect`
  );
}

function once(socket, eventName, label, timeoutMs = 6000) {
  return withTimeout(
    new Promise((resolve) => {
      socket.once(eventName, resolve);
    }),
    timeoutMs,
    label
  );
}

function mutateOneChar(word) {
  if (!word) return "x";
  const chars = word.split("");
  const i = chars.length - 1;
  chars[i] = chars[i] === "z" ? "y" : "z";
  return chars.join("");
}

async function main() {
  const aliceClient = await connectClient("Alice");
  const bobClient = await connectClient("Bob");
  const alice = aliceClient.socket;
  const bob = bobClient.socket;

  const cleanup = () => {
    alice.disconnect();
    bob.disconnect();
  };

  try {
    // First round should exist by now.
    const roomStateAlice = await once(alice, "room-state", "room-state");
    if (!roomStateAlice.players || roomStateAlice.players.length < 2) {
      throw new Error("Expected at least 2 players in room-state.");
    }

    const roundStart =
      aliceClient.events.roundStart ||
      bobClient.events.roundStart || { currentDrawer: roomStateAlice.currentDrawer };
    const drawerID = roundStart.currentDrawer || roomStateAlice.currentDrawer;
    if (!drawerID) {
      throw new Error("Could not determine current drawer.");
    }

    let drawerSocket = alice;
    let guesserSocket = bob;
    let drawerEvents = aliceClient.events;
    if (bob.id === drawerID) {
      drawerSocket = bob;
      guesserSocket = alice;
      drawerEvents = bobClient.events;
    }

    const wordPayload = drawerEvents.yourWord
      ? drawerEvents.yourWord
      : await once(drawerSocket, "your-word", "your-word");
    const secretWord = String(wordPayload.secretWord || "").trim();
    if (!secretWord) {
      throw new Error("Expected drawer secret word.");
    }

    // Draw event propagation check.
    const renderPromise = once(
      guesserSocket,
      "render-line",
      "render-line",
      5000
    );
    drawerSocket.emit("draw-data", {
      x0: 0.1,
      y0: 0.1,
      x1: 0.3,
      y1: 0.3,
      color: "#111111",
      lineWidth: 3,
    });
    await renderPromise;

    // Close-guess hint check.
    const nearGuess = mutateOneChar(secretWord);
    const hintPromise = once(
      guesserSocket,
      "guess-feedback",
      "guess-feedback",
      5000
    );
    guesserSocket.emit("submit-guess", { guess: nearGuess });
    const hint = await hintPromise;
    if (!String(hint.message || "").toLowerCase().includes("close")) {
      throw new Error("Expected close-guess feedback.");
    }

    // Exact-guess scoring flow check.
    const correctPromise = Promise.race([
      once(alice, "correct-guess", "correct-guess alice", 5000),
      once(bob, "correct-guess", "correct-guess bob", 5000),
    ]);
    guesserSocket.emit("submit-guess", { guess: secretWord });
    const correct = await correctPromise;
    if (String(correct.secretWord || "").toLowerCase() !== secretWord.toLowerCase()) {
      throw new Error("Correct guess event did not include expected word.");
    }

    console.log("Smoke test passed: join -> draw -> close guess -> correct guess.");
  } finally {
    cleanup();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
