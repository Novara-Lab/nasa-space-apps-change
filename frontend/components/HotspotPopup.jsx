// hotspot popup with weather for both dates
function rainWord(mm) {
  if (mm < 2) return 'dry';
  if (mm < 15) return 'a little rain';
  if (mm < 50) return 'rainy';
  return 'very wet';
}

function soilWord(v) {
  if (v == null) return 'unknown';
  if (v < 0.15) return 'dry';
  if (v < 0.30) return 'moist';
  return 'wet';
}

// explain the weather difference
function weatherStory(h, A, B) {
  const lines = [];
  const soilDiff = A.soil != null && B.soil != null ? B.soil - A.soil : 0;
  const rainDiff = B.rain7 - A.rain7;
  const wetter = soilDiff >= 0.05 || rainDiff >= 25;
  const drier = soilDiff <= -0.05 || rainDiff <= -25;
  if (wetter) {
    lines.push({ tone: 'info', text: 'The ground was clearly wetter on the After date.' });
    lines.push(h.direction === 'brighter'
      ? { tone: 'warn', text: 'Wet ground reflects radar more strongly, so this brighter spot could simply be rain-soaked ground.' }
      : { tone: 'look', text: 'This spot got darker even though the ground was wetter, so rain alone does not explain it. Standing water (calm water looks dark to radar) or a real surface change are possible.' });
  } else if (drier) {
    lines.push({ tone: 'info', text: 'The ground was clearly drier on the After date.' });
    lines.push(h.direction === 'darker'
      ? { tone: 'warn', text: 'Dry ground reflects radar less, so this darker spot could simply be drying out.' }
      : { tone: 'look', text: 'This spot got brighter even though the ground was drier, so weather alone does not explain it. Growth, building work or other surface change is possible.' });
  } else {
    lines.push({ tone: 'look', text: 'The weather was similar before both dates, so weather is less likely to explain this change.' });
  }
  [[A, 'Before'], [B, 'After']].forEach(([w, name]) => {
    if (w.rainDay >= 10 || w.rainPrevDay >= 20)
      lines.push({ tone: 'info', text: `Heavy rain around the ${name} date (${w.rainPrevDay} mm the day before, ${w.rainDay} mm that day): puddles and wet leaves change radar brightness.` });
    if (w.rain30 < 10)
      lines.push({ tone: 'info', text: `Very little rain in the 30 days before the ${name} date (${w.rain30} mm): a dry spell.` });
  });
  return lines;
}

function RainBars({ days }) {
  const max = Math.max(...days, 10);
  return (
    <div className="rain-bars" title="Daily rain, 7 days up to the radar date (last bar = that day)">
      {days.map((mm, i) => <span key={i} style={{ height: `${Math.max(2, (mm / max) * 100)}%` }} title={`${mm} mm`} />)}
    </div>
  );
}

function HotspotPopup({ h, n, job }) {
  const [w, setW] = React.useState(null);
  const [err, setErr] = React.useState('');
  React.useEffect(() => {
    Promise.all([api.weather(h.lat, h.lon, job.granule_a.start), api.weather(h.lat, h.lon, job.granule_b.start)])
      .then(([A, B]) => setW({ A, B }))
      .catch(e => setErr(e.message));
  }, []);

  return (
    <div className="hs-popup">
      <div className="hs-pop-head">
        <span className={`hs-num ${h.direction}`}>{n}</span>
        <div>
          <strong>Hotspot {n}: {h.relative ? `${h.direction} than its surroundings` : `got ${h.direction}`}</strong>
          <div className="muted">{h.area_ha} ha changed · {h.mean_db > 0 ? '+' : ''}{h.mean_db} dB · {h.distance_km} km {h.bearing}</div>
        </div>
      </div>

      <div className="hs-pop-title">Weather before each radar image</div>
      {!w && !err && <div className="muted"><span className="spinner" /> Loading past weather…</div>}
      {err && <div className="error">Weather unavailable: {err}</div>}
      {w && <>
        <table className="wx">
          <thead><tr><th></th><th>Before<br /><small>{formatDay(w.A.day)}</small></th><th>After<br /><small>{formatDay(w.B.day)}</small></th></tr></thead>
          <tbody>
            <tr><td>Rain, past 7 days</td>
              <td><strong>{w.A.rain7} mm</strong><br /><small>{rainWord(w.A.rain7)}</small><RainBars days={w.A.last7} /></td>
              <td><strong>{w.B.rain7} mm</strong><br /><small>{rainWord(w.B.rain7)}</small><RainBars days={w.B.last7} /></td></tr>
            <tr><td>Rain, past 30 days</td><td>{w.A.rain30} mm</td><td>{w.B.rain30} mm</td></tr>
            <tr><td>Rain on the day</td><td>{w.A.rainDay} mm</td><td>{w.B.rainDay} mm</td></tr>
            <tr><td>Topsoil at pass time</td>
              <td>{soilWord(w.A.soil)}{w.A.soil != null && <small> ({w.A.soil.toFixed(2)})</small>}</td>
              <td>{soilWord(w.B.soil)}{w.B.soil != null && <small> ({w.B.soil.toFixed(2)})</small>}</td></tr>
            <tr><td>Temperature</td><td>{w.A.tmin}–{w.A.tmax} °C</td><td>{w.B.tmin}–{w.B.tmax} °C</td></tr>
          </tbody>
        </table>
        <div className="hs-pop-title">What this suggests</div>
        <ul className="wx-story">{weatherStory(h, w.A, w.B).map((l, i) => <li key={i} className={l.tone}>{l.text}</li>)}</ul>
        <div className="muted wx-src">Weather: Open-Meteo / ERA5 model estimates (~10–25 km grid), not a rain gauge at this exact spot.
          Soil wetness in m³/m³ for the top 7 cm. Radar passes at about {String(w.B.hourUtc).padStart(2, '0')}:00 UTC.</div>
      </>}
      <div className="muted wx-src">Provisional radar signal change: an idea to check, not confirmed damage or flooding.</div>
    </div>
  );
}
