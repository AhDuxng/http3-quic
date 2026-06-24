function getEnvString(name, fallback) {
  const value = process.env[name];
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return fallback;
}

function getEnvNumber(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

const env = Object.freeze({
  host: getEnvString("HOST", "0.0.0.0"),
  port: getEnvNumber("PORT", 3000),
  corsOrigin: getEnvString("CORS_ORIGIN", "*"),
});

module.exports = { env };
