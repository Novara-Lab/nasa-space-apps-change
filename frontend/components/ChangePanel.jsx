// step 3: pick before/after and compare
function ChangePanel({ stack, aId, bId, onPick, place, job, onJob, layer, onLayer }) {
  const [error, setError] = React.useState('');
  const [starting, setStarting] = React.useState(false);
  const running = job && job.status === 'running';
  const busy = starting || running;

  // check the job every 2 s
  React.useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      try { onJob(await api.getAnalysis(job.id)); } catch (e) { setError(e.message); }
    }, 2000);
    return () => clearInterval(t);
  }, [running, job && job.id]);

  if (!stack) {
    return (
      <section className="panel">
        <h2><span className="step">3</span> Compare before and after</h2>
        <p className="muted">Pick a satellite view above first.</p>
      </section>
    );
  }

  const dates = stack.dates;
  const a = dates.find(d => d.id === aId), b = dates.find(d => d.id === bId);
  const label = d => `${formatDay(d.start)} (${d.maturity.toLowerCase()})`;
  const days = a && b ? Math.round((new Date(b.start) - new Date(a.start)) / 86400000) : 0;

  async function run() {
    if (busy) return;
    setError(''); setStarting(true);
    onJob(null);
    try {
      onJob(await api.startAnalysis({ granuleA: a.id, granuleB: b.id, lat: place.lat, lon: place.lon, place: place.name }));
    } catch (e) { setError(e.message); }
    finally { setStarting(false); }
  }

  return (
    <section className="panel">
      <h2><span className="step">3</span> Compare before and after</h2>
      <div className="presets">
        <button type="button" onClick={() => onPick(dates[0].id, dates[dates.length - 1].id)}>Longest gap</button>
        <button type="button" onClick={() => onPick(dates[dates.length - 2].id, dates[dates.length - 1].id)}>Latest two</button>
      </div>
      <label>Before
        <select value={aId || ''} onChange={e => onPick(e.target.value, bId)} disabled={busy}>
          {dates.slice(0, -1).map(d => <option key={d.id} value={d.id} disabled={b && d.start >= b.start}>{label(d)}</option>)}
        </select>
      </label>
      <label>After
        <select value={bId || ''} onChange={e => onPick(aId, e.target.value)} disabled={busy}>
          {dates.slice(1).map(d => <option key={d.id} value={d.id} disabled={a && d.start <= a.start}>{label(d)}</option>)}
        </select>
      </label>
      {a && b && <p className="muted small">{days} days apart · same satellite view, so the images line up.</p>}
      {a && b && a.maturity !== b.maturity && (
        <p className="notice small">Mixed releases ({a.maturity.toLowerCase()} → {b.maturity.toLowerCase()}): allowed, but processing can differ a little between releases.</p>
      )}
      <button className="primary" type="button" onClick={run} disabled={!a || !b || busy}>
        {starting ? <><span className="spinner dark" /> Starting…</> : running ? <><span className="spinner dark" /> Comparing… (about 1 minute)</> : 'Compare'}
      </button>
      {error && <p className="error">{error}</p>}
      {starting && <div className="job"><span className="spinner" /> Checking the two images with NASA…</div>}

      {job && (
        <div className={`job job-${job.status}`}>
          {job.status === 'running' && <div><span className="spinner" /> {job.step}</div>}
          {job.status === 'done' && <ResultSummary job={job} />}
          {(job.status === 'failed' || job.status === 'rejected') && <div><strong>Could not compare:</strong> {job.step}</div>}
          {job.warnings && job.warnings.length > 0 && <ul>{job.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
          {job.status === 'done' && (
            <div className="layer-switch" role="group" aria-label="Map layer">
              {[['change', 'Change'], ['a', 'Before'], ['b', 'After'], ['none', 'Hide']].map(([k, text]) => (
                <button key={k} type="button" className={layer === k ? 'on' : ''} onClick={() => onLayer(k)}>{text}</button>
              ))}
            </div>
          )}
          {job.cautions && job.cautions.length > 0 && (
            <details className="more"><summary>Notes on this result ({job.cautions.length})</summary>
              <ul className="cautions">{job.cautions.map(w => <li key={w}>{w}</li>)}</ul></details>
          )}
        </div>
      )}
      <p className="notice small">
        This shows a <strong>provisional radar signal change</strong> in a ~10 km square around the place.
        Radar brightness changes with soil moisture, crops, construction, water and more. It does <strong>not</strong> confirm
        damage, flooding or ground movement.
      </p>
    </section>
  );
}

// short summary of the result
function ResultSummary({ job }) {
  const s = job.stats;
  const up = s.pct_increase_gt3db, down = s.pct_decrease_gt3db;
  const strong = up + down;
  const verdict = job.report && job.report.headline ? job.report.headline
    : strong < 2 ? 'Mostly unchanged' : strong < 10 ? 'Some patches changed' : 'Large areas changed';
  return (
    <div>
      <div className="verdict">{verdict}</div>
      <div className="stat-row">
        <div><strong className="up">{up}%</strong><small>got clearly brighter</small></div>
        <div><strong className="down">{down}%</strong><small>got clearly darker</small></div>
        <div><strong>{s.median_db > 0 ? '+' : ''}{s.median_db} dB</strong><small>typical change</small></div>
      </div>
      <p className="muted small">“Clearly” = more than 3 dB. {s.valid_pixels.toLocaleString()} of {s.total_pixels.toLocaleString()} pixels
        had good data on both dates. {job.polarisation}, {job.spacing_m && job.spacing_m[0]} m pixels.
        {job.report && job.report.summary && ' The full report is on the right of the map →'}</p>
    </div>
  );
}
