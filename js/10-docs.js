// Floorboard — 10-docs.js · production documents
// One vector PDF engine for every producer document (prop list, gear list,
// budget, shot list, call sheet): real text, real tables, A4 margins that
// use the page, a header in the production's own colour with its logo, and
// a footer with page numbers. Style lives in project.production.brand
// (accent, header style, footer line) so every export looks like one set.
'use strict';

// ---------------------------------------------------------------- brand
function docBrand(){
  if(typeof normalizeProduction === 'function') normalizeProduction();
  const P = project.production || (project.production = {});
  P.brand = P.brand || {};
  return {
    accent: P.brand.accent || '#4B6BFB',
    style: P.brand.style || 'band',          // 'band' | 'minimal'
    footer: P.brand.footer || '',
    logo: P.logo || null,
    company: P.company || '',
    email: P.email || '', phone: P.phone || ''
  };
}
function hexRGB(hex){
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if(!m) return [0.29, 0.42, 0.98];
  const v = parseInt(m[1], 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}
const DOC_INK = [0.16, 0.16, 0.15], DOC_INK2 = [0.45, 0.43, 0.40], DOC_LINE = [0.86, 0.85, 0.83], DOC_SOFT = [0.965, 0.96, 0.95];

// Helvetica advance widths (AFM, per 1000) for 32..126 — real wrapping instead of 0.52·size guesses
const HELV_W = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const WINANSI = {'€':0x80, '…':0x85, '‘':0x91, '’':0x92, '“':0x93, '”':0x94, '•':0x95, '–':0x96, '—':0x97, '™':0x99, 'Œ':0x8C, 'œ':0x9C, 'Š':0x8A, 'š':0x9A, 'Ž':0x8E, 'ž':0x9E, 'Ÿ':0x9F, '‰':0x89, '˜':0x98, '†':0x86, '‡':0x87, '‹':0x8B, '›':0x9B};
function docBytes(s){ // JS string → WinAnsi byte string
  let out = '';
  for(const ch of String(s ?? '')){
    const cp = ch.codePointAt(0);
    if(cp < 0x80) out += ch;
    else if(cp >= 0xA0 && cp <= 0xFF) out += ch;
    else if(WINANSI[ch]) out += String.fromCharCode(WINANSI[ch]);
    else if(cp === 0x2192) out += '>';   // →
    else if(cp === 0x2713 || cp === 0x2714) out += 'v';
    else out += '?';
  }
  return out;
}
function docEsc(s){ return docBytes(s).replace(/[\\()]/g, m=>'\\' + m).replace(/[\r\n]/g, ' '); }
function docTW(s, size, bold){
  let w = 0;
  for(const ch of docBytes(s)){
    const c = ch.charCodeAt(0);
    w += (c >= 32 && c <= 126) ? HELV_W[c - 32] : 556;
  }
  return w / 1000 * size * (bold ? 1.05 : 1);
}
function docWrap(s, width, size, bold){
  const out = [];
  for(const para of String(s ?? '').split('\n')){
    let line = '';
    for(const w of para.split(/\s+/)){
      if(!w) continue;
      const t = line ? line + ' ' + w : w;
      if(docTW(t, size, bold) > width && line){ out.push(line); line = w; }
      else line = t;
    }
    out.push(line);
  }
  return out.length ? out : [''];
}

// ---------------------------------------------------------------- engine
function DocPDF(opts){
  const o = opts || {};
  this.land = !!o.landscape;
  this.W = this.land ? 842 : 595; this.H = this.land ? 595 : 842;
  this.M = o.margin || 42;
  this.brand = docBrand();
  this.title = o.title || 'Document';
  this.pages = []; this.c = ''; this.xobjs = {}; this.annots = []; this.imgN = 0;
  this.y = this.H - this.M;
  this.pageNo = 0;
}
DocPDF.prototype.rg = function(c){ return c.map(v=>v.toFixed(3)).join(' '); };
DocPDF.prototype.contentW = function(){ return this.W - this.M * 2; };
DocPDF.prototype.newPage = function(){
  if(this.pageNo) this.pages.push({c:this.c, xobjs:this.xobjs, annots:this.annots});
  this.c = ''; this.xobjs = {}; this.annots = []; this.pageNo++;
  this.y = this.H - this.M;
  if(this.brand.style === 'band'){
    this.c += `${this.rg(hexRGB(this.brand.accent))} rg 0 ${this.H - 7} ${this.W} 7 re f\n`;
  }
  if(this.pageNo > 1){ // running head
    this.textAt(this.M, this.H - this.M + 14, this.title, 8, false, DOC_INK2);
    this.y -= 6;
  }
};
DocPDF.prototype.need = function(h){ if(this.y - h < this.M + 18) this.newPage(); };
DocPDF.prototype.textAt = function(x, y, s, size, bold, color, align, maxW){
  let txt = String(s ?? '');
  if(maxW != null) while(txt.length > 1 && docTW(txt, size, bold) > maxW) txt = txt.slice(0, -2) + '…';
  const w = docTW(txt, size, bold);
  const xx = align === 'r' ? x - w : align === 'c' ? x - w / 2 : x;
  this.c += `BT /F${bold ? 2 : 1} ${size} Tf ${this.rg(color || DOC_INK)} rg 1 0 0 1 ${xx.toFixed(2)} ${y.toFixed(2)} Tm (${docEsc(txt)}) Tj ET\n`;
  return w;
};
DocPDF.prototype.rect = function(x, y, w, h, fill, stroke, lw){
  if(fill) this.c += `${this.rg(fill)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f\n`;
  if(stroke) this.c += `${this.rg(stroke)} RG ${(lw || 0.6).toFixed(2)} w ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S\n`;
};
DocPDF.prototype.hline = function(y, color, lw, x0, x1){
  this.c += `${this.rg(color || DOC_LINE)} RG ${(lw || 0.6).toFixed(2)} w ${(x0 ?? this.M).toFixed(2)} ${y.toFixed(2)} m ${(x1 ?? (this.W - this.M)).toFixed(2)} ${y.toFixed(2)} l S\n`;
};
DocPDF.prototype.space = function(h){ this.y -= h; };
// JPEG image (imgCache entry or an <img>) — PNG/other sources are re-encoded on white
DocPDF.prototype.imageXobj = function(im){
  if(!im || !im.complete || !im.naturalWidth) return null;
  let src = im.src;
  if(!src.startsWith('data:image/jpeg')){
    try{
      const cv = document.createElement('canvas');
      cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(im, 0, 0);
      src = cv.toDataURL('image/jpeg', .9);
    }catch(_){ return null; }
  }
  const nm = 'I' + (++this.imgN);
  this.xobjs[nm] = {data:atob(src.split(',')[1]), w:im.naturalWidth, h:im.naturalHeight};
  return nm;
};
DocPDF.prototype.image = function(im, x, y, w, h){
  const nm = this.imageXobj(im);
  if(!nm) return false;
  this.c += `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /${nm} Do Q\n`;
  return true;
};
DocPDF.prototype.link = function(x, y, w, h, url){ this.annots.push({rect:[x, y, x + w, y + h], url}); };
// document head: production · title · meta line · logo right
DocPDF.prototype.head = function(title, subtitle, metaPairs){
  if(!this.pageNo) this.newPage();
  const B = this.brand, acc = hexRGB(B.accent);
  let logoH = 0;
  if(B.logo && window.imgCache && imgCache[B.logo]){
    const im = imgCache[B.logo];
    if(im.complete && im.naturalWidth){
      const k = Math.min(130 / im.naturalWidth, 44 / im.naturalHeight, 1);
      const lw = im.naturalWidth * k, lh = im.naturalHeight * k;
      if(this.image(im, this.W - this.M - lw, this.y - lh + 2, lw, lh)) logoH = lh;
    }
  }
  const prodName = project.shootName || 'Production';
  this.textAt(this.M, this.y - 8, prodName.toUpperCase(), 8.5, true, acc);
  this.y -= 26;
  this.textAt(this.M, this.y, title, 21, true, DOC_INK);
  this.y -= 8;
  if(subtitle){ this.y -= 12; this.textAt(this.M, this.y, subtitle, 10, false, DOC_INK2); }
  const meta = (metaPairs || []).filter(p=>p && p[1]);
  if(meta.length){
    this.y -= 14;
    let x = this.M;
    for(const [k, v] of meta){
      x += this.textAt(x, this.y, k.toUpperCase() + ' ', 7.5, true, DOC_INK2);
      x += this.textAt(x, this.y, String(v), 9, false, DOC_INK) + 14;
    }
  }
  this.y = Math.min(this.y, this.H - this.M - logoH - 4);
  this.y -= 12;
  if(B.style === 'minimal') this.hline(this.y, acc, 1.2, this.M, this.M + 46);
  else this.hline(this.y, DOC_LINE, 0.6);
  this.y -= 14;
};
DocPDF.prototype.section = function(title, right){
  this.need(34);
  const acc = hexRGB(this.brand.accent);
  this.y -= 6;
  this.textAt(this.M, this.y, String(title).toUpperCase(), 8, true, acc);
  if(right) this.textAt(this.W - this.M, this.y, right, 8.5, true, DOC_INK2, 'r');
  this.y -= 5;
  this.hline(this.y, DOC_LINE, 0.6);
  this.y -= 12;
};
DocPDF.prototype.text = function(s, opt){
  const o = opt || {}, size = o.size || 9.5, lh = size * 1.4, x = this.M + (o.indent || 0);
  for(const l of docWrap(s, this.contentW() - (o.indent || 0), size, o.bold)){
    this.need(lh);
    this.textAt(x, this.y - size + 2, l, size, o.bold, o.color || (o.dim ? DOC_INK2 : DOC_INK));
    this.y -= lh;
  }
  this.y -= o.gap || 0;
};
// a line with clickable substrings: segs = [{s,e,u}]
DocPDF.prototype.lineWithLinks = function(s, segs, opt){
  const o = opt || {}, size = o.size || 9.5, lh = size * 1.4;
  this.need(lh);
  const y = this.y - size + 2;
  const acc = hexRGB(this.brand.accent);
  let shown = String(s ?? '');
  while(shown.length > 1 && docTW(shown, size, o.bold) > this.contentW()) shown = shown.slice(0, -2) + '…';
  this.textAt(this.M + (o.indent || 0), y, shown, size, o.bold, o.color || DOC_INK);
  for(const sg of (segs || [])){
    if(!sg.u || sg.s >= shown.length) continue;
    const sub = shown.slice(sg.s, Math.min(sg.e, shown.length));
    const x0 = this.M + (o.indent || 0) + docTW(shown.slice(0, sg.s), size, o.bold);
    const sw = docTW(sub, size, o.bold);
    this.textAt(x0, y, sub, size, o.bold, acc);
    this.hline(y - 1.5, acc, 0.5, x0, x0 + sw);
    this.link(x0, y - 3, sw, size + 3, sg.u);
  }
  this.y -= lh;
};
// table: cols [{label, w?(pt), flex?, align:'l'|'r'|'c', bold?}], rows: [cells]; cell = string | {t, bold, dim, color, box:true|'checked', span:true, fill}
DocPDF.prototype.table = function(cols, rows, opt){
  const o = opt || {}, FS = o.fontSize || 9, LH = FS * 1.35, PAD = 5, PADY = 4;
  const cw = this.contentW();
  const fixed = cols.reduce((a, c)=>a + (c.w || 0), 0);
  const flexSum = cols.reduce((a, c)=>a + (c.w ? 0 : (c.flex || 1)), 0) || 1;
  const widths = cols.map(c=>c.w || (cw - fixed) * (c.flex || 1) / flexSum);
  const drawHead = ()=>{
    if(o.noHead) return;
    const h = FS * 1.35 + PADY * 2;
    this.need(h + LH);
    this.rect(this.M, this.y - h, cw, h, DOC_SOFT);
    let x = this.M;
    cols.forEach((c, i)=>{
      const ax = c.align === 'r' ? x + widths[i] - PAD : c.align === 'c' ? x + widths[i] / 2 : x + PAD;
      this.textAt(ax, this.y - PADY - FS + 1, (c.label || '').toUpperCase(), FS - 1.5, true, DOC_INK2, c.align, widths[i] - PAD * 2);
      x += widths[i];
    });
    this.y -= h;
  };
  drawHead();
  for(const row of rows){
    const cells = cols.map((c, i)=>{
      const v = row[i];
      const cell = (v && typeof v === 'object') ? v : {t:v == null ? '' : String(v)};
      const span = cell.span;
      const w = span ? cw : widths[i];
      cell.lines = cell.box && !cell.t ? [''] : docWrap(cell.t || '', w - PAD * 2, FS, cell.bold || c.bold);
      return cell;
    });
    const rh = Math.max(...cells.map(cl=>cl.lines.length)) * LH + PADY * 2;
    if(this.y - rh < this.M + 18){ this.newPage(); drawHead(); }
    const fill = cells[0].fill || (o.zebra && rows.indexOf(row) % 2 ? DOC_SOFT : null);
    if(fill) this.rect(this.M, this.y - rh, cw, rh, fill);
    let x = this.M;
    cells.forEach((cl, i)=>{
      const c = cols[i], w = cl.span ? cw : widths[i];
      if(cl.span && i) return;
      if(cl.box){
        const bx = x + PAD, by = this.y - PADY - FS + 1;
        this.rect(bx, by - 1, FS, FS, cl.box === 'checked' ? hexRGB(this.brand.accent) : null, cl.box === 'checked' ? null : DOC_INK2, 0.7);
        if(cl.box === 'checked'){
          this.c += `1 1 1 RG 1.2 w ${(bx + FS * .25).toFixed(1)} ${(by - 1 + FS * .5).toFixed(1)} m ${(bx + FS * .45).toFixed(1)} ${(by - 1 + FS * .25).toFixed(1)} l ${(bx + FS * .8).toFixed(1)} ${(by - 1 + FS * .8).toFixed(1)} l S\n`;
        }
      } else {
        const bold = cl.bold || c.bold, color = cl.color || (cl.dim ? DOC_INK2 : DOC_INK);
        const al = cl.span ? 'l' : c.align; // a spanning group row always reads from the left
        const ax = al === 'r' ? x + w - PAD : al === 'c' ? x + w / 2 : x + PAD;
        cl.lines.forEach((l, li)=>this.textAt(ax, this.y - PADY - FS + 1 - li * LH, l, FS, bold, color, al));
        if(cl.strike && cl.lines[0]){
          const tw = docTW(cl.lines[0], FS, bold), sx = c.align === 'r' ? ax - tw : ax;
          this.hline(this.y - PADY - FS / 2 - 0.5, DOC_INK2, 0.5, sx, sx + tw);
        }
      }
      x += w;
    });
    this.y -= rh;
    if(!o.noRules) this.hline(this.y, DOC_LINE, 0.4);
  }
  this.y -= 6;
};
DocPDF.prototype.totals = function(pairs, opt){ // right-aligned label/value block
  const o = opt || {}, FS = 9.5, LH = 15, labW = 130, valW = 90;
  const x1 = this.W - this.M, x0 = x1 - valW - labW;
  this.need(pairs.length * LH + 10);
  this.y -= 4;
  for(const [lab, val, strong] of pairs){
    if(strong) this.hline(this.y + 2, DOC_INK, 0.8, x0, x1);
    this.textAt(x1 - valW - 8, this.y - FS + 1, lab, FS, !!strong, strong ? DOC_INK : DOC_INK2, 'r');
    this.textAt(x1, this.y - FS + 1, val, strong ? 11 : FS, !!strong, DOC_INK, 'r');
    this.y -= LH;
  }
  this.y -= o.gap || 6;
};
DocPDF.prototype.blob = function(){
  if(this.pageNo) this.pages.push({c:this.c, xobjs:this.xobjs, annots:this.annots});
  const B = this.brand, n = this.pages.length;
  const objs = [], add = b=>{ objs.push(b); return objs.length; };
  add(null); add(null);
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids = [];
  this.pages.forEach((p, i)=>{
    // footer: company · footer line · page x / n
    const fy = this.M - 18;
    let foot = `0.6 w ${this.rg(DOC_LINE)} RG ${this.M} ${fy + 12} m ${this.W - this.M} ${fy + 12} l S\n`;
    const left = [B.company, B.footer].filter(Boolean).join('  ·  ') || (project.shootName || '');
    foot += `BT /F1 7.5 Tf ${this.rg(DOC_INK2)} rg 1 0 0 1 ${this.M} ${fy} Tm (${docEsc(left)}) Tj ET\n`;
    const pg = `${i + 1} / ${n}`;
    foot += `BT /F1 7.5 Tf ${this.rg(DOC_INK2)} rg 1 0 0 1 ${(this.W - this.M - docTW(pg, 7.5)).toFixed(2)} ${fy} Tm (${docEsc(pg)}) Tj ET\n`;
    const content = p.c + foot;
    const xo = Object.entries(p.xobjs).map(([nm, im])=>{
      const k = add({stream:im.data, dict:`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>`});
      return `/${nm} ${k} 0 R`;
    }).join(' ');
    const an = p.annots.map(a=>add(`<< /Type /Annot /Subtype /Link /Rect [${a.rect.map(v=>v.toFixed(2)).join(' ')}] /Border [0 0 0] /A << /S /URI /URI (${String(a.url).replace(/([\\()])/g, '\\$1')}) >> >>`));
    const cn = add({stream:content, dict:`<< /Length ${content.length} >>`});
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >>${xo ? ' /XObject << ' + xo + ' >>' : ''} >> /Contents ${cn} 0 R${an.length ? ' /Annots [' + an.map(k=>k + ' 0 R').join(' ') + ']' : ''} >>`));
  });
  objs[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[1] = `<< /Type /Pages /Kids [${kids.map(k=>k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offs = [];
  objs.forEach((ob, i)=>{
    offs.push(out.length);
    out += `${i + 1} 0 obj\n` + (typeof ob === 'string' ? ob + '\nendobj\n' : ob.dict + '\nstream\n' + ob.stream + '\nendstream\nendobj\n');
  });
  const xr = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offs.forEach(of=>{ out += String(of).padStart(10, '0') + ' 00000 n \n'; });
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF`;
  const bytes = new Uint8Array(out.length);
  for(let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xFF;
  return new Blob([bytes], {type:'application/pdf'});
};
function docFileName(kind){
  return ((project.shootName || 'production').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'production') + '_' + kind + '.pdf';
}
function docDateStr(d){
  if(!d) return '';
  try{ return new Date(d + 'T12:00:00').toLocaleDateString('nl-NL', {weekday:'long', day:'numeric', month:'long', year:'numeric'}); }
  catch(_){ return d; }
}
function todayStr(){ return new Date().toLocaleDateString('nl-NL', {day:'numeric', month:'long', year:'numeric'}); }

// ---------------------------------------------------------------- prop / gear list
function exportPropListPDF(o){
  const gear = o.cat === 'gearlist';
  const doc = new DocPDF({title:gear ? 'Gear list' : 'Prop list'});
  const groups = (gear ? gearListGroups : propListGroups)(o).filter(g=>g.rows.length);
  const total = groups.reduce((n, g)=>n + g.rows.length, 0);
  doc.head(gear ? 'Gear list' : 'Prop list', gear ? 'Cameras, grip and light per scene — tick when loaded' : 'What travels with us per scene — tick when packed',
    [['Date', todayStr()], ['Items', String(total)], ['Scenes', String(groups.length)]]);
  if(!groups.length) doc.text(gear ? 'No gear yet — place cameras and lights on the scene boards, or add rows on the card.' : 'Nothing on the list yet — add rows on the Prop list card or pick items from the scene boards.', {dim:true});
  for(const g of groups){
    doc.section(plSceneHead(g.s), g.rows.filter(r=>r.done).length + ' / ' + g.rows.length);
    doc.table([{label:'', w:22}, {label:'Item', flex:3}, {label:'Qty', w:44, align:'c'}, {label:'Notes', flex:2}],
      g.rows.map(r=>[{box:r.done ? 'checked' : true}, {t:r.name, strike:r.done, dim:r.done}, r.count > 1 ? '×' + r.count : (r.count === 1 ? '1' : ''), r.note || '']),
      {noHead:false});
  }
  dlBlob(docFileName(gear ? 'gear-list' : 'prop-list'), doc.blob());
  toast((gear ? 'Gear list' : 'Prop list') + ' PDF exported');
}

// ---------------------------------------------------------------- call sheet (vector)
function exportCallSheetDoc(o){
  if(typeof render === 'function') render(); // the renderer leaves head + sections on the card
  const head = o._csHead || [], secs = o._csSecs || [];
  const doc = new DocPDF({title:'Call sheet', margin:40});
  const day = typeof dayFor === 'function' ? dayFor(o) : null;
  const multi = !!o.allDays;
  doc.head('Call sheet' + (multi ? ' — all days' : ''), day && !multi ? docDateStr(day.date) : '', [
    day && !multi ? ['General call', day.call || '–'] : null,
    day && !multi ? ['Shooting call', day.shootCall || '–'] : null,
    day && !multi && day.wrap ? ['Est. wrap', day.wrap] : null]);
  for(const [k, t, sg] of head){
    if(k === 't') continue; // production title already in the head
    doc.lineWithLinks(t, sg, {size:k === 'b' ? 10 : 9.5, bold:k === 'b'});
  }
  doc.space(6);
  for(const [name, lines] of secs){
    if(name) doc.section(name);
    for(const [k, t, sg] of lines){
      if(k === 't'){ doc.need(30); doc.space(6); doc.text(t, {size:12, bold:true}); }
      else if(k === 'p') doc.text(t, {size:9, dim:true});
      else doc.lineWithLinks(t, sg, {size:9.5, bold:k === 'b', indent:k === 'b' ? 0 : 0});
    }
  }
  const nm = docFileName('callsheet' + (multi ? '_all-days' : (day && day.date ? '_' + day.date : '')));
  dlBlob(nm, doc.blob());
  toast('Call sheet PDF exported');
}

// ---------------------------------------------------------------- document style overlay
function docStyleOverlay(){
  const B = docBrand();
  const P = project.production;
  const swatches = [['#4B6BFB', 'Blue'], ...Object.entries(PAL).map(([k, v])=>[v, k]), ['#2B2A28', 'Ink']];
  const el = document.createElement('div');
  el.className = 'fb-ov';
  el.innerHTML = `
    <div class="fb-ov-box" style="width:520px">
      <div class="fb-ov-title">Document style</div>
      <div class="fb-ov-sub">Every exported PDF — prop list, gear list, budget, shot list, call sheet — uses this colour, logo and footer. Same look, your name on it.</div>
      <label class="fb-lab">Accent colour</label>
      <div class="fb-swatches">${swatches.map(([hex, nm])=>`<button class="fb-sw${B.accent.toLowerCase() === hex.toLowerCase() ? ' on' : ''}" data-hex="${hex}" title="${nm}" style="background:${hex}"></button>`).join('')}
        <label class="fb-sw-custom" title="Custom colour"><input type="color" id="dsCustom" value="${/^#[0-9a-f]{6}$/i.test(B.accent) ? B.accent : '#4B6BFB'}"><span>Custom</span></label></div>
      <label class="fb-lab">Header</label>
      <div class="fb-seg"><button data-style="band" class="${B.style === 'band' ? 'on' : ''}">Colour band</button><button data-style="minimal" class="${B.style === 'minimal' ? 'on' : ''}">Minimal</button></div>
      <label class="fb-lab">Logo</label>
      <div class="fb-row"><span id="dsLogoState" class="fb-dim">${B.logo ? 'Logo set — shows top-right on every document' : 'No logo yet'}</span>
        <button class="btn" id="dsLogo">${B.logo ? 'Replace…' : 'Choose…'}</button>${B.logo ? '<button class="btn" id="dsLogoRm">Remove</button>' : ''}</div>
      <label class="fb-lab">Company name</label>
      <input id="dsCompany" class="fb-inp" value="${esc(P.company || '')}" placeholder="Your production company">
      <label class="fb-lab">Footer line</label>
      <input id="dsFooter" class="fb-inp" value="${esc(B.footer)}" placeholder="e.g. KvK 12345678 · info@company.nl · +31 6 …">
      <div class="fb-ov-actions"><button class="btn" id="dsPreview">Preview PDF</button><span style="flex:1"></span><button class="btn primary" id="dsDone">Done</button></div>
    </div>`;
  document.body.appendChild(el);
  const save = ()=>{
    P.brand = P.brand || {};
    P.brand.footer = el.querySelector('#dsFooter').value.trim();
    P.company = el.querySelector('#dsCompany').value.trim();
    markDirty();
  };
  el.querySelectorAll('.fb-sw').forEach(b=>b.addEventListener('click', ()=>{
    P.brand.accent = b.dataset.hex; el.querySelectorAll('.fb-sw').forEach(x=>x.classList.toggle('on', x === b)); markDirty();
  }));
  el.querySelector('#dsCustom').addEventListener('input', e=>{ P.brand.accent = e.target.value; el.querySelectorAll('.fb-sw').forEach(x=>x.classList.remove('on')); markDirty(); });
  el.querySelectorAll('.fb-seg button').forEach(b=>b.addEventListener('click', ()=>{
    P.brand.style = b.dataset.style; el.querySelectorAll('.fb-seg button').forEach(x=>x.classList.toggle('on', x === b)); markDirty();
  }));
  el.querySelector('#dsLogo').addEventListener('click', ()=>{
    const fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*';
    fi.addEventListener('change', async ()=>{
      if(!fi.files || !fi.files[0]) return;
      try{ P.logo = await storeImageFile(fi.files[0]); markDirty(); el.querySelector('#dsLogoState').textContent = 'Logo set — shows top-right on every document'; if(typeof render === 'function') render(); }
      catch(_){ toast('Could not store that image — try a smaller one'); }
    });
    fi.click();
  });
  const rm = el.querySelector('#dsLogoRm');
  if(rm) rm.addEventListener('click', ()=>{ const old = P.logo; P.logo = null; if(typeof maybeDeleteImg === 'function') maybeDeleteImg(old); markDirty(); el.querySelector('#dsLogoState').textContent = 'No logo yet'; rm.remove(); });
  el.querySelector('#dsPreview').addEventListener('click', ()=>{
    save();
    const doc = new DocPDF({title:'Style preview'});
    doc.head('Style preview', 'This is how your documents will look', [['Date', todayStr()], ['Company', P.company || '—']]);
    doc.section('Sample section', '3 items');
    doc.table([{label:'', w:22}, {label:'Item', flex:3}, {label:'Qty', w:44, align:'c'}, {label:'Notes', flex:2}],
      [[{box:'checked'}, {t:'Something packed', strike:true, dim:true}, '×2', ''], [{box:true}, 'Something to bring', '1', 'left of the door'], [{box:true}, 'Another thing', '', '']]);
    doc.totals([['Subtotal', '€ 1.000'], ['21% VAT', '€ 210'], ['Total', '€ 1.210', true]]);
    dlBlob('floorboard-style-preview.pdf', doc.blob());
  });
  el.querySelector('#dsDone').addEventListener('click', ()=>{ save(); el.remove(); if(typeof render === 'function') render(); });
  el.addEventListener('click', e=>{ if(e.target === el){ save(); el.remove(); } });
  el.addEventListener('keydown', e=>e.stopPropagation());
}
