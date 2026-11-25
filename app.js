/* Sayso front end. Talks to Supabase; crowd numbers only ever come from the
   server functions search_places / place_crowd / place_notes, which apply the
   privacy rules. Sample mode runs the same rules on invented data in the browser. */

const SB_URL = "https://tmlkgledgnrziirgdcib.supabase.co";
const SB_KEY = "sb_publishable_0kxJs3lZuRqdQZP-c2Lpaw_RgYk9_yP"; // publishable: safe in the browser
const sb = window.supabase.createClient(SB_URL, SB_KEY);

const K = 5, MAX_FILTERS = 3;
const DIMS = {
  age_band:  { label: "Age",       opts: ["18-24","25-34","35-44","45-54","55-64","65+"] },
  gender:    { label: "Gender",    opts: ["Woman","Man","Non-binary"] },
  politics:  { label: "Politics",  opts: ["Liberal","Moderate","Conservative","Libertarian","Apolitical"] },
  religion:  { label: "Religion",  opts: ["Christian","Catholic","Jewish","Muslim","Hindu","Buddhist","Spiritual","None"] },
  education: { label: "Education", opts: ["High school","Some college","Bachelor's","Graduate"] },
  income:    { label: "Income",    opts: ["Under $50k","$50-100k","$100-200k","$200k+"] },
};
const DK = Object.keys(DIMS);
const SENSITIVE = ["politics","religion"];
const CATS = ["Bar","Restaurant","Coffee shop","Yoga studio","Gym","Club","Salon","Other"];
const FREQ = { first: "First visit", few: "A few times", regular: "Regular" };
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const norm = s => String(s || "").trim().toLowerCase();
const r5 = x => Math.round(x * 20) / 20;

