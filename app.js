/* =====================================================
   Camy — app.js
   Full image editor logic
   ===================================================== */
'use strict';

/* ── DOM refs ── */
const uploadScreen = document.getElementById('upload-screen');
const dropZone     = document.getElementById('dropZone');
const fileInput    = document.getElementById('fileInput');
const editorEl     = document.getElementById('editor');
const canvasWrap   = document.getElementById('canvasWrap');
const mainCanvas   = document.getElementById('mainCanvas');
const ctx          = mainCanvas.getContext('2d');

/* Masks */
const maskBtns   = document.querySelectorAll('.mask-btn');
const blurMaskUI = document.getElementById('blurMaskUI');
const maskHandle = document.getElementById('maskHandle');
const maskRadius = document.getElementById('maskRadius');

const vignetteLayer= document.getElementById('vignetteLayer');
const textLayer    = document.getElementById('textLayer');
const cropOverlay  = document.getElementById('cropOverlay');
const floatingCompare = document.getElementById('floatingCompare');
const historyList     = document.getElementById('historyList');
const toastRoot    = document.getElementById('toastRoot');

/* ── Tabs & Panels ── */
const tabs   = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');

/* ── Adjustment sliders ── */
const slBrightness = document.getElementById('brightness');
const slContrast   = document.getElementById('contrast');
const slSaturation = document.getElementById('saturation');
const slBlur       = document.getElementById('blurSlider');
const valB = document.getElementById('brightVal');
const valC = document.getElementById('cVal');
const valS = document.getElementById('sVal');
const valBl= document.getElementById('blurVal');

/* Advanced Adjustments */
const slTemp       = document.getElementById('tempSlider');
const slShadows    = document.getElementById('shadowsSlider');
const slHighlights = document.getElementById('highlightsSlider');
const slSharp      = document.getElementById('sharpSlider');
const slR          = document.getElementById('rSlider');
const slG          = document.getElementById('gSlider');
const slB          = document.getElementById('bSlider');
const valT  = document.getElementById('tVal');
const valSh = document.getElementById('shVal');
const valHl = document.getElementById('hlVal');
const valSp = document.getElementById('sharpVal');
const valR  = document.getElementById('rVal');
const valG  = document.getElementById('gVal');
const valB2 = document.getElementById('blueVal');

/* Filters */
const filterBtns = document.querySelectorAll('.filter-btn');
const slFilterInt= document.getElementById('filterIntensity');
const valFInt    = document.getElementById('filterIntVal');

/* ── Transform ── */
const rotLBtn  = document.getElementById('rotL');
const rotRBtn  = document.getElementById('rotR');
const flipHBtn = document.getElementById('flipH');
const flipVBtn = document.getElementById('flipV');
const rotDisplay = document.getElementById('rotDisplay');

/* ── Crop ── */
const applyCropBtn  = document.getElementById('applyCropBtn');
const cancelCropBtn = document.getElementById('cancelCropBtn');
const cropTop    = cropOverlay.querySelector('.crop-dim.top');
const cropBottom = cropOverlay.querySelector('.crop-dim.bottom');
const cropLeft   = cropOverlay.querySelector('.crop-dim.left');
const cropRight  = cropOverlay.querySelector('.crop-dim.right');
const cropBox    = cropOverlay.querySelector('.crop-box');

/* ── Vignette ── */
const vigSlider = document.getElementById('vigSlider');
const vigVal    = document.getElementById('vigVal');

/* ── Text ── */
const addTextBtn  = document.getElementById('addTextBtn');
const textControls= document.getElementById('textControls');
const txtContent  = document.getElementById('txtContent');
const txtFont     = document.getElementById('txtFont');
const txtColor    = document.getElementById('txtColor');
const txtStrokeColor= document.getElementById('txtStrokeColor');
const txtSize     = document.getElementById('txtSize');
const txtSizeVal  = document.getElementById('txtSizeVal');
const txtStroke   = document.getElementById('txtStroke');
const txtStrokeVal= document.getElementById('txtStrokeVal');
const removeTextBtn= document.getElementById('removeTextBtn');

/* ── Header buttons ── */
const undoBtn    = document.getElementById('undoBtn');
const redoBtn    = document.getElementById('redoBtn');
const resetBtn   = document.getElementById('resetBtn');
const enhanceBtn = document.getElementById('enhanceBtn');
const exportBtn  = document.getElementById('exportBtn');
const importBtn       = document.getElementById('importBtn');
const importFileInput = document.getElementById('importFileInput');
const themeBtn        = document.getElementById('themeBtn');

/* =====================================================
   STATE
   ===================================================== */
let originalImage = null;    // ImageBitmap of the uploaded file
let currentImage  = null;    // ImageBitmap after transforms/crop applied
let scale = 1;               // canvas display scale

const adj = { 
  brightness: 100, contrast: 100, saturation: 100, blur: 0,
  temp: 0, shadows: 0, highlights: 0, sharpness: 0,
  r: 0, g: 0, b: 0
};
const tfm = { rotation: 0, flipH: false, flipV: false };
let vigIntensity = 0;
let activeFilter = 'none';
let filterInt = 100;

/* Undo/Redo stacks — each entry is an ImageBitmap snapshot */
const undoStack = [];
const redoStack = [];

/* Crop state */
const crop = { active: false, dragging: false, sx: 0, sy: 0, ex: 0, ey: 0 };

/* Text overlays */
let textItems  = [];
let selectedTxt = null;

/* Compare */
let compareMode = false;

/* Theme handling */
const isLight = localStorage.getItem('camy_theme') === 'light';
if (isLight) { document.body.classList.add('light'); themeBtn.innerHTML = '<span class="material-icons-round">dark_mode</span>'; }
themeBtn.addEventListener('click', () => {
  document.body.classList.toggle('light');
  const light = document.body.classList.contains('light');
  localStorage.setItem('camy_theme', light ? 'light' : 'dark');
  themeBtn.innerHTML = `<span class="material-icons-round">${light ? 'dark_mode' : 'light_mode'}</span>`;
});

