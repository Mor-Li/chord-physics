// ========================================================
// 1. 公式层 —— 严格 1:1 对应 music_probe.py
// ========================================================
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const A4_MIDI = 69;
const A4_FREQ = 440.0;

function midiToFreq(m){ return A4_FREQ * Math.pow(2, (m - A4_MIDI) / 12); }
function midiToName(m){
  const oct = Math.floor(m / 12) - 1;
  return NOTE_NAMES[((m % 12) + 12) % 12] + oct;
}
function isBlack(m){ return [1,3,6,8,10].includes(((m%12)+12)%12); }

function harmonicSeries(f0, nPartials=6, rolloff=0.88){
  const out = [];
  for(let k=1; k<=nPartials; k++){
    out.push({freq: f0*k, amp: Math.pow(rolloff, k-1)});
  }
  return out;
}

const _A=-3.5, _B=-5.75, _DSTAR=0.24, _S1=0.0207, _S2=18.96;

function dissonancePair(f1, f2, v1, v2){
  if(f1 === f2) return 0.0;
  const fmin = Math.min(f1,f2), fmax = Math.max(f1,f2);
  const s = _DSTAR / (_S1*fmin + _S2);
  const x = s * (fmax - fmin);
  return Math.min(v1,v2) * (Math.exp(_A*x) - Math.exp(_B*x));
}

function chordDissonance(midis, nPartials=6, rolloff=0.88){
  const parts = midis.map(m => harmonicSeries(midiToFreq(m), nPartials, rolloff));
  let total = 0.0;
  for(let i=0; i<parts.length; i++){
    for(let j=i+1; j<parts.length; j++){
      for(const p of parts[i]){
        for(const q of parts[j]){
          total += dissonancePair(p.freq, q.freq, p.amp, q.amp);
        }
      }
    }
  }
  return total;
}

// ========================================================
// 1b. Tenney Harmonic Distance（认知复杂度，纯数学派）
// ========================================================
// 十二平均律每个音程近似的纯律整数比
const JUST_RATIOS = [
  [1,1],   // 0 unison
  [16,15], // 1 m2
  [9,8],   // 2 M2
  [6,5],   // 3 m3
  [5,4],   // 4 M3
  [4,3],   // 5 P4
  [45,32], // 6 tritone
  [3,2],   // 7 P5
  [8,5],   // 8 m6
  [5,3],   // 9 M6
  [16,9],  // 10 m7
  [15,8],  // 11 M7
];
function gcd(a,b){ a=Math.abs(a); b=Math.abs(b); while(b){ [a,b]=[b,a%b]; } return a||1; }
function tenneyHD(m1, m2){
  const n = Math.abs(m2 - m1);
  if(n === 0) return 0;
  const octaves = Math.floor(n / 12);
  const rem = n % 12;
  let [a, b] = JUST_RATIOS[rem];
  a *= Math.pow(2, octaves);
  const g = gcd(a, b);
  return Math.log2((a / g) * (b / g));
}
function chordTenney(midis){
  let total = 0;
  for(let i=0; i<midis.length; i++)
    for(let j=i+1; j<midis.length; j++)
      total += tenneyHD(midis[i], midis[j]);
  return total;
}
// 归一化因子：Python 里 hd_scale = 1/10
const HD_SCALE = 0.1;
function jointScore(midis, alpha=0.5, beta=0.5){
  return alpha * chordDissonance(midis) + beta * HD_SCALE * chordTenney(midis);
}

