// FLOOR — 00-theme.js
// The canvas can't read CSS variables, so the renderer draws from THEME, a
// plain object filled from tokens.css at boot and again whenever the theme
// changes. Keys mirror the token names (--ink → THEME.ink). Exports (PNG/PDF)
// always render in the light theme — see withLightTheme().
'use strict';
const THEME = {};
const THEME_KEYS = ['bg','panel','card','hover','soft','grid','line','line2','ink','body','ink2','ink3',
  'ph30','ph35','ph40','chip','toast','toast-ink','accent','accent-ink','accent-soft','accent-08',
  'danger','danger-soft','warn','warn-soft','ok','ok-soft','on-accent'];
function loadTheme(){
  const cs = getComputedStyle(document.documentElement);
  for(const k of THEME_KEYS){
    const v = cs.getPropertyValue('--' + k).trim();
    if(v) THEME[k.replace(/-(\w)/g, (_, c)=>c.toUpperCase())] = v;
  }
  THEME.rCard = parseFloat(cs.getPropertyValue('--r-card')) || 8;
  THEME.dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
    (!document.documentElement.getAttribute('data-theme') &&
     window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  return THEME;
}
// light values, for exports and for the very first paint before CSS is parsed
const THEME_LIGHT = {bg:'#F7F7F8', panel:'#FFFFFF', card:'#FFFFFF', hover:'#F5F5F7', soft:'#F2F2F4',
  grid:'#DADADF', line:'#E8E8EC', line2:'#D5D5DB', ink:'#1D1D1F', body:'#3A3A3F', ink2:'#5F5F66',
  ink3:'#8E8E95', ph30:'rgba(29,29,31,.30)', ph35:'rgba(29,29,31,.35)', ph40:'rgba(29,29,31,.40)',
  chip:'rgba(255,255,255,.92)', toast:'#1D1D1F', toastInk:'#FFFFFF', accent:'#0A7CFF',
  accentInk:'#096BDB', accentSoft:'#E2EFFF', accent08:'rgba(10,124,255,.08)', danger:'#E5484D',
  dangerSoft:'#FDECEC', warn:'#E69F00', warnSoft:'#FDF4E1', ok:'#1FA855', okSoft:'#E4F6EA',
  onAccent:'#FFFFFF', rCard:12, dark:false};
Object.assign(THEME, THEME_LIGHT);
// run fn with the light palette active (exports must look the same in dark mode)
function withLightTheme(fn){
  const saved = Object.assign({}, THEME);
  Object.assign(THEME, THEME_LIGHT);
  try{ return fn(); } finally { Object.assign(THEME, saved); }
}
async function withLightThemeAsync(fn){
  const saved = Object.assign({}, THEME);
  Object.assign(THEME, THEME_LIGHT);
  try{ return await fn(); } finally { Object.assign(THEME, saved); }
}
// user choice: 'light' | 'dark' | '' (follow the system)
function setTheme(mode){
  try{ if(mode) localStorage.floorTheme = mode; else localStorage.removeItem('floorTheme'); }catch(_){}
  if(mode) document.documentElement.setAttribute('data-theme', mode);
  else document.documentElement.removeAttribute('data-theme');
  loadTheme();
  document.dispatchEvent(new CustomEvent('floor-theme-changed'));
}
function currentTheme(){ try{ return localStorage.floorTheme || ''; }catch(_){ return ''; } }
// apply the remembered choice as early as possible (this file loads first)
(function(){
  const m = currentTheme();
  if(m) document.documentElement.setAttribute('data-theme', m);
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadTheme, {once:true});
  else loadTheme();
  if(window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', ()=>{ if(!currentTheme()){ loadTheme(); document.dispatchEvent(new CustomEvent('floor-theme-changed')); } });
})();
