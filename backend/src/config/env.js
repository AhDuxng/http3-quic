/**
 * env.js - Doc va validate bien moi truong (environment variables).
 *
 * Tap trung toan bo cau hinh vao mot noi, tranh truong hop
 * cac module tu doc truc tiep process.env (kho bao tri va test).
 *
 * Dung Object.freeze de dam bao config la readonly sau khi khoi tao.
 */

/**
 * Doc bien moi truong dang string.
 * @param {string} name    - Ten bien moi truong
 * @param {string} fallback - Gia tri mac dinh neu bien khong ton tai hoac rong
 * @returns {string}
 */
function getEnvString(name, fallback) {
  const value = process.env[name];
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return fallback;
}

/**
 * Doc bien moi truong dang so nguyen.
 * @param {string} name     - Ten bien moi truong
 * @param {number} fallback - Gia tri mac dinh neu bien khong hop le
 * @returns {number}
 */
function getEnvNumber(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  // Kiem tra la so hop le (khong phai NaN hoac Infinity)
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Object cau hinh ung dung (readonly).
 * Cac module khac import object nay thay vi doc process.env truc tiep.
 */
const env = Object.freeze({
  host: getEnvString("HOST", "0.0.0.0"),        // Dia chi lang nghe (0.0.0.0 = moi interface)
  port: getEnvNumber("PORT", 3000),             // Cong lang nghe
  corsOrigin: getEnvString("CORS_ORIGIN", "*"), // Origin duoc phep goi API
});

module.exports = { env };
