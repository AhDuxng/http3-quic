/**
 * index.js - Entry point cua backend server.
 *
 * Khoi tao Express app va khoi dong server lang nghe ket noi.
 * Config duoc doc tu bien moi truong qua module src/config/env.js.
 */
const { createApp } = require("./src/app/createApp");
const { env } = require("./src/config/env");

// Tao Express app voi day du middleware va routes da cau hinh
const app = createApp();

// Lang nghe ket noi tren host:port duoc chi dinh
app.listen(env.port, env.host, () => {
  console.log(`[Server] Running on http://${env.host}:${env.port}`);
});
