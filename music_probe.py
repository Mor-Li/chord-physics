"""
验证"和弦好听/难听"的物理本质 —— Plomp-Levelt 不协和度模型。

核心思路（来自 conversation.md 里的推导）：
  1. 每个钢琴键发出基音 + 一串整数倍泛音（谐波列）。
  2. 两个频率接近的泛音叠加会产生"拍音"，耳朵觉得粗糙。
  3. 粗糙度的大小取决于频率差落在"临界频带"里的位置。
  4. 一个和弦的"不协和度" = 所有泛音对的粗糙度之和。
  5. 暴力遍历所有三音组合，排序 -> 最协和的应当是大三 / 小三和弦。

参考：Plomp & Levelt (1965), Sethares (1993) dissonance curve.
"""

from __future__ import annotations

import argparse
import itertools
import math
import os
import sys
from dataclasses import dataclass
from typing import Iterable

import numpy as np


# --------- 1. 音高 <-> 频率 映射 ---------

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
A4_MIDI = 69
A4_FREQ = 440.0


def midi_to_freq(midi: int) -> float:
    return A4_FREQ * 2.0 ** ((midi - A4_MIDI) / 12.0)


def midi_to_name(midi: int) -> str:
    octave = midi // 12 - 1
    return f"{NOTE_NAMES[midi % 12]}{octave}"


# --------- 2. 谐波列（泛音）生成 ---------

@dataclass
class Partial:
    freq: float      # Hz
    amp: float       # 相对振幅 0~1


def harmonic_series(
    f0: float,
    n_partials: int = 6,
    rolloff: float = 0.88,
) -> list[Partial]:
    """给一个基频，生成前 n 个整数倍泛音，振幅按 rolloff**k 衰减。

    真实钢琴的谐波衰减大致是几何级数，rolloff=0.88 是经验值（近似钢琴音色）。
    """
    return [Partial(freq=f0 * k, amp=rolloff ** (k - 1)) for k in range(1, n_partials + 1)]


# --------- 3. Plomp-Levelt 不协和度 ---------

# Sethares 1993 拟合出的参数
_A = -3.5
_B = -5.75
_DSTAR = 0.24
_S1 = 0.0207
_S2 = 18.96


def dissonance_pair(f1: float, f2: float, v1: float, v2: float) -> float:
    """两个正弦分量的粗糙度。

    关键是"临界频带宽度"随频率非线性缩放：低频区分辨率高，
    高频区分辨率差。这正是对话里墨哥抓到的那个漏洞的数学模型。
    """
    if f1 == f2:
        return 0.0
    fmin, fmax = (f1, f2) if f1 < f2 else (f2, f1)
    s = _DSTAR / (_S1 * fmin + _S2)
    x = s * (fmax - fmin)
    return min(v1, v2) * (math.exp(_A * x) - math.exp(_B * x))


def chord_dissonance(
    midis: Iterable[int],
    n_partials: int = 6,
    rolloff: float = 0.88,
) -> float:
    """和弦总不协和度 = 所有跨音符的泛音对粗糙度之和。

    注意：只算不同基音之间的泛音对；同一基音内部的泛音对是音色的固有属性，
    在所有和弦里都是常数，不影响排序。
    """
    partials_per_note = [
        harmonic_series(midi_to_freq(m), n_partials, rolloff) for m in midis
    ]
    total = 0.0
    for ps_a, ps_b in itertools.combinations(partials_per_note, 2):
        for pa in ps_a:
            for pb in ps_b:
                total += dissonance_pair(pa.freq, pb.freq, pa.amp, pb.amp)
    return total


# --------- 3b. Tenney Harmonic Distance（认知复杂度，纯数学派） ---------
#
# 与 Plomp-Levelt 互补的另一派观点：人耳觉得好听，不止是"物理上不打架"（粗糙度低），
# 还要"数学上结构简单"——大脑喜欢把频率比自动吸附到最简整数比（3:2, 4:3...）。
# Tenney 1964 年给出的公式：HD(a/b) = log2(a*b)，越小越简单。
# 这是个纯数学量，不依赖任何实验拟合参数。

# 十二平均律下每个音程的理想纯律整数比（归到 1 个八度内）
JUST_RATIOS: list[tuple[int, int]] = [
    (1, 1),     # 0 unison
    (16, 15),   # 1 minor 2nd
    (9, 8),     # 2 major 2nd
    (6, 5),     # 3 minor 3rd
    (5, 4),     # 4 major 3rd
    (4, 3),     # 5 perfect 4th
    (45, 32),   # 6 tritone
    (3, 2),     # 7 perfect 5th
    (8, 5),     # 8 minor 6th
    (5, 3),     # 9 major 6th
    (16, 9),    # 10 minor 7th
    (15, 8),    # 11 major 7th
]