/* ---------------- Sample data (invented, never stored) ---------------- */
function rng(seed){ return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function pick(r, opts, w){ const tot = w.reduce((a, b) => a + b, 0); let x = r() * tot; for (let i = 0; i < opts.length; i++){ x -= w[i]; if (x <= 0) return opts[i]; } return opts[opts.length - 1]; }
const BASE = { age_band:[12,20,18,16,16,14], gender:[50,48,2], politics:[30,32,25,5,8], religion:[38,18,3,2,2,2,9,26], education:[24,24,32,20], income:[28,36,26,10] };
const SCHOOLS = { Austin:["UT Austin","Texas A&M","Texas State","Baylor","Rice"], Chicago:["Northwestern","UChicago","UIUC","Loyola","DePaul"], Nashville:["Vanderbilt","Belmont","Lipscomb","UT Knoxville","MTSU"] };
const SAMPLE_PLACES = [
  ["Austin","The Low Tide","Bar","East 6th",4.1,{age_band:{"18-24":5,"25-34":3,"45-54":.3,"55-64":.15,"65+":.05},politics:{Liberal:1.8},school:"UT Austin"}],
  ["Austin","Rusty Spur Saloon","Bar","North Loop",3.9,{age_band:{"35-44":2,"45-54":2.5,"55-64":2,"18-24":.5},gender:{Man:1.8},politics:{Conservative:2.6,Liberal:.5},school:"Texas A&M"}],
  ["Austin","Velvet Hour","Bar","Rainey St",4.4,{age_band:{"25-34":3,"35-44":2.2,"65+":.2},income:{"$100-200k":2.5,"$200k+":3,"Under $50k":.4},education:{"Graduate":1.8,"Bachelor's":1.5}}],
  ["Austin","Sunrise Flow Yoga","Yoga studio","Zilker",4.6,{gender:{Woman:6},religion:{Spiritual:3,Buddhist:2},politics:{Liberal:2}}],
  ["Austin","Iron Republic","Gym","Mueller",4.2,{gender:{Man:2.5},age_band:{"25-34":2.5,"18-24":1.8,"55-64":.4,"65+":.2}}],
  ["Austin","Cedar & Clay Coffee","Coffee shop","South Congress",4.3,{age_band:{"25-34":1.5},education:{"Bachelor's":1.4}}],
  ["Austin","Pho Lucky","Restaurant","North Lamar",4.5,{}],
  ["Chicago","Wicker Social","Bar","Wicker Park",4.0,{age_band:{"25-34":4,"18-24":2,"55-64":.3,"65+":.1},politics:{Liberal:1.6},school:"Northwestern"}],
  ["Chicago","Old Union Tap","Bar","Bridgeport",4.2,{age_band:{"45-54":2.5,"55-64":3,"65+":2,"18-24":.4},religion:{Catholic:3},gender:{Man:1.5},school:"Loyola"}],
  ["Chicago","Lakeview Hot Yoga","Yoga studio","Lakeview",4.4,{gender:{Woman:4},age_band:{"25-34":2,"35-44":1.6}}],
  ["Chicago","Northside Barbell","Gym","Ravenswood",4.5,{gender:{Man:1.6},age_band:{"25-34":2,"35-44":1.8}}],
  ["Chicago","Loop Espresso Bar","Coffee shop","The Loop",3.8,{income:{"$100-200k":2.5,"$200k+":2},education:{Graduate:2}}],
  ["Chicago","Gemma's Trattoria","Restaurant","Little Italy",4.6,{age_band:{"45-54":2,"55-64":2.5,"65+":2.5},religion:{Catholic:2}}],
  ["Nashville","Honky Neon","Bar","Lower Broadway",3.6,{age_band:{"25-34":3,"18-24":2.5},gender:{Woman:1.4}}],
  ["Nashville","Back Porch Tavern","Bar","Germantown",4.3,{politics:{Conservative:2.8,Liberal:.5},religion:{Christian:2},age_band:{"35-44":1.8,"45-54":1.8}}],
  ["Nashville","Still Water Yoga","Yoga studio","12 South",4.5,{gender:{Woman:5},religion:{Christian:1.6,Spiritual:2}}],
  ["Nashville","Music Row CrossFit","Gym","Music Row",4.1,{age_band:{"25-34":2.2,"35-44":2},gender:{Man:1.4}}],
  ["Nashville","Hymn & Bean","Coffee shop","Belmont",4.4,{religion:{Christian:3},age_band:{"18-24":3,"25-34":1.5},school:"Belmont"}],
  ["Nashville","Cinder Hot Chicken","Restaurant","The Gulch",4.3,{}],
];
const SAMPLE_CITY = { Austin: "Austin, TX", Chicago: "Chicago, IL", Nashville: "Nashville, TN" };
const SAMPLE = (() => {
  const r = rng(20261125), places = [], reviews = [];
  SAMPLE_PLACES.forEach(([city, name, category, neighborhood, q, bias], i) => {
    const id = "s" + i; places.push({ id, city: SAMPLE_CITY[city], name, category, neighborhood });
    const n = 28 + Math.floor(r() * 60);
    for (let j = 0; j < n; j++){
      const rv = { place_id: id }; let fit = 0;
      for (const d of DK){
        const opts = DIMS[d].opts, b = bias[d] || {};
        const v = r() < .05 ? null : pick(r, opts, BASE[d].map((w, k) => w * (b[opts[k]] ?? 1)));
        rv[d] = v; if (v && (b[v] ?? 1) > 1) fit++;
      }
      const sl = SCHOOLS[city];
      rv.school = r() < .8 ? pick(r, sl, sl.map((s, k) => bias.school === s ? 9 : [5,3,2,2,1][k])) : null;
      rv.stars = Math.max(1, Math.min(5, Math.round(q - .2 + (r() - .5) * 1.6 + Math.min(fit, 3) * .18)));
      reviews.push(rv);
    }
  });
  return { places, reviews };
})();
// sample dishes for the sample restaurants (own random stream so other sample numbers don't change)
const SAMPLE_MENUS = {
  "Pho Lucky": ["Pho tai", "Bún bò Huế", "Spring rolls", "Lemongrass chicken banh mi", "Vietnamese iced coffee"],
  "Gemma's Trattoria": ["Cacio e pepe", "Lasagna bolognese", "Chicken parm", "Burrata", "Tiramisu"],
  "Cinder Hot Chicken": ["Hot chicken sandwich", "Tenders, extra hot", "Mac and cheese", "Banana pudding"],
};
(() => {
  const r = rng(4242);
  for (const p of SAMPLE.places){
    const menu = SAMPLE_MENUS[p.name]; if (!menu) continue;
    const bonus = menu.map(() => (r() - .5) * 1.6);
    for (const rv of SAMPLE.reviews.filter(x => x.place_id === p.id)){
      if (r() < .3) continue;
      const names = new Set([pick(r, menu, menu.map((_, i) => menu.length - i))]);
      if (r() < .4) names.add(pick(r, menu, menu.map(() => 1)));
      rv.items = [...names].map(name => ({ name, stars: Math.max(1, Math.min(5, Math.round(rv.stars + bonus[menu.indexOf(name)] + (r() - .5)))) }));
    }
  }
})();
function sampleMatches(rv, f){
  for (const [d, vals] of Object.entries(f)){
    if (!vals.length) continue;
    if (d === "school"){ if (!vals.some(v => norm(v) === norm(rv.school))) return false; }
    else if (!vals.includes(rv[d])) return false;
  }
  return true;
}
const avg = a => a.length ? Math.round(a.reduce((s, r) => s + r.stars, 0) / a.length * 10) / 10 : null;

/* ---------------- Data layer: same shapes for sample and live ---------------- */
const api = {
  async cities(){
    if (S.source === "sample") return [...new Set(SAMPLE.places.map(p => p.city))].sort();
    return liveCities();
  },
  async search(city, category, filters, query){
    if (S.source === "live"){
      const { data, error } = await sb.rpc("search_places", { p_city: city, p_category: category, p_filters: filters, p_query: query || null, p_limit: 60 });
      if (error) throw error;
      return data;
    }
    const nf = Object.values(filters).filter(v => v.length).length;
    return SAMPLE.places.filter(p => p.city === city && (!category || p.category === category) && (!query || norm(p.name).includes(norm(query)))).map(p => {
      const rs = SAMPLE.reviews.filter(r => r.place_id === p.id), ms = rs.filter(r => sampleMatches(r, filters));
      const n = rs.length, m = ms.length;
      const status = !nf ? "none" : n < K ? "insufficient" : m === 0 ? "zero" : m < K ? "few" : "ok";
      return { place_id: p.id, name: p.name, category: p.category, neighborhood: p.neighborhood, ratings: n, avg_stars: avg(rs),
        match_status: status, match_share: (status === "ok" || status === "zero") ? r5(m / n) : null,
        match_count: status === "ok" ? Math.round(m / 5) * 5 : null, crowd_avg_stars: status === "ok" ? avg(ms) : null };
    });
  },
  async crowd(placeId){
    if (S.source === "live"){
      const { data, error } = await sb.rpc("place_crowd", { p_place_id: placeId });
      if (error) throw error;
      return data;
    }
    const rs = SAMPLE.reviews.filter(r => r.place_id === placeId), n = rs.length;
    if (n < K) return { ratings: n, hidden: true };
    const dims = {};
    for (const d of DK){
      const counts = {};
      for (const r of rs){ const v = r[d] ?? "Not shared"; counts[v] = (counts[v] || 0) + 1; }
      const merged = {};
      for (const [v, c] of Object.entries(counts)){ const l = v === "Not shared" ? v : c < K ? "Smaller groups" : v; merged[l] = (merged[l] || 0) + c; }
      dims[d] = Object.entries(merged).map(([label, c]) => ({ label, share: r5(c / n) }));
    }
    return { ratings: n, hidden: false, dims };
  },
  async posts(placeId){
    if (S.source === "sample") return [];
    const { data, error } = await sb.rpc("place_posts", { p_place_id: placeId, p_limit: 6 });
    if (error) throw error;
    return data;
  },
  async dishes(placeId){
    if (S.source === "live"){
      const { data, error } = await sb.rpc("place_dishes", { p_place_id: placeId, p_limit: 8 });
      if (error) throw error;
      return data;
    }
    const agg = {};
    for (const rv of SAMPLE.reviews) if (rv.place_id === placeId) for (const it of rv.items || []){
      const k = norm(it.name); (agg[k] ||= { dish: it.name, orders: 0, sum: 0 }); agg[k].orders++; agg[k].sum += it.stars;
    }
    return Object.values(agg).map(a => ({ dish: a.dish, orders: a.orders, avg_stars: Math.round(a.sum / a.orders * 10) / 10 }))
      .sort((a, b) => b.orders - a.orders || b.avg_stars - a.avg_stars).slice(0, 8);
  },
};
const ORDER_CATS = ["Restaurant"];   // categories that get "What did you order?"
const MAX_PHOTOS = 4;
const photoUrl = path => `${SB_URL}/storage/v1/object/public/review-photos/${encodeURIComponent(path)}`;
async function toJpeg(file){
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  // re-encoding through a canvas drops EXIF data, including GPS location
  return await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error("Couldn't process that photo")), "image/jpeg", 0.82));
}

