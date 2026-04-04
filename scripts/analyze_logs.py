"""
analyze_logs.py
---------------
Analyze & compare two CSV log files from ADTube streaming system:
  - File H2 (HTTP/2 over TCP)
  - File H3 (HTTP/3 over QUIC)

All metric names follow adaptive streaming QoE academic conventions
(IEEE, ACM, arXiv literature on DASH/HLS streaming quality).

Automatically detects all CSV columns, classifies data types
(instantaneous / cumulative / categorical), and applies appropriate
statistical methods.

Usage:
  GUI (recommended) – run without arguments:
    python analyze_logs.py
    → File dialog appears, then output folder opens automatically.

  CLI:
    python analyze_logs.py <h2_csv> <h3_csv> [--out <output_dir>]

Requirements:
    pip install pandas matplotlib seaborn numpy scipy
"""

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
from typing import Callable, Dict, List, Optional, Tuple

import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

warnings.filterwarnings("ignore")

# ═══════════════════════════════════════════════════════════════════════
#  CSV COLUMN DEFINITIONS & METADATA
# ═══════════════════════════════════════════════════════════════════════
#
# Each numeric column has metadata:
#   agg    : "mean" (instantaneous) or "last" (cumulative)
#   label  : display label (English, academic standard)
#   unit   : measurement unit
#   hint   : lower/higher is better ("lower" | "higher" | "info")
#   group  : analysis group ("network" | "quality" | "playback" | "extra")

METRIC_META = {
    # ── Network Metrics ──
    "TTFB_ms": {
        "agg": "mean", "label": "Time To First Byte (TTFB)", "unit": "ms",
        "hint": "lower", "group": "network",
    },
    "Jitter_ms": {
        "agg": "mean", "label": "SDT Jitter", "unit": "ms",
        "hint": "lower", "group": "network",
    },
    "DownloadSpeed_kbps": {
        "agg": "mean", "label": "Segment Download Speed", "unit": "kbps",
        "hint": "higher", "group": "network",
    },
    "Throughput_kbps": {
        "agg": "mean", "label": "Throughput", "unit": "kbps",
        "hint": "higher", "group": "network",
    },
    "SegmentDownloadTime_ms": {
        "agg": "mean", "label": "Segment Download Time (SDT)", "unit": "ms",
        "hint": "lower", "group": "network",
    },
    "SegmentSize_KB": {
        "agg": "mean", "label": "Segment Size", "unit": "KB",
        "hint": "info", "group": "network",
    },
    "EstimatedBandwidth_Mbps": {
        "agg": "mean", "label": "Estimated Bandwidth", "unit": "Mbps",
        "hint": "higher", "group": "network",
    },

    # ── Video Quality Metrics ──
    "Bitrate_kbps": {
        "agg": "mean", "label": "Video Bitrate", "unit": "kbps",
        "hint": "higher", "group": "quality",
    },
    "Buffer_s": {
        "agg": "mean", "label": "Buffer Occupancy", "unit": "s",
        "hint": "higher", "group": "quality",
    },
    "FPS": {
        "agg": "mean", "label": "Frame Rate", "unit": "fps",
        "hint": "higher", "group": "quality",
    },
    "QualityIndex": {
        "agg": "mean", "label": "Quality Index", "unit": "",
        "hint": "higher", "group": "quality",
    },

    # ── Playback Stability Metrics ──
    "DroppedFrames": {
        "agg": "last", "label": "Dropped Frames", "unit": "frames",
        "hint": "lower", "group": "playback",
    },
    "TotalFrames": {
        "agg": "last", "label": "Total Frames", "unit": "frames",
        "hint": "info", "group": "playback",
    },
    "StallCount": {
        "agg": "last", "label": "Stall Count", "unit": "events",
        "hint": "lower", "group": "playback",
    },
    "StallDuration_ms": {
        "agg": "last", "label": "Total Stall Duration", "unit": "ms",
        "hint": "lower", "group": "playback",
    },
    "RebufferCount": {
        "agg": "last", "label": "Rebuffer Count", "unit": "events",
        "hint": "lower", "group": "playback",
    },
    "RebufferDuration_ms": {
        "agg": "last", "label": "Total Rebuffer Duration", "unit": "ms",
        "hint": "lower", "group": "playback",
    },
    "RebufferingRatio": {
        "agg": "last", "label": "Rebuffering Ratio", "unit": "",
        "hint": "lower", "group": "playback",
    },
    "QualitySwitchCount": {
        "agg": "last", "label": "Quality Switch Count", "unit": "events",
        "hint": "lower", "group": "playback",
    },
    "TotalDownloaded_MB": {
        "agg": "last", "label": "Total Downloaded", "unit": "MB",
        "hint": "info", "group": "playback",
    },

    # ── Context / Extra ──
    "CurrentTime_s": {
        "agg": "last", "label": "Playback Position", "unit": "s",
        "hint": "info", "group": "extra",
    },
    "Duration_s": {
        "agg": "last", "label": "Media Duration", "unit": "s",
        "hint": "info", "group": "extra",
    },
    "QualityCount": {
        "agg": "last", "label": "Quality Levels", "unit": "",
        "hint": "info", "group": "extra",
    },
}

# Backward compatibility: map old CSV column names to new names
COLUMN_RENAME_MAP = {
    "Latency_ms": None,              # DROP — redundant with SegmentDownloadTime_ms
    "RTT_ms": "TTFB_ms",             # Was TTFB all along, rename
    "SegmentDuration_ms": "SegmentDownloadTime_ms",  # Academic name
}

# Categorical/text columns
CATEGORICAL_COLS = [
    "Level", "Protocol", "ConnectionType", "Resolution",
    "Codec", "ActiveScenario", "IsAutoQuality",
]

# All numeric columns
ALL_NUMERIC_COLS = list(METRIC_META.keys())

# Cumulative columns (use last value, not mean)
CUMULATIVE_COLS = {k for k, v in METRIC_META.items() if v["agg"] == "last"}

# ═══════════════════════════════════════════════════════════════════════
#  THEME & STYLE
# ═══════════════════════════════════════════════════════════════════════

PALETTE = {
    "H2": "#4C9BE8",   # blue  – HTTP/2
    "H3": "#F5A623",   # amber – HTTP/3 QUIC
}

