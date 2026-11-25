/* IWH Certificate Generator - admin logic
 * Runs entirely in the browser. No backend, no uploads to any server.
 * Uses: QRCode (qrcode.js), PDFLib (pdf-lib), JSZip, FileSaver
 */

(function(){
'use strict';

// ---------- Constants ----------
const BASE_URL = 'https://verify-heightsafety.vercel.app';
const DEFAULT_DESIGNATION = 'Rope Access Technician';

// A4 portrait in points (1pt = 1/72 inch)
const PAGE_W = 595.28;
const PAGE_H = 841.89;

// Demo-derived QR placement (fractions of page)
const QR_LEFT_FRAC = 0.11;
const QR_SIZE_FRAC = 0.12;
const QR_TOP_FRAC  = 0.50;

// ---------- State ----------
let members = [];        // loaded from /members.json
let currentPngFile = null;   // single mode
let currentPngBytes = null;  // single mode (ArrayBuffer)
let batchPngFiles = [];      // batch mode
let csvFile = null;          // batch mode
let lastGenerated = null;    // { member, pdfBytes, qrBytes, pageHtml }

// ---------- Utils ----------
function regToSlug(reg){
  return String(reg).trim().replace(/\s+/g,'').replace(/\//g,'-').replace(/[^A-Za-z0-9\-]/g,'');
}

function escapeHtml(s){
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function dataUrlToBytes(dataUrl){
  const base64 = dataUrl.split(',')[1];
  const bin = atob(base64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for(let i=0;i<len;i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBlob(bytes, type){
  return new Blob([bytes], {type: type});
}

function toast(msg, type){
  let t = document.querySelector('.toast');
  if(!t){
    t = document.createElement('div');
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' '+type : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>{ t.className = 'toast'; }, 2800);
}

function isoDate(s){
  // Validate YYYY-MM-DD
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Date must be YYYY-MM-DD: '+s);
  return s;
}

// ---------- Templates ----------
const MEMBER_PAGE_TPL = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Member Verification</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#FFFFFF;color:#8A8A8A;font-family:Roboto,Arial,system-ui,-apple-system,sans-serif;font-weight:400;font-size:14px;line-height:1.4;-webkit-font-smoothing:antialiased;}
  body{padding:16px 12px;}
  .top-rule{border-top:1px solid #E0E0E0;margin-bottom:36px;}
  .row{display:flex;align-items:flex-start;margin-bottom:32px;}
  .row .label{width:48%;color:#8A8A8A;font-weight:400;}
  .row .value{width:52%;color:#8A8A8A;font-weight:400;}
  .section-header{font-weight:700;color:#8A8A8A;margin-top:8px;margin-bottom:20px;}
  .sub-table{display:flex;margin-top:4px;}
  .sub-table .col{width:52%;}
  .sub-table .col:first-child{width:48%;}
  .sub-header{color:#8A8A8A;font-weight:400;margin-bottom:28px;}
  .sub-value{color:#8A8A8A;font-weight:400;}
</style>
</head>
<body>
  <div class="top-rule"></div>
  <div class="row"><div class="label">Member Name</div><div class="value">__NAME__</div></div>
  <div class="row"><div class="label">ID Number</div><div class="value">__ID__</div></div>
  <div class="row"><div class="label">Member Status</div><div class="value"></div></div>
  <div class="section-header">Designations</div>
  <div class="sub-table">
    <div class="col"><div class="sub-header">Name</div><div class="sub-value">__DESIGNATION__</div></div>
    <div class="col"><div class="sub-header">Expiry</div><div class="sub-value">__EXPIRY__</div></div>
  </div>
</body>
</html>`;

const LANDING_PAGE_TPL = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Member Verification</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#FFFFFF;color:#8A8A8A;font-family:Roboto,Arial,system-ui,-apple-system,sans-serif;font-weight:400;font-size:14px;line-height:1.4;-webkit-font-smoothing:antialiased;}
  body{padding:16px 12px;}
  .top-rule{border-top:1px solid #E0E0E0;margin-bottom:36px;}
  .row{display:flex;align-items:flex-start;margin-bottom:32px;}
  .row .label{width:48%;color:#8A8A8A;font-weight:400;}
  .row .value{width:52%;color:#8A8A8A;font-weight:400;}
  .row .value a{color:#8A8A8A;text-decoration:none;}
  .row .value a:hover{text-decoration:underline;}
  .section-header{font-weight:700;color:#8A8A8A;margin-top:8px;margin-bottom:20px;}
  .sub-table{display:flex;margin-top:4px;}
  .sub-table .col{width:52%;}
  .sub-table .col:first-child{width:48%;}
  .sub-header{color:#8A8A8A;font-weight:400;margin-bottom:28px;}
  .sub-value{color:#8A8A8A;font-weight:400;}
  .member-block{margin-bottom:48px;}
  .member-block:last-child{margin-bottom:0;}
</style>
</head>
<body>
  <div class="top-rule"></div>
__MEMBER_BLOCKS__
</body>
</html>`;

const MEMBER_BLOCK_TPL = `  <div class="member-block">
    <div class="row"><div class="label">Member Name</div><div class="value"><a href="__SLUG__/">__NAME__</a></div></div>
    <div class="row"><div class="label">ID Number</div><div class="value">__ID__</div></div>
    <div class="row"><div class="label">Member Status</div><div class="value"></div></div>
    <div class="section-header">Designations</div>
    <div class="sub-table">
      <div class="col"><div class="sub-header">Name</div><div class="sub-value">__DESIGNATION__</div></div>
      <div class="col"><div class="sub-header">Expiry</div><div class="sub-value">__EXPIRY__</div></div>
    </div>
  </div>
`;

function renderMemberPage(m){
  return MEMBER_PAGE_TPL
    .replace('__NAME__', escapeHtml(m.name))
    .replace('__ID__', escapeHtml(m.id_number))
    .replace('__DESIGNATION__', escapeHtml(m.designation || DEFAULT_DESIGNATION))
    .replace('__EXPIRY__', escapeHtml(m.expiry_date));
}

function renderLandingPage(members){
  const blocks = members.map(m =>
    MEMBER_BLOCK_TPL
      .replace('__SLUG__', escapeHtml(regToSlug(m.registration)))
      .replace('__NAME__', escapeHtml(m.name))
      .replace('__ID__', escapeHtml(m.id_number))
      .replace('__DESIGNATION__', escapeHtml(m.designation || DEFAULT_DESIGNATION))
      .replace('__EXPIRY__', escapeHtml(m.expiry_date))
  ).join('\n');
  return LANDING_PAGE_TPL.replace('__MEMBER_BLOCKS__', blocks);
}

function renderMembersJson(members){
  return JSON.stringify(members, null, 2);
}

// ---------- Generators ----------

function generateQrPngBytes(url){
  // qrcode-generator API: qrcode(typeNumber, errorCorrectionLevel)
  // typeNumber 0 = auto-fit, 'M' = ~15% redundancy
  // We render the QR matrix to a canvas and export as real PNG
  // (qrcode-generator's createDataURL returns GIF, which pdf-lib rejects).
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const cellSize = 10;
  const margin = 4; // quiet zone modules
  const totalSize = (moduleCount + margin * 2) * cellSize;

  const canvas = document.createElement('canvas');
  canvas.width = totalSize;
  canvas.height = totalSize;
  const ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, totalSize, totalSize);

  // Black modules
  ctx.fillStyle = '#000000';
  for(let r = 0; r < moduleCount; r++){
    for(let c = 0; c < moduleCount; c++){
      if(qr.isDark(r, c)){
        ctx.fillRect(
          (c + margin) * cellSize,
          (r + margin) * cellSize,
          cellSize, cellSize
        );
      }
    }
  }

  const dataUrl = canvas.toDataURL('image/png');
  return Promise.resolve(dataUrlToBytes(dataUrl));
}

async function generateStampedPdf(pngBytes, member){
  const { PDFDocument } = PDFLib;
  const pdfDoc = await PDFDocument.create();

  // Decide orientation based on image aspect
  let img;
  // Try PNG first, fall back to JPG
  try {
    img = await pdfDoc.embedPng(pngBytes);
  } catch(e) {
    img = await pdfDoc.embedJpg(pngBytes);
  }

  const iw = img.width, ih = img.height;
  const aspect = iw / ih;
  let pageW, pageH;
  if(aspect >= 1){
    pageW = 841.89; pageH = 595.28; // A4 landscape
  } else {
    pageW = PAGE_W; pageH = PAGE_H; // A4 portrait
  }
  const page = pdfDoc.addPage([pageW, pageH]);

  // Fit image with margin
  const margin = 18;
  const scale = Math.min((pageW - 2*margin)/iw, (pageH - 2*margin)/ih);
  const drawW = iw * scale;
  const drawH = ih * scale;
  const x = (pageW - drawW) / 2;
  const y = (pageH - drawH) / 2;
  page.drawImage(img, { x, y, width: drawW, height: drawH });

  // Generate QR
  const slug = regToSlug(member.registration);
  const url = `${BASE_URL}/cert/${slug}`;
  const qrBytes = await generateQrPngBytes(url);
  const qrImg = await pdfDoc.embedPng(qrBytes);

  // Place at demo position
  const qrSize = QR_SIZE_FRAC * pageW;
  const qrX = QR_LEFT_FRAC * pageW;
  const qrY = pageH - (QR_TOP_FRAC * pageH) - qrSize;
  page.drawImage(qrImg, { x: qrX, y: qrY, width: qrSize, height: qrSize });

  const pdfBytes = await pdfDoc.save();
  return { pdfBytes, qrBytes, url };
}

// ---------- Members loading ----------
async function loadMembers(){
  try {
    const res = await fetch('../members.json', { cache: 'no-store' });
    if(!res.ok){
      if(res.status === 404) return [];
      throw new Error('HTTP '+res.status);
    }
    return await res.json();
  } catch(e) {
    console.warn('Could not load members.json:', e);
    return [];
  }
}

function renderMembersTable(){
  const tbody = document.getElementById('members-tbody');
  if(!members.length){
    tbody.innerHTML = `<tr><td colspan="6" class="ta-c muted">No members registered yet. Add one from the "Add Member" tab.</td></tr>`;
    return;
  }
  const sorted = [...members].sort((a,b)=>a.name.localeCompare(b.name));
  tbody.innerHTML = sorted.map(m => {
    const slug = regToSlug(m.registration);
    return `
      <tr>
        <td>${escapeHtml(m.name)}</td>
        <td class="id-cell">${escapeHtml(m.id_number)}</td>
        <td>${escapeHtml(m.registration)}</td>
        <td>${escapeHtml(m.expiry_date)}</td>
        <td class="slug-cell">${escapeHtml(slug)}</td>
        <td class="ta-r">
          <div class="row-actions">
            <button data-action="download-page" data-slug="${escapeHtml(slug)}">Page</button>
            <button data-action="remove" data-slug="${escapeHtml(slug)}" class="danger">Remove</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ---------- Tab navigation ----------
function switchTab(name){
  document.querySelectorAll('.tab').forEach(t=>{
    t.classList.toggle('active', t.dataset.tab === name);
  });
  document.querySelectorAll('.panel').forEach(p=>{
    p.hidden = p.id !== 'tab-'+name;
  });
}

// ---------- Dropzone wiring ----------
function wireDropzone(zoneEl, inputEl, onFiles, multiple){
  const handle = (files) => {
    if(!files || !files.length) return;
    if(multiple) onFiles(Array.from(files));
    else onFiles(files[0]);
  };
  zoneEl.addEventListener('click', e=>{
    if(e.target.tagName !== 'INPUT') inputEl.click();
  });
  inputEl.addEventListener('change', e=> handle(e.target.files));
  ['dragenter','dragover'].forEach(ev=>{
    zoneEl.addEventListener(ev, e=>{
      e.preventDefault(); e.stopPropagation();
      zoneEl.classList.add('drag');
    });
  });
  ['dragleave','drop'].forEach(ev=>{
    zoneEl.addEventListener(ev, e=>{
      e.preventDefault(); e.stopPropagation();
      zoneEl.classList.remove('drag');
    });
  });
  zoneEl.addEventListener('drop', e=> handle(e.dataTransfer.files));
}

// ---------- Single mode ----------
function handleSinglePng(file){
  if(!file) return;
  if(!/^image\/(png|jpeg)$/.test(file.type)){
    toast('Please choose a PNG or JPEG image', 'error');
    return;
  }
  currentPngFile = file;
  const reader = new FileReader();
  reader.onload = () => {
    currentPngBytes = reader.result;
    const preview = document.getElementById('png-preview');
    const img = document.getElementById('png-preview-img');
    img.src = reader.result;
    preview.hidden = false;
  };
  reader.readAsArrayBuffer(file);
  toast('Image loaded: '+file.name, 'success');
}

function clearSinglePng(){
  currentPngFile = null;
  currentPngBytes = null;
  document.getElementById('png-preview').hidden = true;
  document.getElementById('png-input').value = '';
}

function updateSlugPreview(){
  const reg = document.getElementById('f-reg').value;
  const slug = reg ? regToSlug(reg) : '';
  document.getElementById('slug-preview').textContent = slug
    ? 'URL slug: '+slug+'  →  '+BASE_URL+'/cert/'+slug
    : 'URL slug: —';
}

async function handleSingleSubmit(e){
  e.preventDefault();
  if(!currentPngBytes){
    toast('Please choose a PNG first', 'error');
    return;
  }
  const name = document.getElementById('f-name').value.trim();
  const id = document.getElementById('f-id').value.trim();
  const reg = document.getElementById('f-reg').value.trim();
  const issue = document.getElementById('f-issue').value;
  const expiry = document.getElementById('f-expiry').value;
  const designation = document.getElementById('f-designation').value.trim() || DEFAULT_DESIGNATION;
  const serial = document.getElementById('f-serial').value.trim();

  if(!name || !id || !reg || !issue || !expiry){
    toast('Please fill all required fields', 'error');
    return;
  }
  try { isoDate(issue); isoDate(expiry); }
  catch(err){ toast(err.message, 'error'); return; }

  const btn = document.getElementById('single-generate');
  btn.disabled = true; btn.textContent = 'Generating…';

  try {
    const member = {
      name, id_number: id, registration: reg,
      issue_date: issue, expiry_date: expiry,
      designation, serial,
      png_path: currentPngFile ? currentPngFile.name : ''
    };

    const { pdfBytes, qrBytes, url } = await generateStampedPdf(currentPngBytes, member);
    const pageHtml = renderMemberPage(member);

    // Build updated members list (replace existing with same slug, else append)
    const slug = regToSlug(reg);
    const others = members.filter(m => regToSlug(m.registration) !== slug);
    const updatedMembers = [...others, member].sort((a,b)=>a.name.localeCompare(b.name));
    const updatedJson = renderMembersJson(updatedMembers);
    const updatedLanding = renderLandingPage(updatedMembers);

    lastGenerated = { member, pdfBytes, qrBytes, pageHtml, updatedJson, updatedLanding, slug, url };

    // Show results
    showSingleResults();
    toast('Generated. Download below.', 'success');
  } catch(err){
    console.error(err);
    toast('Generation failed: '+err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Generate & Download';
  }
}

function showSingleResults(){
  const card = document.getElementById('single-results');
  card.hidden = false;

  // Render PDF preview onto a canvas
  // (We'll render the QR + a thumbnail of the PNG since we can't easily render
  // the PDF in-browser without a heavy PDF viewer. Instead, show the PNG thumb.)
  const canvas = document.getElementById('result-canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.onload = () => {
    const maxW = 240, maxH = 340;
    const scale = Math.min(maxW/img.width, maxH/img.height);
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };
  img.src = currentPngBytes instanceof ArrayBuffer
    ? URL.createObjectURL(new Blob([currentPngBytes]))
    : URL.createObjectURL(currentPngFile);

  document.getElementById('result-hint').textContent =
    'QR encodes: '+lastGenerated.url;
  card.scrollIntoView({behavior:'smooth', block:'start'});
}

function downloadSingle(kind){
  if(!lastGenerated) return;
  const { member, pdfBytes, qrBytes, pageHtml, updatedJson, updatedLanding, slug } = lastGenerated;

  if(kind === 'pdf'){
    saveAs(bytesToBlob(pdfBytes, 'application/pdf'), `${slug}_with_qr.pdf`);
  } else if(kind === 'qr'){
    saveAs(bytesToBlob(qrBytes, 'image/png'), `qr_${slug}.png`);
  } else if(kind === 'page'){
    saveAs(new Blob([pageHtml], {type:'text/html'}), `index.html`);
  } else if(kind === 'zip'){
    downloadFullProjectZip([member]);
  }
}

async function downloadFullProjectZip(extraMembers){
  // Build a zip with the full vercel-verify project state:
  // - index.html (landing, regenerated)
  // - members.json (updated)
  // - cert/<slug>/index.html for each member
  // - vercel.json (unchanged, only if we have it)
  // - admin/* (the admin UI, only if we have it)
  const zip = new JSZip();

  // Combine existing members with any new ones
  const existingBySlug = new Map(members.map(m => [regToSlug(m.registration), m]));
  for(const m of extraMembers || []){
    existingBySlug.set(regToSlug(m.registration), m);
  }
  const allMembers = Array.from(existingBySlug.values()).sort((a,b)=>a.name.localeCompare(b.name));

  zip.file('index.html', renderLandingPage(allMembers));
  zip.file('members.json', renderMembersJson(allMembers));

  const certFolder = zip.folder('cert');
  for(const m of allMembers){
    const slug = regToSlug(m.registration);
    certFolder.folder(slug).file('index.html', renderMemberPage(m));
  }

  // Try to include vercel.json if it exists in the project
  try {
    const vres = await fetch('../vercel.json');
    if(vres.ok){
      zip.file('vercel.json', await vres.text());
    }
  } catch(e){ /* ignore */ }

  // Try to include the admin folder (so the zip is a complete project)
  try {
    const ares = await fetch('index.html');
    if(ares.ok){
      const adminFolder = zip.folder('admin');
      adminFolder.file('index.html', await ares.text());
      const cres = await fetch('admin.css');
      if(cres.ok) adminFolder.file('admin.css', await cres.text());
      const jres = await fetch('admin.js');
      if(jres.ok) adminFolder.file('admin.js', await jres.text());
    }
  } catch(e){ /* ignore */ }

  // For members that were just generated (in extraMembers), include their stamped PDF + QR
  for(const m of extraMembers || []){
    const slug = regToSlug(m.registration);
    if(lastGenerated && regToSlug(lastGenerated.member.registration) === slug){
      // The just-generated one — we have bytes in memory
      zip.file(`${slug}_with_qr.pdf`, lastGenerated.pdfBytes);
      zip.file(`qr_${slug}.png`, lastGenerated.qrBytes);
    }
  }

  const blob = await zip.generateAsync({type:'blob'});
  saveAs(blob, 'vercel-verify.zip');
  toast('Project zip downloaded', 'success');
}

// ---------- Batch mode ----------
function handleBatchPngs(files){
  batchPngFiles = files;
  const c = document.getElementById('batch-png-count');
  c.textContent = files.length
    ? `${files.length} file${files.length>1?'s':''} selected: ` + files.map(f=>f.name).join(', ').slice(0,120)
    : 'No files selected yet';
}

function handleCsv(file){
  if(!file) return;
  csvFile = file;
  document.getElementById('csv-name').textContent = file.name;
}

function parseCsv(text){
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if(!lines.length) throw new Error('CSV is empty');
  const headers = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
  const required = ['png','name','id','reg','issue','expiry'];
  const missing = required.filter(r => !headers.includes(r));
  if(missing.length) throw new Error('CSV missing columns: '+missing.join(', '));

  const rows = [];
  for(let i=1; i<lines.length; i++){
    const cells = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => row[h] = (cells[idx] || '').trim());
    // Validate dates
    try { isoDate(row.issue); isoDate(row.expiry); }
    catch(e){ throw new Error(`CSV row ${i+1}: ${e.message}`); }
    if(!row.designation) row.designation = DEFAULT_DESIGNATION;
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line){
  // Simple CSV parser supporting quoted values with commas
  const out = [];
  let cur = '', inQ = false;
  for(let i=0; i<line.length; i++){
    const ch = line[i];
    if(inQ){
      if(ch === '"' && line[i+1] === '"'){ cur+='"'; i++; }
      else if(ch === '"'){ inQ = false; }
      else cur += ch;
    } else {
      if(ch === '"') inQ = true;
      else if(ch === ','){ out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

async function handleBatchSubmit(e){
  e.preventDefault();
  if(!batchPngFiles.length){
    toast('Please select PNG files first', 'error'); return;
  }
  if(!csvFile){
    toast('Please select a CSV file', 'error'); return;
  }

  const btn = document.getElementById('batch-generate');
  btn.disabled = true; btn.textContent = 'Processing…';
  const logCard = document.getElementById('batch-log-card');
  const log = document.getElementById('batch-log');
  log.innerHTML = '';
  logCard.hidden = false;

  const logLine = (msg, cls) => {
    const div = document.createElement('div');
    div.className = 'line ' + (cls || '');
    div.textContent = msg;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  };

  try {
    const text = await csvFile.text();
    const rows = parseCsv(text);
    logLine(`Loaded ${rows.length} member rows from CSV`, 'info');
    logLine(`Loaded ${batchPngFiles.length} PNG files`, 'info');

    // Match each row to a PNG file by filename
    const pngByName = new Map(batchPngFiles.map(f => [f.name.toLowerCase(), f]));
    const pngByBasename = new Map(batchPngFiles.map(f => [f.name.split('/').pop().toLowerCase(), f]));

    const newMembers = [];
    const filesForZip = []; // {slug, pdfBytes, qrBytes, member}

    for(let i=0; i<rows.length; i++){
      const row = rows[i];
      const wanted = row.png.toLowerCase();
      const file = pngByName.get(wanted) || pngByBasename.get(wanted.split(/[\\/]/).pop());
      if(!file){
        logLine(`Row ${i+1}: ${row.name} — PNG not found: ${row.png}`, 'err');
        continue;
      }
      try {
        const bytes = await file.arrayBuffer();
        const member = {
          name: row.name,
          id_number: row.id,
          registration: row.reg,
          issue_date: row.issue,
          expiry_date: row.expiry,
          designation: row.designation,
          serial: row.serial || '',
          png_path: row.png
        };
        const { pdfBytes, qrBytes } = await generateStampedPdf(bytes, member);
        const slug = regToSlug(row.reg);
        filesForZip.push({ slug, pdfBytes, qrBytes, member });
        newMembers.push(member);
        logLine(`Row ${i+1}: ${row.name} (${slug}) — OK`, 'ok');
      } catch(err){
        logLine(`Row ${i+1}: ${row.name} — ${err.message}`, 'err');
      }
    }

    if(!newMembers.length){
      logLine('No members generated. Check CSV and filenames.', 'err');
      return;
    }

    // Build updated members list
    const existingBySlug = new Map(members.map(m => [regToSlug(m.registration), m]));
    for(const m of newMembers){
      existingBySlug.set(regToSlug(m.registration), m);
    }
    const allMembers = Array.from(existingBySlug.values()).sort((a,b)=>a.name.localeCompare(b.name));

    // Build zip
    logLine('Building project zip…', 'info');
    const zip = new JSZip();
    zip.file('index.html', renderLandingPage(allMembers));
    zip.file('members.json', renderMembersJson(allMembers));
    const certFolder = zip.folder('cert');
    for(const m of allMembers){
      const slug = regToSlug(m.registration);
      certFolder.folder(slug).file('index.html', renderMemberPage(m));
    }
    // Add stamped PDFs + QR PNGs at root
    for(const f of filesForZip){
      zip.file(`${f.slug}_with_qr.pdf`, f.pdfBytes);
      zip.file(`qr_${f.slug}.png`, f.qrBytes);
    }
    // Try to include vercel.json
    try {
      const vres = await fetch('../vercel.json');
      if(vres.ok) zip.file('vercel.json', await vres.text());
    } catch(e){}

    // Try to include admin folder
    try {
      const ares = await fetch('index.html');
      if(ares.ok){
        const adminFolder = zip.folder('admin');
        adminFolder.file('index.html', await ares.text());
        const cres = await fetch('admin.css');
        if(cres.ok) adminFolder.file('admin.css', await cres.text());
        const jres = await fetch('admin.js');
        if(jres.ok) adminFolder.file('admin.js', await jres.text());
      }
    } catch(e){}

    const blob = await zip.generateAsync({type:'blob'});
    saveAs(blob, 'vercel-verify-batch.zip');

    document.getElementById('batch-summary').textContent =
      `Generated ${newMembers.length} of ${rows.length} members. Zip downloaded.`;
    logLine(`Done. ${newMembers.length} members added to project zip.`, 'ok');
    toast('Batch zip downloaded', 'success');

    // Update in-memory members list and re-render table
    members = allMembers;
    renderMembersTable();
  } catch(err){
    logLine('ERROR: '+err.message, 'err');
    toast('Batch failed: '+err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Process All & Download Zip';
  }
}

// ---------- Members tab actions ----------
async function handleMembersTableClick(e){
  const btn = e.target.closest('button');
  if(!btn) return;
  const slug = btn.dataset.slug;
  if(!slug) return;

  if(btn.dataset.action === 'remove'){
    if(!confirm('Remove this member from the registry? Their verification page and stamped PDF will be removed from the project zip.')) return;
    members = members.filter(m => regToSlug(m.registration) !== slug);
    renderMembersTable();
    // Rebuild members.json + landing + remove the cert page
    const zip = new JSZip();
    zip.file('index.html', renderLandingPage(members));
    zip.file('members.json', renderMembersJson(members));
    const certFolder = zip.folder('cert');
    for(const m of members){
      certFolder.folder(regToSlug(m.registration)).file('index.html', renderMemberPage(m));
    }
    try {
      const vres = await fetch('../vercel.json');
      if(vres.ok) zip.file('vercel.json', await vres.text());
    } catch(e){}
    try {
      const ares = await fetch('index.html');
      if(ares.ok){
        const adminFolder = zip.folder('admin');
        adminFolder.file('index.html', await ares.text());
        const cres = await fetch('admin.css');
        if(cres.ok) adminFolder.file('admin.css', await cres.text());
        const jres = await fetch('admin.js');
        if(jres.ok) adminFolder.file('admin.js', await jres.text());
      }
    } catch(e){}
    const blob = await zip.generateAsync({type:'blob'});
    saveAs(blob, 'vercel-verify.zip');
    toast('Member removed. Updated project zip downloaded.', 'success');
  } else if(btn.dataset.action === 'download-page'){
    const m = members.find(m => regToSlug(m.registration) === slug);
    if(m){
      saveAs(new Blob([renderMemberPage(m)], {type:'text/html'}), 'index.html');
    }
  }
}

// ---------- Init ----------
function init(){
  // Tabs
  document.querySelectorAll('.tab').forEach(t=>{
    t.addEventListener('click', () => switchTab(t.dataset.tab));
  });

  // Single dropzone
  wireDropzone(
    document.getElementById('dropzone'),
    document.getElementById('png-input'),
    handleSinglePng,
    false
  );
  document.getElementById('png-clear').addEventListener('click', clearSinglePng);

  // Slug preview
  document.getElementById('f-reg').addEventListener('input', updateSlugPreview);

  // Single form submit
  document.getElementById('single-form').addEventListener('submit', handleSingleSubmit);
  document.getElementById('single-reset').addEventListener('click', () => {
    document.getElementById('single-form').reset();
    clearSinglePng();
    document.getElementById('single-results').hidden = true;
    updateSlugPreview();
  });

  // Result download buttons
  document.querySelectorAll('[data-download]').forEach(btn=>{
    btn.addEventListener('click', () => downloadSingle(btn.dataset.download));
  });

  // Batch dropzones
  wireDropzone(
    document.getElementById('batch-dropzone'),
    document.getElementById('batch-png-input'),
    handleBatchPngs,
    true
  );
  wireDropzone(
    document.getElementById('csv-dropzone'),
    document.getElementById('csv-input'),
    handleCsv,
    false
  );
  document.getElementById('batch-form').addEventListener('submit', handleBatchSubmit);
  document.getElementById('batch-reset').addEventListener('click', () => {
    batchPngFiles = [];
    csvFile = null;
    document.getElementById('batch-png-input').value = '';
    document.getElementById('csv-input').value = '';
    document.getElementById('batch-png-count').textContent = 'No files selected yet';
    document.getElementById('csv-name').textContent = 'No CSV selected';
    document.getElementById('batch-log-card').hidden = true;
  });

  // Members
  document.getElementById('members-tbody').addEventListener('click', handleMembersTableClick);
  document.getElementById('members-reload').addEventListener('click', async () => {
    members = await loadMembers();
    renderMembersTable();
    toast('Members reloaded', 'success');
  });
  document.getElementById('members-download-all').addEventListener('click', () => downloadFullProjectZip([]));

  // Initial load
  loadMembers().then(m => {
    members = m;
    renderMembersTable();
  });
}

document.addEventListener('DOMContentLoaded', init);
})();
