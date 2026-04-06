"""
analyze_logs.py  —  ADTube Streaming Performance Analyzer v2
═══════════════════════════════════════════════════════════════
Precisely compares HTTP/2 (TCP) vs HTTP/3 (QUIC) streaming
performance using CSV telemetry exported from the ADTube player.

Charts produced (all publication-ready):
  01  Summary comparison table (image)
  02  CDF — Empirical cumulative distribution for every metric
  03  Box-plot — Quartile spread + outlier analysis
  04  Timeline — Metric evolution over playback duration
  05  Bar chart — Mean ± 95% CI for key network metrics
  06  Radar — Normalised multi-metric overview
  07  Stall & rebuffer analysis (dedicated)
  08  Heatmap — Correlation matrix per protocol
  09  Throughput stability — CoV & sliding window
  10  Percentile ladder — P5/P25/P50/P75/P95 side-by-side

Statistical tests applied per metric:
  • Welch's t-test  (parametric, unequal variance)
  • Mann–Whitney U  (non-parametric, ordinal)
  • Kolmogorov–Smirnov 2-sample
  • Cohen's d effect size
  • Coefficient of Variation (CoV)
  All results written to  statistical_tests.csv

CSV columns consumed (auto-detected, missing columns skipped):
  Timestamp Level Message Protocol NetworkType
  Bitrate_kbps Resolution Throughput_kbps Buffer_s FPS
  TTFB_ms SDT_ms Jitter_ms DownloadSpeed_kbps
  StallCount StallDuration_ms RebufferingRatio
  DroppedFrames QualitySwitchCount
  CurrentTime_s Duration_s IsAutoQuality ActiveScenario

Usage:
  GUI   python analyze_logs.py
  CLI   python analyze_logs.py <h2.csv> <h3.csv> [--out dir]

Requirements:
  pip install pandas matplotlib numpy scipy
"""

from __future__ import annotations

import argparse
import math
import os
import platform
import subprocess
import sys
import textwrap
import warnings
import tkinter as tk
from datetime import datetime
from tkinter import filedialog, messagebox, ttk
from typing import Callable, List, Optional

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy import stats as sp_stats

warnings.filterwarnings("ignore")

# ═══════════════════════════════════════════════════════════════════════════
#  METRIC REGISTRY  — single source of truth for every numeric column
# ═══════════════════════════════════════════════════════════════════════════
# csv_col  : exact column name in the exported CSV
# label    : human-readable for charts / tables
# unit     : measurement unit
# agg      : "inst" = instantaneous (use all rows) | "cum" = cumulative (last row only)
# better   : "lower" | "higher" | None (informational)
# group    : logical chart group

_METRICS = [
    # ── Network / transport ──
    ("TTFB_ms",            "TTFB",                   "ms",   "inst", "lower",  "net"),
    ("SDT_ms",             "Segment Download Time",  "ms",   "inst", "lower",  "net"),
    ("Jitter_ms",          "SDT Jitter",             "ms",   "inst", "lower",  "net"),
    ("DownloadSpeed_kbps", "Download Speed",         "kbps", "inst", "higher", "net"),
    ("Throughput_kbps",    "Throughput",              "kbps", "inst", "higher", "net"),
    # ── Video quality ──
    ("Bitrate_kbps",       "Bitrate",                "kbps", "inst", "higher", "quality"),
    ("Buffer_s",           "Buffer Level",           "s",    "inst", "higher", "quality"),
    ("FPS",                "Frame Rate",             "fps",  "inst", "higher", "quality"),
    # ── Playback stability (cumulative — take last value per session) ──
    ("StallCount",         "Stall Count",            "",     "cum",  "lower",  "stall"),
    ("StallDuration_ms",   "Stall Duration",         "ms",   "cum",  "lower",  "stall"),
    ("RebufferingRatio",   "Rebuffering Ratio",      "",     "cum",  "lower",  "stall"),
    ("DroppedFrames",      "Dropped Frames",         "",     "cum",  "lower",  "stall"),
    ("QualitySwitchCount", "Quality Switches",       "",     "cum",  "lower",  "stall"),
    # ── Context ──
    ("CurrentTime_s",      "Playback Position",      "s",    "cum",  None,     "ctx"),
    ("Duration_s",         "Duration",               "s",    "cum",  None,     "ctx"),
]

class _M:
    """Immutable metric descriptor."""
    __slots__ = ("col", "label", "unit", "agg", "better", "group")
    def __init__(self, col, label, unit, agg, better, group):
        self.col = col; self.label = label; self.unit = unit
        self.agg = agg; self.better = better; self.group = group

METRICS = [_M(*m) for m in _METRICS]
METRIC_BY_COL = {m.col: m for m in METRICS}

# Convenience lists
INST_COLS = [m.col for m in METRICS if m.agg == "inst"]
CUM_COLS  = [m.col for m in METRICS if m.agg == "cum"]
ALL_NUM   = [m.col for m in METRICS]

# Legacy column renames (old CSV → current name)
_RENAMES = {
    "Latency_ms": None,
    "RTT_ms": "TTFB_ms",
    "SegmentDuration_ms": "SDT_ms",
    "SegmentDownloadTime_ms": "SDT_ms",
}

# ═══════════════════════════════════════════════════════════════════════════
#  DARK THEME  — publication-ready dark palette
# ═══════════════════════════════════════════════════════════════════════════

