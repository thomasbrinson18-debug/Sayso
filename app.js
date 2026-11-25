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
const SAMPLE = (() => {
  const r = rng(20261125), places = [], reviews = [];
  SAMPLE_PLACES.forEach(([city, name, category, neighborhood, q, bias], i) => {
    const id = "s" + i; places.push({ id, city, name, category, neighborhood });
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
    const { data, error } = await sb.from("places").select("city").eq("status", "open").limit(5000);
    if (error) throw error;
    return [...new Set(data.map(p => p.city))].sort();
  },
  async search(city, category, filters){
    if (S.source === "live"){
      const { data, error } = await sb.rpc("search_places", { p_city: city, p_category: category, p_filters: filters });
      if (error) throw error;
      return data;
    }
    const nf = Object.values(filters).filter(v => v.length).length;
    return SAMPLE.places.filter(p => p.city === city && (!category || p.category === category)).map(p => {
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
  async notes(placeId){
    if (S.source === "sample") return [];
    const { data, error } = await sb.rpc("place_notes", { p_place_id: placeId, p_limit: 6 });
    if (error) throw error;
    return data;
  },
};

/* ---------------- State ---------------- */
const S = {
  tab: "explore", source: "sample", sourceChosen: false,
  cities: [], city: null, cat: "All", sel: Object.fromEntries(DK.map(d => [d, new Set()])), school: false,
  focus: "age_band", sort: "match", open: new Set(),
  rows: [], crowd: {}, notes: {}, loading: false, error: "", note: "",
  user: null, profile: null, stars: 0, livePlaces: [],
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
    S.city = home || (S.cities.includes("Baton Rouge") ? "Baton Rouge" : S.cities[0] || null);
  }
}
async function runSearch(){
  const seq = ++searchSeq;
  S.loading = true; S.error = ""; renderList();
  if (!S.city){ S.rows = []; S.loading = false; renderList(); return; }
  try {
    const rows = await api.search(S.city, S.cat === "All" ? null : S.cat, currentFilters());
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
  $("rTitle").textContent = S.city ? `${rows.length} ${rows.length === 1 ? catWord.replace(/s$/, "") : catWord} in ${S.city}` : "Places";
  const f = currentFilters();
  const active = Object.entries(f).flatMap(([d, v]) => d === "school" ? [v[0] + " alumni"] : v);
  $("summary").textContent = S.note || (active.length ? `Crowd: ${active.join(" · ")}` : `No crowd filter. Pick up to ${MAX_FILTERS} traits, or tap “Like me”.`);

  if (S.error){ $("list").innerHTML = `<div class="empty"><h3>Something went wrong</h3><p>${esc(S.error)}</p></div>`; return; }
  if (S.loading && !rows.length){ $("list").innerHTML = `<div class="empty"><p>Loading…</p></div>`; return; }
  if (!S.city){
    $("list").innerHTML = `<div class="empty"><h3>No places yet</h3><p>${S.source === "live" ? "Be the first: rate a place you know and it will show up here." : ""}</p>${S.source === "live" ? `<button type="button" class="btn primary" data-go="rate">Rate a place →</button>` : ""}</div>`;
    return;
  }
  if (!rows.length){ $("list").innerHTML = `<div class="empty"><h3>Nothing here yet</h3><p>No ${esc(catWord)} in ${esc(S.city)} so far.</p></div>`; return; }

  $("list").innerHTML = rows.map(r => {
    const open = S.open.has(r.place_id), st = r.match_status;
    const fig = st === "none" ? `<div class="big">${r.ratings}</div><div class="cap">ratings</div>`
      : st === "insufficient" ? `<div class="big">–</div><div class="cap">not enough ratings yet</div>`
      : st === "few" ? `<div class="big">&lt;${K}</div><div class="cap">raters match your crowd</div>`
      : `<div class="big">${Math.round((r.match_share || 0) * 100)}%</div><div class="cap">of raters match your crowd</div>`;
    const crowdRt = st === "none" ? "" : `<span class="crowd">Your crowd: ${st === "ok" ? `<span class="st">★ ${(+r.crowd_avg_stars).toFixed(1)}</span> <small>(~${r.match_count})</small>` : `<small>too few to rate</small>`}</span>`;
    const notes = S.notes[r.place_id] || [];
    return `<article class="card">
      <div class="card-head">
        <div style="min-width:0"><h3>${esc(r.name)}</h3><div class="meta">${esc(r.category)}${r.neighborhood ? " · " + esc(r.neighborhood) : ""}</div>
          <div class="ratings"><span>${r.avg_stars != null ? `<span class="st">★ ${(+r.avg_stars).toFixed(1)}</span> <small>(${r.ratings} rating${r.ratings === 1 ? "" : "s"})</small>` : "<small>No ratings yet</small>"}</span>${crowdRt}</div></div>
        <div class="fig">${fig}</div>
      </div>
      <div class="strip"><span class="strip-label">${DIMS[S.focus].label}</span>${compBar(r.place_id, S.focus, r.ratings)}</div>
      ${open ? `<div class="detail">${DK.filter(d => d !== S.focus).map(d => `<div class="strip"><span class="strip-label">${DIMS[d].label}</span>${compBar(r.place_id, d, r.ratings)}</div>`).join("")}
        ${notes.length ? `<div class="notes"><span class="strip-label">Recent notes</span>${notes.map(x => `<p><span class="nst">★ ${x.stars}</span>${esc(x.note)} <small class="meta">· ${esc(FREQ[x.freq] || "")}</small></p>`).join("")}</div>` : ""}</div>` : ""}
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
let placeTimer;
async function loadLivePlaces(){
  const city = $("rCity").value.trim();
  if (!city){ S.livePlaces = []; renderRate(); return; }
  const { data } = await sb.from("places").select("id,name,category,city").ilike("city", city).eq("status", "open").order("name").limit(1000);
  if (norm($("rCity").value) === norm(city)){ S.livePlaces = data || []; renderRate(); }
}
function profileLine(){ return DK.map(d => S.profile?.[d]).filter(Boolean).join(" · "); }
function renderRate(){
  if (!$("rCity").value && S.profile?.home_city) $("rCity").value = S.profile.home_city;
  const keep = $("rPlace").value;
  $("rPlace").innerHTML = S.livePlaces.map(p => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.category)})</option>`).join("") + `<option value="__new">+ Add a new place</option>`;
  $("rPlace").value = [...$("rPlace").options].some(o => o.value === keep) ? keep : (S.livePlaces[0]?.id || "__new");
  $("newPlace").hidden = $("rPlace").value !== "__new";
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
  $("pCity").value = p.home_city || ""; $("pSchool").value = p.school || "";
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
async function refreshExplore(){ S.crowd = {}; S.notes = {}; await loadCities(); renderFilters(); await runSearch(); }

document.addEventListener("click", async e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.tab || t.dataset.go){
    S.tab = t.dataset.tab || t.dataset.go; render();
    if (S.tab === "rate") loadLivePlaces();
    return;
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
      if (!S.notes[id]) api.notes(id).then(n => { S.notes[id] = n; renderList(); }).catch(() => {});
    }
    renderList(); return;
  }
  if (t.dataset.rate){
    const r = S.rows.find(x => x.place_id === t.dataset.rate);
    S.tab = "rate"; $("rCity").value = S.city || ""; render();
    await loadLivePlaces(); if (r){ $("rPlace").value = r.place_id; renderRate(); }
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
$("rCity").addEventListener("input", () => { clearTimeout(placeTimer); placeTimer = setTimeout(loadLivePlaces, 300); });
$("rPlace").addEventListener("change", () => { $("newPlace").hidden = $("rPlace").value !== "__new"; });
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
  const city = $("rCity").value.trim();
  if (!city){ msg.textContent = "Enter the city the place is in."; return; }
  if (!S.stars){ msg.textContent = "Pick a star rating."; return; }
  let placeId = $("rPlace").value;
  const newName = $("npName").value.trim();
  if (placeId === "__new" && !newName){ msg.textContent = "Enter the place's name."; return; }
  $("rSubmit").disabled = true; msg.className = "msg"; msg.textContent = "Posting…";
  try {
    if (placeId === "__new"){
      const dup = S.livePlaces.find(p => norm(p.name) === norm(newName));
      if (dup) placeId = dup.id;
      else {
        const { data, error } = await sb.from("places").insert({ name: newName.slice(0, 120), category: $("npCat").value, city: city.slice(0, 60), neighborhood: $("npHood").value.trim().slice(0, 60) || null }).select("id").single();
        if (error) throw error; placeId = data.id;
      }
    }
    const { error } = await sb.from("reviews").upsert({ place_id: placeId, stars: S.stars, freq: $("rFreq").value, note: $("rNote").value.trim().slice(0, 280) || null }, { onConflict: "place_id,user_id" });
    if (error) throw error;
    S.stars = 0; $("rNote").value = ""; $("npName").value = ""; $("npHood").value = "";
    document.querySelectorAll("#stars input").forEach(i => i.checked = false);
    msg.textContent = "";
    S.source = "live"; S.sourceChosen = true; S.city = city; S.cat = "All"; S.open = new Set([placeId]); S.tab = "explore";
    render(); await refreshExplore();
    const c = S.cities.find(x => norm(x) === norm(city)); if (c && c !== S.city){ S.city = c; renderFilters(); runSearch(); }
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
  // Start on live data if there's anything there; otherwise show the sample.
  try {
    const { count } = await sb.from("places").select("id", { count: "exact", head: true });
    if (!S.sourceChosen && count > 0) S.source = "live";
  } catch {}
  render(); refreshExplore();
})();
