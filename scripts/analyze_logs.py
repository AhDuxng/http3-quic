"""
analyze_logs.py
---------------
Phân tích và so sánh 2 file CSV log từ hệ thống ADTube:
  - File H2 (HTTP/2)
  - File H3 (HTTP/3 / QUIC)

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
import os
import platform
import subprocess
import sys
import warnings
import textwrap
import tkinter as tk
from datetime import datetime
from tkinter import filedialog, messagebox, ttk

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import seaborn as sns

warnings.filterwarnings("ignore")

#  Cấu hình màu sắc & style
PALETTE = {
    "H2":  "#4C9BE8",   # xanh dương – HTTP/2
    "H3":  "#F5A623",   # cam vàng   – HTTP/3 QUIC
}
BG_COLOR  = "#0F1117"
CARD_BG   = "#1A1D27"
TEXT_COLOR = "#E8EAF0"
GRID_COLOR = "#2A2D3E"

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

#  Cột số quan tâm (phải có trong CSV)
NUMERIC_COLS = [
    "Bitrate_kbps",
    "Throughput_kbps",
    "Buffer_s",
    "Latency_ms",
    "Jitter_ms",
    "RTT_ms",
    "DownloadSpeed_kbps",
    "SegmentSize_KB",
    "SegmentDuration_ms",
    "TotalDownloaded_MB",
    "DroppedFrames",
    "TotalFrames",
    "FPS",
    "RebufferCount",
    "RebufferDuration_ms",
    "QualitySwitchCount",
    # Cac cot so bo sung (truoc day chua co)
    "CurrentTime_s",
    "Duration_s",
    "QualityIndex",
    "QualityCount",
    "EstimatedBandwidth_Mbps",
]

#  Đọc & làm sạch CSV
def load_csv(path: str, label: str) -> pd.DataFrame:
    """Đọc CSV log (UTF-8 BOM), ép kiểu số, thêm cột Label."""
    if not os.path.isfile(path):
        print(f"[ERROR] Không tìm thấy file: {path}")
        sys.exit(1)

    df = pd.read_csv(path, encoding="utf-8-sig")
    df.columns = [c.strip() for c in df.columns]

    # Ép kiểu số cho các cột số (bỏ qua lỗi)
    for col in NUMERIC_COLS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Thêm cột nhãn giao thức
    df["_label"] = label
    return df


#  Thống kê tóm tắt
def summary_stats(df: pd.DataFrame, label: str) -> pd.DataFrame:
    available = [c for c in NUMERIC_COLS if c in df.columns]
    stats = df[available].agg(["mean", "median", "std", "min", "max"]).T
    stats.index.name = "Metric"
    stats["Protocol"] = label
    return stats.reset_index()


def print_summary(h2: pd.DataFrame, h3: pd.DataFrame):
    print("\n" + "═" * 70)
    print("  THỐNG KÊ TỔNG QUAN")
    print("═" * 70)
    print(f"  HTTP/2  → {len(h2):,} dòng log")
    print(f"  HTTP/3  → {len(h3):,} dòng log")
    print("═" * 70)

    available = [c for c in NUMERIC_COLS if c in h2.columns and c in h3.columns]
    rows = []
    for col in available:
        h2_mean = h2[col].mean()
        h3_mean = h3[col].mean()
        if pd.isna(h2_mean) and pd.isna(h3_mean):
            continue
        delta = h3_mean - h2_mean
        pct   = (delta / h2_mean * 100) if h2_mean and not pd.isna(h2_mean) else float("nan")
        arrow = "▲" if delta > 0 else ("▼" if delta < 0 else "=")
        rows.append({
            "Metric":    col,
            "H2 (mean)": round(h2_mean, 3),
            "H3 (mean)": round(h3_mean, 3),
            "Δ (H3−H2)": round(delta, 3),
            "Δ%":        f"{arrow} {abs(pct):.1f}%" if not np.isnan(pct) else "N/A",
        })

    tbl = pd.DataFrame(rows)
    print(tbl.to_string(index=False))
    print("═" * 70 + "\n")
    return tbl


#  Tiện ích vẽ biểu đồ
def _add_value_labels(ax, bars, fmt="{:.1f}"):
    """Thêm nhãn giá trị lên mỗi cột bar."""
    for bar in bars:
        h = bar.get_height()
        if np.isnan(h):
            continue
        ax.annotate(
            fmt.format(h),
            xy=(bar.get_x() + bar.get_width() / 2, h),
            xytext=(0, 5),
            textcoords="offset points",
            ha="center", va="bottom",
            fontsize=8, color=TEXT_COLOR,
        )


def styled_ax(ax, title: str, xlabel: str = "", ylabel: str = ""):
    ax.set_title(title, fontsize=11, fontweight="bold", color=TEXT_COLOR, pad=8)
    ax.set_xlabel(xlabel, fontsize=9)
    ax.set_ylabel(ylabel, fontsize=9)
    ax.yaxis.grid(True)
    ax.set_axisbelow(True)
    for spine in ax.spines.values():
        spine.set_color(GRID_COLOR)


#  === FIGURE 1: Chỉ số mạng (Latency / Jitter / RTT / Download Speed) ===
def fig_network(h2: pd.DataFrame, h3: pd.DataFrame, out_dir: str):
    metrics = [
        ("Latency_ms",        "Latency (ms)",         "Thấp hơn = tốt hơn"),
        ("Jitter_ms",         "Jitter (ms)",          "Thấp hơn = ổn định hơn"),
        ("RTT_ms",            "RTT (ms)",             "Thấp hơn = tốt hơn"),
        ("DownloadSpeed_kbps","Download Speed (kbps)","Cao hơn = tốt hơn"),
        ("Throughput_kbps",   "Throughput (kbps)",    "Cao hơn = tốt hơn"),
        ("SegmentDuration_ms","Segment Duration (ms)","Thấp hơn = tốt hơn"),
    ]
    available = [(m, l, h) for m, l, h in metrics
                 if m in h2.columns and m in h3.columns]

    fig, axes = plt.subplots(2, 3, figsize=(16, 9))
    fig.suptitle("So Sánh Chỉ Số Mạng  │  HTTP/2 vs HTTP/3 (QUIC)",
                 fontsize=15, fontweight="bold", color=TEXT_COLOR, y=1.01)
    axes = axes.flatten()

    for idx, (metric, label, hint) in enumerate(available[:6]):
        ax = axes[idx]
        vals = {
            "H2": h2[metric].dropna(),
            "H3": h3[metric].dropna(),
        }
        means = {k: v.mean() for k, v in vals.items()}
        x = np.arange(2)
        colors = [PALETTE["H2"], PALETTE["H3"]]
        bars = ax.bar(x, [means["H2"], means["H3"]], color=colors,
                      width=0.5, edgecolor=GRID_COLOR, linewidth=0.8)
        _add_value_labels(ax, bars)
        ax.set_xticks(x)
        ax.set_xticklabels(["HTTP/2", "HTTP/3"], fontsize=9)
        styled_ax(ax, f"{label}\n({hint})", ylabel=label)

        # Thêm nhỏ median dưới bar
        ax.text(0.5, -0.18,
                f"Median  H2={vals['H2'].median():.1f}  H3={vals['H3'].median():.1f}",
                transform=ax.transAxes, ha="center", fontsize=7, color="#9A9DBF")

    # Xoá subplot thừa nếu có
    for idx in range(len(available), 6):
        axes[idx].set_visible(False)

    fig.tight_layout()
    path = os.path.join(out_dir, "1_network_metrics.png")
    fig.savefig(path, dpi=150, bbox_inches="tight", facecolor=BG_COLOR)
    plt.close(fig)
    print(f"  ✔  Đã lưu: {path}")


#  === FIGURE 2: Chất lượng phát (Bitrate / Buffer / FPS / Dropped) ===
def fig_quality(h2: pd.DataFrame, h3: pd.DataFrame, out_dir: str):
    metrics = [
        ("Bitrate_kbps",      "Bitrate (kbps)",        "Cao hơn = tốt hơn"),
        ("Buffer_s",          "Buffer Length (s)",     "Cao hơn = ổn định hơn"),
        ("FPS",               "FPS",                   "Cao hơn = mượt hơn"),
        ("DroppedFrames",     "Dropped Frames",        "Thấp hơn = tốt hơn"),
        ("QualitySwitchCount","Quality Switches",      "Thấp hơn = ổn định hơn"),
        ("RebufferCount",     "Rebuffer Count",        "Thấp hơn = tốt hơn"),
    ]
    available = [(m, l, h) for m, l, h in metrics
                 if m in h2.columns and m in h3.columns]

    fig, axes = plt.subplots(2, 3, figsize=(16, 9))
    fig.suptitle("So Sánh Chất Lượng Phát Video  │  HTTP/2 vs HTTP/3 (QUIC)",
                 fontsize=15, fontweight="bold", color=TEXT_COLOR, y=1.01)
    axes = axes.flatten()

    for idx, (metric, label, hint) in enumerate(available[:6]):
        ax = axes[idx]
        vals = {
            "H2": h2[metric].dropna(),
            "H3": h3[metric].dropna(),
        }
        means = {k: v.mean() for k, v in vals.items()}
        x = np.arange(2)
        bars = ax.bar(x, [means["H2"], means["H3"]],
                      color=[PALETTE["H2"], PALETTE["H3"]],
                      width=0.5, edgecolor=GRID_COLOR, linewidth=0.8)
        _add_value_labels(ax, bars)
        ax.set_xticks(x)
        ax.set_xticklabels(["HTTP/2", "HTTP/3"], fontsize=9)
        styled_ax(ax, f"{label}\n({hint})", ylabel=label)

        ax.text(0.5, -0.18,
                f"Median  H2={vals['H2'].median():.1f}  H3={vals['H3'].median():.1f}",
                transform=ax.transAxes, ha="center", fontsize=7, color="#9A9DBF")

    for idx in range(len(available), 6):
        axes[idx].set_visible(False)

    fig.tight_layout()
    path = os.path.join(out_dir, "2_quality_metrics.png")
    fig.savefig(path, dpi=150, bbox_inches="tight", facecolor=BG_COLOR)
    plt.close(fig)
    print(f"  ✔  Đã lưu: {path}")


#  === FIGURE 3: Phân phối Latency & Buffer (violin/box) ===
def fig_distribution(h2: pd.DataFrame, h3: pd.DataFrame, out_dir: str):
    metrics = [
        ("Latency_ms",      "Latency (ms)"),
        ("Jitter_ms",       "Jitter (ms)"),
        ("Buffer_s",        "Buffer Length (s)"),
        ("Bitrate_kbps",    "Bitrate (kbps)"),
        ("DownloadSpeed_kbps", "Download Speed (kbps)"),
        ("RTT_ms",          "RTT (ms)"),
    ]
    available = [(m, l) for m, l in metrics
                 if m in h2.columns and m in h3.columns]

    fig, axes = plt.subplots(2, 3, figsize=(18, 10))
    fig.suptitle("Phân Phối Dữ Liệu  │  HTTP/2 vs HTTP/3 (QUIC)",
                 fontsize=15, fontweight="bold", color=TEXT_COLOR, y=1.01)
    axes = axes.flatten()

    combined = pd.concat([
        h2.assign(_label="HTTP/2"),
        h3.assign(_label="HTTP/3"),
    ], ignore_index=True)

    for idx, (metric, label) in enumerate(available[:6]):
        ax = axes[idx]
        data = combined[[metric, "_label"]].dropna()
        if data.empty:
            axes[idx].set_visible(False)
            continue
        sns.violinplot(
            data=data, x="_label", y=metric,
            palette={"HTTP/2": PALETTE["H2"], "HTTP/3": PALETTE["H3"]},
            inner="box", ax=ax, linewidth=0.8,
        )
        styled_ax(ax, label, ylabel=label)
        ax.set_xlabel("")

    for idx in range(len(available), 6):
        axes[idx].set_visible(False)

    fig.tight_layout()
    path = os.path.join(out_dir, "3_distribution.png")
    fig.savefig(path, dpi=150, bbox_inches="tight", facecolor=BG_COLOR)
    plt.close(fig)
    print(f"  ✔  Đã lưu: {path}")


#  === FIGURE 4: Timeline Latency & Buffer theo thứ tự log ===
def fig_timeline(h2: pd.DataFrame, h3: pd.DataFrame, out_dir: str):
    metrics = [
        ("Latency_ms",      "Latency (ms)"),
        ("Buffer_s",        "Buffer Length (s)"),
        ("Bitrate_kbps",    "Bitrate (kbps)"),
        ("DownloadSpeed_kbps", "Download Speed (kbps)"),
    ]
    available = [(m, l) for m, l in metrics
                 if m in h2.columns and m in h3.columns]

    fig, axes = plt.subplots(len(available), 1, figsize=(18, 4 * len(available)))
    fig.suptitle("Timeline Theo Thứ Tự Log  │  HTTP/2 vs HTTP/3 (QUIC)",
                 fontsize=15, fontweight="bold", color=TEXT_COLOR, y=1.01)

    if len(available) == 1:
        axes = [axes]

    for idx, (metric, label) in enumerate(available):
        ax = axes[idx]
        h2_vals = h2[metric].dropna().reset_index(drop=True)
        h3_vals = h3[metric].dropna().reset_index(drop=True)

        # Smooth với rolling mean
        win = max(1, min(10, len(h2_vals) // 10))
        h2_smooth = h2_vals.rolling(win, min_periods=1).mean()
        h3_smooth = h3_vals.rolling(win, min_periods=1).mean()

        ax.plot(h2_smooth.index, h2_smooth.values,
                color=PALETTE["H2"], lw=1.8, label="HTTP/2",
                alpha=0.9)
        ax.plot(h3_smooth.index, h3_smooth.values,
                color=PALETTE["H3"], lw=1.8, label="HTTP/3",
                alpha=0.9)
        ax.fill_between(h2_smooth.index, h2_smooth.values,
                        color=PALETTE["H2"], alpha=0.12)
        ax.fill_between(h3_smooth.index, h3_smooth.values,
                        color=PALETTE["H3"], alpha=0.12)

        styled_ax(ax, label, xlabel="Log index", ylabel=label)
        ax.legend(loc="upper right", fontsize=9)

    fig.tight_layout()
    path = os.path.join(out_dir, "4_timeline.png")
    fig.savefig(path, dpi=150, bbox_inches="tight", facecolor=BG_COLOR)
    plt.close(fig)
    print(f"  ✔  Đã lưu: {path}")


#  === FIGURE 5: Radar (spider) chart – tổng quan đa chiều ===
def fig_radar(h2: pd.DataFrame, h3: pd.DataFrame, out_dir: str):
    """
    Radar chart so sánh 6 chỉ số chuẩn hóa [0..1].
    Chiều "Cao hơn = tốt hơn" áp dụng cho tất cả trục sau khi invert
    những chỉ số mà "thấp hơn = tốt hơn".
    """
    # (tên_cột, nhãn, invert?)  – invert=True: giá trị thấp là tốt
    metrics = [
        ("DownloadSpeed_kbps", "Download\nSpeed",  False),
        ("Bitrate_kbps",       "Bitrate",          False),
        ("Buffer_s",           "Buffer",           False),
        ("FPS",                "FPS",              False),
        ("Latency_ms",         "Latency",          True),
        ("Jitter_ms",          "Jitter",           True),
    ]
    available = [(col, lab, inv) for col, lab, inv in metrics
                 if col in h2.columns and col in h3.columns]
    if len(available) < 3:
        print("  ⚠  Không đủ dữ liệu để vẽ radar chart.")
        return

    labels  = [lab for _, lab, _ in available]
    h2_vals = np.array([h2[col].mean() for col, _, _ in available])
    h3_vals = np.array([h3[col].mean() for col, _, _ in available])

    # Chuẩn hóa: mỗi trục trên nền max(h2, h3)
    combined_max = np.maximum(h2_vals, h3_vals)
    combined_max[combined_max == 0] = 1
    h2_norm = h2_vals / combined_max
    h3_norm = h3_vals / combined_max

    # Invert: 1 − norm cho trục "thấp hơn = tốt"
    for i, (_, _, inv) in enumerate(available):
        if inv:
            h2_norm[i] = 1 - h2_norm[i]
            h3_norm[i] = 1 - h3_norm[i]

    # Đóng vòng
    n   = len(labels)
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
    ax.set_yticklabels(["25%", "50%", "75%", "100%"], fontsize=7, color="#9A9DBF")
    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(labels, fontsize=10, color=TEXT_COLOR)
    ax.yaxis.grid(True, color=GRID_COLOR, linestyle="--", alpha=0.5)
    ax.xaxis.grid(True, color=GRID_COLOR, linestyle="--", alpha=0.5)
    ax.spines["polar"].set_color(GRID_COLOR)

    ax.set_title("Radar Chart – Hiệu Năng Tổng Quan\n(cạnh ngoài = tốt hơn)",
                 fontsize=13, fontweight="bold", color=TEXT_COLOR, pad=20)
    ax.legend(loc="upper right", bbox_to_anchor=(1.3, 1.15), fontsize=10)

    fig.tight_layout()
    path = os.path.join(out_dir, "5_radar.png")
    fig.savefig(path, dpi=150, bbox_inches="tight", facecolor=BG_COLOR)
    plt.close(fig)
    print(f"  ✔  Đã lưu: {path}")


#  === FIGURE 6: Bảng tổng hợp so sánh (hình ảnh) ===
def fig_summary_table(summary_df: pd.DataFrame, out_dir: str):
    """Render bảng tổng hợp dưới dạng hình ảnh."""
    # Chỉ lấy các cột cần hiển thị
    tbl = summary_df[["Metric", "H2 (mean)", "H3 (mean)", "Δ (H3−H2)", "Δ%"]].copy()
    tbl = tbl.dropna(subset=["H2 (mean)", "H3 (mean)"])

    n_rows = len(tbl)
    fig_h  = max(4, 0.45 * n_rows + 1.5)
    fig, ax = plt.subplots(figsize=(13, fig_h))
    fig.patch.set_facecolor(BG_COLOR)
    ax.set_facecolor(BG_COLOR)
    ax.axis("off")

    col_widths = [0.32, 0.17, 0.17, 0.17, 0.17]
    headers    = list(tbl.columns)

    table = ax.table(
        cellText=tbl.values,
        colLabels=headers,
        colWidths=col_widths,
        cellLoc="center",
        loc="center",
    )
    table.auto_set_font_size(False)
    table.set_fontsize(9)

    # Style header
    for col_idx in range(len(headers)):
        cell = table[0, col_idx]
        cell.set_facecolor("#2A2D3E")
        cell.set_text_props(color=TEXT_COLOR, fontweight="bold")
        cell.set_edgecolor(GRID_COLOR)

    # Style rows
    for row_idx in range(1, n_rows + 1):
        delta_pct_str = str(tbl.iloc[row_idx - 1]["Δ%"])
        for col_idx in range(len(headers)):
            cell = table[row_idx, col_idx]
            cell.set_facecolor(CARD_BG if row_idx % 2 == 0 else "#14172080")
            cell.set_text_props(color=TEXT_COLOR)
            cell.set_edgecolor(GRID_COLOR)
            # Tô màu cột Δ%
            if col_idx == 4:
                if "▲" in delta_pct_str:
                    cell.set_text_props(color="#F5A623")
                elif "▼" in delta_pct_str:
                    cell.set_text_props(color="#4C9BE8")

    ax.set_title("Bảng Tổng Hợp So Sánh H2 vs H3",
                 fontsize=13, fontweight="bold", color=TEXT_COLOR,
                 pad=10, loc="left")

    fig.tight_layout()
    path = os.path.join(out_dir, "6_summary_table.png")
    fig.savefig(path, dpi=150, bbox_inches="tight", facecolor=BG_COLOR)
    plt.close(fig)
    print(f"  ✔  Đã lưu: {path}")


#  === FIGURE 7: Level distribution (số dòng theo Level log) ===
def fig_level_dist(h2: pd.DataFrame, h3: pd.DataFrame, out_dir: str):
    if "Level" not in h2.columns or "Level" not in h3.columns:
        return

    levels = ["SYS", "NET", "INFO", "WARN", "ERRO"]
    h2_cnt = h2["Level"].value_counts().reindex(levels, fill_value=0)
    h3_cnt = h3["Level"].value_counts().reindex(levels, fill_value=0)

    x = np.arange(len(levels))
    w = 0.35

    fig, ax = plt.subplots(figsize=(10, 5))
    b1 = ax.bar(x - w/2, h2_cnt.values, width=w,
                color=PALETTE["H2"], label="HTTP/2", edgecolor=GRID_COLOR, lw=0.8)
    b2 = ax.bar(x + w/2, h3_cnt.values, width=w,
                color=PALETTE["H3"], label="HTTP/3", edgecolor=GRID_COLOR, lw=0.8)

    _add_value_labels(ax, b1, fmt="{:.0f}")
    _add_value_labels(ax, b2, fmt="{:.0f}")

    ax.set_xticks(x)
    ax.set_xticklabels(levels, fontsize=11)
    styled_ax(ax, "Phân Bố Level Log  │  HTTP/2 vs HTTP/3",
              xlabel="Log Level", ylabel="Số dòng log")
    ax.legend(fontsize=10)

    fig.tight_layout()
    path = os.path.join(out_dir, "7_level_distribution.png")
    fig.savefig(path, dpi=150, bbox_inches="tight", facecolor=BG_COLOR)
    plt.close(fig)
    print(f"  ✔  Đã lưu: {path}")


#  === FIGURE 8: Rebuffer & Quality Stability ===
def fig_stability(h2: pd.DataFrame, h3: pd.DataFrame, out_dir: str):
    metrics = [
        ("RebufferCount",     "Rebuffer Count",          "Thấp = tốt hơn"),
        ("RebufferDuration_ms","Rebuffer Duration (ms)",  "Thấp = tốt hơn"),
        ("QualitySwitchCount","Quality Switch Count",     "Thấp = ổn định hơn"),
        ("TotalDownloaded_MB","Total Downloaded (MB)",    "Cao = nhiều hơn"),
    ]
    available = [(m, l, h) for m, l, h in metrics
                 if m in h2.columns and m in h3.columns]
    if not available:
        return

    fig, axes = plt.subplots(1, len(available), figsize=(5 * len(available), 5))
    if len(available) == 1:
        axes = [axes]
    fig.suptitle("Độ Ổn Định Playback & Tổng Lượng Tải  │  HTTP/2 vs HTTP/3",
                 fontsize=13, fontweight="bold", color=TEXT_COLOR)

    for idx, (metric, label, hint) in enumerate(available):
        ax = axes[idx]
        h2_v = h2[metric].dropna()
        h3_v = h3[metric].dropna()
        means = [h2_v.mean(), h3_v.mean()]
        bars = ax.bar(["HTTP/2", "HTTP/3"], means,
                      color=[PALETTE["H2"], PALETTE["H3"]],
                      width=0.5, edgecolor=GRID_COLOR, lw=0.8)
        _add_value_labels(ax, bars, fmt="{:.2f}")
        styled_ax(ax, f"{label}\n({hint})", ylabel=label)

    fig.tight_layout()
    path = os.path.join(out_dir, "8_stability.png")
    fig.savefig(path, dpi=150, bbox_inches="tight", facecolor=BG_COLOR)
    plt.close(fig)
    print(f"  ✔  Đã lưu: {path}")


#  Mở thư mục output trên Windows / macOS / Linux
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


#  Lõi xử lý (dùng chung cho GUI và CLI)
def run_analysis(h2_path: str, h3_path: str, out_dir: str,
                 progress_cb=None):
    """
    progress_cb(step: int, total: int, msg: str) – callback cập nhật tiến trình.
    Nếu là None thì chỉ print ra console.
    """
    def _progress(step, total, msg):
        if progress_cb:
            progress_cb(step, total, msg)
        else:
            pct = int(step / total * 100)
            print(f"  [{pct:3d}%] {msg}")

    TOTAL = 12
    os.makedirs(out_dir, exist_ok=True)

    _progress(0, TOTAL, "Đọc file CSV …")
    h2 = load_csv(h2_path, "HTTP/2")
    h3 = load_csv(h3_path, "HTTP/3")

    _progress(1, TOTAL, "Thống kê tổng quan …")
    summary_df = print_summary(h2, h3)

    steps = [
        (fig_network,       "Vẽ: Chỉ số mạng"),
        (fig_quality,       "Vẽ: Chất lượng phát"),
        (fig_distribution,  "Vẽ: Phân phối violin"),
        (fig_timeline,      "Vẽ: Timeline"),
        (fig_radar,         "Vẽ: Radar chart"),
        (fig_level_dist,    "Vẽ: Phân bố Level log"),
        (fig_stability,     "Vẽ: Stability & Downloaded"),
    ]
    for i, (fn, msg) in enumerate(steps, start=2):
        _progress(i, TOTAL, msg)
        fn(h2, h3, out_dir)

    _progress(9, TOTAL, "Vẽ: Bảng tổng hợp")
    fig_summary_table(summary_df, out_dir)

    _progress(TOTAL, TOTAL, "Hoàn thành!")
    return os.path.abspath(out_dir)


#  === FIGURE 9: Categorical columns – Protocol / ConnectionType / Resolution / Codec ===
def fig_categorical(h2, h3, out_dir):
    """Ve pie/bar cho cac cot text: Protocol, ConnectionType, Resolution, Codec, ActiveScenario, IsAutoQuality."""
    import math

    cats = [
        ("Protocol",          "Giao Thuc Mang"),
        ("ConnectionType",    "Loai Ket Noi"),
        ("Resolution",        "Do Phan Giai"),
        ("Codec",             "Codec"),
        ("ActiveScenario",    "Network Scenario"),
        ("IsAutoQuality",     "Auto Quality (ABR)"),
    ]
    available = [(col, lbl) for col, lbl in cats
                 if col in h2.columns and col in h3.columns]
    if not available:
        return

    n = len(available)
    ncols = 3
    nrows = math.ceil(n / ncols)
    fig, axes = plt.subplots(nrows, ncols * 2,
                             figsize=(ncols * 9, nrows * 4))
    fig.suptitle('Phan Tich Cac Cot Phan Loai  -  HTTP/2 vs HTTP/3',
                 fontsize=14, fontweight='bold', color=TEXT_COLOR)
    axes = axes.flatten()

    for idx, (col, lbl) in enumerate(available):
        ax_h2 = axes[idx * 2]
        ax_h3 = axes[idx * 2 + 1]

        h2_cnt = h2[col].value_counts().nlargest(6)
        h3_cnt = h3[col].value_counts().nlargest(6)

        for ax, cnt, proto, color in [
            (ax_h2, h2_cnt, 'HTTP/2', PALETTE['H2']),
            (ax_h3, h3_cnt, 'HTTP/3', PALETTE['H3']),
        ]:
            if cnt.empty:
                ax.set_visible(False)
                continue
            colors = [color] + ['#2A2D3E'] * (len(cnt) - 1)
            bars = ax.barh(cnt.index.astype(str), cnt.values,
                           color=colors, edgecolor=GRID_COLOR, lw=0.6)
            for bar in bars:
                w = bar.get_width()
                ax.text(w + w * 0.02, bar.get_y() + bar.get_height() / 2,
                        f'{int(w)}', va='center', fontsize=7.5, color=TEXT_COLOR)
            ax.set_title(f'{lbl}  [{proto}]', fontsize=9, fontweight='bold',
                         color=TEXT_COLOR)
            ax.set_xlabel('So dong log', fontsize=8)
            ax.yaxis.grid(False)
            ax.xaxis.grid(True)
            ax.set_axisbelow(True)
            for sp in ax.spines.values():
                sp.set_color(GRID_COLOR)

    # An subplot thua
    for idx in range(len(available) * 2, len(axes)):
        axes[idx].set_visible(False)

    fig.tight_layout()
    path = os.path.join(out_dir, '9_categorical.png')
    fig.savefig(path, dpi=150, bbox_inches='tight', facecolor=BG_COLOR)
    plt.close(fig)
    print(f'  OK  Da luu: {path}')


#  === FIGURE 10: QualityIndex & EstimatedBandwidth ===
def fig_quality_index(h2, h3, out_dir):
    metrics = [
        ('QualityIndex',           'Quality Index (0=thap nhat)',  'Cao hon = chat luong cao hon'),
        ('QualityCount',           'So Luong Quality Levels',      'Thong tin bang'),
        ('CurrentTime_s',          'Current Playback Time (s)',     'Vi tri phat'),
        ('EstimatedBandwidth_Mbps','Est. Bandwidth (Mbps)',        'Cao hon = mang tot hon'),
        ('SegmentSize_KB',         'Segment Size (KB)',            'Thong tin segment'),
        ('Duration_s',             'Media Duration (s)',           'Thong tin media'),
    ]
    available = [(m, l, h) for m, l, h in metrics
                 if m in h2.columns and m in h3.columns]
    if not available:
        return

    fig, axes = plt.subplots(2, 3, figsize=(16, 8))
    fig.suptitle('Cac Chi So Bo Sung  -  HTTP/2 vs HTTP/3',
                 fontsize=14, fontweight='bold', color=TEXT_COLOR)
    axes = axes.flatten()

    for idx, (metric, label, hint) in enumerate(available[:6]):
        ax = axes[idx]
        h2_v = h2[metric].dropna()
        h3_v = h3[metric].dropna()
        h2_m  = h2_v.mean()
        h3_m  = h3_v.mean()
        bars = ax.bar(['HTTP/2', 'HTTP/3'], [h2_m, h3_m],
                      color=[PALETTE['H2'], PALETTE['H3']],
                      width=0.5, edgecolor=GRID_COLOR, lw=0.8)
        for bar in bars:
            h = bar.get_height()
            if not np.isnan(h):
                ax.annotate(f'{h:.2f}',
                            xy=(bar.get_x() + bar.get_width() / 2, h),
                            xytext=(0, 5), textcoords='offset points',
                            ha='center', va='bottom', fontsize=8, color=TEXT_COLOR)
        ax.set_title(f'{label}\n({hint})', fontsize=10, fontweight='bold',
                     color=TEXT_COLOR, pad=6)
        ax.set_ylabel(label, fontsize=9)
        ax.yaxis.grid(True)
        ax.set_axisbelow(True)
        for sp in ax.spines.values():
            sp.set_color(GRID_COLOR)
        ax.text(0.5, -0.18,
                f'Median H2={h2_v.median():.2f}  H3={h3_v.median():.2f}',
                transform=ax.transAxes, ha='center', fontsize=7, color='#9A9DBF')

    for idx in range(len(available), 6):
        axes[idx].set_visible(False)

    fig.tight_layout()
    path = os.path.join(out_dir, '10_extra_metrics.png')
    fig.savefig(path, dpi=150, bbox_inches='tight', facecolor=BG_COLOR)
    plt.close(fig)
    print(f'  OK  Da luu: {path}')


#  GUI - hop thoai chon file + progress bar (thread-safe via Queue)
def gui_mode():
    import queue, threading

    root = tk.Tk()
    root.withdraw()
    root.title('ADTube Log Analyzer')

    # Buoc 1: chon H2
    messagebox.showinfo('ADTube - Buoc 1/2', 'Chon file CSV log HTTP/2')
    h2_path = filedialog.askopenfilename(
        title='Chon file CSV - HTTP/2',
        filetypes=[('CSV files', '*.csv'), ('All files', '*.*')],
    )
    if not h2_path:
        messagebox.showwarning('Huy', 'Ban chua chon file H2. Thoat.')
        root.destroy()
        return

    # Buoc 2: chon H3
    messagebox.showinfo('ADTube - Buoc 2/2', 'Chon file CSV log HTTP/3 (QUIC)')
    h3_path = filedialog.askopenfilename(
        title='Chon file CSV - HTTP/3 (QUIC)',
        filetypes=[('CSV files', '*.csv'), ('All files', '*.*')],
    )
    if not h3_path:
        messagebox.showwarning('Huy', 'Ban chua chon file H3. Thoat.')
        root.destroy()
        return

    # Thu muc output (tu dong tao ben canh file H2)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    default_out = os.path.join(os.path.dirname(h2_path), f'log_analysis_{timestamp}')
    out_dir = filedialog.askdirectory(
        title='Chon thu muc luu bieu do (Cancel = tu dong tao)',
        initialdir=os.path.dirname(h2_path),
    ) or default_out

    # Cua so progress
    prog_win = tk.Toplevel(root)
    prog_win.title('Dang phan tich...')
    prog_win.resizable(False, False)
    prog_win.geometry('480x160')
    prog_win.configure(bg='#0F1117')
    prog_win.protocol('WM_DELETE_WINDOW', lambda: None)  # lock X button

    tk.Label(prog_win, text='ADTube Log Analyzer',
             font=('Segoe UI', 12, 'bold'),
             bg='#0F1117', fg='#E8EAF0').pack(pady=(18, 4))

    status_var = tk.StringVar(value='Dang chuan bi...')
    tk.Label(prog_win, textvariable=status_var,
             font=('Segoe UI', 9), bg='#0F1117', fg='#9A9DBF').pack()

    style = ttk.Style(prog_win)
    style.theme_use('default')
    style.configure('Custom.Horizontal.TProgressbar',
                    troughcolor='#1A1D27', background='#F5A623', thickness=12)
    pbar = ttk.Progressbar(prog_win, orient='horizontal', length=400,
                            mode='determinate',
                            style='Custom.Horizontal.TProgressbar')
    pbar.pack(pady=14)
    pct_var = tk.StringVar(value='0%')
    tk.Label(prog_win, textvariable=pct_var,
             font=('Segoe UI', 8), bg='#0F1117', fg='#E8EAF0').pack()

    print(f'H2: {h2_path}')
    print(f'H3: {h3_path}')
    print(f'OUT: {out_dir}')

    # Queue: worker chi put vao queue, KHONG goi tkinter tu phai thread phu
    msg_queue = queue.Queue()

    def progress_cb(step, total, msg):
        pct = int(step / total * 100)
        msg_queue.put(('progress', pct, msg))

    def do_work():
        try:
            result = run_analysis(h2_path, h3_path, out_dir, progress_cb=progress_cb)
            msg_queue.put(('done', result, None))
        except Exception as exc:
            msg_queue.put(('done', None, exc))
        # KHONG goi bat ky ham tkinter nao tu day

    def poll():
        """Chay tren main thread, drain queue moi 80ms."""
        try:
            while True:
                item = msg_queue.get_nowait()
                if item[0] == 'progress':
                    _, pct, txt = item
                    pbar['value'] = pct
                    pct_var.set(f'{pct}%')
                    status_var.set(txt)
                elif item[0] == 'done':
                    _, result, err = item
                    prog_win.destroy()
                    if err:
                        messagebox.showerror('Loi', str(err))
                    else:
                        ans = messagebox.askyesno(
                            'Hoan thanh!',
                            'Da ve xong 10 bieu do.\n\nMo thu muc ngay?',
                        )
                        if ans:
                            open_folder(result)
                    root.destroy()
                    return  # dung poll
        except queue.Empty:
            pass
        root.after(80, poll)  # lap lai sau 80ms

    threading.Thread(target=do_work, daemon=True).start()
    root.after(80, poll)   # bat dau poll
    root.mainloop()        # event loop tren main thread

#  CLI mode
def cli_mode():
    parser = argparse.ArgumentParser(
        description="Phân tích & so sánh log CSV HTTP/2 vs HTTP/3 (QUIC)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""
            Ví dụ:
              python analyze_logs.py h2.csv h3.csv
              python analyze_logs.py h2.csv h3.csv --out ./charts
            Chạy không có tham số → mở hộp thoại chọn file (GUI mode).
        """),
    )
    parser.add_argument("h2_csv", help="File CSV log HTTP/2")
    parser.add_argument("h3_csv", help="File CSV log HTTP/3")
    parser.add_argument("--out", default="./log_analysis",
                        help="Thư mục lưu biểu đồ (mặc định: ./log_analysis)")
    parser.add_argument("--open", action="store_true",
                        help="Tự mở thư mục output sau khi vẽ xong")
    args = parser.parse_args()

    print(f"\n{'─'*60}")
    print("Log Analyzer  │  H2 vs H3 (QUIC)")
    print(f"{'─'*60}")
    print(f"  H2  ← {args.h2_csv}")
    print(f"  H3  ← {args.h3_csv}")
    print(f"  OUT → {os.path.abspath(args.out)}")
    print(f"{'─'*60}\n")

    out = run_analysis(args.h2_csv, args.h3_csv, args.out)
    print(f"\nHoàn thành! Biểu đồ đã lưu vào: {out}\n")

    if args.open:
        open_folder(out)


#  Entry point – tự động chọn GUI hay CLI
if __name__ == "__main__":
    # Nếu không có argument → GUI mode
    if len(sys.argv) == 1:
        gui_mode()
    else:
        cli_mode()