let liveCityCache = null;
async function liveCities(){
  if (liveCityCache) return liveCityCache;
  const { data, error } = await sb.from("cities").select("name").eq("active", true).order("name");
  if (error) throw error;
  return (liveCityCache = data.map(c => c.name));
}

/* ---------------- State ---------------- */
const S = {
  tab: "explore", source: "sample", sourceChosen: false,
  cities: [], city: null, cat: "All", sel: Object.fromEntries(DK.map(d => [d, new Set()])), school: false,
  focus: "age_band", sort: "match", open: new Set(), query: "",
  rows: [], crowd: {}, posts: {}, dishes: {}, loading: false, error: "", note: "",
  items: [], photos: [], removedPhotos: [], // rating form: dishes [{name,stars}], photos [{path}|{file,url}]
  user: null, profile: null, stars: 0,
  rateCities: [], rateCity: null, rateResults: [], ratePick: null, // ratePick: {id,name,category,neighborhood} or "new"
};
let searchSeq = 0;

function currentFilters(){
  const f = {};
  for (const d of DK) if (S.sel[d].size) f[d] = [...S.sel[d]];
  if (S.school && S.profile?.school) f.school = [S.profile.school];
  return f;
}
const filterCount = () => Object.keys(currentFilters()).length;

/* ---------------- Explore ---------------- */
async function loadCities(){
  try { S.cities = await api.cities(); } catch (e){ S.cities = []; S.error = "Couldn't load cities. Check your connection."; }
  if (!S.cities.includes(S.city)){
    const home = S.cities.find(c => norm(c) === norm(S.profile?.home_city));
    S.city = home || (S.cities.includes("Baton Rouge, LA") ? "Baton Rouge, LA" : S.cities[0] || null);
  }
}
async function runSearch(){
  const seq = ++searchSeq;
  S.loading = true; S.error = ""; renderList();
  if (!S.city){ S.rows = []; S.loading = false; renderList(); return; }
  try {
    const rows = await api.search(S.city, S.cat === "All" ? null : S.cat, currentFilters(), S.query.trim());
    if (seq !== searchSeq) return;
    S.rows = rows; S.loading = false;
    renderFilters(); renderList();
    await Promise.all(rows.filter(r => r.ratings >= K && !S.crowd[r.place_id]).map(async r => {
      try { S.crowd[r.place_id] = await api.crowd(r.place_id); } catch {}
    }));
    if (seq === searchSeq) renderList();
  } catch (e){
    if (seq !== searchSeq) return;
    S.loading = false; S.error = e?.message || "Couldn't load places."; renderList();
  }
}

function compBar(placeId, dim, ratings){
  if (ratings < K) return `<div class="bar-empty">Fewer than ${K} ratings, so the crowd stays hidden</div>`;
  const c = S.crowd[placeId];
  if (!c) return `<div class="bar-empty">Loading crowd…</div>`;
  if (c.hidden) return `<div class="bar-empty">Fewer than ${K} ratings, so the crowd stays hidden</div>`;
  const parts = c.dims?.[dim] || [], opts = DIMS[dim].opts, sel = S.sel[dim];
  const order = l => { const i = opts.indexOf(l); return i >= 0 ? i : l === "Smaller groups" ? 90 : 99; };
  const segs = parts.filter(p => p.share > 0).sort((a, b) => order(a.label) - order(b.label)).map(p => {
    const i = opts.indexOf(p.label);
    return { label: p.label, share: +p.share, on: sel.has(p.label), col: i >= 0 ? `var(--c${i + 1})` : p.label === "Smaller groups" ? "var(--c-other)" : "var(--c-na)" };
  });
  if (!segs.length) return `<div class="bar-empty">No crowd data</div>`;
  const pct = s => Math.round(s * 100) + "%";
  return `<div><div class="bar${sel.size ? " dim" : ""}" role="img" aria-label="${esc(DIMS[dim].label)}: ${esc(segs.map(s => s.label + " about " + pct(s.share)).join(", "))}">${
    segs.map(s => `<span class="${s.on ? "on" : ""}" style="flex:${s.share};background:${s.col}" title="${esc(s.label)} · about ${pct(s.share)}"></span>`).join("")}</div>
    <ul class="legend">${segs.map(s => `<li class="${s.on ? "on" : ""}"><i style="background:${s.col}"></i>${esc(s.label)} <span class="pct">~${pct(s.share)}</span></li>`).join("")}</ul></div>`;
}