BG_COLOR   = "#0F1117"
CARD_BG    = "#1A1D27"
TEXT_COLOR  = "#E8EAF0"
GRID_COLOR  = "#2A2D3E"
ACCENT_GREEN = "#4ADE80"
ACCENT_RED   = "#F87171"
MUTED_TEXT   = "#9A9DBF"

plt.rcParams.update({
    "figure.facecolor":  BG_COLOR,
    "axes.facecolor":    CARD_BG,
    "axes.edgecolor":    GRID_COLOR,
    "axes.labelcolor":   TEXT_COLOR,
    "xtick.color":       TEXT_COLOR,
    "ytick.color":       TEXT_COLOR,
    "text.color":        TEXT_COLOR,
    "grid.color":        GRID_COLOR,
    "grid.linestyle":    "--",
    "grid.alpha":        0.5,
    "legend.facecolor":  CARD_BG,
    "legend.edgecolor":  GRID_COLOR,
    "font.family":       "sans-serif",
})


# ═══════════════════════════════════════════════════════════════════════
#  HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════

def _get_value(series: pd.Series, col: str) -> float:
    """Representative value: last for cumulative, mean for instantaneous."""
    s = series.dropna()
    if s.empty:
        return float("nan")
    meta = METRIC_META.get(col)
    if meta and meta["agg"] == "last":
        return float(s.iloc[-1])
    return float(s.mean())


def _hint_label(col: str) -> str:
    """Return hint string 'Lower is better' / 'Higher is better' / 'Info'."""
    meta = METRIC_META.get(col, {})
    h = meta.get("hint", "info")
    return {"lower": "Lower is better",
            "higher": "Higher is better",
            "info": "Informational"}.get(h, "")


def _fmt_val(v: float, precision: int = 2) -> str:
    if pd.isna(v):
        return "N/A"
    if abs(v) >= 1000:
        return f"{v:,.{precision}f}"
    return f"{v:.{precision}f}"


def _add_bar_labels(ax, bars, fmt="{:.1f}"):
    """Add value labels on top of each bar."""
    for bar in bars:
        h = bar.get_height()
        if pd.isna(h) or h == 0:
            continue
        ax.annotate(
            fmt.format(h),
            xy=(bar.get_x() + bar.get_width() / 2, h),
            xytext=(0, 5), textcoords="offset points",
            ha="center", va="bottom", fontsize=8, color=TEXT_COLOR,
        )


def _style_ax(ax, title: str, xlabel: str = "", ylabel: str = ""):
    ax.set_title(title, fontsize=11, fontweight="bold",
                 color=TEXT_COLOR, pad=10)
    if xlabel:
        ax.set_xlabel(xlabel, fontsize=9)
    if ylabel:
        ax.set_ylabel(ylabel, fontsize=9)
    ax.yaxis.grid(True)
    ax.set_axisbelow(True)
    for spine in ax.spines.values():
        spine.set_color(GRID_COLOR)


def _hide_unused(axes, used: int, total: int):
    """Hide unused subplot axes."""
    for i in range(used, total):
        axes[i].set_visible(False)


def _save_fig(fig, out_dir: str, name: str):
    path = os.path.join(out_dir, name)
    fig.savefig(path, dpi=150, bbox_inches="tight", facecolor=BG_COLOR)
    plt.close(fig)
    print(f"  ✔  {path}")
    return path


def _available_cols(h2: pd.DataFrame, h3: pd.DataFrame,
                    cols: List[str]) -> List[str]:
    """Return list of columns present in both DataFrames."""
    return [c for c in cols if c in h2.columns and c in h3.columns]


def _cols_by_group(h2: pd.DataFrame, h3: pd.DataFrame,
                   group: str) -> List[str]:
    """Get columns belonging to a specific group, present in both dfs."""
    candidates = [k for k, v in METRIC_META.items() if v["group"] == group]
    return _available_cols(h2, h3, candidates)


# ═══════════════════════════════════════════════════════════════════════
#  READ & CLEAN CSV
# ═══════════════════════════════════════════════════════════════════════

def load_csv(path: str, label: str) -> pd.DataFrame:
    """Read CSV log (UTF-8 BOM), coerce numeric columns, apply renames."""
    if not os.path.isfile(path):
        print(f"[ERROR] File not found: {path}")
        sys.exit(1)

    df = pd.read_csv(path, encoding="utf-8-sig")
    df.columns = [c.strip() for c in df.columns]

    # Apply backward-compatible column renames
    for old_name, new_name in COLUMN_RENAME_MAP.items():
        if old_name in df.columns:
            if new_name is None:
                # DROP the column
                df = df.drop(columns=[old_name])
                print(f"  ⚠  Dropped legacy column: {old_name}")
            elif new_name not in df.columns:
                df = df.rename(columns={old_name: new_name})
                print(f"  ↦  Renamed column: {old_name} → {new_name}")

    # Coerce numeric types
    for col in ALL_NUMERIC_COLS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    df["_label"] = label
    return df


# ═══════════════════════════════════════════════════════════════════════
#  SUMMARY STATISTICS
# ═══════════════════════════════════════════════════════════════════════

def compute_summary(h2: pd.DataFrame, h3: pd.DataFrame) -> pd.DataFrame:
    """
    Create comparison statistics table H2 vs H3 for all numeric metrics.
    Columns: Metric | Group | Agg | Unit | H2 | H3 | Δ | Δ% | Verdict
    """
    available = _available_cols(h2, h3, ALL_NUMERIC_COLS)
    rows = []
    for col in available:
        meta = METRIC_META[col]
        h2_val = _get_value(h2[col], col)
        h3_val = _get_value(h3[col], col)
        if pd.isna(h2_val) and pd.isna(h3_val):
            continue

        delta = h3_val - h2_val
        pct = (delta / h2_val * 100) if h2_val and not pd.isna(h2_val) else float("nan")

        # Verdict: H3 better / H2 better / equal
        verdict = "="
        if not pd.isna(delta) and delta != 0:
            if meta["hint"] == "lower":
                verdict = "H3 ✓" if delta < 0 else "H2 ✓"
            elif meta["hint"] == "higher":
                verdict = "H3 ✓" if delta > 0 else "H2 ✓"
            else:
                verdict = "—"

        arrow = "▲" if delta > 0 else ("▼" if delta < 0 else "=")
        rows.append({
            "Metric":    col,
            "Label":     meta["label"],
            "Group":     meta["group"],
            "Agg":       meta["agg"],
            "Unit":      meta["unit"],
            "H2":        round(h2_val, 3),
            "H3":        round(h3_val, 3),
            "Δ (H3−H2)": round(delta, 3),
            "Δ%":        f"{arrow} {abs(pct):.1f}%" if not np.isnan(pct) else "N/A",
            "Verdict":   verdict,
        })

    return pd.DataFrame(rows)


