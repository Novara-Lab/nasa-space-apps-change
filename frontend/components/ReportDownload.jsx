// download the report as a pdf

function ReportDownloadButton({ job }) {
  const [state, setState] = React.useState({ busy: false, step: '', error: '' });

  async function download() {
    if (state.busy) return;
    setState({ busy: true, step: 'Preparing report…', error: '' });
    try {
      await buildChangeReportPdf(job, step => setState(s => ({ ...s, step })));
      setState({ busy: false, step: '', error: '' });
    } catch (e) {
      setState({ busy: false, step: '', error: `Could not create the report: ${e.message}` });
    }
  }

  return (
    <div className="report-download">
      <button type="button" className="download-btn" onClick={download} disabled={state.busy}
        title="Download this report as a PDF, with the location map and both radar images">
        {state.busy ? <><span className="spinner" /> {state.step}</> : <>⬇ Download report (PDF)</>}
      </button>
      {state.error && <p className="error small" role="alert">{state.error}</p>}
    </div>
  );
}

// helpers

const RPT = {
  navy: [11, 27, 50], text: [30, 41, 59], muted: [100, 116, 139], line: [226, 232, 240],
  teal: [40, 241, 214], tealDark: [13, 148, 136], soft: [241, 245, 249],
  up: [37, 99, 235], down: [220, 38, 38],
  level: { low: [22, 163, 74], medium: [217, 119, 6], high: [220, 38, 38], shift: [99, 102, 241] },
};

// pdf font has no arrows etc
function pdfText(value) {
  return String(value ?? '')
    .replace(/→/g, 'to').replace(/[−–—]/g, '-').replace(/≈/g, '~').replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"').replace(/…/g, '...').replace(/•/g, '-').replace(/✓/g, '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');
}

function loadImage(src, cors) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed: ${src}`));
    img.src = src;
  });
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

// logo svg to png
async function loadLogos() {
  const svg = await (await fetch('assets/logo-wordmark-dark.svg')).text();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = await loadImage(url, false);
    const scale = 1.2;
    const full = document.createElement('canvas');
    full.width = 1251 * scale; full.height = 353 * scale;
    full.getContext('2d').drawImage(img, 0, 0, full.width, full.height);
    const icon = document.createElement('canvas');
    icon.width = 430 * scale; icon.height = 353 * scale; // icon only
    icon.getContext('2d').drawImage(img, 0, 0, 430, 353, 0, 0, icon.width, icon.height);
    return { wordmark: full.toDataURL('image/png'), icon: icon.toDataURL('image/png') };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// lat/lon to map pixels
function mercX(lon, z) { return (lon + 180) / 360 * 256 * 2 ** z; }
function mercY(lat, z) {
  const r = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 256 * 2 ** z;
}

// map image from osm tiles
async function renderMap({ bounds, lat, lon, padRatio, overlay, hotspots, maxPx = 900 }) {
  const [[s, w], [n, e]] = bounds;
  const latPad = (n - s) * padRatio, lonPad = (e - w) * padRatio;
  const S = s - latPad, N = n + latPad, W = w - lonPad, E = e + lonPad;
  let z = 17;
  while (z > 2 && Math.max(mercX(E, z) - mercX(W, z), mercY(S, z) - mercY(N, z)) > maxPx) z--;

  const x0 = mercX(W, z), x1 = mercX(E, z), y0 = mercY(N, z), y1 = mercY(S, z);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(x1 - x0); canvas.height = Math.round(y1 - y0);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e5e7eb'; ctx.fillRect(0, 0, canvas.width, canvas.height);

  const tiles = [];
  for (let tx = Math.floor(x0 / 256); tx <= Math.floor(x1 / 256); tx++) {
    for (let ty = Math.floor(y0 / 256); ty <= Math.floor(y1 / 256); ty++) {
      tiles.push(withTimeout(loadImage(`https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`, true), 10000)
        .then(img => ctx.drawImage(img, tx * 256 - x0, ty * 256 - y0))
        .catch(() => { /* leave grey */ }));
    }
  }
  await Promise.all(tiles);

  const px = (la, lo) => [mercX(lo, z) - x0, mercY(la, z) - y0];
  const [ax, ay] = px(n, w), [bx, by] = px(s, e);

  if (overlay) {
    ctx.globalAlpha = 0.92;
    ctx.drawImage(overlay, ax, ay, bx - ax, by - ay);
    ctx.globalAlpha = 1;
  }
  // analysed square
  ctx.lineWidth = 3; ctx.strokeStyle = '#0B1B32'; ctx.setLineDash([10, 6]);
  ctx.strokeRect(ax, ay, bx - ax, by - ay); ctx.setLineDash([]);

  // place pin
  const [lx, ly] = px(lat, lon);
  ctx.beginPath(); ctx.arc(lx, ly, 9, 0, Math.PI * 2);
  ctx.fillStyle = '#28F1D6'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#0B1B32'; ctx.stroke();

  (hotspots || []).forEach((h, i) => {
    const [hx, hy] = px(h.lat, h.lon);
    ctx.beginPath(); ctx.arc(hx, hy, 13, 0, Math.PI * 2);
    ctx.fillStyle = h.direction === 'brighter' ? '#2563eb' : '#dc2626'; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), hx, hy + 1);
  });

  // osm credit
  ctx.font = '12px system-ui, sans-serif';
  const attr = '© OpenStreetMap contributors';
  const aw = ctx.measureText(attr).width + 10;
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(canvas.width - aw, canvas.height - 18, aw, 18);
  ctx.fillStyle = '#334155'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(attr, canvas.width - aw + 5, canvas.height - 9);

  return { data: canvas.toDataURL('image/jpeg', 0.9), w: canvas.width, h: canvas.height };
}

// radar image (smaller so pdf is not too big)
function renderRadar(img) {
  const scale = Math.min(1, 700 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0B1B32'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { data: canvas.toDataURL('image/jpeg', 0.82), w: canvas.width, h: canvas.height };
}

function slug(s) {
  return pdfText(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'location';
}

function fmtUtc(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : `${formatDay(v)}, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}

