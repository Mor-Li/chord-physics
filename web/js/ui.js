// ========================================================
// 4. 钢琴 UI
// ========================================================
const MIDI_LOW = 60, MIDI_HIGH = 83;
const selected = new Set();
const piano = document.getElementById('piano');

// 白/黑键索引
const whites = [];
const blacks = [];
for(let m=MIDI_LOW; m<=MIDI_HIGH; m++){
  (isBlack(m) ? blacks : whites).push(m);
}

// 键盘快捷键映射（从 C4 开始，按 24 键布局）
// 白键 14 个：Z X C V B N M , . / Q W E R T Y
// 黑键 10 个：S D (gap) G H J (gap) 2 3 (gap) 5 6 7
const WHITE_KEYMAP = ['z','x','c','v','b','n','m',',','.','/','q','w','e','r','t','y'];
const BLACK_KEYMAP = ['s','d', 'g','h','j', '2','3', '5','6','7'];

function buildPiano(){
  piano.innerHTML = '';
  // white row
  const wrow = document.createElement('div');
  wrow.className = 'white-row';
  whites.forEach((m, idx) => {
    const el = document.createElement('div');
    el.className = 'white-key';
    el.dataset.midi = m;
    el.innerHTML = `
      <div class="note-name">${midiToName(m)}</div>
      <div class="note-freq">${midiToFreq(m).toFixed(1)}Hz</div>
      <div style="font-size:9px; color:#a59878; margin-top:3px; opacity:0.8;">${WHITE_KEYMAP[idx] || ''}</div>
    `;
    attachKeyEvents(el, m);
    wrow.appendChild(el);
  });
  piano.appendChild(wrow);

  // black row -- positioned absolutely over whites
  const brow = document.createElement('div');
  brow.className = 'black-row';
  piano.appendChild(brow);

  // after layout, position each black key
  requestAnimationFrame(() => {
    const pianoRect = piano.getBoundingClientRect();
    const whiteW = pianoRect.width / whites.length;
    piano.style.setProperty('--white-w', whiteW + 'px');

    let blackIdx = 0;
    for(let i=0; i<whites.length-1; i++){
      const m = whites[i];
      // 如果下一个白键与当前白键之间存在黑键（差 2 个半音），则放一个黑键
      if(whites[i+1] - m === 2){
        const blackM = m + 1;
        const el = document.createElement('div');
        el.className = 'black-key';
        el.dataset.midi = blackM;
        const leftCenter = (i+1) * whiteW; // 右边界 = 下个白键左边缘
        const blackW = whiteW * 0.62;
        el.style.left = (leftCenter - blackW/2) + 'px';
        el.innerHTML = `
          <div class="note-name">${midiToName(blackM)}</div>
          <div class="note-freq">${midiToFreq(blackM).toFixed(1)}</div>
          <div style="font-size:9px; color:#8a91bd; margin-top:2px; opacity:0.8;">${BLACK_KEYMAP[blackIdx] || ''}</div>
        `;
        attachKeyEvents(el, blackM);
        brow.appendChild(el);
        blackIdx++;
      }
    }
  });
}

function attachKeyEvents(el, midi){
  el.addEventListener('click', () => toggleNote(midi));
  el.addEventListener('mouseenter', () => showHover(midi));
  el.addEventListener('mouseleave', () => clearHover());
}

function toggleNote(m){
  if(selected.has(m)) selected.delete(m); else selected.add(m);
  refresh();
}
function setSelected(midis){
  selected.clear();
  midis.forEach(m => selected.add(m));
  refresh();
}
function clearAll(){ selected.clear(); refresh(); }

