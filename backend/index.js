const { createApp } = require("./src/app/createApp");
const { env } = require("./src/config/env");

const app = createApp();

app.listen(env.port, env.host, () => {
  console.log(`[Server] Running on http://${env.host}:${env.port}`);
});