C_H2         = "#4C9BE8"   # blue
C_H3         = "#F5A623"   # amber
C_BG         = "#0F1117"
C_CARD       = "#1A1D27"
C_TEXT       = "#E8EAF0"
C_GRID       = "#2A2D3E"
C_GREEN      = "#4ADE80"
C_RED        = "#F87171"
C_MUTED      = "#9A9DBF"

plt.rcParams.update({
    "figure.facecolor": C_BG,   "axes.facecolor": C_CARD,
    "axes.edgecolor": C_GRID,   "axes.labelcolor": C_TEXT,
    "xtick.color": C_TEXT,      "ytick.color": C_TEXT,
    "text.color": C_TEXT,       "grid.color": C_GRID,
    "grid.linestyle": "--",     "grid.alpha": 0.45,
    "legend.facecolor": C_CARD, "legend.edgecolor": C_GRID,
    "font.family": "sans-serif",
})

# ═══════════════════════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════════════════════

def _avail(h2: pd.DataFrame, h3: pd.DataFrame, cols: List[str]) -> List[str]:
    return [c for c in cols if c in h2.columns and c in h3.columns]


def _style(ax, title="", xlabel="", ylabel=""):
    ax.set_title(title, fontsize=11, fontweight="bold", color=C_TEXT, pad=10)
    if xlabel: ax.set_xlabel(xlabel, fontsize=9)
    if ylabel: ax.set_ylabel(ylabel, fontsize=9)
    ax.yaxis.grid(True); ax.set_axisbelow(True)
    for s in ax.spines.values(): s.set_color(C_GRID)


def _save(fig, out, name):
    p = os.path.join(out, name)
    fig.savefig(p, dpi=180, bbox_inches="tight", facecolor=C_BG)
    plt.close(fig); print(f"  ✔  {p}"); return p


def _hide(axes, used, total):
    for i in range(used, total): axes[i].set_visible(False)


def _val(series, col):
    """Representative scalar: last (cumulative) or mean (instantaneous)."""
    s = series.dropna()
    if s.empty: return float("nan")
    m = METRIC_BY_COL.get(col)
    if m and m.agg == "cum": return float(s.iloc[-1])
    return float(s.mean())


def _cohens_d(a, b):
    """Cohen's d effect size (pooled std)."""
    na, nb = len(a), len(b)
    if na < 2 or nb < 2: return float("nan")
    sp = np.sqrt(((na-1)*np.var(a,ddof=1) + (nb-1)*np.var(b,ddof=1)) / (na+nb-2))
    if sp == 0: return 0.0
    return (np.mean(a) - np.mean(b)) / sp


# ═══════════════════════════════════════════════════════════════════════════
#  CSV READER
# ═══════════════════════════════════════════════════════════════════════════

def load_csv(path: str, label: str) -> pd.DataFrame:
    if not os.path.isfile(path):
        print(f"[ERROR] File not found: {path}"); sys.exit(1)
    df = pd.read_csv(path, encoding="utf-8-sig")
    df.columns = [c.strip() for c in df.columns]
    for old, new in _RENAMES.items():
        if old in df.columns:
            if new is None:
                df.drop(columns=[old], inplace=True)
            elif new not in df.columns:
                df.rename(columns={old: new}, inplace=True)
    for c in ALL_NUM:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    df["_proto"] = label
    print(f"  [{label}] {len(df)} rows,  {sum(1 for c in ALL_NUM if c in df.columns)} numeric cols")
    return df


# ═══════════════════════════════════════════════════════════════════════════
#  STATISTICAL TESTS  — comprehensive per-metric analysis
# ═══════════════════════════════════════════════════════════════════════════

def compute_stat_tests(h2: pd.DataFrame, h3: pd.DataFrame) -> pd.DataFrame:
    """
    For each shared numeric column run:
      • Welch t-test                (parametric)
      • Mann-Whitney U              (non-parametric)
      • KS 2-sample                 (distribution shape)
      • Cohen's d                   (effect size)
      • Mean, Median, Std, CoV      (descriptive)
      • P5, P25, P50, P75, P95      (percentiles)
      • Δ mean, Δ%, Verdict
    """
    cols = _avail(h2, h3, ALL_NUM)
    rows = []
    for c in cols:
        m = METRIC_BY_COL[c]
        a = h2[c].dropna().values.astype(float)
        b = h3[c].dropna().values.astype(float)
        if len(a) < 2 or len(b) < 2:
            continue

        ma, mb = np.mean(a), np.mean(b)
        mda, mdb = np.median(a), np.median(b)
        sa, sb = np.std(a, ddof=1), np.std(b, ddof=1)
        cov_a = (sa / ma * 100) if ma != 0 else 0
        cov_b = (sb / mb * 100) if mb != 0 else 0

        # Welch t-test
        t_stat, t_p = sp_stats.ttest_ind(a, b, equal_var=False)
        # Mann-Whitney
        try:
            u_stat, u_p = sp_stats.mannwhitneyu(a, b, alternative="two-sided")
        except ValueError:
            u_stat, u_p = float("nan"), float("nan")
        # KS test
        ks_stat, ks_p = sp_stats.ks_2samp(a, b)
        # Effect size
        d = _cohens_d(a, b)

        delta = mb - ma
        pct = (delta / ma * 100) if ma != 0 else float("nan")

        verdict = "="
        if not np.isnan(delta) and delta != 0 and m.better:
            if m.better == "lower":
                verdict = "H3 ✓" if delta < 0 else "H2 ✓"
            else:
                verdict = "H3 ✓" if delta > 0 else "H2 ✓"

        rows.append({
            "Metric": c, "Label": m.label, "Unit": m.unit,
            "Type": m.agg, "Group": m.group,
            # Descriptive — H2
            "H2_mean": round(ma, 4), "H2_median": round(mda, 4),
            "H2_std": round(sa, 4), "H2_CoV%": round(cov_a, 2),
            "H2_P5": round(np.percentile(a, 5), 4),
            "H2_P25": round(np.percentile(a, 25), 4),
            "H2_P50": round(np.percentile(a, 50), 4),
            "H2_P75": round(np.percentile(a, 75), 4),
            "H2_P95": round(np.percentile(a, 95), 4),
            # Descriptive — H3
            "H3_mean": round(mb, 4), "H3_median": round(mdb, 4),
            "H3_std": round(sb, 4), "H3_CoV%": round(cov_b, 2),
            "H3_P5": round(np.percentile(b, 5), 4),
            "H3_P25": round(np.percentile(b, 25), 4),
            "H3_P50": round(np.percentile(b, 50), 4),
            "H3_P75": round(np.percentile(b, 75), 4),
            "H3_P95": round(np.percentile(b, 95), 4),
            # Comparison
            "Δ_mean": round(delta, 4),
            "Δ%": round(pct, 2) if not np.isnan(pct) else "N/A",
            # Tests
            "Welch_t": round(t_stat, 4), "Welch_p": f"{t_p:.2e}",
            "MannWhitney_U": round(u_stat, 1) if not np.isnan(u_stat) else "N/A",
            "MannWhitney_p": f"{u_p:.2e}" if not np.isnan(u_p) else "N/A",
            "KS_stat": round(ks_stat, 4), "KS_p": f"{ks_p:.2e}",
            "Cohens_d": round(d, 4),
            "Verdict": verdict,
        })
    return pd.DataFrame(rows)


