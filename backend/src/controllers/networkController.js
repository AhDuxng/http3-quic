const { execSync } = require("child_process");

// Ten container Caddy (doc tu bien moi truong, mac dinh la caddy_server)
// Backend se chay `docker exec <CADDY_CONTAINER_NAME> tc ...` de ap dung
// traffic shaping TREN container Caddy - noi thuc su phuc vu media/traffic den browser
const CADDY_CONTAINER = process.env.CADDY_CONTAINER_NAME || "caddy_server";

/**
 * Chay mot lenh shell va tra ve ket qua.
 * Neu lenh loi, nem loi de caller xu ly.
 * @param {string} cmd - Lenh can chay
 */
function runCmd(cmd) {
  try {
    execSync(cmd, { stdio: "ignore" });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Ap dung tc netem tren mot interface cu the (eth0) cua mot container.
 * Strategy:
 *   1. Neu co DOCKER_SOCKET (docker.sock duoc mount), chay qua `docker exec <container> tc`
 *      -> Hieu luc tren Caddy container: tat ca traffic browser<->Caddy bi anh huong
 *   2. Fallback: chay tc truc tiep tren container backend (co the dung de test)
 *
 * @param {string} containerName - Ten container can ap dung tc
 * @param {string} tcArgs - Phan tham so cho lenh `tc qdisc add dev eth0 root netem ...`
 */
function applyTcOnContainer(containerName, tcArgs) {
  // Thu xoa tc rules cu tren container Caddy truoc
  runCmd(`docker exec ${containerName} tc qdisc del dev eth0 root 2>/dev/null || true`);

  if (tcArgs) {
    // Ap dung rules moi tren Caddy container
    const addCmd = `docker exec ${containerName} tc qdisc add dev eth0 root netem ${tcArgs}`;
    console.log(`[Network] docker exec ${containerName}: tc qdisc add dev eth0 root netem ${tcArgs}`);
    const ok = runCmd(addCmd);
    if (!ok) {
      // Fallback: ap dung tren chinh container backend neu docker exec that bai
      console.warn(`[Network] docker exec that bai, fallback: ap dung tc tren backend eth0`);
      runCmd("tc qdisc del dev eth0 root 2>/dev/null || true");
      runCmd(`tc qdisc add dev eth0 root netem ${tcArgs}`);
    }
  } else {
    console.log(`[Network] Xoa het tc rules tren ${containerName} (Back to Normal)`);
    // Fallback: xoa tren backend
    runCmd("tc qdisc del dev eth0 root 2>/dev/null || true");
  }
}

/**
 * API endpoint POST /api/network-scenario
 * Nhan params: maxBitrateKbps, delayMs, lossPercent
 * Ap dung tc netem len container Caddy de gia lap kich ban mang thuc.
 */
function applyNetworkScenario(req, res) {
  const { maxBitrateKbps, delayMs, lossPercent } = req.body;

  try {
    // Xay dung phan tham so tc netem
    // netem ho tro: rate (bandwidth), delay (latency + jitter), loss (packet loss %)
    const hasBitrate = maxBitrateKbps && Number(maxBitrateKbps) > 0;
    const hasDelay = delayMs && Number(delayMs) > 0;
    const hasLoss = lossPercent && Number(lossPercent) > 0;

    let tcArgs = "";

    if (hasBitrate || hasDelay || hasLoss) {
      // Xay dung chuoi tham so cho tc netem
      if (hasBitrate) {
        tcArgs += ` rate ${maxBitrateKbps}kbit`;
      }
      if (hasDelay) {
        // Them jitter = 1/4 delay de gia lap mang thuc te hon
        const jitter = Math.max(1, Math.round(Number(delayMs) / 4));
        tcArgs += ` delay ${delayMs}ms ${jitter}ms distribution normal`;
      }
      if (hasLoss) {
        tcArgs += ` loss ${lossPercent}%`;
      }
      tcArgs = tcArgs.trim();
    }

    // Ap dung tc len Caddy container (noi phuc vu media/traffic that su)
    applyTcOnContainer(CADDY_CONTAINER, tcArgs);

    const summary = tcArgs
      ? `Applied: ${tcArgs}`
      : "Cleared (Normal - khong gioi han)";

    console.log(`[Network] ${summary}`);
    res.json({ success: true, message: summary });
  } catch (error) {
    console.error("[Network] Loi khi ap dung tc:", error.message || error);
    res.status(500).json({
      error: "Khong the ap dung kich ban mang",
      detail: error.message || String(error),
    });
  }
}

module.exports = { applyNetworkScenario };
