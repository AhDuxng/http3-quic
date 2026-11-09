/**
 * Entry point of the NGIS Stream backend API. Builds the Express application
 * and listens on the HOST and PORT taken from the environment.
 */

const { createApp } = require("./src/app/createApp");
const { env } = require("./src/config/env");

const app = createApp();

app.listen(env.port, env.host, () => {
  console.log(`[Server] Running on http://${env.host}:${env.port}`);
});