def print_summary(h2, h3, df):
    print(f"\n{'═'*90}")
    print("  ADTube Performance Analyzer v2  │  HTTP/2 vs HTTP/3 (QUIC)")
    print(f"{'═'*90}")
    print(f"  H2: {len(h2):,} rows   H3: {len(h3):,} rows")
    if df.empty:
        print("  (no shared numeric columns)"); return
    short = df[["Metric","H2_mean","H3_mean","Δ%","Welch_p","KS_p","Cohens_d","Verdict"]].copy()
    print(short.to_string(index=False))
    h3w = (df["Verdict"]=="H3 ✓").sum()
    h2w = (df["Verdict"]=="H2 ✓").sum()
    print(f"\n  H3 wins {h3w},  H2 wins {h2w},  tie/info {len(df)-h3w-h2w}")
    print(f"{'═'*90}\n")


# ═══════════════════════════════════════════════════════════════════════════
#  CHART 01 — Summary comparison table (rendered to image)
# ═══════════════════════════════════════════════════════════════════════════

def chart_summary_table(stat_df: pd.DataFrame, out: str):
    if stat_df.empty: return
    tbl = stat_df[["Metric","Unit","H2_mean","H3_mean","Δ%",
                   "Welch_p","KS_p","Cohens_d","Verdict"]].copy()
    nr = len(tbl)
    fig_h = max(3.5, 0.42 * nr + 2)
    fig, ax = plt.subplots(figsize=(18, fig_h))
    fig.patch.set_facecolor(C_BG); ax.set_facecolor(C_BG); ax.axis("off")
    headers = list(tbl.columns)
    table = ax.table(cellText=tbl.values, colLabels=headers,
                     cellLoc="center", loc="center")
    table.auto_set_font_size(False); table.set_fontsize(8.5)
    for ci in range(len(headers)):
        c = table[0, ci]
        c.set_facecolor("#2A2D3E"); c.set_text_props(color=C_TEXT, fontweight="bold")
        c.set_edgecolor(C_GRID)
    for ri in range(1, nr+1):
        v = str(tbl.iloc[ri-1]["Verdict"])
        for ci in range(len(headers)):
            c = table[ri, ci]
            c.set_facecolor(C_CARD if ri%2==0 else "#141720")
            c.set_text_props(color=C_TEXT); c.set_edgecolor(C_GRID)
            if ci == len(headers)-1:
                if "H3" in v: c.set_text_props(color=C_H3, fontweight="bold")
                elif "H2" in v: c.set_text_props(color=C_H2, fontweight="bold")
    ax.set_title("Summary  │  HTTP/2 vs HTTP/3 (QUIC)  │  Statistical Tests",
                 fontsize=14, fontweight="bold", color=C_TEXT, pad=12, loc="left")
    _save(fig, out, "01_summary_table.png")


# ═══════════════════════════════════════════════════════════════════════════
#  CHART 02 — Empirical CDF  (one subplot per metric)
# ═══════════════════════════════════════════════════════════════════════════

