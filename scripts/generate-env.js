const fs = require("fs");
const path = require("path");

const targetPath = path.join(__dirname, "..", "env.js");
const defaultSocketUrl = "https://shiyad-ideapad-1-15amn7.tailb72c55.ts.net";
const socketUrl = String(
  process.env.NEXT_PUBLIC_SOCKET_URL || defaultSocketUrl
).trim();

const output = `window.__ENV__ = Object.assign({}, window.__ENV__, {
  NEXT_PUBLIC_SOCKET_URL: ${JSON.stringify(socketUrl)},
});
`;

fs.writeFileSync(targetPath, output, "utf8");
console.log(
  `Generated env.js with NEXT_PUBLIC_SOCKET_URL=${socketUrl || "(empty; fallback to script default)"}`
);