// ========================================================
// 5. UI 刷新
// ========================================================
function refresh(){
  // keys
  piano.querySelectorAll('.white-key, .black-key').forEach(el => {
    const m = +el.dataset.midi;
    el.classList.toggle('selected', selected.has(m));
  });

  const midis = [...selected].sort((a,b)=>a-b);
  const pl = chordDissonance(midis);
  const hd = chordTenney(midis);
  const alpha = 1 - WEIGHT_BETA;
  const beta = WEIGHT_BETA;
  const joint = alpha * pl + beta * HD_SCALE * hd;

  // 大号联合分数
  const scoreNum = document.getElementById('scoreNum');
  scoreNum.textContent = joint.toFixed(4);
  scoreNum.classList.remove('good','mid','bad');
  if(midis.length < 2) scoreNum.classList.add('good');
  else if(joint < 0.5) scoreNum.classList.add('good');
  else if(joint < 1.2) scoreNum.classList.add('mid');
  else scoreNum.classList.add('bad');

  // 三个迷你分数
  document.getElementById('plVal').textContent = pl.toFixed(4);
  document.getElementById('hdVal').textContent = hd.toFixed(4);
  document.getElementById('jointVal').textContent = joint.toFixed(4);

  // score bar (cap at 2.5 for visual) - 基于联合分数
  const bar = document.getElementById('scoreBar');
  const pct = Math.min(100, (joint / 2.5) * 100);
  bar.style.width = pct + '%';

  // chord label
  const lab = document.getElementById('chordLabel');
  if(midis.length === 0){
    lab.textContent = '点键开始 · 或试试上方快捷按钮';
    lab.className = 'chord-label sub';
  }else if(midis.length === 1){
    lab.textContent = `${midiToName(midis[0])} · ${midiToFreq(midis[0]).toFixed(2)} Hz`;
    lab.className = 'chord-label';
  }else if(midis.length === 2){
    const semis = midis[1] - midis[0];
    lab.textContent = `音程: ${intervalName(semis)} (${semis} 半音)`;
    lab.className = 'chord-label';
  }else{
    lab.textContent = identifyChord(midis);
    lab.className = 'chord-label';
  }

  // note list
  const list = document.getElementById('noteList');
  list.innerHTML = '';
  if(midis.length === 0){
    list.innerHTML = '<div class="empty-hint">还没选 · 点下面键盘或上面快捷按钮</div>';
  }else{
    midis.forEach(m => {
      const row = document.createElement('div');
      row.className = 'note-row';
      row.innerHTML = `
        <span class="name">${midiToName(m)}</span>
        <span class="freq">${midiToFreq(m).toFixed(2)} Hz</span>
        <span class="midi">midi ${m}</span>`;
      list.appendChild(row);
    });
  }

  document.getElementById('btnPlay').disabled = midis.length === 0;
}

// ========================================================
// 6. Hover: 显示泛音
// ========================================================
function showHover(m){
  const parts = harmonicSeries(midiToFreq(m));
  const txt = parts.map((p,i) => `${i+1}f=${p.freq.toFixed(1)}Hz×${p.amp.toFixed(3)}`).join('  ');
  document.getElementById('hoverHint').innerHTML = `<b>${midiToName(m)}</b> 谐波列 · ${txt}`;
}
function clearHover(){
  document.getElementById('hoverHint').textContent = '悬停某个键可以看到它的前 6 个泛音频率。';
}

// ========================================================
// 8. 事件绑定
// ========================================================
document.getElementById('btnPlay').addEventListener('click', () => {
  const midis = [...selected].sort((a,b)=>a-b);
  if(midis.length === 0) return;
  playChord(midis);
});
document.getElementById('btnClear').addEventListener('click', clearAll);

// α/β 权重滑块
let WEIGHT_BETA = 0.5;
const betaSlider = document.getElementById('betaSlider');
const alphaLab = document.getElementById('alphaLab');
const betaLab = document.getElementById('betaLab');
betaSlider.addEventListener('input', e => {
  WEIGHT_BETA = parseFloat(e.target.value);
  const a = 1 - WEIGHT_BETA;
  alphaLab.textContent = `α=${a.toFixed(2)}`;
  betaLab.textContent = `β=${WEIGHT_BETA.toFixed(2)}`;
  refresh();
});

document.querySelectorAll('[data-preset]').forEach(btn => {
  btn.addEventListener('click', () => {
    const midis = btn.dataset.preset.split(',').map(x => +x);
    setSelected(midis);
  });
});

// keyboard shortcuts
const KEYMAP = {}; // char -> midi
WHITE_KEYMAP.forEach((k, i) => { if(whites[i] !== undefined) KEYMAP[k] = whites[i]; });
BLACK_KEYMAP.forEach((k, i) => { if(blacks[i] !== undefined) KEYMAP[k] = blacks[i]; });
document.addEventListener('keydown', e => {
  if(e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if(k === ' '){
    e.preventDefault();
    const midis = [...selected].sort((a,b)=>a-b);
    if(midis.length) playChord(midis);
    return;
  }
  if(k === 'escape'){ clearAll(); return; }
  if(k in KEYMAP){
    e.preventDefault();
    toggleNote(KEYMAP[k]);
  }
});

// ========================================================
// 9. 启动
// ========================================================
buildPiano();
// 布局后再次修正黑键位置（字体/滚动条可能影响宽度）
window.addEventListener('resize', () => { buildPiano(); refresh(); });
refresh();
renderVerifyTable();
requestAnimationFrame(() => { resizeCanvas(); drawScopeIdle(); });

// 暴露到全局便于控制台验证
window.chordDissonance = chordDissonance;
window.dissonancePair = dissonancePair;
window.harmonicSeries = harmonicSeries;
window.midiToFreq = midiToFreq;
window.midiToName = midiToName;