// build the pdf

async function buildChangeReportPdf(job, onStep) {
  if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('PDF library did not load. Check your internet connection and reload.');
  const r = job.report;
  const shift = r.level === 'shift';
  const bounds = job.bounds;

  onStep('Loading images…');
  const [logos, imgA, imgB, imgChange] = await Promise.all([
    loadLogos().catch(() => null),
    loadImage(`/api/analysis/${job.id}/a.png`, false).catch(() => null),
    loadImage(`/api/analysis/${job.id}/b.png`, false).catch(() => null),
    loadImage(`/api/analysis/${job.id}/image.png`, false).catch(() => null),
  ]);

  onStep('Drawing maps…');
  const [locMap, changeMap] = await Promise.all([
    renderMap({ bounds, lat: job.lat, lon: job.lon, padRatio: 1.6, maxPx: 800 }).catch(() => null),
    renderMap({ bounds, lat: job.lat, lon: job.lon, padRatio: 0.06, overlay: imgChange, hotspots: r.hotspots, maxPx: 1100 }).catch(() => null),
  ]);
  const radarA = imgA ? renderRadar(imgA) : null;
  const radarB = imgB ? renderRadar(imgB) : null;

  onStep('Getting weather…');
  const [wA, wB] = await Promise.all([job.granule_a.start, job.granule_b.start].map(t =>
    withTimeout(api.weather(job.lat, job.lon, t), 12000).catch(() => null)));

  onStep('Writing PDF…');
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const PW = 210, PH = 297, M = 16, CW = PW - 2 * M, BOTTOM = PH - 18;
  let y = M;

  const color = (c, kind = 'text') => {
    if (kind === 'text') doc.setTextColor(...c);
    else if (kind === 'fill') doc.setFillColor(...c);
    else doc.setDrawColor(...c);
  };
  const font = (size, style = 'normal', c = RPT.text) => { doc.setFont('helvetica', style); doc.setFontSize(size); color(c); };
  const newPage = () => { doc.addPage(); y = M + 4; };
  const ensure = h => { if (y + h > BOTTOM) newPage(); };
  const lineH = size => size * 0.42;

  function para(text, { size = 10, style = 'normal', c = RPT.text, x = M, width = CW, gap = 2 } = {}) {
    font(size, style, c);
    const lines = doc.splitTextToSize(pdfText(text), width);
    lines.forEach(l => { ensure(lineH(size) + 1); doc.text(l, x, y + lineH(size)); y += lineH(size) + 0.9; });
    y += gap;
  }

  function bullets(items, { size = 9.5, c = RPT.text } = {}) {
    items.forEach(item => {
      font(size, 'normal', c);
      const lines = doc.splitTextToSize(pdfText(item), CW - 6);
      ensure(lines.length * (lineH(size) + 0.9));
      color(RPT.tealDark, 'fill'); doc.circle(M + 1.6, y + lineH(size) * 0.6, 0.8, 'F');
      lines.forEach(l => { doc.text(l, M + 5, y + lineH(size)); y += lineH(size) + 0.9; });
      y += 1;
    });
    y += 1;
  }

  function heading(text, keepWith = 30) {
    ensure(12 + keepWith);
    y += 3;
    color(RPT.teal, 'fill'); doc.rect(M, y, 1.4, 6, 'F');
    font(13, 'bold', RPT.navy); doc.text(pdfText(text), M + 4, y + 4.8);
    y += 10;
  }

  // table
  function table(head, rows, widths, { size = 9 } = {}) {
    const ws = widths || head.map(() => CW / head.length);
    const pad = 1.7;
    const rowH = cells => Math.max(...cells.map((c, i) => doc.splitTextToSize(pdfText(c), ws[i] - 2 * pad).length)) * (lineH(size) + 0.8) + 2 * pad;
    const drawRow = (cells, isHead, shade) => {
      font(size, isHead ? 'bold' : 'normal', isHead ? [255, 255, 255] : RPT.text);
      const h = rowH(cells);
      ensure(h);
      if (isHead) { color(RPT.navy, 'fill'); doc.rect(M, y, CW, h, 'F'); }
      else if (shade) { color(RPT.soft, 'fill'); doc.rect(M, y, CW, h, 'F'); }
      let x = M;
      cells.forEach((c, i) => {
        const lines = doc.splitTextToSize(pdfText(c), ws[i] - 2 * pad);
        lines.forEach((l, k) => doc.text(l, x + pad, y + pad + lineH(size) * 0.85 + k * (lineH(size) + 0.8)));
        x += ws[i];
      });
      y += h;
      color(RPT.line, 'draw'); doc.setLineWidth(0.2); doc.line(M, y, M + CW, y);
    };
    font(size, 'normal');
    const total = (head ? [head] : []).concat(rows).reduce((sum, cells) => sum + rowH(cells), 0);
    if (total < 90) ensure(total);
    if (head) drawRow(head, true);
    rows.forEach((row, i) => drawRow(row, false, i % 2 === 1));
    y += 4;
  }

  function image(img, x, w, caption) {
    const h = w * img.h / img.w;
    doc.addImage(img.data, 'JPEG', x, y, w, h);
    color(RPT.line, 'draw'); doc.setLineWidth(0.3); doc.rect(x, y, w, h);
    if (caption) { font(8.5, 'normal', RPT.muted); doc.text(doc.splitTextToSize(pdfText(caption), w), x, y + h + 4); }
    return h;
  }

  // header
  if (logos) doc.addImage(logos.wordmark, 'PNG', M, y, 62, 62 * 353 / 1251);
  else { font(16, 'bold', RPT.navy); doc.text('NISAR Change Explorer', M, y + 10); }
  font(9, 'bold', RPT.tealDark); doc.text('CHANGE REPORT', PW - M, y + 6, { align: 'right' });
  font(8.5, 'normal', RPT.muted);
  doc.text(`Created ${new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`, PW - M, y + 11, { align: 'right' });
  doc.text('Provisional NISAR data', PW - M, y + 15.5, { align: 'right' });
  y += 62 * 353 / 1251 + 4;
  color(RPT.teal, 'fill'); doc.rect(M, y, CW, 1.2, 'F');
  y += 9;

  // title
  font(22, 'bold', RPT.navy); doc.text('What happened here?', M, y); y += 7;
  para(job.place || 'Selected location', { size: 11.5, style: 'bold', c: RPT.text, gap: 0.5 });
  para(`${job.lat.toFixed(5)}, ${job.lon.toFixed(5)}   |   ${formatDay(r.period.from)} to ${formatDay(r.period.to)} (${r.period.days} days)`,
    { size: 9.5, c: RPT.muted, gap: 5 });

  // verdict box
  const lvl = RPT.level[r.level] || RPT.tealDark;
  font(13, 'bold'); const hl = doc.splitTextToSize(pdfText(r.headline), CW - 12);
  font(9.5); const hint = doc.splitTextToSize(pdfText(levelHint(r.level)), CW - 12);
  const boxH = hl.length * 5.6 + hint.length * 4.2 + 8;
  color(lvl.map(v => Math.round(v + (255 - v) * 0.9)), 'fill'); doc.roundedRect(M, y, CW, boxH, 2, 2, 'F');
  color(lvl, 'fill'); doc.rect(M, y, 2, boxH, 'F');
  let by = y + 7;
  font(13, 'bold', RPT.navy); hl.forEach(l => { doc.text(l, M + 7, by); by += 5.6; });
  font(9.5, 'normal', RPT.text); hint.forEach(l => { doc.text(l, M + 7, by); by += 4.2; });
  y += boxH + 6;

  para(r.summary, { size: 10.5, gap: 4 });

  // stat tiles
  const changedPct = shift ? r.local_changed_pct : r.changed.total_pct;
  const tiles = [
    [`${changedPct}%`, shift ? 'changed locally' : 'of the area changed', RPT.navy],
    [`${r.changed.brighter_ha} ha`, 'got brighter', RPT.up],
    [`${r.changed.darker_ha} ha`, 'got darker', RPT.down],
  ];
  const tw = (CW - 8) / 3;
  ensure(22);
  tiles.forEach(([big, small, c], i) => {
    const x = M + i * (tw + 4);
    color(RPT.soft, 'fill'); doc.roundedRect(x, y, tw, 19, 2, 2, 'F');
    font(16, 'bold', c); doc.text(pdfText(big), x + tw / 2, y + 9, { align: 'center' });
    font(8.5, 'normal', RPT.muted); doc.text(pdfText(small), x + tw / 2, y + 15, { align: 'center' });
  });
  y += 25;

  // location
  heading('Location', 80);
  const details = [
    ['Place', job.place || '-'],
    ['Coordinates', `${job.lat.toFixed(5)}, ${job.lon.toFixed(5)}`],
    ['Area checked', `About ${(((bounds[1][1] - bounds[0][1]) * 111.32 * Math.cos(job.lat * Math.PI / 180))).toFixed(1)} x ${((bounds[1][0] - bounds[0][0]) * 110.57).toFixed(1)} km square around the place`],
    ['Before image', `${fmtUtc(job.granule_a.start)} (${String(job.granule_a.maturity).toLowerCase()})`],
    ['After image', `${fmtUtc(job.granule_b.start)} (${String(job.granule_b.maturity).toLowerCase()})`],
    ['Time between', `${r.period.days} days`],
    ['Radar', `NISAR, ${job.polarisation || '-'} polarisation, ${job.spacing_m ? job.spacing_m[0] : '-'} m pixels`],
    ['Good pixels', job.stats ? `${job.stats.valid_pixels.toLocaleString('en-GB')} of ${job.stats.total_pixels.toLocaleString('en-GB')}` : '-'],
  ];
  const mapW = 82, tableX = M + mapW + 6, tableW = CW - mapW - 6;
  const startY = y;
  let mapH = 0;
  if (locMap) mapH = image(locMap, M, mapW, 'Teal pin = your selected place. Dashed square = area that was analysed.') + 6;
  let ty = startY;
  details.forEach(([k, v]) => {
    font(8, 'bold', RPT.muted); doc.text(pdfText(k).toUpperCase(), tableX, ty + 3);
    font(9.5, 'normal', RPT.text);
    const lines = doc.splitTextToSize(pdfText(v), tableW);
    lines.forEach((l, i) => doc.text(l, tableX, ty + 7.5 + i * 4.2));
    ty += 7.5 + lines.length * 4.2 + 1.5;
  });
  y = Math.max(startY + mapH, ty) + 2;

  // radar images
  newPage();
  heading('The two radar images');
  para('Each image shows how strongly the ground reflected the radar signal. Bright = strong echo (buildings, rough or wet ground, vegetation). Dark = weak echo (calm water, smooth or dry ground).',
    { size: 9.5, c: RPT.muted, gap: 3 });
  const halfW = (CW - 6) / 2;
  if (radarA || radarB) {
    font(10, 'bold', RPT.navy);
    doc.text(`Before - ${pdfText(formatDay(job.granule_a.start))}`, M, y + 3);
    doc.text(`After - ${pdfText(formatDay(job.granule_b.start))}`, M + halfW + 6, y + 3);
    y += 6;
    const top = y;
    const hA = radarA ? image(radarA, M, halfW) : 0;
    y = top;
    const hB = radarB ? image(radarB, M + halfW + 6, halfW) : 0;
    y = top + Math.max(hA, hB) + 8;
  } else {
    para('The radar images could not be loaded.', { c: RPT.muted });
  }

  // change map
  const changeW = changeMap ? Math.min(CW, 92 * changeMap.w / changeMap.h) : 0;
  heading('Change map', changeMap ? changeW * changeMap.h / changeMap.w + 20 : 20);
  para('After minus Before. Blue = the signal got stronger, red = it got weaker. Numbered circles are the hotspots listed below.',
    { size: 9.5, c: RPT.muted, gap: 3 });
  if (changeMap) {
    const w = changeW;
    const h = image(changeMap, M + (CW - w) / 2, w);
    y += h + 4;
    // legend
    const stops = [[103, 0, 31], [214, 96, 77], [247, 247, 247], [67, 147, 195], [5, 48, 97]];
    const rw = 90, rx = M + (CW - rw) / 2, steps = 60;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1) * (stops.length - 1), k = Math.min(Math.floor(t), stops.length - 2), f = t - k;
      color(stops[k].map((v, j) => Math.round(v + (stops[k + 1][j] - v) * f)), 'fill');
      doc.rect(rx + i * rw / steps, y, rw / steps + 0.1, 3.5, 'F');
    }
    font(8, 'normal', RPT.muted);
    doc.text('-6 dB (darker)', rx, y + 7.5); doc.text('0', rx + rw / 2, y + 7.5, { align: 'center' });
    doc.text('+6 dB (brighter)', rx + rw, y + 7.5, { align: 'right' });
    y += 13;
  }

  // hotspots
  heading(`Hotspots to look at (${r.hotspots.length})`);
  if (r.hotspots.length === 0) {
    para('No compact clusters of change. Changes are scattered, which usually means noise or gradual change.', { c: RPT.muted });
  } else {
    table(['#', 'Where (from the place)', 'What changed', 'Area', 'Strength', 'Coordinates'],
      r.hotspots.map((h, i) => [
        String(i + 1), `${h.distance_km} km ${h.bearing}`,
        h.relative ? `${h.direction} than surroundings` : `got ${h.direction}`,
        `${h.area_ha} ha`, `${h.mean_db > 0 ? '+' : ''}${h.mean_db} dB`, `${h.lat.toFixed(5)}, ${h.lon.toFixed(5)}`,
      ]), [9, 40, 40, 20, 22, CW - 131]);
  }

  // zones
  const cell = 19;
  heading('Where in the area?', cell * 3 + 12);
  para('The analysed square split into nine parts, north at the top. Darker yellow = more of that part changed.', { size: 9.5, c: RPT.muted, gap: 3 });
  const maxZone = Math.max(...r.zones.map(z => z.changed_pct || 0), 10);
  const gx = M + (CW - cell * 3) / 2;
  ensure(cell * 3 + 6);
  r.zones.forEach((z, i) => {
    const cx = gx + (i % 3) * cell, cy = y + Math.floor(i / 3) * cell;
    const a = 0.08 + 0.7 * (z.changed_pct || 0) / maxZone;
    color([250, 204, 21].map(v => Math.round(255 + (v - 255) * a)), 'fill');
    color([255, 255, 255], 'draw'); doc.setLineWidth(0.8);
    doc.rect(cx, cy, cell, cell, 'FD');
    font(7, 'normal', RPT.muted); doc.text(pdfText(z.name), cx + cell / 2, cy + 6.5, { align: 'center' });
    font(11, 'bold', RPT.navy); doc.text(z.changed_pct == null ? '-' : `${z.changed_pct}%`, cx + cell / 2, cy + 13.5, { align: 'center' });
  });
  y += cell * 3 + 8;

  // before vs after
  const ba = r.before_after;
  heading('Before vs after', 30);
  table(['', 'Before', 'After'], [
    ['Typical brightness', `${ba.median_db_before} dB`, `${ba.median_db_after} dB`],
    ['Very dark area (often water)', `${ba.very_dark_pct_before}%`, `${ba.very_dark_pct_after}%`],
    ['Clearly brighter (> 3 dB)', '-', job.stats ? `${job.stats.pct_increase_gt3db}% of the area` : '-'],
    ['Clearly darker (> 3 dB)', '-', job.stats ? `${job.stats.pct_decrease_gt3db}% of the area` : '-'],
  ], [CW * 0.46, CW * 0.27, CW * 0.27]);

  // weather
  if (wA || wB) {
    heading('Weather at the place before each image', 58);
    para('Rain and soil moisture change radar brightness, so check these before reading too much into the change.', { size: 9.5, c: RPT.muted, gap: 3 });
    const wv = (w, f) => (w ? f(w) : 'n/a');
    table(['', `Before (${pdfText(formatDay(job.granule_a.start))})`, `After (${pdfText(formatDay(job.granule_b.start))})`], [
      ['Rain on the day', wv(wA, w => `${w.rainDay} mm`), wv(wB, w => `${w.rainDay} mm`)],
      ['Rain in the 7 days before', wv(wA, w => `${w.rain7} mm (${rainWord(w.rain7)})`), wv(wB, w => `${w.rain7} mm (${rainWord(w.rain7)})`)],
      ['Rain in the 30 days before', wv(wA, w => `${w.rain30} mm`), wv(wB, w => `${w.rain30} mm`)],
      ['Temperature (min / max)', wv(wA, w => `${w.tmin} / ${w.tmax} °C`), wv(wB, w => `${w.tmin} / ${w.tmax} °C`)],
      ['Topsoil moisture', wv(wA, w => w.soil == null ? 'unknown' : `${w.soil} m³/m³ (${soilWord(w.soil)})`),
        wv(wB, w => w.soil == null ? 'unknown' : `${w.soil} m³/m³ (${soilWord(w.soil)})`)],
    ], [CW * 0.36, CW * 0.32, CW * 0.32]);
  }

  // causes and notes
  if (r.possible_causes.length > 0) {
    heading('What could cause this?', 25);
    para('Radar alone cannot tell which of these happened. Treat them as ideas to check.', { size: 9.5, c: RPT.muted, gap: 2 });
    r.possible_causes.forEach(c => {
      para(c.pattern, { size: 10, style: 'bold', c: RPT.navy, gap: 1 });
      bullets(c.examples);
    });
  }
  if (r.next_steps.length) { heading('How to check it', 20); bullets(r.next_steps); }
  const notes = [...r.notes, ...(job.cautions || []), ...(job.warnings || [])];
  if (notes.length) { heading(`Things to keep in mind (${notes.length})`, 20); bullets(notes, { c: RPT.muted }); }

  // disclaimer
  font(9); const disc = doc.splitTextToSize(pdfText('This is a provisional radar signal change measured by NISAR (provisional data). It does not confirm damage, flooding or ground movement. Always check on the ground or with other sources before acting on it.'), CW - 10);
  const dh = disc.length * 4.2 + 8;
  ensure(dh + 4);
  y += 2;
  color([254, 249, 195], 'fill'); doc.roundedRect(M, y, CW, dh, 2, 2, 'F');
  font(9, 'normal', [113, 63, 18]); disc.forEach((l, i) => doc.text(l, M + 5, y + 6 + i * 4.2));
  y += dh + 5;
  para('Data: NISAR radar (NASA/ISRO) via the Alaska Satellite Facility · Image search: NASA CMR · Map: © OpenStreetMap contributors · Weather: Open-Meteo. Analysis ID: ' + job.id,
    { size: 8, c: RPT.muted });

  // footer
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    color(RPT.line, 'draw'); doc.setLineWidth(0.3); doc.line(M, PH - 13, PW - M, PH - 13);
    if (logos) doc.addImage(logos.icon, 'PNG', M, PH - 11.2, 7.3, 6);
    font(8, 'normal', RPT.muted);
    doc.text('NISAR Change Explorer  ·  Novara Labs  ·  NASA Space Apps', M + (logos ? 9 : 0), PH - 7);
    doc.text(`Page ${p} of ${pages}`, PW - M, PH - 7, { align: 'right' });
  }

  doc.save(`NISAR-change-report_${slug(job.place)}_${String(r.period.from).slice(0, 10)}_to_${String(r.period.to).slice(0, 10)}.pdf`);
}
