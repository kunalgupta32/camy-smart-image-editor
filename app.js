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
const vignetteLayer= document.getElementById('vignetteLayer');
const textLayer    = document.getElementById('textLayer');
const cropOverlay  = document.getElementById('cropOverlay');
const compareSlider= document.getElementById('compareSlider');
const compareCanvas= document.getElementById('compareCanvas');
const cmpCtx       = compareCanvas.getContext('2d');
const toastRoot    = document.getElementById('toastRoot');

/* ── Tabs & Panels ── */
const tabs   = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');

/* ── Adjustment sliders ── */
const slBrightness = document.getElementById('brightness');
const slContrast   = document.getElementById('contrast');
const slSaturation = document.getElementById('saturation');
const slBlur       = document.getElementById('blurSlider');
const valB = document.getElementById('bVal');
const valC = document.getElementById('cVal');
const valS = document.getElementById('sVal');
const valBl= document.getElementById('blurVal');

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

/* =====================================================
   STATE
   ===================================================== */
let originalImage = null;    // ImageBitmap of the uploaded file
let currentImage  = null;    // ImageBitmap after transforms/crop applied
let scale = 1;               // canvas display scale

const adj = { brightness: 100, contrast: 100, saturation: 100, blur: 0 };
const tfm = { rotation: 0, flipH: false, flipV: false };
let vigIntensity = 0;

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
let cmpX = 0.5; // 0..1 fraction

/* Active panel */
let activePanel = 'adjust';

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

function getCSSFilter() {
  return `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%) blur(${adj.blur}px)`;
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
    renderCanvas();
    uploadScreen.classList.add('out');
    editorEl.classList.remove('hidden');
    toast('Image loaded!', 'image');
  } catch(e) { toast('Could not load image.', 'error'); }
}

function resetState() {
  adj.brightness = 100; adj.contrast = 100; adj.saturation = 100; adj.blur = 0;
  slBrightness.value = 100; slContrast.value = 100; slSaturation.value = 100; slBlur.value = 0;
  valB.textContent = 100; valC.textContent = 100; valS.textContent = 100; valBl.textContent = 0;
  tfm.rotation = 0; tfm.flipH = false; tfm.flipV = false;
  vigIntensity = 0; vigSlider.value = 0; vigVal.textContent = 0;
  updateVignette();
  rotDisplay.textContent = '0°';
  textItems = []; textLayer.innerHTML = ''; selectedTxt = null;
  textControls.classList.add('hidden');
  undoStack.length = 0; redoStack.length = 0;
  updateUndoRedo();
  exitCompare();
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
  compareCanvas.width  = w;
  compareCanvas.height = h;
}

function renderCanvas() {
  if (!currentImage) return;
  fitCanvas();
  ctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
  ctx.filter = getCSSFilter();
  ctx.drawImage(currentImage, 0, 0, mainCanvas.width, mainCanvas.height);
  ctx.filter = 'none';
  if (compareMode) renderCompare();
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
}
bindSlider(slBrightness, valB, 'brightness');
bindSlider(slContrast,   valC, 'contrast');
bindSlider(slSaturation, valS, 'saturation');
bindSlider(slBlur, valBl, 'blur');

/* =====================================================
   UNDO / REDO
   ===================================================== */
async function pushUndo() {
  const bmp = await createImageBitmap(currentImage);
  undoStack.push(bmp);
  if (undoStack.length > 30) undoStack.shift();
  redoStack.length = 0;
  updateUndoRedo();
}

function updateUndoRedo() {
  undoBtn.disabled = undoStack.length === 0;
  redoBtn.disabled = redoStack.length === 0;
}

undoBtn.addEventListener('click', async () => {
  if (!undoStack.length) return;
  redoStack.push(await createImageBitmap(currentImage));
  currentImage = undoStack.pop();
  renderCanvas();
  updateUndoRedo();
  toast('Undo', 'undo');
});

redoBtn.addEventListener('click', async () => {
  if (!redoStack.length) return;
  undoStack.push(await createImageBitmap(currentImage));
  currentImage = redoStack.pop();
  renderCanvas();
  updateUndoRedo();
  toast('Redo', 'redo');
});

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undoBtn.click(); }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redoBtn.click(); }
});

/* =====================================================
   TRANSFORMS
   ===================================================== */
async function applyTransform(drawFn) {
  await pushUndo();
  const offscreen = document.createElement('canvas');
  const w = currentImage.width, h = currentImage.height;
  const oCtx = offscreen.getContext('2d');
  // draw with current filters to bake them in before geometric transform
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  const tCtx = tmp.getContext('2d');
  tCtx.filter = getCSSFilter();
  tCtx.drawImage(currentImage, 0, 0);
  tCtx.filter = 'none';
  const filtered = await createImageBitmap(tmp);

  drawFn(offscreen, oCtx, filtered, w, h);
  currentImage = await createImageBitmap(offscreen);
  // reset adjustments after baking
  adj.brightness = 100; adj.contrast = 100; adj.saturation = 100; adj.blur = 0;
  slBrightness.value = 100; slContrast.value = 100; slSaturation.value = 100; slBlur.value = 0;
  valB.textContent = 100; valC.textContent = 100; valS.textContent = 100; valBl.textContent = 0;
  renderCanvas();
}