def tenney_hd(midi1: int, midi2: int) -> float:
    """两个音的 Tenney Harmonic Distance：log2(a*b)，a/b 是最简整数比。"""
    n = abs(midi2 - midi1)
    if n == 0:
        return 0.0
    octaves, rem = divmod(n, 12)
    a, b = JUST_RATIOS[rem]
    # 每跨一个八度，大数 × 2
    a *= 2 ** octaves
    g = math.gcd(a, b)
    return math.log2((a // g) * (b // g))


def chord_tenney(midis: Iterable[int]) -> float:
    """和弦的 Tenney HD = 所有两两音对的 HD 求和。"""
    midis = list(midis)
    return sum(tenney_hd(a, b) for a, b in itertools.combinations(midis, 2))


def joint_score(
    midis: Iterable[int],
    alpha: float = 0.5,
    beta: float = 0.5,
    pl_scale: float = 1.0,
    hd_scale: float = 1.0 / 10.0,
) -> float:
    """联合损失 = α·粗糙度 + β·认知复杂度（归一化后叠加）。

    Plomp-Levelt 分数范围大约 [0, 2]，Tenney HD 大约 [0, 25]，
    默认 hd_scale=1/10 把两者拉到同量级，然后 α+β 加权。
    """
    midis = list(midis)
    pl = chord_dissonance(midis) * pl_scale
    hd = chord_tenney(midis) * hd_scale
    return alpha * pl + beta * hd


# --------- 4. 和弦识别 ---------

# 三音和弦模板：根音记 0，其余记半音间隔
_CHORD_TEMPLATES: dict[tuple[int, ...], str] = {
    (0, 4, 7): "Major (大三)",
    (0, 3, 7): "Minor (小三)",
    (0, 3, 6): "Diminished (减)",
    (0, 4, 8): "Augmented (增)",
    (0, 5, 7): "Sus4 (挂四)",
    (0, 2, 7): "Sus2 (挂二)",
    (0, 4, 10): "Dom7-no5 (属七缺五)",
    (0, 3, 10): "Min7-no5",
    (0, 2, 4): "Cluster-whole (全音簇)",
    (0, 1, 2): "Cluster-semi (半音簇)",
    (0, 1, 3): "Cluster",
    (0, 2, 5): "Cluster",
    (0, 5, 10): "Quartal (四度叠置)",
}


def identify_chord(midis: tuple[int, int, int]) -> str:
    """识别三和弦（考虑所有转位）。"""
    sorted_m = sorted(midis)
    pcs = sorted({m % 12 for m in sorted_m})
    if len(pcs) < 3:
        return "(含重复音)"
    for rotation in range(len(pcs)):
        root = pcs[rotation]
        intervals = tuple(sorted((p - root) % 12 for p in pcs))
        if intervals in _CHORD_TEMPLATES:
            root_name = NOTE_NAMES[root]
            return f"{root_name} {_CHORD_TEMPLATES[intervals]}"
    intervals = tuple(sorted((p - pcs[0]) % 12 for p in pcs))
    return f"{NOTE_NAMES[pcs[0]]} {intervals}"


# --------- 5. 遍历所有三音组合 ---------

def enumerate_triads(
    midi_low: int = 60,   # C4
    midi_high: int = 83,  # B5
    n_partials: int = 6,
    distinct_pc: bool = True,
) -> list[tuple[float, tuple[int, int, int]]]:
    """distinct_pc=True 时过滤掉音名重复的组合（比如 E4-E5-B5 其实只有两个音名）。"""
    triads = list(itertools.combinations(range(midi_low, midi_high + 1), 3))
    if distinct_pc:
        triads = [t for t in triads if len({m % 12 for m in t}) == 3]
    results = []
    for triad in triads:
        d = chord_dissonance(triad, n_partials=n_partials)
        results.append((d, triad))
    results.sort(key=lambda x: x[0])
    return results


def print_ranking(
    results: list[tuple[float, tuple[int, int, int]]],
    top_k: int = 15,
) -> None:
    print("\n" + "=" * 72)
    print(f"TOP {top_k} 最协和（不协和度分数最低）")
    print("=" * 72)
    print(f"{'Rank':<6}{'Score':<12}{'Notes':<24}{'Chord':<30}")
    print("-" * 72)
    for i, (score, triad) in enumerate(results[:top_k], 1):
        names = "-".join(midi_to_name(m) for m in triad)
        print(f"{i:<6}{score:<12.4f}{names:<24}{identify_chord(triad):<30}")

    print("\n" + "=" * 72)
    print(f"BOTTOM {top_k} 最难听（不协和度分数最高）")
    print("=" * 72)
    print(f"{'Rank':<6}{'Score':<12}{'Notes':<24}{'Chord':<30}")
    print("-" * 72)
    for i, (score, triad) in enumerate(results[-top_k:][::-1], 1):
        names = "-".join(midi_to_name(m) for m in triad)
        print(f"{i:<6}{score:<12.4f}{names:<24}{identify_chord(triad):<30}")


# --------- 6. 画图 ---------

def _setup_chinese_font() -> None:
    """在 macOS 上找一个能渲染中文的字体。"""
    import matplotlib.font_manager as fm
    from matplotlib import rcParams
    preferred_files = [
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/System/Library/Fonts/Supplemental/Songti.ttc",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    ]
    for path in preferred_files:
        if os.path.exists(path):
            fm.fontManager.addfont(path)
            prop = fm.FontProperties(fname=path)
            rcParams["font.sans-serif"] = [prop.get_name()]
            rcParams["font.family"] = "sans-serif"
            break
    rcParams["axes.unicode_minus"] = False


def plot_plomp_levelt_curve(
    f1: float = 440.0,
    n_partials_per_note: int = 6,
    save_path: str | None = None,
) -> None:
    """画两张图：
    (A) 单纯两个正弦的粗糙度随频率差的变化 —— 经典 Plomp-Levelt 曲线。
    (B) 两个带谐波的音（模拟钢琴键）之间，不协和度随音程的变化 —— 能看到 2:1, 3:2, 4:3 等纯音程位置的"谷".
    """
    import matplotlib.pyplot as plt
    _setup_chinese_font()

    fig, axes = plt.subplots(1, 2, figsize=(14, 5))

    # (A) 纯两正弦
    df_range = np.linspace(0.1, 300, 600)
    d_pair = [dissonance_pair(f1, f1 + df, 1.0, 1.0) for df in df_range]
    axes[0].plot(df_range, d_pair, lw=2, color="#c03030")
    peak_idx = int(np.argmax(d_pair))
    axes[0].axvline(df_range[peak_idx], ls="--", color="gray", alpha=0.6)
    axes[0].annotate(
        f"Peak ≈ {df_range[peak_idx]:.1f} Hz",
        xy=(df_range[peak_idx], d_pair[peak_idx]),
        xytext=(df_range[peak_idx] + 40, d_pair[peak_idx] * 0.8),
        fontsize=10,
        arrowprops=dict(arrowstyle="->", color="gray"),
    )
    axes[0].set_title(f"(A) 两纯音粗糙度 vs 频率差 (基准 {f1:.0f} Hz)")
    axes[0].set_xlabel("频率差 Δf (Hz)")
    axes[0].set_ylabel("粗糙度")
    axes[0].grid(alpha=0.3)

    # (B) 两个带谐波的音，扫描半音音程
    base_midi = 69  # A4
    semitone_range = np.linspace(0, 14, 600)
    d_interval = []
    for s in semitone_range:
        f2 = f1 * 2 ** (s / 12)
        partials_a = harmonic_series(f1, n_partials_per_note)
        partials_b = harmonic_series(f2, n_partials_per_note)
        d = 0.0
        for pa in partials_a:
            for pb in partials_b:
                d += dissonance_pair(pa.freq, pb.freq, pa.amp, pb.amp)
        d_interval.append(d)
    d_interval = np.array(d_interval)
    axes[1].plot(semitone_range, d_interval, lw=2, color="#2050a0")
    # 标注几个经典音程位置
    key_intervals = {
        0: "1P",
        3: "m3",
        4: "M3",
        5: "P4",
        7: "P5",
        8: "m6",
        9: "M6",
        12: "P8",
    }
    for s, label in key_intervals.items():
        f2 = f1 * 2 ** (s / 12)
        partials_a = harmonic_series(f1, n_partials_per_note)
        partials_b = harmonic_series(f2, n_partials_per_note)
        d = sum(
            dissonance_pair(pa.freq, pb.freq, pa.amp, pb.amp)
            for pa in partials_a for pb in partials_b
        )
        axes[1].scatter([s], [d], color="#c03030", zorder=5, s=40)
        axes[1].annotate(label, xy=(s, d), xytext=(s, d + 0.05),
                         fontsize=9, ha="center")
    axes[1].set_title(f"(B) 带谐波的两音不协和度 vs 半音间隔")
    axes[1].set_xlabel("半音数")
    axes[1].set_ylabel("不协和度")
    axes[1].grid(alpha=0.3)

    plt.tight_layout()
    if save_path:
        plt.savefig(save_path, dpi=140)
        print(f"已保存 {save_path}")
    plt.show()


def plot_triad_scatter(
    results: list[tuple[float, tuple[int, int, int]]],
    top_k: int = 10,
    save_path: str | None = None,
) -> None:
    import matplotlib.pyplot as plt
    _setup_chinese_font()

    scores = np.array([r[0] for r in results])
    ranks = np.arange(1, len(scores) + 1)

    fig, ax = plt.subplots(figsize=(12, 6))
    ax.scatter(ranks, scores, s=8, alpha=0.4, color="#888")

    # 标 Top K
    for i, (score, triad) in enumerate(results[:top_k]):
        ax.scatter(i + 1, score, color="#2a9d8f", s=40, zorder=5)
        ax.annotate(
            "-".join(midi_to_name(m) for m in triad),
            xy=(i + 1, score),
            xytext=(i + 1, score - 0.3),
            fontsize=7, ha="center", color="#2a9d8f", rotation=25,
        )
    # 标 Bottom K
    for i, (score, triad) in enumerate(results[-top_k:]):
        rank = len(results) - top_k + i + 1
        ax.scatter(rank, score, color="#e76f51", s=40, zorder=5)
        ax.annotate(
            "-".join(midi_to_name(m) for m in triad),
            xy=(rank, score),
            xytext=(rank, score + 0.1),
            fontsize=7, ha="center", color="#e76f51", rotation=25,
        )

    ax.set_title(f"C4-B5 内所有三音组合的不协和度分布（共 {len(results)} 组）")
    ax.set_xlabel("排名（协和 → 不协和）")
    ax.set_ylabel("不协和度分数")
    ax.grid(alpha=0.3)
    plt.tight_layout()
    if save_path:
        plt.savefig(save_path, dpi=140)
        print(f"已保存 {save_path}")
    plt.show()


# --------- 7. 音频合成 + 播放 ---------

SAMPLE_RATE = 44100


def synth_note(
    midi: int,
    duration: float = 1.5,
    n_partials: int = 6,
    rolloff: float = 0.88,
    sr: int = SAMPLE_RATE,
) -> np.ndarray:
    """合成一个带谐波列和指数衰减包络的单音（近似钢琴音色）。"""
    f0 = midi_to_freq(midi)
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    wave = np.zeros_like(t)
    for k in range(1, n_partials + 1):
        wave += (rolloff ** (k - 1)) * np.sin(2 * np.pi * f0 * k * t)
    # ADSR 简化：快速 attack + 指数 decay
    env = np.exp(-2.0 * t)
    attack_samples = int(0.01 * sr)
    env[:attack_samples] *= np.linspace(0, 1, attack_samples)
    return wave * env


def synth_chord(
    midis: Iterable[int],
    duration: float = 1.8,
    n_partials: int = 6,
) -> np.ndarray:
    midis = list(midis)
    mix = sum(synth_note(m, duration, n_partials) for m in midis)
    peak = np.max(np.abs(mix))
    if peak > 0:
        mix = mix / peak * 0.85
    return mix.astype(np.float32)


def play_chord(midis: Iterable[int], duration: float = 1.8) -> None:
    """优先 sounddevice，失败则生成 wav 用 afplay。"""
    midis = list(midis)
    wave = synth_chord(midis, duration)
    name = "-".join(midi_to_name(m) for m in midis)
    print(f"  ▶ 播放 {name} ({identify_chord(tuple(midis))})")
    try:
        import sounddevice as sd
        sd.play(wave, SAMPLE_RATE, blocking=True)
    except Exception as e:
        print(f"    sounddevice 失败 ({e})，改用 afplay")
        from scipy.io import wavfile
        wav_path = "/tmp/_chord.wav"
        wavfile.write(wav_path, SAMPLE_RATE, (wave * 32767).astype(np.int16))
        os.system(f"afplay {wav_path}")


def play_ranking(
    results: list[tuple[float, tuple[int, int, int]]],
    top_k: int = 5,
    duration: float = 1.5,
    gap: float = 0.3,
) -> None:
    import time
    print(f"\n>>> 先听 Top {top_k} 最协和：")
    for score, triad in results[:top_k]:
        play_chord(triad, duration)
        time.sleep(gap)
    print(f"\n>>> 再听 Bottom {top_k} 最难听：")
    for score, triad in results[-top_k:][::-1]:
        play_chord(triad, duration)
        time.sleep(gap)


def save_ranking_audio(
    results: list[tuple[float, tuple[int, int, int]]],
    out_dir: str,
    top_k: int = 5,
    duration: float = 1.8,
) -> None:
    """把 Top K / Bottom K 和弦各自导出为 wav，再把它们串成一个总览 wav。"""
    from scipy.io import wavfile
    os.makedirs(out_dir, exist_ok=True)
    gap = np.zeros(int(SAMPLE_RATE * 0.25), dtype=np.float32)
    timeline: list[np.ndarray] = []

    def _write(triad: tuple[int, int, int], tag: str, rank: int, score: float) -> None:
        wave = synth_chord(triad, duration)
        name = "-".join(midi_to_name(m) for m in triad)
        fname = f"{tag}_{rank:02d}_{name}.wav"
        path = os.path.join(out_dir, fname)
        wavfile.write(path, SAMPLE_RATE, (wave * 32767).astype(np.int16))
        print(f"  -> {fname}  score={score:.4f}  {identify_chord(triad)}")
        timeline.append(wave)
        timeline.append(gap)

    print(f"\n>>> 导出 Top {top_k} 最协和的和弦：")
    for i, (score, triad) in enumerate(results[:top_k], 1):
        _write(triad, "top", i, score)

    print(f"\n>>> 导出 Bottom {top_k} 最难听的和弦：")
    for i, (score, triad) in enumerate(results[-top_k:][::-1], 1):
        _write(triad, "bot", i, score)

    timeline_wave = np.concatenate(timeline)
    timeline_path = os.path.join(out_dir, "_timeline_top_then_bottom.wav")
    wavfile.write(timeline_path, SAMPLE_RATE, (timeline_wave * 32767).astype(np.int16))
    print(f"\n合集: {timeline_path}  (前半段协和，后半段刺耳，感受对比)")


# --------- 8. CLI ---------

def main() -> None:
    parser = argparse.ArgumentParser(description="Plomp-Levelt 和弦协和度探针")
    parser.add_argument("--low", type=int, default=60, help="最低 MIDI 号 (默认 60=C4)")
    parser.add_argument("--high", type=int, default=83, help="最高 MIDI 号 (默认 83=B5)")
    parser.add_argument("--partials", type=int, default=6, help="每个音的泛音数")
    parser.add_argument("--topk", type=int, default=15, help="打印 Top/Bottom K")
    parser.add_argument("--play", action="store_true", help="播放 Top/Bottom K 和弦")
    parser.add_argument("--play-k", type=int, default=5, help="播放多少个")
    parser.add_argument("--save-audio", action="store_true",
                        help="把 Top/Bottom K 和弦保存为 wav 文件")
    parser.add_argument("--include-duplicates", action="store_true",
                        help="保留含重复音名的组合（默认过滤）")
    parser.add_argument("--plot", action="store_true", help="画不协和度曲线")
    parser.add_argument("--plot-scatter", action="store_true", help="画三音组合散点图")
    parser.add_argument("--save-dir", type=str, default=None, help="保存图像到目录")
    args = parser.parse_args()

    print(f"遍历 MIDI [{args.low}, {args.high}] = "
          f"{midi_to_name(args.low)} 到 {midi_to_name(args.high)}，"
          f"泛音数 = {args.partials}")
    results = enumerate_triads(
        args.low, args.high, args.partials,
        distinct_pc=not args.include_duplicates,
    )
    print(f"共 {len(results)} 个三音组合")
    print_ranking(results, top_k=args.topk)

    if args.plot:
        path = os.path.join(args.save_dir, "plomp_levelt.png") if args.save_dir else None
        if args.save_dir:
            os.makedirs(args.save_dir, exist_ok=True)
        plot_plomp_levelt_curve(save_path=path)

    if args.plot_scatter:
        path = os.path.join(args.save_dir, "triads.png") if args.save_dir else None
        if args.save_dir:
            os.makedirs(args.save_dir, exist_ok=True)
        plot_triad_scatter(results, top_k=args.topk, save_path=path)

    if args.save_audio:
        audio_dir = os.path.join(args.save_dir or "output", "audio")
        save_ranking_audio(results, audio_dir, top_k=args.play_k)

    if args.play:
        play_ranking(results, top_k=args.play_k)


if __name__ == "__main__":
    main()
