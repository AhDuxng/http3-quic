const { execSync } = require("child_process");

function runCommand(command) {
  try {
    const stdout = execSync(command, { stdio: "pipe" }).toString().trim();
    return { ok: true, output: stdout };
  } catch (error) {
    const stderr = error.stderr ? error.stderr.toString().trim() : "";
    const stdout = error.stdout ? error.stdout.toString().trim() : "";
    return { ok: false, error: stderr || stdout || error.message };
  }
}

function clearTcRules() {
  const result = runCommand("tc qdisc del dev eth0 root");
  if (!result.ok && !/No such file|Cannot delete qdisc with handle of zero/i.test(result.error)) {
    return result;
  }
  return { ok: true };
}

function verifyNetemIsCleared() {
  const result = runCommand("tc qdisc show dev eth0");
  if (!result.ok) return result;
  if (/\bnetem\b/i.test(result.output || "")) {
    return { ok: false, error: `netem van con ton tai: ${result.output}` };
  }
  return { ok: true };
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
    const clearResult = clearTcRules();
    if (!clearResult.ok) {
      return res.status(500).json({
        error: "khong the xoa tc/netem",
        detail: clearResult.error,
      });
    }

    const hasBitrate = maxBitrateKbps && Number(maxBitrateKbps) > 0;
    const hasDelay = delayMs && Number(delayMs) > 0;
    const hasLoss = lossPercent && Number(lossPercent) > 0;

    if (!hasBitrate && !hasDelay && !hasLoss) {
      const verification = verifyNetemIsCleared();
      if (!verification.ok) {
        return res.status(500).json({
          error: "tc/netem chua duoc xoa hoan toan",
          detail: verification.error,
        });
      }
      console.log("[Network] Cleared - Back to Normal (xoa het tc rules)");
      return res.json({
        success: true,
        message: "Real network - tc/netem da duoc xoa",
        applied: { maxBitrateKbps: null, delayMs: 0, lossPercent: 0 },
      });
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