def chart_cdf(h2, h3, out):
    cols = _avail(h2, h3, INST_COLS)
    if not cols: return
    n = min(len(cols), 9); nc = min(n, 3); nr = math.ceil(n/nc)
    fig, axes = plt.subplots(nr, nc, figsize=(6.5*nc, 5*nr))
    fig.suptitle("Empirical CDF  │  CDF(x) = P(X ≤ x)",
                 fontsize=14, fontweight="bold", color=C_TEXT, y=1.02)
    axes = np.atleast_1d(axes).flatten()
    for i, c in enumerate(cols[:n]):
        ax = axes[i]; m = METRIC_BY_COL[c]
        a = np.sort(h2[c].dropna().values.astype(float))
        b = np.sort(h3[c].dropna().values.astype(float))
        if len(a)<2 or len(b)<2: ax.set_visible(False); continue
        ax.step(a, np.arange(1,len(a)+1)/len(a), where="post",
                color=C_H2, lw=2, label="HTTP/2", alpha=.9)
        ax.step(b, np.arange(1,len(b)+1)/len(b), where="post",
                color=C_H3, lw=2, label="HTTP/3", alpha=.9)
        ax.fill_between(a, np.arange(1,len(a)+1)/len(a), step="post", color=C_H2, alpha=.06)
        ax.fill_between(b, np.arange(1,len(b)+1)/len(b), step="post", color=C_H3, alpha=.06)
        # Percentile lines
        for pct, ls in [(50,"--"),(95,":")]:
            ax.axvline(np.percentile(a, pct), color=C_H2, ls=ls, alpha=.45, lw=.8)
            ax.axvline(np.percentile(b, pct), color=C_H3, ls=ls, alpha=.45, lw=.8)
        # KS annotation
        ks_s, ks_p = sp_stats.ks_2samp(a, b)
        sig_c = C_GREEN if ks_p < 0.05 else C_MUTED
        ax.text(.97,.04, f"KS p={ks_p:.2e}\nd={ks_s:.3f}",
                transform=ax.transAxes, ha="right", va="bottom",
                fontsize=7, color=sig_c, fontstyle="italic",
                bbox=dict(boxstyle="round,pad=.2", fc=C_CARD, ec=sig_c, alpha=.85))
        u = f" ({m.unit})" if m.unit else ""
        _style(ax, f"{m.label}{u}", xlabel=f"{m.label}{u}", ylabel="P(X ≤ x)")
        ax.set_ylim(-.02, 1.05); ax.legend(fontsize=7, loc="lower right")
    _hide(axes, n, len(axes)); fig.tight_layout()
    _save(fig, out, "02_cdf.png")


# ═══════════════════════════════════════════════════════════════════════════
#  CHART 03 — Box-plot  (quartile + outlier analysis)
# ═══════════════════════════════════════════════════════════════════════════

def chart_boxplot(h2, h3, out):
    cols = _avail(h2, h3, INST_COLS)
    if not cols: return
    n = min(len(cols), 9); nc = min(n, 3); nr = math.ceil(n/nc)
    fig, axes = plt.subplots(nr, nc, figsize=(6*nc, 5*nr))
    fig.suptitle("Box-Plot Analysis  │  HTTP/2 vs HTTP/3",
                 fontsize=14, fontweight="bold", color=C_TEXT, y=1.02)
    axes = np.atleast_1d(axes).flatten()
    for i, c in enumerate(cols[:n]):
        ax = axes[i]; m = METRIC_BY_COL[c]
        a = h2[c].dropna().values.astype(float)
        b = h3[c].dropna().values.astype(float)
        if len(a)<2 or len(b)<2: ax.set_visible(False); continue
        bp = ax.boxplot([a, b], labels=["HTTP/2","HTTP/3"], patch_artist=True,
                        widths=.5, showmeans=True, meanline=True,
                        meanprops=dict(color="white", ls="--", lw=1),
                        medianprops=dict(color=C_TEXT, lw=1.5),
                        flierprops=dict(marker="o", markersize=3, alpha=.4))
        for patch, col in zip(bp["boxes"], [C_H2, C_H3]):
            patch.set_facecolor(col); patch.set_alpha(.6)
            patch.set_edgecolor(C_GRID)
        # Annotate median + mean
        for j, (d, lbl) in enumerate([(a, "H2"), (b, "H3")]):
            ax.text(j+1, np.median(d), f" Med={np.median(d):.1f}",
                    fontsize=6.5, color=C_TEXT, va="bottom")
        # U-test annotation
        try:
            _, up = sp_stats.mannwhitneyu(a, b, alternative="two-sided")
            sc = C_GREEN if up<.05 else C_MUTED
            ax.text(.97,.95, f"U p={up:.2e}", transform=ax.transAxes,
                    ha="right", va="top", fontsize=7, color=sc, fontstyle="italic",
                    bbox=dict(boxstyle="round,pad=.2", fc=C_CARD, ec=sc, alpha=.85))
        except: pass
        u = f" ({m.unit})" if m.unit else ""
        _style(ax, f"{m.label}{u}", ylabel=f"{m.label}{u}")
    _hide(axes, n, len(axes)); fig.tight_layout()
    _save(fig, out, "03_boxplot.png")


# ═══════════════════════════════════════════════════════════════════════════
#  CHART 04 — Timeline (metric over playback time)
# ═══════════════════════════════════════════════════════════════════════════

