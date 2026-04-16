// ========================================================
// 7. Web Audio —— 对应 synth_note / synth_chord
// ========================================================
let audioCtx = null;
let masterGain = null;
function ensureAudio(){
  if(!audioCtx){
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.85;
    masterGain.connect(audioCtx.destination);
  }
  if(audioCtx.state === 'suspended') audioCtx.resume();
}

// scope visualization
let analyser = null;
function ensureAnalyser(){
  if(!analyser && audioCtx){
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    masterGain.connect(analyser);
  }
}

function playChord(midis){
  ensureAudio();
  ensureAnalyser();
  const duration = 1.8;
  const nPartials = 6;
  const rolloff = 0.88;
  const now = audioCtx.currentTime;

  // Per-note gain node to combine harmonics, then a global normalizer ≤ 0.85
  // 由于浏览器里我们不提前计算 peak，稳妥做法：按 1/N 缩放。
  const nVoices = Math.max(1, midis.length);
  const voiceScale = 0.85 / nVoices;

  midis.forEach(m => {
    const f0 = midiToFreq(m);
    const voiceGain = audioCtx.createGain();
    voiceGain.connect(masterGain);

    // ADSR envelope on voice gain
    const attack = 0.010;
    voiceGain.gain.setValueAtTime(0, now);
    voiceGain.gain.linearRampToValueAtTime(voiceScale, now + attack);
    // 指数衰减：对应 Python 的 exp(-2.0 * t)
    voiceGain.gain.setTargetAtTime(0, now + attack, 1/2.0);

    for(let k=1; k<=nPartials; k++){
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f0 * k, now);
      const pGain = audioCtx.createGain();
      pGain.gain.value = Math.pow(rolloff, k-1);
      osc.connect(pGain).connect(voiceGain);
      osc.start(now);
      osc.stop(now + duration + 0.05);
    }
  });

  startScope();
}

// waveform scope
const canvas = document.getElementById('scope');
const cctx = canvas.getContext('2d');
let scopeRunning = false;

function resizeCanvas(){
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  cctx.scale(dpr, dpr);
}
window.addEventListener('resize', () => { resizeCanvas(); drawScopeIdle(); });

function drawScopeIdle(){
  const w = canvas.clientWidth, h = canvas.clientHeight;
  cctx.clearRect(0,0,w,h);
  cctx.strokeStyle = 'rgba(124,245,211,0.25)';
  cctx.lineWidth = 1;
  cctx.beginPath();
  cctx.moveTo(0, h/2); cctx.lineTo(w, h/2); cctx.stroke();
  cctx.fillStyle = 'rgba(154,163,208,0.4)';
  cctx.font = '11px JetBrains Mono, SF Mono, monospace';
  cctx.fillText('波形（按 ▶ 后实时显示叠加波）', 12, h/2 - 8);
}

function startScope(){
  if(scopeRunning) return;
  scopeRunning = true;
  const buf = new Float32Array(analyser.fftSize);
  const w = canvas.clientWidth, h = canvas.clientHeight;

  function frame(){
    if(!analyser){ scopeRunning=false; return; }
    analyser.getFloatTimeDomainData(buf);
    cctx.clearRect(0,0,w,h);
    // gradient grid
    cctx.strokeStyle = 'rgba(255,255,255,0.04)';
    cctx.lineWidth = 1;
    for(let y=1; y<4; y++){
      cctx.beginPath();
      cctx.moveTo(0, h*y/4); cctx.lineTo(w, h*y/4); cctx.stroke();
    }
    // waveform
    cctx.strokeStyle = '#7cf5d3';
    cctx.lineWidth = 1.5;
    cctx.shadowColor = 'rgba(124,245,211,0.6)';
    cctx.shadowBlur = 6;
    cctx.beginPath();
    for(let i=0; i<buf.length; i++){
      const x = (i / buf.length) * w;
      const y = h/2 - buf[i] * h * 0.45;
      if(i===0) cctx.moveTo(x,y); else cctx.lineTo(x,y);
    }
    cctx.stroke();
    cctx.shadowBlur = 0;

    // detect silence to stop
    let rms = 0;
    for(let i=0; i<buf.length; i++) rms += buf[i]*buf[i];
    rms = Math.sqrt(rms/buf.length);
    if(rms < 0.0005){
      scopeRunning = false;
      setTimeout(drawScopeIdle, 100);
      return;
    }
    requestAnimationFrame(frame);
  }
  frame();
}