rotLBtn.addEventListener('click', () => {
  tfm.rotation = (tfm.rotation - 90 + 360) % 360;
  rotDisplay.textContent = tfm.rotation + '°';
  applyTransform((canvas, c, src, w, h) => {
    canvas.width = h; canvas.height = w;
    c.translate(0, w); c.rotate(-Math.PI / 2); c.drawImage(src, 0, 0, w, h);
  });
});
rotRBtn.addEventListener('click', () => {
  tfm.rotation = (tfm.rotation + 90) % 360;
  rotDisplay.textContent = tfm.rotation + '°';
  applyTransform((canvas, c, src, w, h) => {
    canvas.width = h; canvas.height = w;
    c.translate(h, 0); c.rotate(Math.PI / 2); c.drawImage(src, 0, 0, w, h);
  });
});
flipHBtn.addEventListener('click', () => {
  tfm.flipH = !tfm.flipH;
  applyTransform((canvas, c, src, w, h) => {
    canvas.width = w; canvas.height = h;
    c.translate(w, 0); c.scale(-1, 1); c.drawImage(src, 0, 0, w, h);
  });
});
flipVBtn.addEventListener('click', () => {
  tfm.flipV = !tfm.flipV;
  applyTransform((canvas, c, src, w, h) => {
    canvas.width = w; canvas.height = h;
    c.translate(0, h); c.scale(1, -1); c.drawImage(src, 0, 0, w, h);
  });
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
  await pushUndo();
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
   COMPARE SLIDER
   ===================================================== */
const cmpDivider = document.querySelector('.cmp-divider');

function enterCompare() {
  compareMode = true;
  cmpX = 0.5;
  compareSlider.classList.remove('hidden');
  renderCompare();
  positionCmpDivider();
}
function exitCompare() {
  compareMode = false;
  compareSlider.classList.add('hidden');
}

function renderCompare() {
  if (!originalImage) return;
  cmpCtx.clearRect(0, 0, compareCanvas.width, compareCanvas.height);
  cmpCtx.drawImage(originalImage, 0, 0, compareCanvas.width, compareCanvas.height);
  const clipW = cmpX * compareCanvas.width;
  compareCanvas.style.clipPath = `inset(0 ${Math.round((1 - cmpX) * 100)}% 0 0)`;
  positionCmpDivider();
}
function positionCmpDivider() {
  cmpDivider.style.left = (cmpX * 100) + '%';
}

/* Drag compare divider */
let cmpDragging = false;
cmpDivider.addEventListener('mousedown', e => { cmpDragging = true; e.preventDefault(); });
cmpDivider.addEventListener('touchstart', () => { cmpDragging = true; }, { passive: true });
document.addEventListener('mousemove', e => {
  if (!cmpDragging || !compareMode) return;
  const rect = compareSlider.getBoundingClientRect();
  cmpX = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0.02), 0.98);
  renderCompare();
});
document.addEventListener('touchmove', e => {
  if (!cmpDragging || !compareMode) return;
  const rect = compareSlider.getBoundingClientRect();
  cmpX = Math.min(Math.max((e.touches[0].clientX - rect.left) / rect.width, 0.02), 0.98);
  renderCompare();
}, { passive: true });
document.addEventListener('mouseup',  () => { cmpDragging = false; });
document.addEventListener('touchend', () => { cmpDragging = false; });

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

  if (name === 'crop') { enterCrop(); }
  else { exitCrop(); }

  if (name === 'compare') { enterCompare(); }
  else { exitCompare(); }
}

/* =====================================================
   RESET & AUTO ENHANCE
   ===================================================== */
resetBtn.addEventListener('click', () => {
  if (!originalImage) return;
  currentImage = originalImage;
  resetState();
  renderCanvas();
  toast('All edits reset', 'refresh');
});

enhanceBtn.addEventListener('click', async () => {
  if (!currentImage) return;
  // Simple auto-enhance: boost brightness/contrast/saturation slightly
  adj.brightness = 110; adj.contrast = 115; adj.saturation = 120;
  slBrightness.value = 110; slContrast.value = 115; slSaturation.value = 120;
  valB.textContent = 110; valC.textContent = 115; valS.textContent = 120;
  renderCanvas();
  toast('Auto Enhanced!', 'auto_awesome');
});

/* =====================================================
   EXPORT
   ===================================================== */
exportBtn.addEventListener('click', async () => {
  if (!currentImage) return;
  exportBtn.disabled = true;

  const off = document.createElement('canvas');
  off.width  = currentImage.width;
  off.height = currentImage.height;
  const oCtx = off.getContext('2d');

  // Draw base image with adjustments
  oCtx.filter = getCSSFilter();
  oCtx.drawImage(currentImage, 0, 0);
  oCtx.filter = 'none';

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

  // Text overlays — scale from display size to real image size
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
  link.download = 'camy-export.png';
  link.href = off.toDataURL('image/png');
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