function renderFilters(){
  $("city").innerHTML = S.cities.length ? S.cities.map(c => `<option${c === S.city ? " selected" : ""}>${esc(c)}</option>`).join("") : `<option>No places yet</option>`;
  $("city").disabled = !S.cities.length;
  $("cats").innerHTML = ["All", ...CATS].map(c => `<button type="button" class="chip" data-cat="${esc(c)}" aria-pressed="${c === S.cat}">${esc(c === "All" ? "Everything" : c)}</button>`).join("");
  $("dimFilters").innerHTML = DK.map(d => `<fieldset class="fgroup"><legend>${DIMS[d].label}</legend><div class="chips">${
    DIMS[d].opts.map(o => `<button type="button" class="chip" data-dim="${d}" data-val="${esc(o)}" aria-pressed="${S.sel[d].has(o)}">${esc(o)}</button>`).join("")}</div></fieldset>`).join("");
  const sch = S.profile?.school;
  $("school").disabled = !sch; $("school").checked = S.school && !!sch;
  $("schoolLabel").textContent = sch ? `Went to my school (${sch})` : "Went to my school (add it in your profile)";
  $("focus").innerHTML = DK.map(d => `<option value="${d}"${d === S.focus ? " selected" : ""}>${DIMS[d].label}</option>`).join("");
  $("sort").value = S.sort;
}

function renderList(){
  const filt = filterCount() > 0;
  const catWord = S.cat === "All" ? "places" : (S.cat === "Coffee shop" ? "coffee shops" : S.cat.toLowerCase() + "s");
  const rows = [...S.rows];
  const key = { match: r => filt ? (r.match_share ?? -1) : r.ratings, crowd: r => r.crowd_avg_stars ?? (filt ? -1 : r.avg_stars ?? -1), rating: r => r.avg_stars ?? -1, count: r => r.ratings }[S.sort];
  rows.sort((a, b) => key(b) - key(a) || b.ratings - a.ratings || a.name.localeCompare(b.name));
  const word = rows.length === 1 ? catWord.replace(/s$/, "") : catWord;
  $("rTitle").textContent = !S.city ? "Places"
    : S.query.trim() ? `${rows.length}${rows.length === 60 ? "+" : ""} ${rows.length === 1 ? "match" : "matches"} in ${S.city}`
    : S.source === "live" ? `${rows.length} rated ${word} in ${S.city}` : `${rows.length} ${word} in ${S.city}`;
  const f = currentFilters();
  const active = Object.entries(f).flatMap(([d, v]) => d === "school" ? [v[0] + " alumni"] : v);
  $("summary").textContent = S.note || (active.length ? `Crowd: ${active.join(" · ")}` : `No crowd filter. Pick up to ${MAX_FILTERS} traits, or tap “Like me”.`);

  if (S.error){ $("list").innerHTML = `<div class="empty"><h3>Something went wrong</h3><p>${esc(S.error)}</p></div>`; return; }
  if (S.loading && !rows.length){ $("list").innerHTML = `<div class="empty"><p>Loading…</p></div>`; return; }
  if (!S.city){
    $("list").innerHTML = `<div class="empty"><h3>No places yet</h3><p>${S.source === "live" ? "Be the first: rate a place you know and it will show up here." : ""}</p>${S.source === "live" ? `<button type="button" class="btn primary" data-go="rate">Rate a place →</button>` : ""}</div>`;
    return;
  }
  if (!rows.length){
    $("list").innerHTML = S.query.trim()
      ? `<div class="empty"><h3>No matches</h3><p>Nothing called “${esc(S.query.trim())}” in ${esc(S.city)}${S.cat === "All" ? "" : " under " + esc(catWord)}.</p></div>`
      : S.source === "live"
        ? `<div class="empty"><h3>No ratings in ${esc(S.city)} yet</h3><p>Search for any ${S.cat === "All" ? "business" : esc(S.cat.toLowerCase())} with “Find a place,” or be the first to rate one.</p><button type="button" class="btn primary" data-go="rate">Rate a place →</button></div>`
        : `<div class="empty"><h3>Nothing here yet</h3><p>No ${esc(catWord)} in ${esc(S.city)} so far.</p></div>`;
    return;
  }

  $("list").innerHTML = rows.map(r => {
    const open = S.open.has(r.place_id), st = r.match_status;
    const fig = st === "none" ? `<div class="big">${r.ratings}</div><div class="cap">ratings</div>`
      : st === "insufficient" ? `<div class="big">–</div><div class="cap">not enough ratings yet</div>`
      : st === "few" ? `<div class="big">&lt;${K}</div><div class="cap">raters match your crowd</div>`
      : `<div class="big">${Math.round((r.match_share || 0) * 100)}%</div><div class="cap">of raters match your crowd</div>`;
    const crowdRt = st === "none" ? "" : `<span class="crowd">Your crowd: ${st === "ok" ? `<span class="st">★ ${(+r.crowd_avg_stars).toFixed(1)}</span> <small>(~${r.match_count})</small>` : `<small>too few to rate</small>`}</span>`;
    const posts = S.posts[r.place_id] || [], dishes = S.dishes[r.place_id] || [];
    return `<article class="card">
      <div class="card-head">
        <div style="min-width:0"><h3>${esc(r.name)}</h3><div class="meta">${esc(r.category)}${r.neighborhood ? " · " + esc(r.neighborhood) : ""}</div>
          <div class="ratings"><span>${r.avg_stars != null ? `<span class="st">★ ${(+r.avg_stars).toFixed(1)}</span> <small>(${r.ratings} rating${r.ratings === 1 ? "" : "s"})</small>` : "<small>No ratings yet</small>"}</span>${crowdRt}</div></div>
        <div class="fig">${fig}</div>
      </div>
      <div class="strip"><span class="strip-label">${DIMS[S.focus].label}</span>${compBar(r.place_id, S.focus, r.ratings)}</div>
      ${open ? `<div class="detail">${DK.filter(d => d !== S.focus).map(d => `<div class="strip"><span class="strip-label">${DIMS[d].label}</span>${compBar(r.place_id, d, r.ratings)}</div>`).join("")}
        ${dishes.length ? `<div class="notes"><span class="strip-label">Top dishes</span><ol class="top-dishes">${dishes.map((d, i) => `<li><span class="rk">${i + 1}</span><span><b>${esc(d.dish)}</b> <span class="st">★ ${(+d.avg_stars).toFixed(1)}</span></span><small>${d.orders} order${d.orders === 1 ? "" : "s"}</small></li>`).join("")}</ol></div>` : ""}
        ${posts.length ? `<div class="notes"><span class="strip-label">Recent posts</span>${posts.map(x => `<div class="post">
            <div><span class="nst">★ ${x.stars}</span><small class="meta">${esc(FREQ[x.freq] || "")}${x.posted_on ? " · " + esc(x.posted_on) : ""}</small></div>
            ${x.note ? `<p>${esc(x.note)}</p>` : ""}
            ${(x.items || []).length ? `<div class="post-dishes">${x.items.map(it => `<span>${esc(it.name)} ★${+it.stars}</span>`).join("")}</div>` : ""}
            ${(x.photos || []).length ? `<div class="post-photos">${x.photos.filter(p => /^[0-9a-f-]{36}\.jpg$/.test(p)).map(p => `<a href="${photoUrl(p)}" target="_blank" rel="noopener"><img src="${photoUrl(p)}" alt="Photo from a rating" loading="lazy"></a>`).join("")}</div>` : ""}
          </div>`).join("")}</div>` : ""}</div>` : ""}
      <div class="card-foot"><button type="button" class="btn ghost" data-open="${esc(r.place_id)}" aria-expanded="${open}">${open ? "Hide full crowd" : "See full crowd →"}</button>
        ${S.source === "live" ? `<button type="button" class="btn" data-rate="${esc(r.place_id)}">Rate this place</button>` : ""}</div>
    </article>`;
  }).join("");
}

