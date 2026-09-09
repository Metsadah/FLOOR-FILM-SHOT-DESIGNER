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
const THEME_LIGHT = {bg:'#F4F3F0', panel:'#FFFFFF', card:'#FFFFFF', hover:'#F6F5F2', soft:'#EEECE7',
  grid:'#E3E0D9', line:'#E6E3DD', line2:'#D6D2CA', ink:'#2B2A27', body:'#46433B', ink2:'#7E7B73',
  ink3:'#B5B1A8', ph30:'rgba(70,67,59,.30)', ph35:'rgba(70,67,59,.35)', ph40:'rgba(70,67,59,.40)',
  chip:'rgba(255,255,255,.92)', toast:'#2A2926', toastInk:'#FFFFFF', accent:'#4B6BFB',
  accentInk:'#3D5BE8', accentSoft:'#EAEEFF', accent08:'rgba(75,107,251,.08)', danger:'#D55E00',
  dangerSoft:'#FBEAE0', warn:'#E69F00', warnSoft:'#FBF3E2', ok:'#009E73', okSoft:'#E3F5EF',
  onAccent:'#FFFFFF', rCard:8, dark:false};
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
