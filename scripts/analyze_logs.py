"""
analyze_logs.py
---------------
Phân tích & so sánh 2 file CSV log từ hệ thống ADTube:
  - File H2 (HTTP/2)
  - File H3 (HTTP/3 / QUIC)

Tự động phát hiện tất cả cột có trong CSV, phân loại đúng kiểu dữ liệu
(tức thời / tích lũy / phân loại), và áp dụng phương pháp thống kê phù hợp.

Cách dùng:
  GUI (khuyến nghị) – chạy không có argument:
    python analyze_logs.py
    → Hộp thoại chọn file hiện ra, sau khi vẽ xong tự mở thư mục output.

  CLI:
    python analyze_logs.py <h2_csv> <h3_csv> [--out <output_dir>]

Yêu cầu:
    pip install pandas matplotlib seaborn numpy
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
#  ĐỊNH NGHĨA CỘT CSV & METADATA
# ═══════════════════════════════════════════════════════════════════════

# Mỗi cột số có metadata:
#   agg    : "mean" (tức thời) hoặc "last" (tích lũy)
#   label  : nhãn hiển thị
#   unit   : đơn vị
#   hint   : gợi ý cao/thấp tốt hơn ("lower" | "higher" | "info")
#   group  : nhóm phân tích ("network" | "quality" | "playback" | "extra")

METRIC_META = {
    # ── Nhóm mạng ──
    "Latency_ms": {
        "agg": "mean", "label": "Latency", "unit": "ms",
        "hint": "lower", "group": "network",
    },
    "Jitter_ms": {
        "agg": "mean", "label": "Jitter", "unit": "ms",
        "hint": "lower", "group": "network",
    },
    "RTT_ms": {
        "agg": "mean", "label": "RTT", "unit": "ms",
        "hint": "lower", "group": "network",
    },
    "DownloadSpeed_kbps": {
        "agg": "mean", "label": "Download Speed", "unit": "kbps",
        "hint": "higher", "group": "network",
    },
    "Throughput_kbps": {
        "agg": "mean", "label": "Throughput", "unit": "kbps",
        "hint": "higher", "group": "network",
    },
    "SegmentDuration_ms": {
        "agg": "mean", "label": "Segment Duration", "unit": "ms",
        "hint": "lower", "group": "network",
    },
    "SegmentSize_KB": {
        "agg": "mean", "label": "Segment Size", "unit": "KB",
        "hint": "info", "group": "network",
    },
    "EstimatedBandwidth_Mbps": {
        "agg": "mean", "label": "Est. Bandwidth", "unit": "Mbps",
        "hint": "higher", "group": "network",
    },

    # ── Nhóm chất lượng phát ──
    "Bitrate_kbps": {
        "agg": "mean", "label": "Bitrate", "unit": "kbps",
        "hint": "higher", "group": "quality",
    },
    "Buffer_s": {
        "agg": "mean", "label": "Buffer Length", "unit": "s",
        "hint": "higher", "group": "quality",
    },
    "FPS": {
        "agg": "mean", "label": "FPS", "unit": "fps",
        "hint": "higher", "group": "quality",
    },
    "QualityIndex": {
        "agg": "mean", "label": "Quality Index", "unit": "",
        "hint": "higher", "group": "quality",
    },

    # ── Nhóm playback / ổn định ──
    "DroppedFrames": {
        "agg": "last", "label": "Dropped Frames", "unit": "frames",
        "hint": "lower", "group": "playback",
    },
    "TotalFrames": {
        "agg": "last", "label": "Total Frames", "unit": "frames",
        "hint": "info", "group": "playback",
    },
    "RebufferCount": {
        "agg": "last", "label": "Rebuffer Count", "unit": "lần",
        "hint": "lower", "group": "playback",
    },
    "RebufferDuration_ms": {
        "agg": "last", "label": "Rebuffer Duration", "unit": "ms",
        "hint": "lower", "group": "playback",
    },
    "QualitySwitchCount": {
        "agg": "last", "label": "Quality Switches", "unit": "lần",
        "hint": "lower", "group": "playback",
    },
    "TotalDownloaded_MB": {
        "agg": "last", "label": "Total Downloaded", "unit": "MB",
        "hint": "info", "group": "playback",
    },

    # ── Nhóm phụ / ngữ cảnh ──
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

# Cột phân loại (categorical/text)
CATEGORICAL_COLS = [
    "Level", "Protocol", "ConnectionType", "Resolution",
    "Codec", "ActiveScenario", "IsAutoQuality",
]

# Tất cả cột số
ALL_NUMERIC_COLS = list(METRIC_META.keys())

# Cột tích lũy
CUMULATIVE_COLS = {k for k, v in METRIC_META.items() if v["agg"] == "last"}

# ═══════════════════════════════════════════════════════════════════════
#  THEME & STYLE
# ═══════════════════════════════════════════════════════════════════════

PALETTE = {
    "H2": "#4C9BE8",   # xanh dương – HTTP/2
    "H3": "#F5A623",   # cam vàng   – HTTP/3 QUIC
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
    """Giá trị đại diện: last cho tích lũy, mean cho tức thời."""
    s = series.dropna()
    if s.empty:
        return float("nan")
    meta = METRIC_META.get(col)
    if meta and meta["agg"] == "last":
        return float(s.iloc[-1])
    return float(s.mean())


def _hint_label(col: str) -> str:
    """Trả về chuỗi gợi ý 'Thấp = tốt' / 'Cao = tốt' / 'Info'."""
    meta = METRIC_META.get(col, {})
    h = meta.get("hint", "info")
    return {"lower": "Thấp hơn = tốt hơn",
            "higher": "Cao hơn = tốt hơn",
            "info": "Thông tin"}.get(h, "")


def _fmt_val(v: float, precision: int = 2) -> str:
    if pd.isna(v):
        return "N/A"
    if abs(v) >= 1000:
        return f"{v:,.{precision}f}"
    return f"{v:.{precision}f}"


def _add_bar_labels(ax, bars, fmt="{:.1f}"):
    """Thêm nhãn giá trị lên mỗi cột bar."""
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
    """Ẩn các subplot không sử dụng."""
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
    """Trả về danh sách cột có trong cả 2 DataFrame."""
    return [c for c in cols if c in h2.columns and c in h3.columns]


def _cols_by_group(h2: pd.DataFrame, h3: pd.DataFrame,
                   group: str) -> List[str]:
    """Lấy các cột thuộc group nhất định có trong cả 2 df."""
    candidates = [k for k, v in METRIC_META.items() if v["group"] == group]
    return _available_cols(h2, h3, candidates)


# ═══════════════════════════════════════════════════════════════════════
#  ĐỌC & LÀM SẠCH CSV
# ═══════════════════════════════════════════════════════════════════════

def load_csv(path: str, label: str) -> pd.DataFrame:
    """Đọc CSV log (UTF-8 BOM), ép kiểu số cho các cột metric."""
    if not os.path.isfile(path):
        print(f"[ERROR] Không tìm thấy file: {path}")
        sys.exit(1)

    df = pd.read_csv(path, encoding="utf-8-sig")
    df.columns = [c.strip() for c in df.columns]

    # Ép kiểu số
    for col in ALL_NUMERIC_COLS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    df["_label"] = label
    return df


# ═══════════════════════════════════════════════════════════════════════
#  THỐNG KÊ TỔNG HỢP
# ═══════════════════════════════════════════════════════════════════════

def compute_summary(h2: pd.DataFrame, h3: pd.DataFrame) -> pd.DataFrame:
    """
    Tạo bảng thống kê so sánh H2 vs H3 cho tất cả metric số.
    Cột: Metric | Group | Agg | Unit | H2 | H3 | Δ | Δ% | Verdict
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

        # Verdict: H3 tốt hơn / H2 tốt hơn / bằng nhau
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
    """In bảng thống kê ra console."""
    print(f"\n{'═' * 80}")
    print("  THỐNG KÊ TỔNG QUAN  │  ADTube Log Analyzer")
    print(f"{'═' * 80}")
    print(f"  HTTP/2  → {len(h2):>6,} dòng log")
    print(f"  HTTP/3  → {len(h3):>6,} dòng log")
    print(f"{'═' * 80}")

    if summary_df.empty:
        print("  (Không có dữ liệu số chung)")
        return

    # In bảng gọn
    display = summary_df[["Metric", "Agg", "Unit", "H2", "H3",
                          "Δ (H3−H2)", "Δ%", "Verdict"]].copy()
    print(display.to_string(index=False))
    print(f"{'═' * 80}\n")

    # Đếm verdict
    h3_wins = (summary_df["Verdict"] == "H3 ✓").sum()
    h2_wins = (summary_df["Verdict"] == "H2 ✓").sum()
    ties = len(summary_df) - h3_wins - h2_wins
    print(f"  Kết quả: H3 tốt hơn ở {h3_wins} chỉ số, "
          f"H2 tốt hơn ở {h2_wins} chỉ số, "
          f"bằng/info ở {ties} chỉ số.\n")