def chart_timeline(h2, h3, out):
    key = ["TTFB_ms","SDT_ms","Buffer_s","Bitrate_kbps",
           "Throughput_kbps","DownloadSpeed_kbps","Jitter_ms"]
    cols = _avail(h2, h3, key)
    if not cols: return
    n = len(cols)
    fig, axes = plt.subplots(n, 1, figsize=(18, 3.8*n))
    fig.suptitle("Timeline  │  HTTP/2 vs HTTP/3",
                 fontsize=14, fontweight="bold", color=C_TEXT, y=1.01)
    if n == 1: axes = [axes]
    for i, c in enumerate(cols):
        ax = axes[i]; m = METRIC_BY_COL[c]
        # Use CurrentTime_s as x-axis if available, else index
        if "CurrentTime_s" in h2.columns and "CurrentTime_s" in h3.columns:
            x2 = h2["CurrentTime_s"].values
            x3 = h3["CurrentTime_s"].values
            xl = "Playback time (s)"
        else:
            x2 = np.arange(len(h2))
            x3 = np.arange(len(h3))
            xl = "Log index"
        y2 = h2[c].values; y3 = h3[c].values
        # Rolling smooth (window = 5% of length, min 1)
        def _smooth(y, n):
            w = max(1, n // 20)
            return pd.Series(y).rolling(w, min_periods=1).mean().values
        s2 = _smooth(y2, len(y2)); s3 = _smooth(y3, len(y3))
        ax.plot(x2, s2, color=C_H2, lw=1.5, label="HTTP/2", alpha=.85)
        ax.plot(x3, s3, color=C_H3, lw=1.5, label="HTTP/3", alpha=.85)
        ax.fill_between(x2, s2, color=C_H2, alpha=.07)
        ax.fill_between(x3, s3, color=C_H3, alpha=.07)
        u = f" ({m.unit})" if m.unit else ""
        _style(ax, f"{m.label}{u}", xlabel=xl, ylabel=f"{m.label}{u}")
        ax.legend(fontsize=8, loc="upper right")
    fig.tight_layout()
    _save(fig, out, "04_timeline.png")


# ═══════════════════════════════════════════════════════════════════════════
#  CHART 05 — Bar chart  (mean ± 95% CI)
# ═══════════════════════════════════════════════════════════════════════════

def chart_bar_ci(h2, h3, out):
    cols = _avail(h2, h3, [c for c in ALL_NUM if METRIC_BY_COL[c].group in ("net","quality")])
    if not cols: return
    n = min(len(cols), 10); nc = min(n, 4); nr_ = math.ceil(n/nc)
    fig, axes = plt.subplots(nr_, nc, figsize=(5.5*nc, 5*nr_))
    fig.suptitle("Mean ± 95 % CI  │  HTTP/2 vs HTTP/3",
                 fontsize=14, fontweight="bold", color=C_TEXT, y=1.02)
    axes = np.atleast_1d(axes).flatten()
    for i, c in enumerate(cols[:n]):
        ax = axes[i]; m = METRIC_BY_COL[c]
        a = h2[c].dropna().values.astype(float)
        b = h3[c].dropna().values.astype(float)
        ma, mb = np.mean(a), np.mean(b)
        # 95% CI via t-distribution
        ci_a = sp_stats.t.interval(0.95, len(a)-1, loc=ma, scale=sp_stats.sem(a)) if len(a)>1 else (ma, ma)
        ci_b = sp_stats.t.interval(0.95, len(b)-1, loc=mb, scale=sp_stats.sem(b)) if len(b)>1 else (mb, mb)
        ea = ma - ci_a[0]; eb = mb - ci_b[0]
        bars = ax.bar(["HTTP/2","HTTP/3"], [ma, mb],
                      yerr=[ea, eb], capsize=5,
                      color=[C_H2, C_H3], width=.5,
                      edgecolor=C_GRID, linewidth=.8,
                      error_kw=dict(ecolor=C_TEXT, lw=1.2))
        for bar in bars:
            h = bar.get_height()
            if h and not np.isnan(h):
                ax.annotate(f"{h:.2f}", xy=(bar.get_x()+bar.get_width()/2, h),
                            xytext=(0,6), textcoords="offset points",
                            ha="center", fontsize=7.5, color=C_TEXT)
        u = f" ({m.unit})" if m.unit else ""
        hint = {"lower":"↓ lower is better","higher":"↑ higher is better"}.get(m.better,"")
        _style(ax, f"{m.label}{u}\n{hint}", ylabel=f"{m.label}{u}")
    _hide(axes, n, len(axes)); fig.tight_layout()
    _save(fig, out, "05_bar_ci.png")


# ═══════════════════════════════════════════════════════════════════════════
#  CHART 06 — Radar chart  (normalised multi-metric)
# ═══════════════════════════════════════════════════════════════════════════

def chart_radar(h2, h3, out):
    candidates = [
        ("DownloadSpeed_kbps", False), ("Bitrate_kbps", False),
        ("Buffer_s", False),           ("FPS", False),
        ("Throughput_kbps", False),     ("TTFB_ms", True),
        ("Jitter_ms", True),           ("SDT_ms", True),
    ]
    avail = [(c, inv) for c, inv in candidates if c in h2.columns and c in h3.columns]
    if len(avail) < 3: return
    labels = [METRIC_BY_COL[c].label for c, _ in avail]
    v2 = np.array([_val(h2[c], c) for c, _ in avail])
    v3 = np.array([_val(h3[c], c) for c, _ in avail])
    mx = np.maximum(v2, v3); mx[mx==0]=1
    n2, n3 = v2/mx, v3/mx
    for j, (_, inv) in enumerate(avail):
        if inv: n2[j] = 1-n2[j]; n3[j] = 1-n3[j]
    k = len(labels)
    angles = np.linspace(0, 2*np.pi, k, endpoint=False).tolist() + [0]
    n2 = np.append(n2, n2[0]); n3 = np.append(n3, n3[0])
    fig, ax = plt.subplots(figsize=(8,8), subplot_kw={"polar":True})
    fig.patch.set_facecolor(C_BG); ax.set_facecolor(C_CARD)
    ax.plot(angles, n2, color=C_H2, lw=2.5, label="HTTP/2")
    ax.fill(angles, n2, color=C_H2, alpha=.2)
    ax.plot(angles, n3, color=C_H3, lw=2.5, label="HTTP/3 (QUIC)")
    ax.fill(angles, n3, color=C_H3, alpha=.2)
    ax.set_yticks([.25,.5,.75,1]); ax.set_yticklabels(["25%","50%","75%","100%"],fontsize=7,color=C_MUTED)
    ax.set_xticks(angles[:-1]); ax.set_xticklabels(labels, fontsize=9, color=C_TEXT)
    ax.yaxis.grid(True, color=C_GRID, ls="--", alpha=.5)
    ax.xaxis.grid(True, color=C_GRID, ls="--", alpha=.5)
    ax.spines["polar"].set_color(C_GRID)
    ax.set_title("Radar — Overall Performance\n(outer = better)",
                 fontsize=13, fontweight="bold", color=C_TEXT, pad=20)
    ax.legend(loc="upper right", bbox_to_anchor=(1.3,1.15), fontsize=10)
    fig.tight_layout()
    _save(fig, out, "06_radar.png")


# ═══════════════════════════════════════════════════════════════════════════
#  CHART 07 — Stall & rebuffer analysis  (dedicated panel)
# ═══════════════════════════════════════════════════════════════════════════

def chart_stall(h2, h3, out):
    stall_cols = ["StallCount","StallDuration_ms","RebufferingRatio",
                  "DroppedFrames","QualitySwitchCount"]
    cols = _avail(h2, h3, stall_cols)
    if not cols: return
    n = len(cols); nc = min(n,3); nr_ = math.ceil(n/nc)
    fig, axes = plt.subplots(nr_, nc, figsize=(6*nc, 5.5*nr_))
    fig.suptitle("Stall & Rebuffering — Key QoE Indicators",
                 fontsize=14, fontweight="bold", color=C_TEXT, y=1.03)
    axes = np.atleast_1d(axes).flatten()
    for i, c in enumerate(cols):
        ax = axes[i]; m = METRIC_BY_COL[c]
        v2 = _val(h2[c], c); v3 = _val(h3[c], c)
        bars = ax.bar(["HTTP/2","HTTP/3"], [v2, v3],
                      color=[C_H2, C_H3], width=.45, edgecolor=C_GRID, lw=.8)
        fmt = "{:.4f}" if c=="RebufferingRatio" else "{:.0f}"
        for bar in bars:
            h = bar.get_height()
            if h and not np.isnan(h):
                ax.annotate(fmt.format(h), xy=(bar.get_x()+bar.get_width()/2,h),
                            xytext=(0,5), textcoords="offset points",
                            ha="center", fontsize=8, color=C_TEXT)
        if v2 > 0 and not np.isnan(v2) and not np.isnan(v3):
            pct = ((v3-v2)/v2)*100
            col = C_GREEN if pct<0 else C_RED
            ax.text(.5,.92, f"Δ={'+' if pct>0 else ''}{pct:.1f}%",
                    transform=ax.transAxes, ha="center", fontsize=10,
                    fontweight="bold", color=col,
                    bbox=dict(boxstyle="round,pad=.3", fc=C_CARD, ec=col, alpha=.9))
        u = f" ({m.unit})" if m.unit else ""
        _style(ax, f"{m.label}{u}\n(↓ lower is better)", ylabel=f"{m.label}{u}")
    _hide(axes, n, len(axes)); fig.tight_layout()
    _save(fig, out, "07_stall_analysis.png")


# ═══════════════════════════════════════════════════════════════════════════
#  CHART 08 — Correlation heatmap per protocol
# ═══════════════════════════════════════════════════════════════════════════

def chart_heatmap(h2, h3, out):
    cols = _avail(h2, h3, INST_COLS)
    if len(cols) < 3: return
    labels = [METRIC_BY_COL[c].label for c in cols]
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6.5))
    fig.suptitle("Pearson Correlation Matrix  │  HTTP/2 vs HTTP/3",
                 fontsize=14, fontweight="bold", color=C_TEXT, y=1.02)
    for ax, df, title, clr in [(ax1, h2, "HTTP/2", C_H2), (ax2, h3, "HTTP/3", C_H3)]:
        corr = df[cols].corr()
        im = ax.imshow(corr.values, cmap="RdYlGn", vmin=-1, vmax=1, aspect="auto")
        ax.set_xticks(range(len(cols))); ax.set_yticks(range(len(cols)))
        ax.set_xticklabels(labels, rotation=45, ha="right", fontsize=7)
        ax.set_yticklabels(labels, fontsize=7)
        for r in range(len(cols)):
            for ci_ in range(len(cols)):
                v = corr.values[r, ci_]
                ax.text(ci_, r, f"{v:.2f}", ha="center", va="center",
                        fontsize=6, color="black" if abs(v)<.6 else "white")
        ax.set_title(title, fontsize=11, fontweight="bold", color=clr, pad=8)
        for s in ax.spines.values(): s.set_color(C_GRID)
    fig.colorbar(im, ax=[ax1,ax2], shrink=.7, label="Pearson r")
    fig.tight_layout()
    _save(fig, out, "08_correlation.png")


