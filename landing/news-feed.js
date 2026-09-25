// news.json → the landing grid (#newsGrid, 3 items) and the news page (#list, all).
// Escaped: the feed is ours, but a page that trusts any JSON is one careless edit
// away from a script tag.
(function(){
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const link = u => (typeof u === 'string' && /^(https?:\/\/|[a-z0-9_./#?=-]+$)/i.test(u) && !/^javascript:/i.test(u)) ? u : 'news.html';
  fetch('news.json', {cache:'no-store'}).then(r=>r.json()).then(items=>{
    const g = document.getElementById('newsGrid');
    if(g) g.innerHTML = items.slice(0, 3).map(n=>'<a class="card" href="' + esc(link(n.link || 'news.html')) + '" style="text-decoration:none;color:inherit;display:block"><small style="color:var(--ink3);font-size:12px">' + esc(n.date) + (n.tag ? ' · ' + esc(n.tag) : '') + '</small><h4 style="margin:6px 0 6px">' + esc(n.title) + '</h4><p>' + esc(n.text) + '</p></a>').join('');
    const l = document.getElementById('list');
    if(l) l.innerHTML = items.map(n=>'<article><small>' + esc(n.date) + '</small>' + (n.tag ? '<span class="tag">' + esc(n.tag) + '</span>' : '') + '<h2>' + esc(n.title) + '</h2><p>' + esc(n.text) + (n.link ? ' <a href="' + esc(link(n.link)) + '">More →</a>' : '') + '</p></article>').join('');
  }).catch(()=>{
    const s = document.getElementById('news'); if(s) s.remove();
    const l = document.getElementById('list'); if(l) l.innerHTML = '<article><p>No news yet.</p></article>';
  });
})();