function renderChrome(){
  for (const t of ["explore","rate","profile","signin"]){
    $("view-" + t).hidden = S.tab !== t;
    const tb = document.querySelector(`[data-tab="${t}"]`); if (tb) tb.setAttribute("aria-selected", S.tab === t);
  }
  $("srcSample").setAttribute("aria-pressed", S.source === "sample");
  $("srcLive").setAttribute("aria-pressed", S.source === "live");
  const b = $("banner");
  b.hidden = S.source !== "sample";
  b.innerHTML = `<span class="tag mono">Sample data</span><span>Invented places and reviewers so you can try the filters.</span> <button type="button" data-src="live">Switch to live ratings</button>`;
  $("authBtn").textContent = S.user ? "Sign out" : "Sign in";
}

/* ---------------- Rate ---------------- */
let placeTimer, qTimer, rateSeq = 0;
async function prepareRate(){
  try { S.rateCities = await liveCities(); } catch { S.rateCities = []; }
  if (!S.rateCities.includes(S.rateCity)){
    const home = S.rateCities.find(c => c === S.profile?.home_city);
    S.rateCity = (S.source === "live" && S.rateCities.includes(S.city)) ? S.city : home || S.rateCities[0] || null;
  }
  renderRate();
}
async function searchRatePlaces(){
  const q = $("rSearch").value.trim(), seq = ++rateSeq;
  if (!S.rateCity || q.length < 2){ S.rateResults = []; renderRate(); return; }
  const { data } = await sb.from("places").select("id,name,category,neighborhood,address")
    .eq("city", S.rateCity).eq("status", "open").ilike("name", `%${q}%`).order("name").limit(20);
  if (seq === rateSeq){ S.rateResults = data || []; renderRate(); }
}
function profileLine(){ return DK.map(d => S.profile?.[d]).filter(Boolean).join(" · "); }
function renderDishes(){
  $("dishRows").innerHTML = S.items.map((it, i) => `<div class="dish">
      <input type="text" list="dishList" maxlength="80" placeholder="e.g. Shrimp po-boy" data-dish-name="${i}" value="${esc(it.name)}" aria-label="Dish ${i + 1}">
      <div class="mini-stars" role="group" aria-label="Stars for dish ${i + 1}">${[1, 2, 3, 4, 5].map(v => `<button type="button" data-dish-star="${i}" data-v="${v}" class="${v <= it.stars ? "lit" : ""}" aria-label="${v} star${v > 1 ? "s" : ""}" aria-pressed="${v === it.stars}">★</button>`).join("")}</div>
      <button type="button" class="x" data-dish-remove="${i}" aria-label="Remove dish ${i + 1}">✕</button>
    </div>`).join("");
  $("addDish").hidden = S.items.length >= 10;
}
function renderPhotos(){
  $("photoRow").innerHTML = S.photos.map((p, i) => `<div class="thumb"><img src="${p.path ? photoUrl(p.path) : p.url}" alt="Your photo ${i + 1}"><button type="button" class="x" data-photo-remove="${i}" aria-label="Remove photo ${i + 1}">✕</button></div>`).join("")
    + (S.photos.length < MAX_PHOTOS ? `<button type="button" class="add-photo" id="addPhoto">+ Add photo</button>` : "");
}
function resetRateExtras(){
  S.photos.forEach(p => p.url && URL.revokeObjectURL(p.url));
  S.items = []; S.photos = []; S.removedPhotos = []; S.stars = 0;
  document.querySelectorAll("#stars input").forEach(i => i.checked = false);
  $("rNote").value = ""; $("rFreq").value = "first"; $("rateMsg").textContent = ""; $("dishList").innerHTML = "";
}
// If you've rated this place before, load that rating so posting again edits it.
async function loadMyReview(placeId){
  resetRateExtras(); renderRate();
  if (!placeId) return;
  if (ORDER_CATS.includes(S.ratePick?.category)){
    sb.rpc("place_dishes", { p_place_id: placeId, p_limit: 20 }).then(({ data }) => {
      $("dishList").innerHTML = (data || []).map(d => `<option value="${esc(d.dish)}">`).join("");
    });
  }
  if (!S.user) return;
  const { data } = await sb.from("reviews").select("stars,freq,note,items,photos").eq("place_id", placeId).eq("user_id", S.user.id).maybeSingle();
  if (!data || S.ratePick?.id !== placeId) return;
  S.stars = data.stars; $("star" + data.stars).checked = true;
  $("rFreq").value = data.freq; $("rNote").value = data.note || "";
  S.items = (data.items || []).map(i => ({ name: i.name, stars: i.stars }));
  S.photos = (data.photos || []).map(path => ({ path }));
  $("rateMsg").className = "msg"; $("rateMsg").textContent = "You've rated this place before. Posting again updates that rating.";
  renderRate();
}
function renderRate(){
  $("rCity").innerHTML = S.rateCities.map(c => `<option${c === S.rateCity ? " selected" : ""}>${esc(c)}</option>`).join("");
  const pick = S.ratePick, q = $("rSearch").value.trim();
  $("rPicked").hidden = !pick;
  if (pick) $("rPicked").innerHTML = (pick === "new"
      ? `<div><b>New place</b><small>Fill in the details below</small></div>`
      : `<div><b>${esc(pick.name)}</b><small>${esc(pick.category)}${pick.neighborhood ? " · " + esc(pick.neighborhood) : ""}</small></div>`)
    + `<button type="button" class="btn ghost" id="rChange">Change</button>`;
  $("rSearch").disabled = !!pick;
  $("rResults").hidden = !!pick || q.length < 2;
  if (!$("rResults").hidden){
    $("rResults").innerHTML = S.rateResults.map(p => `<button type="button" data-pick="${esc(p.id)}"><b>${esc(p.name)}</b><small>${esc(p.category)}${p.neighborhood ? " · " + esc(p.neighborhood) : ""}${p.address ? " · " + esc(p.address) : ""}</small></button>`).join("")
      + (S.rateResults.length ? "" : `<p>No match in ${esc(S.rateCity || "this city")} yet.</p>`)
      + `<button type="button" class="add" data-pick="__new">+ Can't find it? Add “${esc(q)}”</button>`;
  }
  $("newPlace").hidden = pick !== "new";
  const cat = pick === "new" ? $("npCat").value : pick?.category;
  $("orderBox").hidden = !ORDER_CATS.includes(cat);
  if (!$("orderBox").hidden) renderDishes();
  renderPhotos();
  $("stars").querySelectorAll("label").forEach((l, i) => l.classList.toggle("lit", i < S.stars));
  const line = profileLine();
  $("snap").innerHTML = !S.user ? `You need to sign in to post. <button type="button" class="btn ghost" data-go="signin" style="padding:0">Sign in →</button>`
    : line ? `This rating will count toward crowds as: <b>${esc(line)}</b>. <button type="button" class="btn ghost" data-go="profile" style="padding:0">Edit →</button>`
    : `You haven't filled in your profile, so this rating will show as “Not shared” everywhere. <button type="button" class="btn ghost" data-go="profile" style="padding:0">Fill it in →</button>`;
  $("rSubmit").disabled = !S.user;
}

