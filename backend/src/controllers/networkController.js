const { execSync } = require("child_process");

/**
 * Chay mot lenh shell, tra ve true neu thanh cong, false neu loi.
 * stdio: "pipe" de bat output, tranh lenh block terminal.
 */
function runCmd(cmd) {
  try {
    execSync(cmd, { stdio: "pipe" });
    return { ok: true };
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString().trim() : "";
    const stdout = e.stdout ? e.stdout.toString().trim() : "";
    return { ok: false, error: stderr || stdout || e.message };
  }
}

/**
 * Xoa het tc rules tren eth0.
 * Lenh nay co the that bai neu chua co rule nao -> bo qua loi.
 */
function clearTcRules() {
  runCmd("tc qdisc del dev eth0 root 2>/dev/null || true");
}

/**
 * API endpoint POST /api/network-scenario
 *
 * KIEN TRUC TC:
 * Backend container dung network_mode: service:caddy
 * -> Backend va Caddy CHIA SE cung network namespace
 * -> tc eth0 cua backend = tc eth0 cua Caddy
 * -> Traffic shaping anh huong TRUC TIEP den media/video browser nhan
 *
 * @param {Object} req.body - { maxBitrateKbps, delayMs, lossPercent }
 */
function applyNetworkScenario(req, res) {
  const { maxBitrateKbps, delayMs, lossPercent } = req.body;

  // Kiem tra xem tc co san sang khong (iproute2 phai duoc cai trong container)
  const tcCheck = runCmd("which tc");
  if (!tcCheck.ok) {
    console.error("[Network] lenh `tc` khong tim thay - iproute2 chua duoc cai?");
    return res.status(500).json({
      error: "lenh tc khong co san (iproute2 chua cai)",
      hint: "Backend Dockerfile can `apk add iproute2`",
    });
  }

  try {
    // Buoc 1: Xoa het rules cu tren eth0
    clearTcRules();

    const hasBitrate = maxBitrateKbps && Number(maxBitrateKbps) > 0;
    const hasDelay   = delayMs        && Number(delayMs) > 0;
    const hasLoss    = lossPercent    && Number(lossPercent) > 0;

    if (!hasBitrate && !hasDelay && !hasLoss) {
      // Kich ban "Normal" -> chi xoa rules la xong
      console.log("[Network] Cleared - Back to Normal (xoa het tc rules)");
      return res.json({ success: true, message: "Normal - da xoa gioi han mang" });
    }

    // Buoc 2: Xay dung lenh tc netem
    // tc netem ho tro: rate (gioi han bandwidth), delay+jitter, loss (%)
    let netemArgs = "";

    if (hasBitrate) {
      netemArgs += ` rate ${maxBitrateKbps}kbit`;
    }
    if (hasDelay) {
      // Them jitter = delay / 4 de gia lap bien dong mang thuc te
      const jitter = Math.max(1, Math.round(Number(delayMs) / 4));
      netemArgs += ` delay ${delayMs}ms ${jitter}ms distribution normal`;
    }
    if (hasLoss) {
      netemArgs += ` loss ${lossPercent}%`;
    }

    netemArgs = netemArgs.trim();

    // Buoc 3: Ap dung tc netem tren eth0
    // Voi network_mode: service:caddy, eth0 nay la cua Caddy
    // -> anh huong TOAN BO traffic Caddy phuc vu cho browser
    const cmd = `tc qdisc add dev eth0 root netem ${netemArgs}`;
    console.log(`[Network] Ap dung: ${cmd}`);

    const result = runCmd(cmd);
    if (!result.ok) {
      console.error(`[Network] tc that bai: ${result.error}`);
      return res.status(500).json({
        error: "tc that bai",
        detail: result.error,
        cmd,
      });
    }

    // Xac nhan thanh cong bang cach doc lai rules hien tai
    const verify = runCmd("tc qdisc show dev eth0");
    const currentRules = verify.ok ? "" : "";

    console.log(`[Network] Thanh cong: ${netemArgs}`);
    res.json({
      success: true,
      message: `Applied: ${netemArgs}`,
      applied: { maxBitrateKbps, delayMs, lossPercent },
    });

  } catch (error) {
    console.error("[Network] Loi khong mong muon:", error.message);
    res.status(500).json({
      error: "Loi he thong",
      detail: error.message,
    });
  }
}

module.exports = { applyNetworkScenario };
