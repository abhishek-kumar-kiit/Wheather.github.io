 const $ = id => document.getElementById(id);
const state = { country: null, coords: null, forecast: null };

// --- Event bindings ---
[
  ['search', 'keydown', e => e.key === 'Enter' && (e.preventDefault(), doSearch())],
  ['go', 'click', doSearch],
  ['useLoc', 'click', useMyLocation],
  ['clearRecent', 'click', () => (localStorage.removeItem('recentCountries'), renderRecent())],
].forEach(([id, ev, fn]) => $(id).addEventListener(ev, fn));

// --- Unit toggle ---
let unit = localStorage.getItem('unit') || 'C';
const setUnitButtons = u => {
  $('cBtn').ariaPressed = u === 'C';
  $('fBtn').ariaPressed = u === 'F';
};
['C', 'F'].forEach(u =>
  $(`${u.toLowerCase()}Btn`).addEventListener('click', () => {
    unit = u;
    localStorage.setItem('unit', u);
    setUnitButtons(u);
    if (state.coords) fetchWeather(state.coords);
  })
);
setUnitButtons(unit);

// --- Recent searches ---
const readRecent = () => JSON.parse(localStorage.getItem('recentCountries') || '[]');
const pushRecent = name => {
  let arr = readRecent().filter(x => x.toLowerCase() !== name.toLowerCase());
  arr.unshift(name.trim());
  localStorage.setItem('recentCountries', JSON.stringify(arr.slice(0, 5)));
  renderRecent();
};
const renderRecent = () => {
  const holder = $('recent'), arr = readRecent();
  holder.innerHTML = arr.length
    ? arr.map(n => `<button class="chip" title="Search ${n}">${n}</button>`).join('')
    : '<span class="label">(nothing yet)</span>';
  holder.querySelectorAll('button').forEach(b =>
    b.addEventListener('click', () => { $('search').value = b.textContent; doSearch(); })
  );
};
renderRecent();

// --- Search + location ---
async function doSearch() {
  const q = $('search').value.trim();
  if (!q) return;
  setStatus('statusCountry', 'loading'); setStatus('statusWeather', '—');
  try {
    const data = await fetchJSON(`https://restcountries.com/v3.1/name/${encodeURIComponent(q)}?fields=name,capital,population,region,flags,latlng`);
    const best = data.find(c => c.name.common.toLowerCase() === q.toLowerCase()) || data[0];
    if (!best) throw Error();
    const [lat, lon] = best.latlng || [];
    Object.assign(state, { country: best, coords: lat && lon ? { lat, lon } : null });
    $('countryName').textContent = best.name.common;
    $('countrySub').textContent = `${best.capital?.[0] || '—'} • ${best.population?.toLocaleString() || '—'} • ${best.region || '—'}`;
    $('capital').textContent = best.capital?.[0] || '—';
    $('region').textContent = best.region || '—';
    $('population').textContent = best.population?.toLocaleString() || '—';
    $('latlon').textContent = lat ? `${lat.toFixed(2)} / ${lon.toFixed(2)}` : '—';
    $('flag').innerHTML = best.flags?.svg ? `<img alt="Flag of ${best.name.common}" src="${best.flags.svg}">` : '🏳️';
    setStatus('statusCountry', 'ok');
    if (state.coords) { pushRecent(best.name.common); await fetchWeather(state.coords); }
    else setStatus('statusWeather', 'No coordinates');
  } catch {
    setStatus('statusCountry', 'error');
    alert('Country not found. Try a different name.');
  }
}

function useMyLocation() {
  if (!navigator.geolocation) return alert('Geolocation not supported');
  setStatus('statusWeather', 'locating…');
  navigator.geolocation.getCurrentPosition(async ({ coords:{ latitude:lat, longitude:lon } }) => {
    Object.assign(state, { coords:{ lat, lon } });
    $('countryName').textContent = 'Your location';
    $('countrySub').textContent = `${lat.toFixed(2)} / ${lon.toFixed(2)}`;
    $('flag').textContent = '📍';
    ['capital','region','population'].forEach(id => $(id).textContent = '—');
    $('latlon').textContent = `${lat.toFixed(2)} / ${lon.toFixed(2)}`;
    await fetchWeather(state.coords);
  }, ()=>{ setStatus('statusWeather','error'); alert('Could not get your location'); },
  { enableHighAccuracy:true, timeout:10000 });
}

