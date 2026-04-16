// ========================================================
// 2. 和弦识别（对应 identify_chord）
// ========================================================
const CHORD_TEMPLATES = {
  '0,4,7':'Major (大三)',
  '0,3,7':'Minor (小三)',
  '0,3,6':'Diminished (减)',
  '0,4,8':'Augmented (增)',
  '0,5,7':'Sus4 (挂四)',
  '0,2,7':'Sus2 (挂二)',
  '0,4,10':'Dom7-no5 (属七缺五)',
  '0,3,10':'Min7-no5',
  '0,2,4':'Cluster-whole (全音簇)',
  '0,1,2':'Cluster-semi (半音簇)',
  '0,1,3':'Cluster',
  '0,2,5':'Cluster',
  '0,5,10':'Quartal (四度叠置)',
};

function identifyChord(midis){
  const sorted = [...midis].sort((a,b)=>a-b);
  const pcs = [...new Set(sorted.map(m => ((m%12)+12)%12))].sort((a,b)=>a-b);
  if(pcs.length < 3) return '(含重复音)';
  if(pcs.length > 3){
    // 支持 4 音和弦的简单降级识别（只看前 3 个 pc 类集）
    const key = pcs.map(p=>((p-pcs[0])%12+12)%12).sort((a,b)=>a-b).join(',');
    return `${NOTE_NAMES[pcs[0]]} [${key}]`;
  }
  for(let rot=0; rot<pcs.length; rot++){
    const root = pcs[rot];
    const intervals = pcs.map(p => ((p-root)%12+12)%12).sort((a,b)=>a-b).join(',');
    if(intervals in CHORD_TEMPLATES){
      return `${NOTE_NAMES[root]} ${CHORD_TEMPLATES[intervals]}`;
    }
  }
  const intervals = pcs.map(p => ((p-pcs[0])%12+12)%12).sort((a,b)=>a-b);
  return `${NOTE_NAMES[pcs[0]]} (${intervals.join(',')})`;
}

// 音程名称（2音时）
const INTERVAL_NAMES = [
  '完全同度','小二度','大二度','小三度','大三度','完全四度',
  '三全音','完全五度','小六度','大六度','小七度','大七度'
];
function intervalName(semis){
  const s = ((semis%12)+12)%12;
  const oct = Math.floor(semis/12);
  const base = INTERVAL_NAMES[s];
  return oct > 0 ? `${base} + ${oct}八度` : base;
}

// ========================================================
// 3. 自测（对比 Python ground truth）
// ========================================================
const VERIFY_CASES = [
  {name:'C4-E4-G4 (Cmaj)', midis:[60,64,67], py_pl:0.8613657975, py_hd:11.8137811912},
  {name:'C4-Eb4-G4 (Cmin)', midis:[60,63,67], py_pl:0.8890639534, py_hd:11.8137811912},
  {name:'C4-F4-G4 (Csus4)', midis:[60,65,67], py_pl:0.8118522651, py_hd:12.3398500029},
  {name:'C4-C#4-D4 (cluster)', midis:[60,61,62], py_pl:2.0423890076, py_hd:21.9837061927},
  {name:'C5-F5-G5 (密集)', midis:[72,77,79], py_pl:0.4434680653, py_hd:12.3398500029},
  {name:'G4-C5-F5 (路小雨开放)', midis:[67,72,77], py_pl:0.5028751410, py_hd:14.3398500029},
  {name:'C4-G4 (P5)', midis:[60,67], py_pl:0.1279834799, py_hd:2.5849625007},
  {name:'C4-D4 (M2)', midis:[60,62], py_pl:0.5333605314, py_hd:6.1699250014},
  {name:'C4-D5 (M2+8ve)', midis:[60,74], py_pl:0.1990357544, py_hd:5.1699250014},
];
function renderVerifyTable(){
  const tbl = document.getElementById('verifyTable');
  let maxPL = 0, maxHD = 0;
  for(const c of VERIFY_CASES){
    const js_pl = chordDissonance(c.midis);
    const js_hd = chordTenney(c.midis);
    const d_pl = Math.abs(js_pl - c.py_pl);
    const d_hd = Math.abs(js_hd - c.py_hd);
    maxPL = Math.max(maxPL, d_pl);
    maxHD = Math.max(maxHD, d_hd);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${c.name}</td>
      <td style="font-family:var(--mono); color:var(--ink-mute);">${c.midis.join(',') || '—'}</td>
      <td class="num" style="color:var(--accent);">${js_pl.toFixed(4)}</td>
      <td class="num" style="color:#d8a0ff;">${js_hd.toFixed(4)}</td>
      <td class="num">${d_pl.toExponential(2)}</td>
      <td class="num">${d_hd.toExponential(2)}</td>`;
    tbl.appendChild(tr);
  }
  const sumTr = document.createElement('tr');
  sumTr.innerHTML = `<td colspan="4" style="color:var(--ink-mute);">全部用例最大误差</td><td class="num" style="color:var(--good);">${maxPL.toExponential(2)}</td><td class="num" style="color:var(--good);">${maxHD.toExponential(2)}</td>`;
  tbl.appendChild(sumTr);
}