/* ---------------- Profile ---------------- */
function fillProfileForm(){
  const p = S.profile || {};
  $("pFields").innerHTML = DK.map(d => `<label class="field"><span>${DIMS[d].label}</span><select id="p_${d}"><option value="">Prefer not to say</option>${DIMS[d].opts.map(o => `<option${p[d] === o ? " selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`).join("");
  const cities = liveCityCache || [];
  const opts = !p.home_city || cities.includes(p.home_city) ? cities : [...cities, p.home_city];
  $("pCity").innerHTML = `<option value="">Somewhere else / prefer not to say</option>` + opts.map(c => `<option${c === p.home_city ? " selected" : ""}>${esc(c)}</option>`).join("");
  $("pSchool").value = p.school || "";
  $("pConsent").checked = !!p.sensitive_consent_at;
}
function renderProfile(){
  $("pSave").disabled = !S.user;
  if (!S.user){ $("pMsg").className = "msg"; $("pMsg").innerHTML = `Sign in to save your profile. <button type="button" class="btn ghost" data-go="signin" style="padding:0">Sign in →</button>`; }
}
async function loadProfile(){
  if (!S.user){ S.profile = null; fillProfileForm(); return; }
  const { data } = await sb.from("profiles").select("*").eq("user_id", S.user.id).maybeSingle();
  S.profile = data || null; fillProfileForm();
}

/* ---------------- Render + events ---------------- */
function render(){
  renderChrome();
  if (S.tab === "explore"){ renderFilters(); renderList(); }
  if (S.tab === "rate") renderRate();
  if (S.tab === "profile") renderProfile();
}
async function refreshExplore(){ S.crowd = {}; S.posts = {}; S.dishes = {}; await loadCities(); renderFilters(); await runSearch(); }

document.addEventListener("click", async e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.tab || t.dataset.go){
    S.tab = t.dataset.tab || t.dataset.go; render();
    if (S.tab === "rate") prepareRate();
    return;
  }
  if (t.dataset.pick){
    if (t.dataset.pick === "__new"){ S.ratePick = "new"; $("npName").value = $("rSearch").value.trim(); renderRate(); }
    else { const p = S.rateResults.find(x => x.id === t.dataset.pick); if (p){ S.ratePick = p; loadMyReview(p.id); } }
    return;
  }
  if (t.id === "rChange"){ S.ratePick = null; resetRateExtras(); renderRate(); $("rSearch").focus(); return; }
  if (t.dataset.dishStar !== undefined){ S.items[+t.dataset.dishStar].stars = +t.dataset.v; renderDishes(); return; }
  if (t.dataset.dishRemove !== undefined){ S.items.splice(+t.dataset.dishRemove, 1); renderDishes(); return; }
  if (t.id === "addDish"){
    S.items.push({ name: "", stars: 0 }); renderDishes();
    $("dishRows").querySelector(`[data-dish-name="${S.items.length - 1}"]`)?.focus(); return;
  }
  if (t.id === "addPhoto"){ $("photoInput").click(); return; }
  if (t.dataset.photoRemove !== undefined){
    const [p] = S.photos.splice(+t.dataset.photoRemove, 1);
    if (p?.path && !p.file) S.removedPhotos.push(p.path);
    if (p?.url) URL.revokeObjectURL(p.url);
    renderPhotos(); return;
  }
  if (t.dataset.src || t.id === "srcSample" || t.id === "srcLive"){
    S.source = t.dataset.src || (t.id === "srcLive" ? "live" : "sample"); S.sourceChosen = true; S.open.clear(); S.tab = "explore";
    render(); refreshExplore(); return;
  }
  if (t.id === "authBtn"){
    if (S.user){ await sb.auth.signOut(); } else { S.tab = "signin"; render(); $("email").focus(); }
    return;
  }
  if (t.dataset.cat){ S.cat = t.dataset.cat; S.note = ""; renderFilters(); runSearch(); return; }
  if (t.dataset.dim){
    const d = t.dataset.dim, s = S.sel[d], v = t.dataset.val;
    if (!s.has(v) && !s.size && filterCount() >= MAX_FILTERS){ S.note = `You can use up to ${MAX_FILTERS} crowd traits at once. Remove one to add another.`; renderList(); return; }
    S.note = ""; s.has(v) ? s.delete(v) : s.add(v);
    if (s.size) S.focus = d; renderFilters(); runSearch(); return;
  }
  if (t.dataset.open){
    const id = t.dataset.open;
    if (S.open.has(id)) S.open.delete(id); else {
      S.open.add(id);
      const row = S.rows.find(x => x.place_id === id);
      if (!S.posts[id]) api.posts(id).then(n => { S.posts[id] = n; renderList(); }).catch(() => {});
      if (!S.dishes[id] && ORDER_CATS.includes(row?.category)) api.dishes(id).then(d => { S.dishes[id] = d; renderList(); }).catch(() => {});
    }
    renderList(); return;
  }
  if (t.dataset.rate){
    const r = S.rows.find(x => x.place_id === t.dataset.rate);
    S.tab = "rate"; S.rateCity = S.city;
    S.ratePick = r ? { id: r.place_id, name: r.name, category: r.category, neighborhood: r.neighborhood } : null;
    render(); prepareRate(); if (r) loadMyReview(r.place_id);
    return;
  }
  if (t.id === "matchMe"){
    if (!S.profile || !(S.profile.age_band || S.profile.gender)){
      S.tab = S.user ? "profile" : "signin"; render();
      if (S.user){ $("pMsg").className = "msg"; $("pMsg").textContent = "Add your age or gender so “Like me” knows what to match."; }
      return;
    }
    for (const d of DK) S.sel[d].clear();
    S.school = false;
    for (const d of ["age_band","gender"]) if (S.profile[d]) S.sel[d].add(S.profile[d]);
    S.focus = S.profile.age_band ? "age_band" : "gender"; S.note = "";
    renderFilters(); runSearch(); return;
  }
  if (t.id === "clear"){ DK.forEach(d => S.sel[d].clear()); S.school = false; S.note = ""; renderFilters(); runSearch(); return; }
});
$("city").addEventListener("change", e => { S.city = e.target.value; S.open.clear(); runSearch(); });
$("focus").addEventListener("change", e => { S.focus = e.target.value; renderList(); });
$("sort").addEventListener("change", e => { S.sort = e.target.value; renderList(); });
$("school").addEventListener("change", e => {
  if (e.target.checked && filterCount() >= MAX_FILTERS){ e.target.checked = false; S.note = `You can use up to ${MAX_FILTERS} crowd traits at once.`; renderList(); return; }
  S.school = e.target.checked; S.note = ""; runSearch();
});
$("rCity").addEventListener("change", e => { S.rateCity = e.target.value; S.ratePick = null; S.rateResults = []; $("rSearch").value = ""; renderRate(); });
$("dishRows").addEventListener("input", e => { const i = e.target.dataset.dishName; if (i !== undefined && S.items[+i]) S.items[+i].name = e.target.value; });
$("photoInput").addEventListener("change", e => {
  for (const f of [...e.target.files]){
    if (S.photos.length >= MAX_PHOTOS) break;
    if (f.type && !f.type.startsWith("image/")) continue;
    S.photos.push({ file: f, url: URL.createObjectURL(f) });
  }
  e.target.value = ""; renderPhotos();
});
$("npCat").addEventListener("change", () => renderRate());
$("rSearch").addEventListener("input", () => { clearTimeout(placeTimer); placeTimer = setTimeout(searchRatePlaces, 250); renderRate(); });
$("q").addEventListener("input", e => { clearTimeout(qTimer); qTimer = setTimeout(() => { S.query = e.target.value; runSearch(); }, 300); });
$("npCat").innerHTML = CATS.map(c => `<option>${c}</option>`).join("");
$("stars").innerHTML = [1,2,3,4,5].map(n => `<input type="radio" name="stars" id="star${n}" value="${n}"><label for="star${n}" aria-label="${n} star${n > 1 ? "s" : ""}">★</label>`).join("");
$("stars").addEventListener("change", e => { S.stars = +e.target.value; renderRate(); });
$("kText").textContent = K;