# ═══════════════════════════════════════════════════════════════════════
#  DESCRIPTIVE STATISTICS (mean, median, std, min, max, p5, p95)
# ═══════════════════════════════════════════════════════════════════════

def compute_descriptive(df: pd.DataFrame, label: str) -> pd.DataFrame:
    """Thống kê mô tả cho một DataFrame."""
    available = [c for c in ALL_NUMERIC_COLS if c in df.columns]
    if not available:
        return pd.DataFrame()

    result = df[available].describe(
        percentiles=[0.05, 0.25, 0.5, 0.75, 0.95]
    ).T
    result.index.name = "Metric"
    result["Protocol"] = label

    # Thêm agg type
    result["Agg"] = result.index.map(
        lambda x: METRIC_META.get(x, {}).get("agg", "mean")
    )
    return result.reset_index()


# ═══════════════════════════════════════════════════════════════════════
#  CHART 1: Chỉ số mạng (bar chart)
# ═══════════════════════════════════════════════════════════════════════

def chart_network_bars(h2: pd.DataFrame, h3: pd.DataFrame, out_dir: str):
    cols = _cols_by_group(h2, h3, "network")
    if not cols:
        return

    n = min(len(cols), 8)
    ncols = min(n, 4)
    nrows = math.ceil(n / ncols)

    fig, axes = plt.subplots(nrows, ncols, figsize=(5 * ncols, 5 * nrows))
    fig.suptitle("Chỉ Số Mạng  │  HTTP/2 vs HTTP/3 (QUIC)",
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

        # Thêm thông tin phụ bên dưới
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
#  CHART 2: Chất lượng phát video (bar chart)
# ═══════════════════════════════════════════════════════════════════════

def chart_quality_bars(h2: pd.DataFrame, h3: pd.DataFrame, out_dir: str):
    cols = _cols_by_group(h2, h3, "quality")
    if not cols:
        return

    n = min(len(cols), 6)
    ncols = min(n, 3)
    nrows = math.ceil(n / ncols)

    fig, axes = plt.subplots(nrows, ncols, figsize=(6 * ncols, 5 * nrows))
    fig.suptitle("Chất Lượng Phát Video  │  HTTP/2 vs HTTP/3 (QUIC)",
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
#  CHART 3: Phân phối dữ liệu (violin plot)
# ═══════════════════════════════════════════════════════════════════════

def chart_distribution(h2: pd.DataFrame, h3: pd.DataFrame, out_dir: str):
    # Chọn các cột tức thời (không tích lũy) có ý nghĩa phân phối
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
    fig.suptitle("Phân Phối Dữ Liệu  │  HTTP/2 vs HTTP/3 (QUIC)",
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
#  CHART 4: Timeline (biến thiên theo thứ tự log)
# ═══════════════════════════════════════════════════════════════════════

def chart_timeline(h2: pd.DataFrame, h3: pd.DataFrame, out_dir: str):
    key_cols = ["Latency_ms", "Buffer_s", "Bitrate_kbps",
                "DownloadSpeed_kbps", "Throughput_kbps"]
    cols = _available_cols(h2, h3, key_cols)
    if not cols:
        return

    n = len(cols)
    fig, axes = plt.subplots(n, 1, figsize=(18, 4 * n))
    fig.suptitle("Timeline Theo Thứ Tự Log  │  HTTP/2 vs HTTP/3 (QUIC)",
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
#  CHART 5: Radar chart (tổng quan đa chiều)
# ═══════════════════════════════════════════════════════════════════════

def chart_radar(h2: pd.DataFrame, h3: pd.DataFrame, out_dir: str):
    # Chọn 6-8 chỉ số chính
    candidates = [
        ("DownloadSpeed_kbps", False),
        ("Bitrate_kbps",       False),
        ("Buffer_s",           False),
        ("FPS",                False),
        ("Throughput_kbps",    False),
        ("Latency_ms",         True),   # invert: thấp = tốt
        ("Jitter_ms",          True),
        ("RTT_ms",             True),
    ]
    available = [(col, inv) for col, inv in candidates
                 if col in h2.columns and col in h3.columns]
    if len(available) < 3:
        print("  ⚠  Không đủ dữ liệu để vẽ radar chart.")
        return

    labels = [METRIC_META[col]["label"] for col, _ in available]
    h2_vals = np.array([_get_value(h2[col], col) for col, _ in available])
    h3_vals = np.array([_get_value(h3[col], col) for col, _ in available])

    # Chuẩn hóa
    combined_max = np.maximum(h2_vals, h3_vals)
    combined_max[combined_max == 0] = 1
    h2_norm = h2_vals / combined_max
    h3_norm = h3_vals / combined_max

    # Invert
    for i, (_, inv) in enumerate(available):
        if inv:
            h2_norm[i] = 1 - h2_norm[i]
            h3_norm[i] = 1 - h3_norm[i]

    # Đóng vòng
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
    ax.set_xticklabels(labels, fontsize=10, color=TEXT_COLOR)
    ax.yaxis.grid(True, color=GRID_COLOR, linestyle="--", alpha=0.5)
    ax.xaxis.grid(True, color=GRID_COLOR, linestyle="--", alpha=0.5)
    ax.spines["polar"].set_color(GRID_COLOR)

    ax.set_title("Radar Chart – Hiệu Năng Tổng Quan\n"
                 "(cạnh ngoài = tốt hơn)",
                 fontsize=13, fontweight="bold", color=TEXT_COLOR, pad=20)
    ax.legend(loc="upper right", bbox_to_anchor=(1.3, 1.15), fontsize=10)

    fig.tight_layout()
    _save_fig(fig, out_dir, "05_radar.png")


# ═══════════════════════════════════════════════════════════════════════
#  CHART 6: Bảng tổng hợp so sánh (render hình ảnh)
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

            # Tô màu cột Verdict
            if col_idx == 7:
                if "H3" in verdict_str:
                    cell.set_text_props(color=PALETTE["H3"], fontweight="bold")
                elif "H2" in verdict_str:
                    cell.set_text_props(color=PALETTE["H2"], fontweight="bold")
            # Tô màu cột Δ%
            if col_idx == 6:
                if "▲" in delta_pct_str:
                    cell.set_text_props(color=PALETTE["H3"])
                elif "▼" in delta_pct_str:
                    cell.set_text_props(color=PALETTE["H2"])

    ax.set_title("Bảng Tổng Hợp So Sánh  │  HTTP/2 vs HTTP/3",
                 fontsize=14, fontweight="bold", color=TEXT_COLOR,
                 pad=12, loc="left")

    fig.tight_layout()
    _save_fig(fig, out_dir, "06_summary_table.png")


# ═══════════════════════════════════════════════════════════════════════
#  CHART 7: Phân bố Level log
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
    _style_ax(ax, "Phân Bố Level Log  │  HTTP/2 vs HTTP/3",
              xlabel="Log Level", ylabel="Số dòng log")
    ax.legend(fontsize=10)

    fig.tight_layout()
    _save_fig(fig, out_dir, "07_level_distribution.png")


# ═══════════════════════════════════════════════════════════════════════
#  CHART 8: Độ ổn định playback (Rebuffer / Quality Switch / Downloaded)
# ═══════════════════════════════════════════════════════════════════════

def chart_stability(h2: pd.DataFrame, h3: pd.DataFrame, out_dir: str):
    cols = _cols_by_group(h2, h3, "playback")
    if not cols:
        return

    n = min(len(cols), 6)
    ncols = min(n, 3)
    nrows = math.ceil(n / ncols)

    fig, axes = plt.subplots(nrows, ncols,
                             figsize=(5.5 * ncols, 5 * nrows))
    fig.suptitle("Độ Ổn Định Playback & Tổng Lượng Tải  │  HTTP/2 vs HTTP/3",
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
#  CHART 9: Phân tích cột phân loại (categorical)
# ═══════════════════════════════════════════════════════════════════════

def chart_categorical(h2: pd.DataFrame, h3: pd.DataFrame, out_dir: str):
    cats = _available_cols(h2, h3, CATEGORICAL_COLS)
    # Bỏ cột Level (đã vẽ riêng ở chart 7)
    cats = [c for c in cats if c != "Level"]
    if not cats:
        return

    n = len(cats)
    ncols = min(n, 3)
    nrows = math.ceil(n / ncols)

    fig, axes = plt.subplots(nrows, ncols * 2,
                             figsize=(ncols * 9, nrows * 4.5))
    fig.suptitle("Phân Tích Cột Phân Loại  │  HTTP/2 vs HTTP/3",
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
            ax.set_xlabel("Số dòng log", fontsize=8)
            ax.yaxis.grid(False)
            ax.xaxis.grid(True)
            ax.set_axisbelow(True)
            for sp in ax.spines.values():
                sp.set_color(GRID_COLOR)

    _hide_unused(axes, len(cats) * 2, len(axes))
    fig.tight_layout()
    _save_fig(fig, out_dir, "09_categorical.png")


# ═══════════════════════════════════════════════════════════════════════
#  CHART 10: Chỉ số phụ / Extra metrics
# ═══════════════════════════════════════════════════════════════════════

def chart_extra_metrics(h2: pd.DataFrame, h3: pd.DataFrame, out_dir: str):
    cols = _cols_by_group(h2, h3, "extra")
    if not cols:
        return

    n = min(len(cols), 6)
    ncols = min(n, 3)
    nrows = math.ceil(n / ncols)

    fig, axes = plt.subplots(nrows, ncols, figsize=(6 * ncols, 5 * nrows))
    fig.suptitle("Các Chỉ Số Bổ Sung  │  HTTP/2 vs HTTP/3",
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
#  EXPORT CSV SUMMARY
# ═══════════════════════════════════════════════════════════════════════

def export_summary_csv(summary_df: pd.DataFrame,
                       desc_h2: pd.DataFrame,
                       desc_h3: pd.DataFrame,
                       out_dir: str):
    """Xuất bảng thống kê ra file CSV."""
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
#  MỞ THƯ MỤC OUTPUT
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
        print(f"  ⚠  Không thể mở thư mục tự động: {e}")


# ═══════════════════════════════════════════════════════════════════════
#  LÕI XỬ LÝ CHÍNH
# ═══════════════════════════════════════════════════════════════════════

def run_analysis(h2_path: str, h3_path: str, out_dir: str,
                 progress_cb: Optional[Callable] = None) -> str:
    """
    Chạy toàn bộ pipeline phân tích.
    progress_cb(step, total, msg) – callback cập nhật tiến trình.
    """
    TOTAL = 14

    def _progress(step: int, msg: str):
        if progress_cb:
            progress_cb(step, TOTAL, msg)
        else:
            pct = int(step / TOTAL * 100)
            print(f"  [{pct:3d}%] {msg}")

    os.makedirs(out_dir, exist_ok=True)

    # 0. Đọc file
    _progress(0, "Đọc file CSV …")
    h2 = load_csv(h2_path, "HTTP/2")
    h3 = load_csv(h3_path, "HTTP/3")

    # 1. Thống kê tổng quan
    _progress(1, "Tính thống kê tổng quan …")
    summary_df = compute_summary(h2, h3)
    print_summary(h2, h3, summary_df)

    # 2. Thống kê mô tả
    _progress(2, "Tính thống kê mô tả …")
    desc_h2 = compute_descriptive(h2, "HTTP/2")
    desc_h3 = compute_descriptive(h3, "HTTP/3")

    # 3-12. Vẽ biểu đồ
    chart_steps = [
        (chart_network_bars,   "Vẽ: Chỉ số mạng"),
        (chart_quality_bars,   "Vẽ: Chất lượng phát"),
        (chart_distribution,   "Vẽ: Phân phối violin"),
        (chart_timeline,       "Vẽ: Timeline"),
        (chart_radar,          "Vẽ: Radar chart"),
        (chart_summary_table,  None),  # xử lý riêng
        (chart_level_dist,     "Vẽ: Phân bố Level log"),
        (chart_stability,      "Vẽ: Ổn định playback"),
        (chart_categorical,    "Vẽ: Cột phân loại"),
        (chart_extra_metrics,  "Vẽ: Chỉ số bổ sung"),
    ]

    for i, (fn, msg) in enumerate(chart_steps, start=3):
        if fn == chart_summary_table:
            _progress(i, "Vẽ: Bảng tổng hợp")
            fn(summary_df, out_dir)
        else:
            _progress(i, msg)
            fn(h2, h3, out_dir)

    # 13. Xuất CSV
    _progress(13, "Xuất file CSV thống kê …")
    export_summary_csv(summary_df, desc_h2, desc_h3, out_dir)

    _progress(TOTAL, "Hoàn thành!")
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

    # Bước 1: chọn file H2
    messagebox.showinfo("ADTube – Bước 1/2",
                        "Chọn file CSV log HTTP/2")
    h2_path = filedialog.askopenfilename(
        title="Chọn file CSV – HTTP/2",
        filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
    )
    if not h2_path:
        messagebox.showwarning("Hủy", "Bạn chưa chọn file H2. Thoát.")
        root.destroy()
        return

    # Bước 2: chọn file H3
    messagebox.showinfo("ADTube – Bước 2/2",
                        "Chọn file CSV log HTTP/3 (QUIC)")
    h3_path = filedialog.askopenfilename(
        title="Chọn file CSV – HTTP/3 (QUIC)",
        filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
    )
    if not h3_path:
        messagebox.showwarning("Hủy", "Bạn chưa chọn file H3. Thoát.")
        root.destroy()
        return

    # Thư mục output
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    default_out = os.path.join(
        os.path.dirname(h2_path), f"log_analysis_{timestamp}"
    )
    out_dir = filedialog.askdirectory(
        title="Chọn thư mục lưu kết quả (Cancel = tự động tạo)",
        initialdir=os.path.dirname(h2_path),
    ) or default_out

    # Cửa sổ progress
    prog_win = tk.Toplevel(root)
    prog_win.title("Đang phân tích…")
    prog_win.resizable(False, False)
    prog_win.geometry("500x170")
    prog_win.configure(bg=BG_COLOR)
    prog_win.protocol("WM_DELETE_WINDOW", lambda: None)

    tk.Label(prog_win, text="ADTube Log Analyzer",
             font=("Segoe UI", 12, "bold"),
             bg=BG_COLOR, fg=TEXT_COLOR).pack(pady=(18, 4))

    status_var = tk.StringVar(value="Đang chuẩn bị…")
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
                        messagebox.showerror("Lỗi", str(err))
                    else:
                        n_charts = len([f for f in os.listdir(result)
                                        if f.endswith(".png")])
                        n_csvs = len([f for f in os.listdir(result)
                                      if f.endswith(".csv")])
                        ans = messagebox.askyesno(
                            "Hoàn thành!",
                            f"Đã tạo {n_charts} biểu đồ "
                            f"và {n_csvs} file CSV.\n\n"
                            f"Mở thư mục kết quả ngay?",
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
        description="Phân tích & so sánh log CSV HTTP/2 vs HTTP/3 (QUIC)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Ví dụ:
              python analyze_logs.py h2.csv h3.csv
              python analyze_logs.py h2.csv h3.csv --out ./charts
            Chạy không có tham số → mở hộp thoại chọn file (GUI mode).
        """),
    )
    parser.add_argument("h2_csv", help="File CSV log HTTP/2")
    parser.add_argument("h3_csv", help="File CSV log HTTP/3")
    parser.add_argument("--out", default="./log_analysis",
                        help="Thư mục lưu kết quả (mặc định: ./log_analysis)")
    parser.add_argument("--open", action="store_true",
                        help="Tự mở thư mục output sau khi xong")
    args = parser.parse_args()

    print(f"\n{'─' * 65}")
    print("  ADTube Log Analyzer  │  H2 vs H3 (QUIC)")
    print(f"{'─' * 65}")
    print(f"  H2  ← {args.h2_csv}")
    print(f"  H3  ← {args.h3_csv}")
    print(f"  OUT → {os.path.abspath(args.out)}")
    print(f"{'─' * 65}\n")

    out = run_analysis(args.h2_csv, args.h3_csv, args.out)
    print(f"\n✅ Hoàn thành! Kết quả đã lưu vào: {out}\n")

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