def print_summary(h2: pd.DataFrame, h3: pd.DataFrame,
                  summary_df: pd.DataFrame):
    """Print summary statistics to console."""
    print(f"\n{'═' * 80}")
    print("  SUMMARY STATISTICS  │  ADTube Log Analyzer")
    print(f"{'═' * 80}")
    print(f"  HTTP/2  → {len(h2):>6,} log entries")
    print(f"  HTTP/3  → {len(h3):>6,} log entries")
    print(f"{'═' * 80}")

    if summary_df.empty:
        print("  (No shared numeric data)")
        return

    display = summary_df[["Metric", "Agg", "Unit", "H2", "H3",
                          "Δ (H3−H2)", "Δ%", "Verdict"]].copy()
    print(display.to_string(index=False))
    print(f"{'═' * 80}\n")

    h3_wins = (summary_df["Verdict"] == "H3 ✓").sum()
    h2_wins = (summary_df["Verdict"] == "H2 ✓").sum()
    ties = len(summary_df) - h3_wins - h2_wins
    print(f"  Result: H3 wins on {h3_wins} metrics, "
          f"H2 wins on {h2_wins} metrics, "
          f"ties/info on {ties} metrics.\n")


# ═══════════════════════════════════════════════════════════════════════
#  DESCRIPTIVE STATISTICS (mean, median, std, min, max, p5, p95)
# ═══════════════════════════════════════════════════════════════════════

def compute_descriptive(df: pd.DataFrame, label: str) -> pd.DataFrame:
    """Descriptive statistics for a DataFrame."""
    available = [c for c in ALL_NUMERIC_COLS if c in df.columns]
    if not available:
        return pd.DataFrame()

    result = df[available].describe(
        percentiles=[0.05, 0.25, 0.5, 0.75, 0.95]
    ).T
    result.index.name = "Metric"
    result["Protocol"] = label

    result["Agg"] = result.index.map(
        lambda x: METRIC_META.get(x, {}).get("agg", "mean")
    )
    return result.reset_index()


# ═══════════════════════════════════════════════════════════════════════
#  CHART 1: Network Metrics (bar chart)
# ═══════════════════════════════════════════════════════════════════════

def chart_network_bars(h2: pd.DataFrame, h3: pd.DataFrame, out_dir: str):
    cols = _cols_by_group(h2, h3, "network")
    if not cols:
        return

    n = min(len(cols), 8)
    ncols = min(n, 4)
    nrows = math.ceil(n / ncols)

    fig, axes = plt.subplots(nrows, ncols, figsize=(5 * ncols, 5 * nrows))
    fig.suptitle("Network Metrics  │  HTTP/2 vs HTTP/3 (QUIC)",
                 fontsize=15, fontweight="bold", color=TEXT_COLOR, y=1.02)
    axes = np.atleast_1d(axes).flatten()

    for idx, col in enumerate(cols[:n]):
        ax = axes[idx]
        meta = METRIC_META[col]
        h2_v = _get_value(h2[col], col)
        h3_v = _get_value(h3[col], col)

        bars = ax.bar(
            ["HTTP/2", "HTTP/3"], [h2_v, h3_v],
            color=[PALETTE["H2"], PALETTE["H3"]],
            width=0.5, edgecolor=GRID_COLOR, linewidth=0.8,
        )
        _add_bar_labels(ax, bars, fmt="{:.2f}")
        _style_ax(ax,
                  f"{meta['label']} ({meta['unit']})\n({_hint_label(col)})",
                  ylabel=f"{meta['label']} ({meta['unit']})")

        # Sub-info
        agg_label = meta["agg"]
        h2s = h2[col].dropna()
        h3s = h3[col].dropna()
        if agg_label == "last":
            sub = (f"Last  H2={h2s.iloc[-1]:.1f}  H3={h3s.iloc[-1]:.1f}"
                   if len(h2s) and len(h3s) else "")
        else:
            sub = (f"Median  H2={h2s.median():.1f}  H3={h3s.median():.1f}"
                   if len(h2s) and len(h3s) else "")
        ax.text(0.5, -0.15, sub,
                transform=ax.transAxes, ha="center", fontsize=7, color=MUTED_TEXT)

    _hide_unused(axes, n, len(axes))
    fig.tight_layout()
    _save_fig(fig, out_dir, "01_network_metrics.png")


# ═══════════════════════════════════════════════════════════════════════
#  CHART 2: Video Quality Metrics (bar chart)
# ═══════════════════════════════════════════════════════════════════════

def chart_quality_bars(h2: pd.DataFrame, h3: pd.DataFrame, out_dir: str):
    cols = _cols_by_group(h2, h3, "quality")
    if not cols:
        return

    n = min(len(cols), 6)
    ncols = min(n, 3)
    nrows = math.ceil(n / ncols)

    fig, axes = plt.subplots(nrows, ncols, figsize=(6 * ncols, 5 * nrows))
    fig.suptitle("Video Quality Metrics  │  HTTP/2 vs HTTP/3 (QUIC)",
                 fontsize=15, fontweight="bold", color=TEXT_COLOR, y=1.02)
    axes = np.atleast_1d(axes).flatten()

    for idx, col in enumerate(cols[:n]):
        ax = axes[idx]
        meta = METRIC_META[col]
        h2_v = _get_value(h2[col], col)
        h3_v = _get_value(h3[col], col)

        bars = ax.bar(
            ["HTTP/2", "HTTP/3"], [h2_v, h3_v],
            color=[PALETTE["H2"], PALETTE["H3"]],
            width=0.5, edgecolor=GRID_COLOR, linewidth=0.8,
        )
        _add_bar_labels(ax, bars, fmt="{:.2f}")
        _style_ax(ax,
                  f"{meta['label']} ({meta['unit']})\n({_hint_label(col)})",
                  ylabel=f"{meta['label']} ({meta['unit']})")

    _hide_unused(axes, n, len(axes))
    fig.tight_layout()
    _save_fig(fig, out_dir, "02_quality_metrics.png")


