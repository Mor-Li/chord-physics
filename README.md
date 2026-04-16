# Understanding Music

> 用第一性原理和代码，把"和弦为什么好听"扒到底。

这个项目的起点是一个简单的问题：**弹钢琴的时候，为什么有些键叠起来好听、有些难听？**

一路追问下来，涉及到了谐波列、傅里叶分解、和差化积、临界频带、Plomp-Levelt 不协和度曲线、Tenney Harmonic Distance，最后搞出来一个能拖着玩的浏览器小工具，和一个能暴力扫 1760 种三音组合的 Python 脚本。

## 这里有什么

### 1. 交互式网页 `web/`

一个零依赖（只引了 KaTeX 渲染公式）的单页 App：

- **钢琴键盘**（C4–B5 两个八度 24 键），鼠标点、键盘按都行
- **实时三分数**：Plomp-Levelt 物理粗糙度、Tenney HD 认知复杂度、两者加权联合分数
- **α/β 滑块**：拖动调整物理 vs 认知的权重，看同一和弦分数怎么变
- **Web Audio 合成**：按 ▶ 实际听见你选的和弦（6 谐波 + ADSR 包络）
- **8 步学习路径**：从"一个键 = 谐波族"一路推到 Plomp-Levelt 公式，含和差化积证明 + 相位差 φ 的弯路澄清
- **结论栏 + 公式详解**：含纯律整数比吸附表、临界频带直觉、路小雨悖论分析

直接双击 `web/index.html` 就能跑，不需要后端。

### 2. Python 脚本 `music_probe.py`

暴力遍历所有三音组合，做定量分析：

```bash
python music_probe.py --topk 20                                      # 打 Top/Bottom 排名
python music_probe.py --plot --plot-scatter --save-dir output        # 画不协和度曲线
python music_probe.py --save-audio --save-dir output --play-k 5      # 导出 Top/Bottom wav
```

做的事：

- MIDI ↔ 频率映射、谐波列生成
- Plomp-Levelt 成对粗糙度（Sethares 1993 版）
- Tenney Harmonic Distance 认知复杂度
- 联合分数扫描
- matplotlib 画两派曲线
- numpy 合成波形 + scipy 写 wav

### 3. 对话记录 `conversation.md` / `more.md`

整个思考过程的原始对话（和 Gemini / Claude）。强烈建议读，比代码有价值得多。

- `conversation.md` — 第一阶段：从"说话声里有大三和弦吗"到 Plomp-Levelt 公式
- `more.md` — 第二阶段：承认 Plomp-Levelt 是"作弊"（拟合公式），引入纯数学的 Tenney HD，推导联合损失函数

## 四个（半）公式撑起整个项目

1. **MIDI → 频率**（十二平均律）
   `f(n) = 440 × 2^((n-69)/12)`

2. **谐波列**（每个键真正发的东西）
   `f_k = k·f_0, A_k = ρ^(k-1), ρ = 0.88`

3. **Plomp-Levelt 粗糙度**（生理学派 · 拟合公式）
   `d = min(v1,v2)·(e^(-3.5x) - e^(-5.75x))`
   `x = s·|f1-f2|, s = 0.24/(0.0207·f_min + 18.96)`

4. **和弦不协和度**（跨音泛音对求和）
   `D(chord) = ΣΣΣ d(f_p, f_q, v_p, v_q)`

5. **Tenney Harmonic Distance**（认知学派 · 纯数学）
   `HD = log2(a·b)`, `f1/f2 ≈ a/b`（最简整数比）

6. **联合损失函数**
   `D_joint = α·D_PL + β·D_HD/10`

具体推导和"马后炮 vs 第一性原理"的纠结过程，见 `web/` 的学习路径板块或 `conversation.md`。

## 几个不那么平凡的发现

- **同一音程在不同八度，粗糙度差 2.7 倍**：C4+D4 = 0.53，C4+D5 = 0.20。物理公式完全捕捉得到。
- **纯 PL 的 Top 1 不是大三和弦，是 Sus4**：因为 `1:4/3:3/2` 比 `4:5:6` 还简单。
- **Tenney HD 分不出大三/小三**：所有三和弦（含转位）的 HD 求和都是 11.81。
- **路小雨悖论**：周杰伦《路小雨》的 G4-C5-F5 开放排列听起来空灵，但 PL 和 HD 都算它比密集排列 C5-F5-G5 更难听。两派模型在这个地方都失效——空灵感可能在两派之外的变量里。
- **"最协和"的真相**：不是大小三之争，是 voicing 之争。跨八度开放排列的三和弦因为把纯五 `3:2` 拉到 `3:1`（HD 从 2.58 降到 1.58），才真正登顶。

## 目录结构

```
UnderstandingMusic/
├── README.md               # 你正在读的
├── requirements.txt        # Python 依赖
├── .gitignore
├── music_probe.py          # Python 实现 + CLI
├── conversation.md         # 原始对话（第一阶段）
├── more.md                 # 原始对话（第二阶段）
└── web/                    # 浏览器交互应用
    ├── index.html
    ├── styles.css
    └── js/
        ├── physics.js      # MIDI→freq / 谐波列 / PL / Tenney HD / Joint
        ├── chords.js       # 和弦识别 / 音程名 / Python vs JS 校验表
        ├── audio.js        # Web Audio 合成 + canvas 波形可视化
        └── ui.js           # 钢琴构建 / 刷新 / 滑块 / 事件绑定 / 启动
```

## 怎么跑

**Web 端**（最简单）：
```bash
open web/index.html        # 浏览器双击就行
```

**Python 端**（需要虚拟环境）：
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python music_probe.py --help
```

## 数值一致性

Python 和 JS 两端的所有公式都 bit-level 对齐，误差在 `1e-11` 量级（浮点精度极限）。页面底部"自测"表会实时用 JS 把 Python ground truth 算一遍对比。

## 致谢

- Plomp, R. & Levelt, W. J. M. (1965). *Tonal consonance and critical bandwidth*. JASA.
- Sethares, W. A. (1993). *Local consonance and the relationship between timbre and scale*. JASA.
- Tenney, J. (1964). *A history of 'consonance' and 'dissonance'*.
- 以及一个对音乐物理感兴趣的好奇心。

## License

MIT
