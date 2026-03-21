const { execSync } = require("child_process");

/**
 * Api to set network conditions using tc.
 */
function applyNetworkScenario(req, res) {
  const { maxBitrateKbps, delayMs, lossPercent } = req.body;

  try {
    // Xoa luot tc rules neu da co
    try {
      execSync("tc qdisc del dev eth0 root", { stdio: "ignore" });
    } catch (e) {
      // ignore
    }

    if ((maxBitrateKbps && maxBitrateKbps > 0) || (delayMs && delayMs > 0) || (lossPercent && lossPercent > 0)) {
      // Ap dung tc netem de limit bandwidth, delay (kem jitter), va packet loss ngan hang.
      let cmd = 'tc qdisc add dev eth0 root netem';
      
      if (maxBitrateKbps) {
        cmd += ` rate ${maxBitrateKbps}kbit`;
      }
      if (delayMs) {
        // Them 1/4 jitter vao delay, vi du delay 100ms se lech 25ms random
        const jitter = Math.round(delayMs / 4);
        cmd += ` delay ${delayMs}ms ${jitter}ms`;
      }
      if (lossPercent) {
        cmd += ` loss ${lossPercent}%`;
      }

      console.log(`[Network] Applying TC: ${cmd}`);
      execSync(cmd, { stdio: "ignore" });
    } else {
      console.log(`[Network] Cleared TC rules (Back to Normal)`);
    }

    res.json({ success: true, message: "Network scenario applied successfully" });
  } catch (error) {
    console.error("[Network] Failed to apply tc rule:", error);
    res.status(500).json({ error: "Failed to apply network scenario" });
  }
}

module.exports = { applyNetworkScenario };