# ═══════════════════════════════════════════════════════════════════════
#  CHART 3: Distribution (violin plot)
# ═══════════════════════════════════════════════════════════════════════

def chart_distribution(h2: pd.DataFrame, h3: pd.DataFrame, out_dir: str):
    # Select instantaneous cols with meaningful distribution
    candidates = [c for c in ALL_NUMERIC_COLS
                  if METRIC_META[c]["agg"] == "mean"
                  and METRIC_META[c]["group"] in ("network", "quality")]
    cols = _available_cols(h2, h3, candidates)
    if not cols:
        return

    n = min(len(cols), 6)
    ncols = 3
    nrows = math.ceil(n / ncols)

    fig, axes = plt.subplots(nrows, ncols, figsize=(6 * ncols, 5 * nrows))
    fig.suptitle("Data Distribution  │  HTTP/2 vs HTTP/3 (QUIC)",
                 fontsize=15, fontweight="bold", color=TEXT_COLOR, y=1.02)
    axes = np.atleast_1d(axes).flatten()

    combined = pd.concat([
        h2.assign(_label="HTTP/2"),
        h3.assign(_label="HTTP/3"),
    ], ignore_index=True)

    for idx, col in enumerate(cols[:n]):
        ax = axes[idx]
        data = combined[[col, "_label"]].dropna()
        if data.empty:
            ax.set_visible(False)
            continue
        sns.violinplot(
            data=data, x="_label", y=col,
            palette={"HTTP/2": PALETTE["H2"], "HTTP/3": PALETTE["H3"]},
            inner="box", ax=ax, linewidth=0.8,
        )
        meta = METRIC_META[col]
        _style_ax(ax, f"{meta['label']} ({meta['unit']})",
                  ylabel=f"{meta['label']} ({meta['unit']})")
        ax.set_xlabel("")

    _hide_unused(axes, n, len(axes))
    fig.tight_layout()
    _save_fig(fig, out_dir, "03_distribution.png")


# ═══════════════════════════════════════════════════════════════════════
#  CHART 4: Timeline (variation over log index)
# ═══════════════════════════════════════════════════════════════════════