$("signinForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("email").value.trim(), msg = $("sMsg");
  if (!/^\S+@\S+\.\S+$/.test(email)){ msg.className = "msg err"; msg.textContent = "Enter a valid email address."; return; }
  $("sSubmit").disabled = true; msg.className = "msg"; msg.textContent = "Sending…";
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
  $("sSubmit").disabled = false;
  if (error){ msg.className = "msg err"; msg.textContent = error.message; return; }
  msg.className = "msg ok"; msg.textContent = "Check your email for a sign-in link. You can close this tab.";
});

$("profileForm").addEventListener("submit", async e => {
  e.preventDefault(); if (!S.user) return;
  const msg = $("pMsg");
  const next = { user_id: S.user.id };
  DK.forEach(d => next[d] = $("p_" + d).value || null);
  next.home_city = $("pCity").value.trim().slice(0, 60) || null;
  next.school = $("pSchool").value.trim().slice(0, 80) || null;
  const sensitive = SENSITIVE.some(d => next[d]);
  if (sensitive && !$("pConsent").checked){ msg.className = "msg err"; msg.textContent = "Tick the consent box to share politics or religion, or set them to “Prefer not to say”."; return; }
  next.sensitive_consent_at = sensitive ? (S.profile?.sensitive_consent_at || new Date().toISOString()) : null;
  $("pSave").disabled = true; msg.className = "msg"; msg.textContent = "Saving…";
  const { data, error } = await sb.from("profiles").upsert(next).select().single();
  $("pSave").disabled = false;
  if (error){ msg.className = "msg err"; msg.textContent = "Couldn't save: " + error.message; return; }
  S.profile = data; msg.className = "msg ok"; msg.textContent = "Saved. Only you can see this.";
});