/* Masks state */
let activeMask = 'none';
let maskX = 0.5, maskY = 0.5, maskR = 0.3;

/* Active panel */
let activePanel = 'adjust';

/* History view index: tracks which history entry the user is currently viewing.
   -2 = viewing latest (default), -1 = viewing original, 0..N = viewing specific undo entry */
let historyViewIdx = -2;

/* =====================================================
   UTILITIES
   ===================================================== */
function toast(msg, icon = 'check_circle') {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="material-icons-round">${icon}</span>${msg}`;
  toastRoot.appendChild(el);
  setTimeout(() => {
    el.classList.add('off');
    el.addEventListener('animationend', () => el.remove());
  }, 2600);
}

function getCSSFilter(ignoreBlur = false) {
  const b = ignoreBlur ? 0 : adj.blur;
  return `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%) blur(${b}px)`;
}

/* =====================================================
   UPLOAD
   ===================================================== */
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => loadFile(e.target.files[0]));

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('over');
  loadFile(e.dataTransfer.files[0]);
});

// Import button in editor header — opens file picker without losing current session
importBtn.addEventListener('click', () => importFileInput.click());
importFileInput.addEventListener('change', e => loadFile(e.target.files[0]));

async function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) { toast('Please upload an image file.', 'error'); return; }
  try {
    const bmp = await createImageBitmap(file);
    originalImage = bmp;
    currentImage  = bmp;
    resetState();
    uploadScreen.classList.add('out');
    editorEl.classList.remove('hidden');
    // Wait for DOM to finish laying out #editor before calculating canvas size
    requestAnimationFrame(() => {
      renderCanvas();
    });
    toast('Image loaded!', 'image');
  } catch(e) { toast('Could not load image.', 'error'); }
}

function resetState(clearHistory = true) {
  adj.brightness = 100; adj.contrast = 100; adj.saturation = 100; adj.blur = 0;
  adj.temp = 0; adj.shadows = 0; adj.highlights = 0; adj.sharpness = 0;
  adj.r = 0; adj.g = 0; adj.b = 0;
  
  slBrightness.value = 100; slContrast.value = 100; slSaturation.value = 100; slBlur.value = 0;
  slTemp.value = 0; slShadows.value = 0; slHighlights.value = 0; slSharp.value = 0;
  slR.value = 0; slG.value = 0; slB.value = 0;
  
  valB.textContent = 100; valC.textContent = 100; valS.textContent = 100; valBl.textContent = 0;
  valT.textContent = 0; valSh.textContent = 0; valHl.textContent = 0; valSp.textContent = 0;
  valR.textContent = 0; valG.textContent = 0; valB2.textContent = 0;
  
  activeFilter = 'none'; filterInt = 100;
  filterBtns.forEach(b => b.classList.toggle('active', b.dataset.filter === 'none'));
  slFilterInt.value = 100; valFInt.textContent = 100;

  activeMask = 'none'; maskX = 0.5; maskY = 0.5; maskR = 0.3;
  maskBtns.forEach(b => b.classList.toggle('active', b.dataset.mask === 'none'));
  blurMaskUI.classList.add('hidden');

  tfm.rotation = 0; tfm.flipH = false; tfm.flipV = false;
  vigIntensity = 0; vigSlider.value = 0; vigVal.textContent = 0;
  updateVignette();
  rotDisplay.textContent = '0°';
  textItems = []; textLayer.innerHTML = ''; selectedTxt = null;
  textControls.classList.add('hidden');
  
  if (clearHistory) {
    undoStack.length = 0; redoStack.length = 0;
    updateUndoRedo();
    renderHistoryList();
  }
  compareMode = false;
  exitCrop();
}

/* =====================================================
   CANVAS RENDERING
   ===================================================== */
function fitCanvas() {
  const wrap  = document.getElementById('workspace');
  const maxW  = wrap.clientWidth  - 40;
  const maxH  = wrap.clientHeight - 40;
  const ratio = currentImage.width / currentImage.height;
  let w = currentImage.width, h = currentImage.height;
  if (w > maxW) { w = maxW; h = w / ratio; }
  if (h > maxH) { h = maxH; w = h * ratio; }
  scale = w / currentImage.width;
  mainCanvas.width  = w;
  mainCanvas.height = h;
}

function generatePixelData(canvasW, canvasH, sourceImg, ignoreBlur = false) {
  // Draw with basic CSS filters first, then apply advanced pixel math
  const off = document.createElement('canvas');
  off.width = canvasW; off.height = canvasH;
  const oCtx = off.getContext('2d');
  
  oCtx.filter = getCSSFilter(ignoreBlur);
  oCtx.drawImage(sourceImg, 0, 0, canvasW, canvasH);
  
  // If no advanced adjustments are active, return immediately
  const needsRGB = adj.r !== 0 || adj.g !== 0 || adj.b !== 0;
  const needsPixelMath = adj.temp !== 0 || adj.shadows !== 0 || adj.highlights !== 0 || adj.sharpness !== 0 || activeFilter !== 'none' || needsRGB;
  if (!needsPixelMath) return off;

  const imgData = oCtx.getImageData(0, 0, canvasW, canvasH);
  const d = imgData.data;
  
  const temp = adj.temp / 100;
  const shadow = adj.shadows / 100;
  const high = adj.highlights / 100;
  const fInt = filterInt / 100;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i+1], b = d[i+2];

    if (needsRGB) {
      r += adj.r * 2.55; g += adj.g * 2.55; b += adj.b * 2.55;
    }

    // Temperature
    if (temp !== 0) {
      r += temp * 30; b -= temp * 30;
    }

    // Shadows & Highlights
    let lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255; 
    if (shadow !== 0) {
      let m = Math.max(0, (1 - lum) - 0.5) * 2;
      let amt = shadow * 60 * m;
      r += amt; g += amt; b += amt;
    }
    if (high !== 0) {
      let m = Math.max(0, lum - 0.5) * 2;
      let amt = high * 60 * m;
      r += amt; g += amt; b += amt;
    }

    // Filter Presets
    if (activeFilter !== 'none' && fInt > 0) {
      let fr=r, fg=g, fb=b;
      if (activeFilter === 'vintage') {
        fr = r*1.2 + g*0.2 + b*0.1; fg = r*0.1 + g*1.0 + b*0.1; fb = r*0.1 + g*0.1 + b*0.8;
      } else if (activeFilter === 'bw') {
        const p = r*0.3 + g*0.59 + b*0.11; fr=p; fg=p; fb=p;
      } else if (activeFilter === 'cinematic') {
        fr = r*0.9; fg = g*1.1; fb = b*1.3; if(lum > 0.5) { fr*=1.2; fb*=0.8; }
      } else if (activeFilter === 'sepia') {
        fr = (r * 0.393) + (g * 0.769) + (b * 0.189);
        fg = (r * 0.349) + (g * 0.686) + (b * 0.168);
        fb = (r * 0.272) + (g * 0.534) + (b * 0.131);
      } else if (activeFilter === 'polaroid') {
        fr = r*1.1+10; fg = g*1.05+5; fb = b*0.9-5;
      } else if (activeFilter === 'cool') {
        fr = r*0.9; fg = g*1.0; fb = b*1.2;
      }
      r = r + (fr - r) * fInt;
      g = g + (fg - g) * fInt;
      b = b + (fb - b) * fInt;
    }

    d[i]   = Math.min(255, Math.max(0, r));
    d[i+1] = Math.min(255, Math.max(0, g));
    d[i+2] = Math.min(255, Math.max(0, b));
  }
  
  // Sharpness Convolution
  if (adj.sharpness > 0) {
    const s = adj.sharpness / 100;
    const w = canvasW, h = canvasH;
    const cw = w * 4;
    const out = new Uint8ClampedArray(d);
    const m = [0, -s, 0, -s, 1 + 4*s, -s, 0, -s, 0];
    
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const off = (y * cw) + (x * 4);
        for (let c = 0; c < 3; c++) {
          let val = 
            d[off - cw - 4 + c] * m[0] + d[off - cw + c] * m[1] + d[off - cw + 4 + c] * m[2] +
            d[off - 4 + c]      * m[3] + d[off + c]      * m[4] + d[off + 4 + c]      * m[5] +
            d[off + cw - 4 + c] * m[6] + d[off + cw + c] * m[7] + d[off + cw + 4 + c] * m[8];
          out[off + c] = Math.min(255, Math.max(0, val));
        }
      }
    }
    imgData.data.set(out);
  }

  oCtx.putImageData(imgData, 0, 0);
  return off;
}

function renderCanvas() {
  if (!currentImage) return;
  fitCanvas();
  ctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
  
  const w = mainCanvas.width, h = mainCanvas.height;
  
  // 1. Generate sharp base image
  const sharpProcessed = generatePixelData(w, h, currentImage, true);
  
  if (adj.blur > 0) {
    if (activeMask === 'none') {
      ctx.filter = `blur(${adj.blur}px)`;
      ctx.drawImage(sharpProcessed, 0, 0);
      ctx.filter = 'none';
    } else {
      // Draw sharp fully
      ctx.drawImage(sharpProcessed, 0, 0);
      
      // Opt: use an offscreen canvas var instead of re-creating
      if (!window.blurMaskC) window.blurMaskC = document.createElement('canvas');
      const blurred = window.blurMaskC;
      if (blurred.width !== w || blurred.height !== h) { blurred.width = w; blurred.height = h; }
      
      const bCtx = blurred.getContext('2d');
      bCtx.clearRect(0,0,w,h);
      bCtx.globalCompositeOperation = 'source-over';
      bCtx.filter = `blur(${adj.blur}px)`;
      bCtx.drawImage(sharpProcessed, 0, 0);
      bCtx.filter = 'none';
      
      // Mask it out
      bCtx.globalCompositeOperation = 'destination-out';
      if (activeMask === 'radial') {
        const grd = bCtx.createRadialGradient(maskX*w, maskY*h, 0, maskX*w, maskY*h, maskR*w);
        grd.addColorStop(0, "rgba(0,0,0,1)");
        grd.addColorStop(0.5, "rgba(0,0,0,0.5)");
        grd.addColorStop(1, "rgba(0,0,0,0)");
        bCtx.fillStyle = grd;
        bCtx.fillRect(0, 0, w, h);
      } else if (activeMask === 'linear') {
        const range = maskR * h;
        const grd = bCtx.createLinearGradient(0, maskY*h - range, 0, maskY*h + range);
        grd.addColorStop(0, "rgba(0,0,0,0)");
        grd.addColorStop(0.5, "rgba(0,0,0,1)");
        grd.addColorStop(1, "rgba(0,0,0,0)");
        bCtx.fillStyle = grd;
        bCtx.fillRect(0, 0, w, h);
      }
      
      // Composite back to main over sharp
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(blurred, 0, 0);
    }
  } else {
    // No blur at all
    ctx.drawImage(sharpProcessed, 0, 0);
  }

  if (compareMode && originalImage) {
    ctx.drawImage(originalImage, 0, 0, w, h);
  }
}

/* =====================================================
   ADJUSTMENTS
   ===================================================== */
function bindSlider(el, valEl, key, suffix = '') {
  el.addEventListener('input', () => {
    adj[key] = parseFloat(el.value);
    valEl.textContent = el.value + suffix;
    renderCanvas();
  });
  el.addEventListener('change', () => {
    pushUndo(`Adjust ${key}`);
  });
}
bindSlider(slBrightness, valB, 'brightness');
bindSlider(slContrast,   valC, 'contrast');
bindSlider(slSaturation, valS, 'saturation');
bindSlider(slBlur, valBl, 'blur');
bindSlider(slTemp, valT, 'temp');
bindSlider(slShadows, valSh, 'shadows');
bindSlider(slHighlights, valHl, 'highlights');
bindSlider(slSharp, valSp, 'sharpness');
bindSlider(slR, valR, 'r');
bindSlider(slG, valG, 'g');
bindSlider(slB, valB2, 'b');

/* Filters UI */
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    renderCanvas();
    pushUndo(`Filter: ${activeFilter}`);
  });
});

slFilterInt.addEventListener('input', () => {
  filterInt = parseFloat(slFilterInt.value);
  valFInt.textContent = slFilterInt.value;
  renderCanvas();
});
slFilterInt.addEventListener('change', () => pushUndo('Filter Intensity'));

/* =====================================================
   UNDO / REDO
   ===================================================== */
async function pushUndo(actionName = 'Edit') {
  const bmp = await createImageBitmap(currentImage);

  const stateSnapshot = {
    adj: { ...adj }, tfm: { ...tfm },
    filter: activeFilter, fInt: filterInt,
    vig: vigIntensity,
    mask: { active: activeMask, x: maskX, y: maskY, r: maskR }
  };
  
  // Only truncate history if the user navigated to a specific mid-stack entry
  // (not Original and not the latest) and then made a new edit from there.
  if (historyViewIdx >= 0 && historyViewIdx < undoStack.length - 1) {
    undoStack.length = historyViewIdx + 1; // truncate future entries
  }

  undoStack.push({ bitmap: bmp, name: actionName, state: stateSnapshot });
  if (undoStack.length > 30) undoStack.shift();
  redoStack.length = 0;
  historyViewIdx = -2; // reset to viewing latest
  updateUndoRedo();
  renderHistoryList();
}

function updateUndoRedo() {
  undoBtn.disabled = undoStack.length === 0;
  redoBtn.disabled = redoStack.length === 0;
}

function renderHistoryList() {
  historyList.innerHTML = `<div class="history-item" data-idx="-1"><span class="material-icons-round" style="margin-right:8px;font-size:16px;">image</span>Original Import</div>`;
  undoStack.forEach((entry, idx) => {
    historyList.innerHTML += `<div class="history-item" data-idx="${idx}"><span class="material-icons-round" style="margin-right:8px;font-size:16px;">edit</span>${entry.name}</div>`;
  });
  
  // Highlight active
  const items = historyList.querySelectorAll('.history-item');
  if (items.length > 0) items[items.length - 1].classList.add('active');

  items.forEach(item => {
    item.addEventListener('click', async () => {
      const idx = parseInt(item.dataset.idx);
      historyViewIdx = idx; // track which entry we're viewing
      if (idx === -1) {
        // Revert image to original without touching undo history
        currentImage = originalImage;
        // Reset all UI sliders to defaults
        adj.brightness = 100; adj.contrast = 100; adj.saturation = 100; adj.blur = 0;
        adj.temp = 0; adj.shadows = 0; adj.highlights = 0; adj.sharpness = 0;
        adj.r = 0; adj.g = 0; adj.b = 0;
        slBrightness.value = 100; slContrast.value = 100; slSaturation.value = 100; slBlur.value = 0;
        slTemp.value = 0; slShadows.value = 0; slHighlights.value = 0; slSharp.value = 0;
        slR.value = 0; slG.value = 0; slB.value = 0;
        valB.textContent = 100; valC.textContent = 100; valS.textContent = 100; valBl.textContent = 0;
        valT.textContent = 0; valSh.textContent = 0; valHl.textContent = 0; valSp.textContent = 0;
        valR.textContent = 0; valG.textContent = 0; valB2.textContent = 0;
        activeFilter = 'none'; filterInt = 100; slFilterInt.value = 100; valFInt.textContent = 100;
        filterBtns.forEach(b => b.classList.toggle('active', b.dataset.filter === 'none'));
        activeMask = 'none'; maskBtns.forEach(b => b.classList.toggle('active', b.dataset.mask === 'none'));
        vigIntensity = 0; vigSlider.value = 0; vigVal.textContent = 0;
        tfm.rotation = 0; tfm.flipH = false; tfm.flipV = false; rotDisplay.textContent = '0°';
        updateVignette();
        updateBlurMaskUI();
        renderCanvas();
      } else {
        const entry = undoStack[idx];
        currentImage = entry.bitmap;
        // Restore fully recorded state
        Object.assign(adj, entry.state.adj);
        Object.assign(tfm, entry.state.tfm);
        activeFilter = entry.state.filter; filterInt = entry.state.fInt;
        vigIntensity = entry.state.vig;
        activeMask = entry.state.mask.active; maskX = entry.state.mask.x; maskY = entry.state.mask.y; maskR = entry.state.mask.r;

        // Sync HTML sliders & labels
        slBrightness.value = adj.brightness; valB.textContent = adj.brightness;
        slContrast.value = adj.contrast; valC.textContent = adj.contrast;
        slSaturation.value = adj.saturation; valS.textContent = adj.saturation;
        slBlur.value = adj.blur; valBl.textContent = adj.blur;
        slTemp.value = adj.temp; valT.textContent = adj.temp;
        slShadows.value = adj.shadows; valSh.textContent = adj.shadows;
        slHighlights.value = adj.highlights; valHl.textContent = adj.highlights;
        slSharp.value = adj.sharpness; valSp.textContent = adj.sharpness;
        slR.value = adj.r; valR.textContent = adj.r;
        slG.value = adj.g; valG.textContent = adj.g;
        slB.value = adj.b; valB2.textContent = adj.b;
        vigSlider.value = vigIntensity; vigVal.textContent = vigIntensity;
        slFilterInt.value = filterInt; valFInt.textContent = filterInt;
        filterBtns.forEach(b => b.classList.toggle('active', b.dataset.filter === activeFilter));
        maskBtns.forEach(b => b.classList.toggle('active', b.dataset.mask === activeMask));
        rotDisplay.textContent = entry.state.tfm.rotation + '°';
        updateVignette();
        updateBlurMaskUI();

        renderCanvas();
      }
      
      items.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    });
  });
}

undoBtn.addEventListener('click', async () => {
  if (!undoStack.length) return;
  const currentBmp = await createImageBitmap(currentImage);
  const popped = undoStack.pop();
  redoStack.push({ bitmap: currentBmp, name: popped.name });
  
  if (undoStack.length === 0) {
    currentImage = originalImage;
  } else {
    currentImage = undoStack[undoStack.length - 1].bitmap;
  }
  
  renderCanvas();
  updateUndoRedo();
  renderHistoryList();
  toast('Undo', 'undo');
});

redoBtn.addEventListener('click', async () => {
  if (!redoStack.length) return;
  const currentBmp = await createImageBitmap(currentImage);
  undoStack.push({ bitmap: currentBmp, name: redoStack[redoStack.length - 1].name });
  
  const popped = redoStack.pop();
  currentImage = popped.bitmap;
  
  renderCanvas();
  updateUndoRedo();
  renderHistoryList();
  toast('Redo', 'redo');
});

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undoBtn.click(); }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redoBtn.click(); }
});

/* =====================================================
   TRANSFORMS
   ===================================================== */
async function applyTransform(drawFn, actionName = 'Transform') {
  await pushUndo(actionName);
  const offscreen = document.createElement('canvas');
  const w = currentImage.width, h = currentImage.height;
  const oCtx = offscreen.getContext('2d');
  // draw with current filters to bake them in before geometric transform
  const tmp = generatePixelData(currentImage.width, currentImage.height, currentImage);
  const filtered = await createImageBitmap(tmp);

  drawFn(offscreen, oCtx, filtered, w, h);
  currentImage = await createImageBitmap(offscreen);
  // Reset all adjustments after baking (including RGB channels)
  adj.brightness = 100; adj.contrast = 100; adj.saturation = 100; adj.blur = 0;
  adj.temp = 0; adj.shadows = 0; adj.highlights = 0; adj.sharpness = 0;
  adj.r = 0; adj.g = 0; adj.b = 0;
  slBrightness.value = 100; slContrast.value = 100; slSaturation.value = 100; slBlur.value = 0;
  slTemp.value = 0; slShadows.value = 0; slHighlights.value = 0; slSharp.value = 0;
  slR.value = 0; slG.value = 0; slB.value = 0;
  valB.textContent = 100; valC.textContent = 100; valS.textContent = 100; valBl.textContent = 0;
  valT.textContent = 0; valSh.textContent = 0; valHl.textContent = 0; valSp.textContent = 0;
  valR.textContent = 0; valG.textContent = 0; valB2.textContent = 0;
  
  activeFilter = 'none'; filterInt = 100; slFilterInt.value = 100; valFInt.textContent = 100;
  filterBtns.forEach(b => b.classList.toggle('active', b.dataset.filter === 'none'));
  vigIntensity = 0; vigSlider.value = 0; vigVal.textContent = 0;
  updateVignette();
  
  renderCanvas();
}

rotLBtn.addEventListener('click', () => {
  tfm.rotation = (tfm.rotation - 90 + 360) % 360;
  rotDisplay.textContent = tfm.rotation + '°';
  applyTransform((canvas, c, src, w, h) => {
    canvas.width = h; canvas.height = w;
    c.translate(0, w); c.rotate(-Math.PI / 2); c.drawImage(src, 0, 0, w, h);
  }, 'Rotate Left');
});
rotRBtn.addEventListener('click', () => {
  tfm.rotation = (tfm.rotation + 90) % 360;
  rotDisplay.textContent = tfm.rotation + '°';
  applyTransform((canvas, c, src, w, h) => {
    canvas.width = h; canvas.height = w;
    c.translate(h, 0); c.rotate(Math.PI / 2); c.drawImage(src, 0, 0, w, h);
  }, 'Rotate Right');
});
flipHBtn.addEventListener('click', () => {
  tfm.flipH = !tfm.flipH;
  applyTransform((canvas, c, src, w, h) => {
    canvas.width = w; canvas.height = h;
    c.translate(w, 0); c.scale(-1, 1); c.drawImage(src, 0, 0, w, h);
  }, 'Flip H');
});
flipVBtn.addEventListener('click', () => {
  tfm.flipV = !tfm.flipV;
  applyTransform((canvas, c, src, w, h) => {
    canvas.width = w; canvas.height = h;
    c.translate(0, h); c.scale(1, -1); c.drawImage(src, 0, 0, w, h);
  }, 'Flip V');
});

/* =====================================================
   CROP
   ===================================================== */
function enterCrop() {
  crop.active = true; crop.dragging = false;
  cropOverlay.classList.remove('hidden');
  applyCropBtn.disabled = true;
  hideCropBoxes();
}
function exitCrop() {
  crop.active = false; crop.dragging = false;
  cropOverlay.classList.add('hidden');
  applyCropBtn.disabled = true;
}
function hideCropBoxes() {
  [cropTop, cropBottom, cropLeft, cropRight, cropBox].forEach(el => { el.style.cssText = ''; });
}

function canvasPoint(e) {
  const rect = mainCanvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: clientX - rect.left, y: clientY - rect.top };
}

cropOverlay.addEventListener('mousedown',  e => startCropDrag(e));
cropOverlay.addEventListener('touchstart', e => startCropDrag(e), { passive: true });
cropOverlay.addEventListener('mousemove',  e => { if (crop.dragging) updateCropDrag(e); });
cropOverlay.addEventListener('touchmove',  e => { if (crop.dragging) updateCropDrag(e); }, { passive: true });
cropOverlay.addEventListener('mouseup',    () => endCropDrag());
cropOverlay.addEventListener('touchend',   () => endCropDrag());

function startCropDrag(e) {
  if (!crop.active) return;
  const p = canvasPoint(e);
  crop.sx = p.x; crop.sy = p.y;
  crop.ex = p.x; crop.ey = p.y;
  crop.dragging = true;
  applyCropBtn.disabled = true;
}
function updateCropDrag(e) {
  const p = canvasPoint(e);
  crop.ex = Math.min(Math.max(p.x, 0), mainCanvas.width);
  crop.ey = Math.min(Math.max(p.y, 0), mainCanvas.height);
  drawCropUI();
}
function endCropDrag() {
  crop.dragging = false;
  const w = Math.abs(crop.ex - crop.sx), h = Math.abs(crop.ey - crop.sy);
  if (w > 5 && h > 5) applyCropBtn.disabled = false;
}
function drawCropUI() {
  const x1 = Math.min(crop.sx, crop.ex), y1 = Math.min(crop.sy, crop.ey);
  const x2 = Math.max(crop.sx, crop.ex), y2 = Math.max(crop.sy, crop.ey);
  const cw = mainCanvas.width, ch = mainCanvas.height;
  cropTop.style.cssText    = `top:0;left:0;right:0;height:${y1}px`;
  cropBottom.style.cssText = `bottom:0;left:0;right:0;top:${y2}px`;
  cropLeft.style.cssText   = `top:${y1}px;left:0;width:${x1}px;height:${y2 - y1}px`;
  cropRight.style.cssText  = `top:${y1}px;left:${x2}px;right:0;height:${y2 - y1}px`;
  cropBox.style.cssText    = `left:${x1}px;top:${y1}px;width:${x2 - x1}px;height:${y2 - y1}px`;
}

applyCropBtn.addEventListener('click', async () => {
  await pushUndo('Crop Area');
  const x1 = Math.min(crop.sx, crop.ex), y1 = Math.min(crop.sy, crop.ey);
  const x2 = Math.max(crop.sx, crop.ex), y2 = Math.max(crop.sy, crop.ey);
  const srcX = x1 / scale, srcY = y1 / scale;
  const srcW = (x2 - x1) / scale, srcH = (y2 - y1) / scale;
  const off = document.createElement('canvas');
  off.width = srcW; off.height = srcH;
  off.getContext('2d').drawImage(currentImage, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
  currentImage = await createImageBitmap(off);
  exitCrop();
  renderCanvas();
  toast('Crop applied!', 'crop');
  // switch back to adjust panel
  switchPanel('adjust');
});
cancelCropBtn.addEventListener('click', () => { exitCrop(); switchPanel('adjust'); });

/* =====================================================
   VIGNETTE
   ===================================================== */
vigSlider.addEventListener('input', () => {
  vigIntensity = parseInt(vigSlider.value);
  vigVal.textContent = vigIntensity;
  updateVignette();
});
function updateVignette() {
  if (vigIntensity === 0) {
    vignetteLayer.style.background = 'none';
    return;
  }
  const alpha = vigIntensity / 100;
  vignetteLayer.style.background =
    `radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,${alpha * 0.9}) 100%)`;
}

/* =====================================================
   BLUR MASKING
   ===================================================== */
maskBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    maskBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeMask = btn.dataset.mask;
    renderCanvas();
    updateBlurMaskUI();
    pushUndo(`Blur Mask: ${activeMask}`);
  });
});

function updateBlurMaskUI() {
  if (activeMask === 'none' || adj.blur === 0 || activePanel !== 'adjust') {
    blurMaskUI.classList.add('hidden');
    return;
  }
  blurMaskUI.classList.remove('hidden');
  const w = mainCanvas.width, h = mainCanvas.height;
  maskHandle.style.left = (maskX * w) + 'px';
  maskHandle.style.top  = (maskY * h) + 'px';
  
  if (activeMask === 'radial') {
    maskRadius.style.display = 'block';
    maskRadius.style.left   = (maskX * w) + 'px';
    maskRadius.style.top    = (maskY * h) + 'px';
    maskRadius.style.width  = (maskR * w * 2) + 'px';
    maskRadius.style.height = (maskR * w * 2) + 'px';
  } else {
    maskRadius.style.display = 'none';
  }
}

let maskDragging = null;
blurMaskUI.addEventListener('mousedown', e => {
  if (e.target === maskHandle) {
    maskDragging = 'handle';
  } else if (e.target === maskRadius) {
    maskDragging = 'radius';
  } else {
    // Clicked elsewhere on the UI: Relocate the handle immediately!
    const rect = mainCanvas.getBoundingClientRect();
    maskX = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    maskY = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1);
    maskDragging = 'handle';
    updateBlurMaskUI();
    renderCanvas();
  }
});
blurMaskUI.addEventListener('touchstart', e => {
  if (e.target === maskHandle) {
    maskDragging = 'handle';
  } else if (e.target === maskRadius) {
    maskDragging = 'radius';
  } else {
    const rect = mainCanvas.getBoundingClientRect();
    maskX = Math.min(Math.max((e.touches[0].clientX - rect.left) / rect.width, 0), 1);
    maskY = Math.min(Math.max((e.touches[0].clientY - rect.top) / rect.height, 0), 1);
    maskDragging = 'handle';
    updateBlurMaskUI();
    renderCanvas();
  }
}, { passive: true });

document.addEventListener('mousemove', e => {
  if (!maskDragging) return;
  const rect = mainCanvas.getBoundingClientRect();
  const px = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
  const py = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1);
  
  if (maskDragging === 'handle') {
    maskX = px; maskY = py;
  } else if (maskDragging === 'radius') {
    const dx = px - maskX, dy = py - maskY;
    maskR = Math.max(0.05, Math.sqrt(dx*dx + dy*dy));
  }
  updateBlurMaskUI();
  renderCanvas();
});
document.addEventListener('touchmove', e => {
  if (!maskDragging) return;
  const rect = mainCanvas.getBoundingClientRect();
  const px = Math.min(Math.max((e.touches[0].clientX - rect.left) / rect.width, 0), 1);
  const py = Math.min(Math.max((e.touches[0].clientY - rect.top) / rect.height, 0), 1);
  if (maskDragging === 'handle') { maskX = px; maskY = py; }
  else if (maskDragging === 'radius') { const dx = px - maskX, dy = py - maskY; maskR = Math.max(0.05, Math.sqrt(dx*dx + dy*dy)); }
  updateBlurMaskUI();
  renderCanvas();
}, { passive: true });

document.addEventListener('mouseup', () => { if (maskDragging) { maskDragging = null; pushUndo('Mask Edit'); } });
document.addEventListener('touchend', () => { if (maskDragging) { maskDragging = null; pushUndo('Mask Edit'); } });

/* =====================================================
   TEXT OVERLAYS
   ===================================================== */
let txtIdCounter = 0;

addTextBtn.addEventListener('click', () => {
  const id = 'txt_' + (++txtIdCounter);
  const item = {
    id, text: 'Your Text',
    x: 50, y: 50,
    font: 'Inter, sans-serif', size: 48,
    color: '#ffffff', strokeColor: '#000000', strokeWidth: 2,
    el: null
  };
  const el = document.createElement('div');
  el.className = 'txt-item';
  el.id = id;
  el.dataset.id = id;
  applyTextStyle(el, item);
  el.textContent = item.text;
  textLayer.appendChild(el);
  item.el = el;
  textItems.push(item);
  makeDraggable(el, item);
  selectText(item);
  textControls.classList.remove('hidden');
  syncTextControls(item);
});

function applyTextStyle(el, item) {
  el.style.fontFamily  = item.font;
  el.style.fontSize    = item.size + 'px';
  el.style.color       = item.color;
  el.style.left        = item.x + '%';
  el.style.top         = item.y + '%';
  // Use -webkit-text-stroke for a proper, clean outline (no shadow artifacts)
  if (item.strokeWidth > 0) {
    el.style.webkitTextStroke = `${item.strokeWidth}px ${item.strokeColor}`;
    el.style.paintOrder = 'stroke fill';
  } else {
    el.style.webkitTextStroke = '0px transparent';
    el.style.paintOrder = 'fill';
  }
  el.style.textShadow = 'none';
}

function selectText(item) {
  textItems.forEach(t => t.el && t.el.classList.remove('selected'));
  selectedTxt = item;
  if (item) {
    item.el.classList.add('selected');
    syncTextControls(item);
    textControls.classList.remove('hidden');
  }
}

function syncTextControls(item) {
  txtContent.value = item.text;
  txtFont.value    = item.font;
  txtColor.value   = item.color;
  txtStrokeColor.value = item.strokeColor;
  txtSize.value    = item.size; txtSizeVal.textContent = item.size;
  txtStroke.value  = item.strokeWidth; txtStrokeVal.textContent = item.strokeWidth;
}

function updateSelectedText() {
  if (!selectedTxt) return;
  selectedTxt.text        = txtContent.value;
  selectedTxt.font        = txtFont.value;
  selectedTxt.color       = txtColor.value;
  selectedTxt.strokeColor = txtStrokeColor.value;
  selectedTxt.size        = parseInt(txtSize.value);
  selectedTxt.strokeWidth = parseInt(txtStroke.value);
  selectedTxt.el.textContent = selectedTxt.text;
  applyTextStyle(selectedTxt.el, selectedTxt);
}

[txtContent, txtFont, txtColor, txtStrokeColor].forEach(el => el.addEventListener('input', updateSelectedText));
txtSize.addEventListener('input', () => { txtSizeVal.textContent = txtSize.value; updateSelectedText(); });
txtStroke.addEventListener('input', () => { txtStrokeVal.textContent = txtStroke.value; updateSelectedText(); });

removeTextBtn.addEventListener('click', () => {
  if (!selectedTxt) return;
  selectedTxt.el.remove();
  textItems = textItems.filter(t => t !== selectedTxt);
  selectedTxt = null;
  if (textItems.length === 0) textControls.classList.add('hidden');
  else selectText(textItems[textItems.length - 1]);
});

/* Draggable text */
function makeDraggable(el, item) {
  let startX, startY, startL, startT;
  el.addEventListener('mousedown', e => {
    e.stopPropagation(); selectText(item);
    const rect = textLayer.getBoundingClientRect();
    startX = e.clientX; startY = e.clientY;
    startL = item.x; startT = item.y;
    el.classList.add('dragging');
    const onMove = e2 => {
      const dx = ((e2.clientX - startX) / rect.width)  * 100;
      const dy = ((e2.clientY - startY) / rect.height) * 100;
      item.x = Math.min(Math.max(startL + dx, 0), 95);
      item.y = Math.min(Math.max(startT + dy, 0), 95);
      applyTextStyle(el, item);
    };
    const onUp = () => {
      el.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
  el.addEventListener('touchstart', e => {
    e.stopPropagation(); selectText(item);
    const rect = textLayer.getBoundingClientRect();
    startX = e.touches[0].clientX; startY = e.touches[0].clientY;
    startL = item.x; startT = item.y;
    el.classList.add('dragging');
    const onMove = e2 => {
      const dx = ((e2.touches[0].clientX - startX) / rect.width)  * 100;
      const dy = ((e2.touches[0].clientY - startY) / rect.height) * 100;
      item.x = Math.min(Math.max(startL + dx, 0), 95);
      item.y = Math.min(Math.max(startT + dy, 0), 95);
      applyTextStyle(el, item);
    };
    const onUp = () => {
      el.classList.remove('dragging');
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onUp);
    };
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onUp);
  }, { passive: true });
}

/* Click on canvas area deselects text */
document.getElementById('workspace').addEventListener('click', e => {
  if (!e.target.closest('.txt-item')) { textItems.forEach(t => t.el && t.el.classList.remove('selected')); selectedTxt = null; }
});

/* =====================================================
   FLOATING COMPARE
   ===================================================== */
const showOriginal = () => { compareMode = true; renderCanvas(); };
const hideOriginal = () => { compareMode = false; renderCanvas(); };

floatingCompare.addEventListener('mousedown', showOriginal);
floatingCompare.addEventListener('touchstart', showOriginal, { passive: true });
floatingCompare.addEventListener('mouseup', hideOriginal);
floatingCompare.addEventListener('mouseleave', hideOriginal);
floatingCompare.addEventListener('touchend', hideOriginal);

/* =====================================================
   PANEL SWITCHING
   ===================================================== */
tabs.forEach(tab => {
  tab.addEventListener('click', () => switchPanel(tab.dataset.panel));
});

function switchPanel(name) {
  activePanel = name;
  tabs.forEach(t => t.classList.toggle('active', t.dataset.panel === name));
  panels.forEach(p => p.classList.toggle('hidden', p.id !== 'panel-' + name));

  if (name === 'transform') { enterCrop(); }
  else { exitCrop(); }

  updateBlurMaskUI();
}

/* =====================================================
   RESET & AUTO ENHANCE
   ===================================================== */
resetBtn.addEventListener('click', () => {
  if (!originalImage) return;
  currentImage = originalImage;
  resetState(false);
  renderCanvas();
  pushUndo('Reset All Edits');
  toast('All edits reset', 'refresh');
});

enhanceBtn.addEventListener('click', async () => {
  if (!currentImage) return;
  // Simple auto-enhance: boost brightness/contrast/saturation slightly
  adj.brightness = 110; adj.contrast = 115; adj.saturation = 120;
  slBrightness.value = 110; slContrast.value = 115; slSaturation.value = 120;
  valB.textContent = 110; valC.textContent = 115; valS.textContent = 120;
  renderCanvas();
  pushUndo('Auto Enhance');
  toast('Auto Enhanced!', 'auto_awesome');
});

slBlur.addEventListener('input', () => { updateBlurMaskUI(); });

/* =====================================================
   EXPORT
   ===================================================== */
exportBtn.addEventListener('click', async () => {
  if (!currentImage) return;
  exportBtn.disabled = true;
  
  const formatEl = document.getElementById('exportFormat');
  const formatType = formatEl ? formatEl.value : 'png';

  const off = document.createElement('canvas');
  off.width  = currentImage.width;
  off.height = currentImage.height;
  const oCtx = off.getContext('2d');

  const w = off.width, h = off.height;
  const sharpProcessed = generatePixelData(w, h, currentImage, true);
  
  if (adj.blur > 0) {
    if (activeMask === 'none') {
      oCtx.filter = `blur(${adj.blur}px)`;
      oCtx.drawImage(sharpProcessed, 0, 0);
      oCtx.filter = 'none';
    } else {
      oCtx.drawImage(sharpProcessed, 0, 0);
      const blurred = document.createElement('canvas');
      blurred.width = w; blurred.height = h;
      const bCtx = blurred.getContext('2d');
      bCtx.filter = `blur(${adj.blur}px)`;
      bCtx.drawImage(sharpProcessed, 0, 0);
      bCtx.filter = 'none';
      bCtx.globalCompositeOperation = 'destination-out';
      if (activeMask === 'radial') {
        const grd = bCtx.createRadialGradient(maskX*w, maskY*h, 0, maskX*w, maskY*h, maskR*w);
        grd.addColorStop(0, "rgba(0,0,0,1)"); grd.addColorStop(0.5, "rgba(0,0,0,0.5)"); grd.addColorStop(1, "rgba(0,0,0,0)");
        bCtx.fillStyle = grd; bCtx.fillRect(0, 0, w, h);
      } else if (activeMask === 'linear') {
        const range = maskR * h;
        const grd = bCtx.createLinearGradient(0, maskY*h - range, 0, maskY*h + range);
        grd.addColorStop(0, "rgba(0,0,0,0)"); grd.addColorStop(0.5, "rgba(0,0,0,1)"); grd.addColorStop(1, "rgba(0,0,0,0)");
        bCtx.fillStyle = grd; bCtx.fillRect(0, 0, w, h);
      }
      oCtx.globalCompositeOperation = 'source-over';
      oCtx.drawImage(blurred, 0, 0);
    }
  } else {
    oCtx.drawImage(sharpProcessed, 0, 0);
  }

  // Vignette
  if (vigIntensity > 0) {
    const alpha = vigIntensity / 100;
    const grad = oCtx.createRadialGradient(
      off.width / 2, off.height / 2, 0,
      off.width / 2, off.height / 2, Math.max(off.width, off.height) * 0.7
    );
    grad.addColorStop(0.3, 'rgba(0,0,0,0)');
    grad.addColorStop(1,   `rgba(0,0,0,${alpha * 0.9})`);
    oCtx.fillStyle = grad;
    oCtx.fillRect(0, 0, off.width, off.height);
  }

  // Text overlays
  const scaleX = currentImage.width  / mainCanvas.width;
  const scaleY = currentImage.height / mainCanvas.height;
  for (const item of textItems) {
    const px = (item.x / 100) * mainCanvas.width  * scaleX;
    const py = (item.y / 100) * mainCanvas.height * scaleY;
    const fs = item.size * Math.min(scaleX, scaleY);
    oCtx.font      = `bold ${fs}px ${item.font}`;
    oCtx.fillStyle = item.color;
    if (item.strokeWidth > 0) {
      oCtx.strokeStyle   = item.strokeColor;
      oCtx.lineWidth     = item.strokeWidth * Math.min(scaleX, scaleY) * 2;
      oCtx.lineJoin      = 'round';
      oCtx.strokeText(item.text, px, py + fs);
    }
    oCtx.fillText(item.text, px, py + fs);
  }

  const link = document.createElement('a');
  link.download = `camy-export.${formatType}`;
  link.href = off.toDataURL(`image/${formatType}`, formatType === 'jpeg' || formatType === 'webp' ? 0.92 : undefined);
  link.click();
  toast('Image exported!', 'download');
  exportBtn.disabled = false;
});

/* =====================================================
   RESIZE HANDLER
   ===================================================== */
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (currentImage) renderCanvas(); }, 120);
});

/* =====================================================
   KEYBOARD SHORTCUTS
   ===================================================== */
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedTxt) removeTextBtn.click();
  }
  if (e.key === 'Escape') {
    if (activePanel === 'crop') { cancelCropBtn.click(); }
    textItems.forEach(t => t.el && t.el.classList.remove('selected'));
    selectedTxt = null;
  }
});
