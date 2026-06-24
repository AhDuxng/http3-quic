const { execSync } = require("child_process");

function runCommand(command) {
  try {
    execSync(command, { stdio: "pipe" });
    return { ok: true };
  } catch (error) {
    const stderr = error.stderr ? error.stderr.toString().trim() : "";
    const stdout = error.stdout ? error.stdout.toString().trim() : "";
    return { ok: false, error: stderr || stdout || error.message };
  }
}

function clearTcRules() {
  runCommand("tc qdisc del dev eth0 root 2>/dev/null || true");
}

function applyNetworkScenario(req, res) {
  const { maxBitrateKbps, delayMs, lossPercent } = req.body;

  const tcCheck = runCommand("which tc");
  if (!tcCheck.ok) {
    console.error("[Network] lenh `tc` khong tim thay - iproute2 chua duoc cai?");
    return res.status(500).json({
      error: "lenh tc khong co san (iproute2 chua cai)",
      hint: "Backend Dockerfile can `apk add iproute2`",
    });
  }

  try {
    clearTcRules();

    const hasBitrate = maxBitrateKbps && Number(maxBitrateKbps) > 0;
    const hasDelay = delayMs && Number(delayMs) > 0;
    const hasLoss = lossPercent && Number(lossPercent) > 0;

    if (!hasBitrate && !hasDelay && !hasLoss) {
      console.log("[Network] Cleared - Back to Normal (xoa het tc rules)");
      return res.json({ success: true, message: "Normal - da xoa gioi han mang" });
    }

    let netemArgs = "";

    if (hasBitrate) {
      netemArgs += ` rate ${maxBitrateKbps}kbit`;
    }
    if (hasDelay) {
      const jitter = Math.max(1, Math.round(Number(delayMs) / 4));
      netemArgs += ` delay ${delayMs}ms ${jitter}ms distribution normal`;
    }
    if (hasLoss) {
      netemArgs += ` loss ${lossPercent}%`;
    }

    netemArgs = netemArgs.trim();

    const command = `tc qdisc add dev eth0 root netem ${netemArgs}`;
    console.log(`[Network] Ap dung: ${command}`);

    const result = runCommand(command);
    if (!result.ok) {
      console.error(`[Network] tc that bai: ${result.error}`);
      return res.status(500).json({
        error: "tc that bai",
        detail: result.error,
        command,
      });
    }

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