$("rateForm").addEventListener("submit", async e => {
  e.preventDefault(); if (!S.user) return;
  const msg = $("rateMsg"); msg.className = "msg err";
  const city = S.rateCity;
  if (!city){ msg.textContent = "Pick a city."; return; }
  if (!S.ratePick){ msg.textContent = "Search for the place and pick it from the list."; return; }
  if (!S.stars){ msg.textContent = "Pick a star rating."; return; }
  const newName = $("npName").value.trim();
  if (S.ratePick === "new" && !newName){ msg.textContent = "Enter the place's name."; return; }
  const showOrder = ORDER_CATS.includes(S.ratePick === "new" ? $("npCat").value : S.ratePick.category);
  const items = showOrder ? S.items.filter(i => i.name.trim()) : [];
  if (items.some(i => !i.stars)){ msg.textContent = "Give each dish 1 to 5 stars, or remove it."; return; }
  let placeId = S.ratePick === "new" ? null : S.ratePick.id;
  $("rSubmit").disabled = true; msg.className = "msg"; msg.textContent = "Posting…";
  try {
    if (!placeId){
      const { data: same } = await sb.from("places").select("id").eq("city", city).ilike("name", newName.replace(/[%_]/g, "")).limit(1);
      if (same?.length) placeId = same[0].id;
      else {
        const { data, error } = await sb.from("places").insert({ name: newName.slice(0, 120), category: $("npCat").value, city, neighborhood: $("npHood").value.trim().slice(0, 60) || null }).select("id").single();
        if (error) throw error; placeId = data.id;
      }
    }
    const paths = [];
    for (const p of S.photos){
      if (!p.file){ paths.push(p.path); continue; }
      if (!p.path){
        msg.textContent = `Uploading photo ${paths.length + 1} of ${S.photos.length}…`;
        let blob;
        try { blob = await toJpeg(p.file); } catch { throw new Error("couldn't read one of the photos. Try a JPEG or PNG."); }
        const path = crypto.randomUUID() + ".jpg";
        const { error: upErr } = await sb.storage.from("review-photos").upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
        if (upErr) throw upErr;
        p.path = path;          // a retry won't upload it twice
      }
      paths.push(p.path);
    }
    msg.textContent = "Posting…";
    const { error } = await sb.from("reviews").upsert({
      place_id: placeId, stars: S.stars, freq: $("rFreq").value, note: $("rNote").value.trim().slice(0, 280) || null,
      items: items.map(i => ({ name: i.name.trim().slice(0, 80), stars: i.stars })), photos: paths,
    }, { onConflict: "place_id,user_id" });
    if (error) throw error;
    if (S.removedPhotos.length) sb.storage.from("review-photos").remove(S.removedPhotos).catch(() => {});
    resetRateExtras(); $("npName").value = ""; $("npHood").value = "";
    msg.textContent = "";
    S.ratePick = null; S.rateResults = []; $("rSearch").value = "";
    S.source = "live"; S.sourceChosen = true; S.city = city; S.cat = "All"; S.query = ""; $("q").value = "";
    S.open = new Set([placeId]); S.tab = "explore";
    render(); await refreshExplore();
  } catch (err){
    msg.className = "msg err"; msg.textContent = "Couldn't post: " + (err?.message || "check your connection and try again.");
  }
  $("rSubmit").disabled = !S.user;
});

/* ---------------- Start ---------------- */
sb.auth.onAuthStateChange((_event, session) => {
  const was = S.user?.id;
  S.user = session?.user || null;
  if (S.user?.id !== was){
    loadProfile().then(() => {
      if (S.tab === "signin" && S.user) S.tab = "explore";
      render();
    });
  }
});
(async () => {
  render();
  liveCities().then(() => { if (!document.activeElement?.closest?.("#profileForm")) fillProfileForm(); }).catch(() => {});
  // Start on live data if there's anything there; otherwise show the sample.
  try {
    const { count } = await sb.from("places").select("id", { count: "exact", head: true });
    if (!S.sourceChosen && count > 0) S.source = "live";
  } catch {}
  render(); refreshExplore();
})();