# ═══════════════════════════════════════════════════════════════════════════
#  CHART 09 — Throughput stability  (CoV + sliding window)
# ═══════════════════════════════════════════════════════════════════════════

def chart_throughput_stability(h2, h3, out):
    target = "Throughput_kbps"
    if target not in h2.columns or target not in h3.columns:
        target = "DownloadSpeed_kbps"
        if target not in h2.columns or target not in h3.columns:
            return
    m = METRIC_BY_COL[target]
    a = h2[target].dropna().values.astype(float)
    b = h3[target].dropna().values.astype(float)
    if len(a)<5 or len(b)<5: return

    fig, axes = plt.subplots(1, 3, figsize=(20, 5.5))
    fig.suptitle(f"{m.label} Stability Analysis",
                 fontsize=14, fontweight="bold", color=C_TEXT, y=1.02)

    # 1) Sliding-window mean + std band
    ax = axes[0]
    for vals, c, lbl in [(a, C_H2, "HTTP/2"), (b, C_H3, "HTTP/3")]:
        w = max(3, len(vals)//15)
        s = pd.Series(vals)
        rm = s.rolling(w, min_periods=1).mean()
        rs = s.rolling(w, min_periods=1).std().fillna(0)
        x = np.arange(len(vals))
        ax.plot(x, rm, color=c, lw=1.5, label=lbl, alpha=.9)
        ax.fill_between(x, (rm-rs).values, (rm+rs).values, color=c, alpha=.12)
    _style(ax, "Rolling Mean ± σ", xlabel="Sample", ylabel=f"{m.label} ({m.unit})")
    ax.legend(fontsize=8)

    # 2) CoV over sliding window
    ax = axes[1]
    for vals, c, lbl in [(a, C_H2, "HTTP/2"), (b, C_H3, "HTTP/3")]:
        w = max(3, len(vals)//10)
        s = pd.Series(vals)
        rm = s.rolling(w, min_periods=1).mean()
        rs = s.rolling(w, min_periods=1).std().fillna(0)
        cov = (rs / rm * 100).fillna(0)
        ax.plot(np.arange(len(vals)), cov, color=c, lw=1.2, label=lbl, alpha=.85)
    _style(ax, "Coefficient of Variation (%)", xlabel="Sample", ylabel="CoV (%)")
    ax.legend(fontsize=8)

    # 3) Histogram overlay
    ax = axes[2]
    bins = np.linspace(min(a.min(), b.min()), max(a.max(), b.max()), 40)
    ax.hist(a, bins=bins, color=C_H2, alpha=.5, label="HTTP/2", edgecolor=C_GRID, lw=.5)
    ax.hist(b, bins=bins, color=C_H3, alpha=.5, label="HTTP/3", edgecolor=C_GRID, lw=.5)
    _style(ax, "Distribution Histogram", xlabel=f"{m.label} ({m.unit})", ylabel="Count")
    ax.legend(fontsize=8)

    fig.tight_layout()
    _save(fig, out, "09_throughput_stability.png")


# ═══════════════════════════════════════════════════════════════════════════
#  CHART 10 — Percentile ladder  (P5 / P25 / P50 / P75 / P95)
# ═══════════════════════════════════════════════════════════════════════════

def chart_percentile_ladder(h2, h3, out):
    cols = _avail(h2, h3, INST_COLS)
    if not cols: return
    n = min(len(cols), 8); nc = min(n, 4); nr_ = math.ceil(n/nc)
    fig, axes = plt.subplots(nr_, nc, figsize=(5.5*nc, 5*nr_))
    fig.suptitle("Percentile Ladder  │  P5 – P25 – P50 – P75 – P95",
                 fontsize=14, fontweight="bold", color=C_TEXT, y=1.02)
    axes = np.atleast_1d(axes).flatten()
    pcts = [5, 25, 50, 75, 95]
    x = np.arange(len(pcts))
    w = .35
    for i, c in enumerate(cols[:n]):
        ax = axes[i]; m = METRIC_BY_COL[c]
        a = h2[c].dropna().values.astype(float)
        b = h3[c].dropna().values.astype(float)
        if len(a)<2 or len(b)<2: ax.set_visible(False); continue
        pa = [np.percentile(a, p) for p in pcts]
        pb = [np.percentile(b, p) for p in pcts]
        ax.bar(x-w/2, pa, width=w, color=C_H2, label="HTTP/2", edgecolor=C_GRID, lw=.6)
        ax.bar(x+w/2, pb, width=w, color=C_H3, label="HTTP/3", edgecolor=C_GRID, lw=.6)
        ax.set_xticks(x); ax.set_xticklabels([f"P{p}" for p in pcts], fontsize=9)
        u = f" ({m.unit})" if m.unit else ""
        _style(ax, f"{m.label}{u}", ylabel=f"{m.label}{u}")
        ax.legend(fontsize=7)
    _hide(axes, n, len(axes)); fig.tight_layout()
    _save(fig, out, "10_percentile_ladder.png")


# ═══════════════════════════════════════════════════════════════════════════
#  CSV EXPORT
# ═══════════════════════════════════════════════════════════════════════════

def export_csvs(stat_df, out):
    if not stat_df.empty:
        p = os.path.join(out, "statistical_tests.csv")
        stat_df.to_csv(p, index=False, encoding="utf-8-sig")
        print(f"  ✔  {p}")


# ═══════════════════════════════════════════════════════════════════════════
#  OPEN FOLDER
# ═══════════════════════════════════════════════════════════════════════════

def _open_folder(path):
    ap = os.path.abspath(path)
    try:
        s = platform.system()
        if s == "Windows": os.startfile(ap)
        elif s == "Darwin": subprocess.Popen(["open", ap])
        else: subprocess.Popen(["xdg-open", ap])
    except Exception as e:
        print(f"  ⚠  {e}")


# ═══════════════════════════════════════════════════════════════════════════
#  PIPELINE
# ═══════════════════════════════════════════════════════════════════════════

def run_analysis(h2_path, h3_path, out_dir, progress_cb=None):
    TOTAL = 13

    def _p(step, msg):
        if progress_cb: progress_cb(step, TOTAL, msg)
        else: print(f"  [{int(step/TOTAL*100):3d}%] {msg}")

    os.makedirs(out_dir, exist_ok=True)

    _p(0, "Reading CSV files…")
    h2 = load_csv(h2_path, "HTTP/2")
    h3 = load_csv(h3_path, "HTTP/3")

    _p(1, "Computing statistical tests…")
    stat_df = compute_stat_tests(h2, h3)
    print_summary(h2, h3, stat_df)

    steps = [
        (chart_summary_table,         "Summary table",           True),
        (chart_cdf,                   "CDF",                     False),
        (chart_boxplot,               "Box-plot",                False),
        (chart_timeline,              "Timeline",                False),
        (chart_bar_ci,                "Bar ± CI",                False),
        (chart_radar,                 "Radar",                   False),
        (chart_stall,                 "Stall analysis",          False),
        (chart_heatmap,               "Correlation heatmap",     False),
        (chart_throughput_stability,  "Throughput stability",    False),
        (chart_percentile_ladder,     "Percentile ladder",       False),
    ]

    for i, (fn, msg, is_stat) in enumerate(steps, start=2):
        _p(i, f"Chart: {msg}")
        if is_stat:
            fn(stat_df, out_dir)
        else:
            fn(h2, h3, out_dir)

    _p(12, "Exporting CSV…")
    export_csvs(stat_df, out_dir)

    _p(TOTAL, "Complete!")
    return os.path.abspath(out_dir)


# ═══════════════════════════════════════════════════════════════════════════
#  GUI MODE
# ═══════════════════════════════════════════════════════════════════════════

def gui_mode():
    import queue, threading

    root = tk.Tk(); root.withdraw(); root.title("ADTube Analyzer v2")

    messagebox.showinfo("Step 1/2", "Select CSV log for HTTP/2")
    h2 = filedialog.askopenfilename(title="CSV – HTTP/2",
                                    filetypes=[("CSV","*.csv"),("All","*.*")])
    if not h2: root.destroy(); return

    messagebox.showinfo("Step 2/2", "Select CSV log for HTTP/3 (QUIC)")
    h3 = filedialog.askopenfilename(title="CSV – HTTP/3",
                                    filetypes=[("CSV","*.csv"),("All","*.*")])
    if not h3: root.destroy(); return

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    default_out = os.path.join(os.path.dirname(h2), f"analysis_{ts}")
    out = filedialog.askdirectory(title="Output folder", initialdir=os.path.dirname(h2)) or default_out

    pw = tk.Toplevel(root); pw.title("Analyzing…"); pw.resizable(False,False)
    pw.geometry("500x170"); pw.configure(bg=C_BG)
    pw.protocol("WM_DELETE_WINDOW", lambda: None)
    tk.Label(pw, text="ADTube Analyzer v2", font=("Segoe UI",12,"bold"),
             bg=C_BG, fg=C_TEXT).pack(pady=(18,4))
    sv = tk.StringVar(value="…"); tk.Label(pw, textvariable=sv, font=("Segoe UI",9),
                                           bg=C_BG, fg=C_MUTED).pack()
    st = ttk.Style(pw); st.theme_use("default")
    st.configure("P.Horizontal.TProgressbar", troughcolor=C_CARD, background=C_H3, thickness=12)
    pb = ttk.Progressbar(pw, orient="horizontal", length=420, mode="determinate",
                         style="P.Horizontal.TProgressbar"); pb.pack(pady=14)
    pv = tk.StringVar(value="0%"); tk.Label(pw, textvariable=pv, font=("Segoe UI",8),
                                            bg=C_BG, fg=C_TEXT).pack()

    q = queue.Queue()
    def pcb(step,total,msg): q.put(("p", int(step/total*100), msg))
    def work():
        try: r=run_analysis(h2,h3,out,pcb); q.put(("d",r,None))
        except Exception as e: q.put(("d",None,e))
    def poll():
        try:
            while True:
                item=q.get_nowait()
                if item[0]=="p":
                    pb["value"]=item[1]; pv.set(f"{item[1]}%"); sv.set(item[2])
                elif item[0]=="d":
                    pw.destroy()
                    if item[2]: messagebox.showerror("Error",str(item[2]))
                    else:
                        nc=len([f for f in os.listdir(item[1]) if f.endswith(".png")])
                        nv=len([f for f in os.listdir(item[1]) if f.endswith(".csv")])
                        if messagebox.askyesno("Done",f"{nc} charts, {nv} CSV.\nOpen folder?"):
                            _open_folder(item[1])
                    root.destroy(); return
        except queue.Empty: pass
        root.after(80, poll)
    threading.Thread(target=work, daemon=True).start()
    root.after(80, poll); root.mainloop()


# ═══════════════════════════════════════════════════════════════════════════
#  CLI MODE
# ═══════════════════════════════════════════════════════════════════════════

def cli_mode():
    p = argparse.ArgumentParser(description="ADTube Analyzer v2 — H2 vs H3",
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("h2_csv"); p.add_argument("h3_csv")
    p.add_argument("--out", default="./analysis")
    p.add_argument("--open", action="store_true")
    a = p.parse_args()
    print(f"\n{'─'*65}\n  ADTube Analyzer v2  │  H2 vs H3\n{'─'*65}")
    print(f"  H2  ← {a.h2_csv}\n  H3  ← {a.h3_csv}\n  OUT → {os.path.abspath(a.out)}\n{'─'*65}\n")
    r = run_analysis(a.h2_csv, a.h3_csv, a.out)
    print(f"\n✅ Done → {r}\n")
    if a.open: _open_folder(r)


if __name__ == "__main__":
    gui_mode() if len(sys.argv) == 1 else cli_mode()