def chart_timeline(h2: pd.DataFrame, h3: pd.DataFrame, out_dir: str):
    key_cols = ["TTFB_ms", "Buffer_s", "Bitrate_kbps",
                "DownloadSpeed_kbps", "Throughput_kbps",
                "SegmentDownloadTime_ms"]
    cols = _available_cols(h2, h3, key_cols)
    if not cols:
        return

    n = len(cols)
    fig, axes = plt.subplots(n, 1, figsize=(18, 4 * n))
    fig.suptitle("Timeline by Log Index  │  HTTP/2 vs HTTP/3 (QUIC)",
                 fontsize=15, fontweight="bold", color=TEXT_COLOR, y=1.01)
    if n == 1:
        axes = [axes]

    for idx, col in enumerate(cols):
        ax = axes[idx]
        meta = METRIC_META[col]
        h2_vals = h2[col].dropna().reset_index(drop=True)
        h3_vals = h3[col].dropna().reset_index(drop=True)

        # Rolling smooth
        win = max(1, min(10, len(h2_vals) // 10))
        h2_smooth = h2_vals.rolling(win, min_periods=1).mean()
        h3_smooth = h3_vals.rolling(win, min_periods=1).mean()

        ax.plot(h2_smooth.index, h2_smooth.values,
                color=PALETTE["H2"], lw=1.8, label="HTTP/2", alpha=0.9)
        ax.plot(h3_smooth.index, h3_smooth.values,
                color=PALETTE["H3"], lw=1.8, label="HTTP/3", alpha=0.9)
        ax.fill_between(h2_smooth.index, h2_smooth.values,
                        color=PALETTE["H2"], alpha=0.10)
        ax.fill_between(h3_smooth.index, h3_smooth.values,
                        color=PALETTE["H3"], alpha=0.10)

        _style_ax(ax, f"{meta['label']} ({meta['unit']})",
                  xlabel="Log index",
                  ylabel=f"{meta['label']} ({meta['unit']})")
        ax.legend(loc="upper right", fontsize=9)

    fig.tight_layout()
    _save_fig(fig, out_dir, "04_timeline.png")


# ═══════════════════════════════════════════════════════════════════════
#  CHART 5: Radar chart (multi-dimensional overview)
# ═══════════════════════════════════════════════════════════════════════

def chart_radar(h2: pd.DataFrame, h3: pd.DataFrame, out_dir: str):
    # Select 6-8 key metrics — invert = True means lower is better
    candidates = [
        ("DownloadSpeed_kbps", False),
        ("Bitrate_kbps",       False),
        ("Buffer_s",           False),
        ("FPS",                False),
        ("Throughput_kbps",    False),
        ("TTFB_ms",            True),   # invert: lower = better
        ("Jitter_ms",          True),
        ("SegmentDownloadTime_ms", True),
    ]
    available = [(col, inv) for col, inv in candidates
                 if col in h2.columns and col in h3.columns]
    if len(available) < 3:
        print("  ⚠  Not enough data for radar chart.")
        return

    labels = [METRIC_META[col]["label"] for col, _ in available]
    h2_vals = np.array([_get_value(h2[col], col) for col, _ in available])
    h3_vals = np.array([_get_value(h3[col], col) for col, _ in available])

    # Normalize
    combined_max = np.maximum(h2_vals, h3_vals)
    combined_max[combined_max == 0] = 1
    h2_norm = h2_vals / combined_max
    h3_norm = h3_vals / combined_max

    # Invert: lower is better → higher normalized = better
    for i, (_, inv) in enumerate(available):
        if inv:
            h2_norm[i] = 1 - h2_norm[i]
            h3_norm[i] = 1 - h3_norm[i]

    # Close the loop
    n = len(labels)
    angles = np.linspace(0, 2 * np.pi, n, endpoint=False).tolist()
    angles += angles[:1]
    h2_norm = np.append(h2_norm, h2_norm[0])
    h3_norm = np.append(h3_norm, h3_norm[0])

    fig, ax = plt.subplots(figsize=(8, 8), subplot_kw={"polar": True})
    fig.patch.set_facecolor(BG_COLOR)
    ax.set_facecolor(CARD_BG)

    ax.plot(angles, h2_norm, color=PALETTE["H2"], lw=2.5, label="HTTP/2")
    ax.fill(angles, h2_norm, color=PALETTE["H2"], alpha=0.25)
    ax.plot(angles, h3_norm, color=PALETTE["H3"], lw=2.5, label="HTTP/3 (QUIC)")
    ax.fill(angles, h3_norm, color=PALETTE["H3"], alpha=0.25)

    ax.set_yticks([0.25, 0.5, 0.75, 1.0])
    ax.set_yticklabels(["25%", "50%", "75%", "100%"],
                       fontsize=7, color=MUTED_TEXT)
    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(labels, fontsize=9, color=TEXT_COLOR)
    ax.yaxis.grid(True, color=GRID_COLOR, linestyle="--", alpha=0.5)
    ax.xaxis.grid(True, color=GRID_COLOR, linestyle="--", alpha=0.5)
    ax.spines["polar"].set_color(GRID_COLOR)

    ax.set_title("Radar Chart – Overall Performance\n"
                 "(outer edge = better)",
                 fontsize=13, fontweight="bold", color=TEXT_COLOR, pad=20)
    ax.legend(loc="upper right", bbox_to_anchor=(1.3, 1.15), fontsize=10)

    fig.tight_layout()
    _save_fig(fig, out_dir, "05_radar.png")


# ═══════════════════════════════════════════════════════════════════════
#  CHART 6: Summary comparison table (rendered as image)
# ═══════════════════════════════════════════════════════════════════════

def chart_summary_table(summary_df: pd.DataFrame, out_dir: str):
    if summary_df.empty:
        return

    tbl = summary_df[["Metric", "Agg", "Unit", "H2", "H3",
                      "Δ (H3−H2)", "Δ%", "Verdict"]].copy()
    tbl = tbl.dropna(subset=["H2", "H3"])

    n_rows = len(tbl)
    fig_h = max(4, 0.42 * n_rows + 2)
    fig, ax = plt.subplots(figsize=(16, fig_h))
    fig.patch.set_facecolor(BG_COLOR)
    ax.set_facecolor(BG_COLOR)
    ax.axis("off")

    col_widths = [0.20, 0.06, 0.07, 0.13, 0.13, 0.14, 0.13, 0.14]
    headers = list(tbl.columns)

    table = ax.table(
        cellText=tbl.values,
        colLabels=headers,
        colWidths=col_widths,
        cellLoc="center",
        loc="center",
    )
    table.auto_set_font_size(False)
    table.set_fontsize(9)

    for col_idx in range(len(headers)):
        cell = table[0, col_idx]
        cell.set_facecolor("#2A2D3E")
        cell.set_text_props(color=TEXT_COLOR, fontweight="bold")
        cell.set_edgecolor(GRID_COLOR)

    for row_idx in range(1, n_rows + 1):
        verdict_str = str(tbl.iloc[row_idx - 1]["Verdict"])
        delta_pct_str = str(tbl.iloc[row_idx - 1]["Δ%"])
        for col_idx in range(len(headers)):
            cell = table[row_idx, col_idx]
            cell.set_facecolor(CARD_BG if row_idx % 2 == 0 else "#141720")
            cell.set_text_props(color=TEXT_COLOR)
            cell.set_edgecolor(GRID_COLOR)

            # Color Verdict column
            if col_idx == 7:
                if "H3" in verdict_str:
                    cell.set_text_props(color=PALETTE["H3"], fontweight="bold")
                elif "H2" in verdict_str:
                    cell.set_text_props(color=PALETTE["H2"], fontweight="bold")
            # Color Δ% column
            if col_idx == 6:
                if "▲" in delta_pct_str:
                    cell.set_text_props(color=PALETTE["H3"])
                elif "▼" in delta_pct_str:
                    cell.set_text_props(color=PALETTE["H2"])

    ax.set_title("Summary Comparison Table  │  HTTP/2 vs HTTP/3",
                 fontsize=14, fontweight="bold", color=TEXT_COLOR,
                 pad=12, loc="left")

    fig.tight_layout()
    _save_fig(fig, out_dir, "06_summary_table.png")


# ═══════════════════════════════════════════════════════════════════════
#  CHART 7: Log level distribution
# ═══════════════════════════════════════════════════════════════════════

def chart_level_dist(h2: pd.DataFrame, h3: pd.DataFrame, out_dir: str):
    if "Level" not in h2.columns or "Level" not in h3.columns:
        return

    levels = ["SYS", "NET", "INFO", "WARN", "ERRO"]
    h2_cnt = h2["Level"].value_counts().reindex(levels, fill_value=0)
    h3_cnt = h3["Level"].value_counts().reindex(levels, fill_value=0)

    x = np.arange(len(levels))
    w = 0.35

    fig, ax = plt.subplots(figsize=(10, 5))
    b1 = ax.bar(x - w / 2, h2_cnt.values, width=w,
                color=PALETTE["H2"], label="HTTP/2",
                edgecolor=GRID_COLOR, lw=0.8)
    b2 = ax.bar(x + w / 2, h3_cnt.values, width=w,
                color=PALETTE["H3"], label="HTTP/3",
                edgecolor=GRID_COLOR, lw=0.8)
    _add_bar_labels(ax, b1, fmt="{:.0f}")
    _add_bar_labels(ax, b2, fmt="{:.0f}")

    ax.set_xticks(x)
    ax.set_xticklabels(levels, fontsize=11)
    _style_ax(ax, "Log Level Distribution  │  HTTP/2 vs HTTP/3",
              xlabel="Log Level", ylabel="Number of log entries")
    ax.legend(fontsize=10)

    fig.tight_layout()
    _save_fig(fig, out_dir, "07_level_distribution.png")


# ═══════════════════════════════════════════════════════════════════════
#  CHART 8: Playback Stability (Stall / Rebuffer / Quality Switch)
# ═══════════════════════════════════════════════════════════════════════

def chart_stability(h2: pd.DataFrame, h3: pd.DataFrame, out_dir: str):
    cols = _cols_by_group(h2, h3, "playback")
    if not cols:
        return

    n = min(len(cols), 9)
    ncols = min(n, 3)
    nrows = math.ceil(n / ncols)

    fig, axes = plt.subplots(nrows, ncols,
                             figsize=(5.5 * ncols, 5 * nrows))
    fig.suptitle("Playback Stability & Stalling Analysis  │  HTTP/2 vs HTTP/3",
                 fontsize=14, fontweight="bold", color=TEXT_COLOR, y=1.02)
    axes = np.atleast_1d(axes).flatten()

    for idx, col in enumerate(cols[:n]):
        ax = axes[idx]
        meta = METRIC_META[col]
        h2_v = _get_value(h2[col], col)
        h3_v = _get_value(h3[col], col)

        bars = ax.bar(
            ["HTTP/2", "HTTP/3"], [h2_v, h3_v],
            color=[PALETTE["H2"], PALETTE["H3"]],
            width=0.5, edgecolor=GRID_COLOR, lw=0.8,
        )
        _add_bar_labels(ax, bars, fmt="{:.2f}")
        _style_ax(ax,
                  f"{meta['label']} ({meta['agg']})\n({_hint_label(col)})",
                  ylabel=f"{meta['label']} ({meta['unit']})")

    _hide_unused(axes, n, len(axes))
    fig.tight_layout()
    _save_fig(fig, out_dir, "08_stability.png")


# ═══════════════════════════════════════════════════════════════════════
#  CHART 9: Categorical column analysis
# ═══════════════════════════════════════════════════════════════════════

def chart_categorical(h2: pd.DataFrame, h3: pd.DataFrame, out_dir: str):
    cats = _available_cols(h2, h3, CATEGORICAL_COLS)
    cats = [c for c in cats if c != "Level"]
    if not cats:
        return

    n = len(cats)
    ncols = min(n, 3)
    nrows = math.ceil(n / ncols)

    fig, axes = plt.subplots(nrows, ncols * 2,
                             figsize=(ncols * 9, nrows * 4.5))
    fig.suptitle("Categorical Column Analysis  │  HTTP/2 vs HTTP/3",
                 fontsize=14, fontweight="bold", color=TEXT_COLOR, y=1.02)
    axes = np.atleast_1d(axes).flatten()

    for idx, col in enumerate(cats):
        ax_h2 = axes[idx * 2]
        ax_h3 = axes[idx * 2 + 1]

        h2_cnt = h2[col].value_counts().nlargest(6)
        h3_cnt = h3[col].value_counts().nlargest(6)

        for ax, cnt, proto, color in [
            (ax_h2, h2_cnt, "HTTP/2", PALETTE["H2"]),
            (ax_h3, h3_cnt, "HTTP/3", PALETTE["H3"]),
        ]:
            if cnt.empty:
                ax.set_visible(False)
                continue
            colors = [color] + ["#2A2D3E"] * (len(cnt) - 1)
            bars = ax.barh(cnt.index.astype(str), cnt.values,
                           color=colors, edgecolor=GRID_COLOR, lw=0.6)
            for bar in bars:
                w = bar.get_width()
                ax.text(w + max(w * 0.02, 0.5),
                        bar.get_y() + bar.get_height() / 2,
                        f"{int(w)}", va="center", fontsize=7.5,
                        color=TEXT_COLOR)
            ax.set_title(f"{col}  [{proto}]", fontsize=9,
                         fontweight="bold", color=TEXT_COLOR)
            ax.set_xlabel("Log entries", fontsize=8)
            ax.yaxis.grid(False)
            ax.xaxis.grid(True)
            ax.set_axisbelow(True)
            for sp in ax.spines.values():
                sp.set_color(GRID_COLOR)

    _hide_unused(axes, len(cats) * 2, len(axes))
    fig.tight_layout()
    _save_fig(fig, out_dir, "09_categorical.png")


# ═══════════════════════════════════════════════════════════════════════
#  CHART 10: Extra / Context Metrics
# ═══════════════════════════════════════════════════════════════════════

def chart_extra_metrics(h2: pd.DataFrame, h3: pd.DataFrame, out_dir: str):
    cols = _cols_by_group(h2, h3, "extra")
    if not cols:
        return

    n = min(len(cols), 6)
    ncols = min(n, 3)
    nrows = math.ceil(n / ncols)

    fig, axes = plt.subplots(nrows, ncols, figsize=(6 * ncols, 5 * nrows))
    fig.suptitle("Supplementary Metrics  │  HTTP/2 vs HTTP/3",
                 fontsize=14, fontweight="bold", color=TEXT_COLOR, y=1.02)
    axes = np.atleast_1d(axes).flatten()

    for idx, col in enumerate(cols[:n]):
        ax = axes[idx]
        meta = METRIC_META[col]
        h2_v = _get_value(h2[col], col)
        h3_v = _get_value(h3[col], col)

        bars = ax.bar(
            ["HTTP/2", "HTTP/3"], [h2_v, h3_v],
            color=[PALETTE["H2"], PALETTE["H3"]],
            width=0.5, edgecolor=GRID_COLOR, lw=0.8,
        )
        _add_bar_labels(ax, bars, fmt="{:.2f}")
        _style_ax(ax,
                  f"{meta['label']} ({meta['agg']})\n({_hint_label(col)})",
                  ylabel=f"{meta['label']} ({meta['unit']})")

    _hide_unused(axes, n, len(axes))
    fig.tight_layout()
    _save_fig(fig, out_dir, "10_extra_metrics.png")


# ═══════════════════════════════════════════════════════════════════════
#  CHART 11: Stalling Analysis (NEW - critical for Q1 paper)
# ═══════════════════════════════════════════════════════════════════════

def chart_stalling_analysis(h2: pd.DataFrame, h3: pd.DataFrame, out_dir: str):
    """Dedicated stalling & rebuffering analysis chart for academic research."""
    stall_metrics = [
        "StallCount", "StallDuration_ms",
        "RebufferCount", "RebufferDuration_ms",
        "RebufferingRatio",
    ]
    cols = _available_cols(h2, h3, stall_metrics)
    if not cols:
        return

    n = len(cols)
    ncols = min(n, 3)
    nrows = math.ceil(n / ncols)

    fig, axes = plt.subplots(nrows, ncols, figsize=(6 * ncols, 5.5 * nrows))
    fig.suptitle("Stalling & Rebuffering Analysis  │  HTTP/2 vs HTTP/3 (QUIC)\n"
                 "Key QoE indicators for adaptive streaming research",
                 fontsize=14, fontweight="bold", color=TEXT_COLOR, y=1.04)
    axes = np.atleast_1d(axes).flatten()

    for idx, col in enumerate(cols[:n]):
        ax = axes[idx]
        meta = METRIC_META[col]
        h2_v = _get_value(h2[col], col)
        h3_v = _get_value(h3[col], col)

        bars = ax.bar(
            ["HTTP/2", "HTTP/3"], [h2_v, h3_v],
            color=[PALETTE["H2"], PALETTE["H3"]],
            width=0.45, edgecolor=GRID_COLOR, lw=0.8,
        )

        # Format: special handling for ratio
        if col == "RebufferingRatio":
            fmt = "{:.4f}"
        elif "Duration" in col:
            fmt = "{:.0f}"
        else:
            fmt = "{:.0f}"
        _add_bar_labels(ax, bars, fmt=fmt)

        title_label = meta["label"]
        if col == "RebufferingRatio":
            title_label += "\n(stall_duration / playback_duration)"

        _style_ax(ax, f"{title_label}\n({_hint_label(col)})",
                  ylabel=f"{meta['label']} ({meta['unit']})")

        # Highlight: add percentage difference annotation
        if h2_v > 0 and not pd.isna(h2_v) and not pd.isna(h3_v):
            pct_diff = ((h3_v - h2_v) / h2_v) * 100
            color = ACCENT_GREEN if pct_diff < 0 else ACCENT_RED
            sign = "+" if pct_diff > 0 else ""
            ax.text(0.5, 0.92, f"Δ = {sign}{pct_diff:.1f}%",
                    transform=ax.transAxes, ha="center",
                    fontsize=10, fontweight="bold", color=color,
                    bbox=dict(boxstyle="round,pad=0.3",
                              facecolor=CARD_BG, edgecolor=color, alpha=0.9))

    _hide_unused(axes, n, len(axes))
    fig.tight_layout()
    _save_fig(fig, out_dir, "11_stalling_analysis.png")


# ═══════════════════════════════════════════════════════════════════════
#  EXPORT CSV SUMMARY
# ═══════════════════════════════════════════════════════════════════════

def export_summary_csv(summary_df: pd.DataFrame,
                       desc_h2: pd.DataFrame,
                       desc_h3: pd.DataFrame,
                       out_dir: str):
    """Export summary statistics to CSV files."""
    if not summary_df.empty:
        path = os.path.join(out_dir, "summary_comparison.csv")
        summary_df.to_csv(path, index=False, encoding="utf-8-sig")
        print(f"  ✔  {path}")

    if not desc_h2.empty:
        path = os.path.join(out_dir, "descriptive_h2.csv")
        desc_h2.to_csv(path, index=False, encoding="utf-8-sig")
        print(f"  ✔  {path}")

    if not desc_h3.empty:
        path = os.path.join(out_dir, "descriptive_h3.csv")
        desc_h3.to_csv(path, index=False, encoding="utf-8-sig")
        print(f"  ✔  {path}")


# ═══════════════════════════════════════════════════════════════════════
#  OPEN OUTPUT FOLDER
# ═══════════════════════════════════════════════════════════════════════

def open_folder(path: str):
    abs_path = os.path.abspath(path)
    system = platform.system()
    try:
        if system == "Windows":
            os.startfile(abs_path)
        elif system == "Darwin":
            subprocess.Popen(["open", abs_path])
        else:
            subprocess.Popen(["xdg-open", abs_path])
    except Exception as e:
        print(f"  ⚠  Could not open folder automatically: {e}")


# ═══════════════════════════════════════════════════════════════════════
#  MAIN ANALYSIS PIPELINE
# ═══════════════════════════════════════════════════════════════════════

def run_analysis(h2_path: str, h3_path: str, out_dir: str,
                 progress_cb: Optional[Callable] = None) -> str:
    """
    Run the full analysis pipeline.
    progress_cb(step, total, msg) – progress callback.
    """
    TOTAL = 15

    def _progress(step: int, msg: str):
        if progress_cb:
            progress_cb(step, TOTAL, msg)
        else:
            pct = int(step / TOTAL * 100)
            print(f"  [{pct:3d}%] {msg}")

    os.makedirs(out_dir, exist_ok=True)

    # 0. Read files
    _progress(0, "Reading CSV files…")
    h2 = load_csv(h2_path, "HTTP/2")
    h3 = load_csv(h3_path, "HTTP/3")

    # 1. Summary statistics
    _progress(1, "Computing summary statistics…")
    summary_df = compute_summary(h2, h3)
    print_summary(h2, h3, summary_df)

    # 2. Descriptive statistics
    _progress(2, "Computing descriptive statistics…")
    desc_h2 = compute_descriptive(h2, "HTTP/2")
    desc_h3 = compute_descriptive(h3, "HTTP/3")

    # 3-13. Generate charts
    chart_steps = [
        (chart_network_bars,       "Chart: Network Metrics"),
        (chart_quality_bars,       "Chart: Video Quality"),
        (chart_distribution,       "Chart: Distribution (violin)"),
        (chart_timeline,           "Chart: Timeline"),
        (chart_radar,              "Chart: Radar chart"),
        (chart_summary_table,      None),  # handled separately
        (chart_level_dist,         "Chart: Log level distribution"),
        (chart_stability,          "Chart: Playback stability"),
        (chart_categorical,        "Chart: Categorical columns"),
        (chart_extra_metrics,      "Chart: Supplementary metrics"),
        (chart_stalling_analysis,  "Chart: Stalling analysis"),
    ]

    for i, (fn, msg) in enumerate(chart_steps, start=3):
        if fn == chart_summary_table:
            _progress(i, "Chart: Summary table")
            fn(summary_df, out_dir)
        else:
            _progress(i, msg)
            fn(h2, h3, out_dir)

    # 14. Export CSV
    _progress(14, "Exporting CSV summary files…")
    export_summary_csv(summary_df, desc_h2, desc_h3, out_dir)

    _progress(TOTAL, "Complete!")
    return os.path.abspath(out_dir)


# ═══════════════════════════════════════════════════════════════════════
#  GUI MODE
# ═══════════════════════════════════════════════════════════════════════

def gui_mode():
    import queue
    import threading

    root = tk.Tk()
    root.withdraw()
    root.title("ADTube Log Analyzer")

    # Step 1: select H2 file
    messagebox.showinfo("ADTube – Step 1/2",
                        "Select the CSV log file for HTTP/2")
    h2_path = filedialog.askopenfilename(
        title="Select CSV – HTTP/2",
        filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
    )
    if not h2_path:
        messagebox.showwarning("Cancelled", "No H2 file selected. Exiting.")
        root.destroy()
        return

    # Step 2: select H3 file
    messagebox.showinfo("ADTube – Step 2/2",
                        "Select the CSV log file for HTTP/3 (QUIC)")
    h3_path = filedialog.askopenfilename(
        title="Select CSV – HTTP/3 (QUIC)",
        filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
    )
    if not h3_path:
        messagebox.showwarning("Cancelled", "No H3 file selected. Exiting.")
        root.destroy()
        return

    # Output directory
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    default_out = os.path.join(
        os.path.dirname(h2_path), f"log_analysis_{timestamp}"
    )
    out_dir = filedialog.askdirectory(
        title="Select output folder (Cancel = auto-create)",
        initialdir=os.path.dirname(h2_path),
    ) or default_out

    # Progress window
    prog_win = tk.Toplevel(root)
    prog_win.title("Analyzing…")
    prog_win.resizable(False, False)
    prog_win.geometry("500x170")
    prog_win.configure(bg=BG_COLOR)
    prog_win.protocol("WM_DELETE_WINDOW", lambda: None)

    tk.Label(prog_win, text="ADTube Log Analyzer",
             font=("Segoe UI", 12, "bold"),
             bg=BG_COLOR, fg=TEXT_COLOR).pack(pady=(18, 4))

    status_var = tk.StringVar(value="Preparing…")
    tk.Label(prog_win, textvariable=status_var,
             font=("Segoe UI", 9), bg=BG_COLOR, fg=MUTED_TEXT).pack()

    style = ttk.Style(prog_win)
    style.theme_use("default")
    style.configure("Custom.Horizontal.TProgressbar",
                    troughcolor=CARD_BG, background=PALETTE["H3"],
                    thickness=12)
    pbar = ttk.Progressbar(prog_win, orient="horizontal", length=420,
                           mode="determinate",
                           style="Custom.Horizontal.TProgressbar")
    pbar.pack(pady=14)

    pct_var = tk.StringVar(value="0%")
    tk.Label(prog_win, textvariable=pct_var,
             font=("Segoe UI", 8), bg=BG_COLOR, fg=TEXT_COLOR).pack()

    print(f"H2:  {h2_path}")
    print(f"H3:  {h3_path}")
    print(f"OUT: {out_dir}")

    msg_queue = queue.Queue()

    def progress_cb(step, total, msg):
        pct = int(step / total * 100)
        msg_queue.put(("progress", pct, msg))

    def do_work():
        try:
            result = run_analysis(h2_path, h3_path, out_dir,
                                  progress_cb=progress_cb)
            msg_queue.put(("done", result, None))
        except Exception as exc:
            msg_queue.put(("done", None, exc))

    def poll():
        try:
            while True:
                item = msg_queue.get_nowait()
                if item[0] == "progress":
                    _, pct, txt = item
                    pbar["value"] = pct
                    pct_var.set(f"{pct}%")
                    status_var.set(txt)
                elif item[0] == "done":
                    _, result, err = item
                    prog_win.destroy()
                    if err:
                        messagebox.showerror("Error", str(err))
                    else:
                        n_charts = len([f for f in os.listdir(result)
                                        if f.endswith(".png")])
                        n_csvs = len([f for f in os.listdir(result)
                                      if f.endswith(".csv")])
                        ans = messagebox.askyesno(
                            "Complete!",
                            f"Generated {n_charts} charts "
                            f"and {n_csvs} CSV files.\n\n"
                            f"Open the output folder now?",
                        )
                        if ans:
                            open_folder(result)
                    root.destroy()
                    return
        except queue.Empty:
            pass
        root.after(80, poll)

    threading.Thread(target=do_work, daemon=True).start()
    root.after(80, poll)
    root.mainloop()


# ═══════════════════════════════════════════════════════════════════════
#  CLI MODE
# ═══════════════════════════════════════════════════════════════════════

def cli_mode():
    parser = argparse.ArgumentParser(
        description="Analyze & compare CSV logs: HTTP/2 vs HTTP/3 (QUIC)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Examples:
              python analyze_logs.py h2.csv h3.csv
              python analyze_logs.py h2.csv h3.csv --out ./charts
            Run without arguments → opens file dialog (GUI mode).
        """),
    )
    parser.add_argument("h2_csv", help="CSV log file for HTTP/2")
    parser.add_argument("h3_csv", help="CSV log file for HTTP/3")
    parser.add_argument("--out", default="./log_analysis",
                        help="Output directory (default: ./log_analysis)")
    parser.add_argument("--open", action="store_true",
                        help="Auto-open output folder when done")
    args = parser.parse_args()

    print(f"\n{'─' * 65}")
    print("  ADTube Log Analyzer  │  HTTP/2 vs HTTP/3 (QUIC)")
    print(f"{'─' * 65}")
    print(f"  H2  ← {args.h2_csv}")
    print(f"  H3  ← {args.h3_csv}")
    print(f"  OUT → {os.path.abspath(args.out)}")
    print(f"{'─' * 65}\n")

    out = run_analysis(args.h2_csv, args.h3_csv, args.out)
    print(f"\n✅ Complete! Results saved to: {out}\n")

    if args.open:
        open_folder(out)


# ═══════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    if len(sys.argv) == 1:
        gui_mode()
    else:
        cli_mode()