// --- Weather fetch ---
async function fetchWeather({ lat, lon }) {
  try {
    setStatus('statusWeather','loading');
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto&hourly=precipitation&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max`;
    const w = await fetchJSON(url); state.forecast = w;
    const t = w.current_weather?.temperature, wind = w.current_weather?.windspeed;
    const idx = w.hourly?.time.indexOf(w.current_weather?.time);
    $('nowTemp').textContent = t==null ? '—' : (unit==='C'?`${t.toFixed(1)} °C`:`${(t*9/5+32).toFixed(1)} °F`);
    $('nowWind').textContent = wind==null ? '—' : `${wind.toFixed(0)} km/h`;
    $('nowRain').textContent = idx>-1 ? `${(w.hourly.precipitation[idx]||0).toFixed(1)} mm` : '—';
    setStatus('statusWeather','ok'); drawChart(w);
  } catch { setStatus('statusWeather','error'); }
}

// --- Chart ---
function drawChart(w) {
  const cv = $('chart'), ctx = cv.getContext('2d'),
        W = cv.clientWidth || 900, H = cv.height, padL=44, padR=20, padT=20, padB=34,
        chartW = W - padL - padR, chartH = H - padT - padB;
  cv.width = W; ctx.clearRect(0,0,W,H);

  const labels = w.daily.time.map(d => new Date(d).toLocaleDateString(undefined,{weekday:'short'})),
        tMax = w.daily.temperature_2m_max.map(c => unit==='C'?c:c*9/5+32),
        tMin = w.daily.temperature_2m_min.map(c => unit==='C'?c:c*9/5+32),
        precip = w.daily.precipitation_sum,
        tVals = [...tMax,...tMin], tMinV = Math.min(...tVals)-2, tMaxV = Math.max(...tVals)+2, pMax = Math.max(...precip,1),
        x = i => padL + i*(chartW/(labels.length-1||1)),
        yT= v => padT + (1-(v-tMinV)/(tMaxV-tMinV))*chartH,
        yP= v => padT+chartH-(v/pMax)*chartH;

  // Grid
  ctx.setLineDash([4,6]); ctx.strokeStyle='#b7c7d4'; ctx.globalAlpha=.25;
  labels.forEach((_,i)=>{ ctx.beginPath(); ctx.moveTo(x(i),padT); ctx.lineTo(x(i),padT+chartH); ctx.stroke(); });
  ctx.setLineDash([]); ctx.globalAlpha=1;

  // Precip bars
  precip.forEach((v,i)=>{ const bw=chartW/(labels.length*1.6); ctx.fillStyle='rgba(84,209,0,.5)'; ctx.fillRect(x(i)-bw/2,yP(v),bw,padT+chartH-yP(v)); });

  // Temp lines
  const drawLine=(d,col)=>{ ctx.beginPath(); ctx.strokeStyle=col; ctx.lineWidth=2.5;
    d.forEach((v,i)=> i?ctx.lineTo(x(i),yT(v)):ctx.moveTo(x(i),yT(v))); ctx.stroke();
    d.forEach((v,i)=>{ ctx.beginPath(); ctx.arc(x(i),yT(v),3.5,0,2*Math.PI); ctx.fillStyle=col; ctx.fill(); });
  };
  drawLine(tMin,'#71ffa5'); drawLine(tMax,'#fff');

  // Labels
  ctx.fillStyle='#b7c7d4'; ctx.font='12px Inter,system-ui'; ctx.textAlign='center';
  labels.forEach((lb,i)=> ctx.fillText(lb,x(i),H-10));
  ctx.textAlign='right'; for(let s=0;s<=4;s++){ const v=tMinV+(s/4)*(tMaxV-tMinV); ctx.fillText(`${v.toFixed(0)}°`,padL-8,yT(v)+4); }
  ctx.textAlign='left'; ctx.fillText('High',padL+8,padT+14); ctx.fillText('Low',padL+60,padT+14); ctx.fillText('Precip',padL+108,padT+14);
}

const setStatus = (id, type) => {
  const el = $(id), map = {ok:'✓',loading:'Loading…',error:'Error','—':'—'};
  el.textContent = map[type]||type;
  el.style.color = {error:'var(--danger)',ok:'var(--accent)'}[type] || 'var(--muted)';
};
const fetchJSON = async url => (await fetch(url)).json();

(() => { $('search').value = readRecent()[0] || 'India'; doSearch(); })();
