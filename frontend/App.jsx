// main app
// link example: /?q=Kandy or /?lat=7.29&lon=80.63 (add &a=<id>&b=<id> to compare)
function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

const urlParams = new URLSearchParams(window.location.search);
const INITIAL = {
  query: urlParams.get('q') || '',
  startDate: urlParams.get('start') || '2025-10-01', // first NISAR data
  endDate: urlParams.get('end') || isoToday(),
  radiusKm: urlParams.get('radius') || '0',           // 0 = exact place
  lat: urlParams.get('lat'),
  lon: urlParams.get('lon'),
  a: urlParams.get('a'),
  b: urlParams.get('b'),
};

function App() {
  const [place, setPlace] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [radiusKm, setRadiusKm] = React.useState(INITIAL.radiusKm);
  const [opts, setOpts] = React.useState({ startDate: INITIAL.startDate, endDate: INITIAL.endDate, radiusKm: INITIAL.radiusKm });
  const [pinMode, setPinMode] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [searched, setSearched] = React.useState(false);
  const [stackId, setStackId] = React.useState(null);
  const [pair, setPair] = React.useState({ a: null, b: null });
  const [error, setError] = React.useState('');
  const [job, setJob] = React.useState(null);
  const [layer, setLayer] = React.useState('change');
  const [focus, setFocus] = React.useState(null); // hotspot to zoom to
  const [reportOpen, setReportOpen] = React.useState(true);
  // open the report when a job finishes
  React.useEffect(() => {
    if (job && job.status === 'done') setReportOpen(true);
  }, [job && job.id, job && job.status]);

  const stacks = result ? result.stacks : [];
  const stack = stacks.find(s => s.stack_id === stackId) || null;

  // select oldest and newest dates
  function pickStack(id, res = result) {
    const s = res.stacks.find(x => x.stack_id === id);
    setStackId(id); setJob(null); setLayer('change');
    setPair(s && s.count >= 2 ? { a: s.dates[0].id, b: s.dates[s.count - 1].id } : { a: null, b: null });
  }

  function pickPair(a, b) {
    setPair({ a, b }); setJob(null); setLayer('change');
  }

  // search images for a place
  async function searchAt(hit, o = opts) {
    setBusy(true); setError(''); setSearched(false); setResult(null); setStackId(null); setJob(null);
    try {
      setPlace(hit); setRadiusKm(o.radiusKm); setSearched(true);
      const res = await api.searchObservations({ lat: hit.lat, lon: hit.lon, ...o });
      setResult(res);
      // pick the view with most dates
      const best = res.stacks.find(s => s.count >= 2);
      if (best) pickStack(best.stack_id, res);
      return { hit, res };
    } catch (e) {
      setError(`Search failed: ${e.message}`);
      return null;
    } finally {
      setBusy(false);
    }
  }

  // search by typed text
  async function search(query, o = opts) {
    try {
      const hit = await api.geocode(query);
      if (!hit) { setError('Place not found. Pick one of the suggestions, or pin the spot on the map.'); return null; }
      return await searchAt(hit, o);
    } catch (e) {
      setError(`Place search failed: ${e.message}`);
      return null;
    }
  }

  // user clicked on the map
  async function pickOnMap(lat, lon) {
    setPinMode(false);
    const hit = { name: `Pinned spot (${lat.toFixed(4)}, ${lon.toFixed(4)})`, lat, lon, pinned: true };
    searchAt(hit);
    // get the place name
    try {
      const name = await api.reverse(lat, lon);
      if (name) setPlace(p => (p && p.lat === lat && p.lon === lon ? { ...p, name: `Near ${name}` } : p));
    } catch (e) { /* keep coordinates */ }
  }

  // run search from the link
  React.useEffect(() => {
    const pinned = INITIAL.lat && INITIAL.lon;
    if (!INITIAL.query && !pinned) return;
    (async () => {
      const found = pinned
        ? await searchAt({ name: `Pinned spot (${INITIAL.lat}, ${INITIAL.lon})`, lat: Number(INITIAL.lat), lon: Number(INITIAL.lon), pinned: true })
        : await search(INITIAL.query);
      if (!found || !INITIAL.a || !INITIAL.b) return;
      const s = found.res.stacks.find(x => x.dates.some(d => d.id === INITIAL.a) && x.dates.some(d => d.id === INITIAL.b));
      if (!s) { setError('The two images in the link are not in the same satellite view for this place.'); return; }
      setStackId(s.stack_id);
      const [a, b] = [INITIAL.a, INITIAL.b].map(id => s.dates.find(d => d.id === id)).sort((x, y) => x.start.localeCompare(y.start));
      setPair({ a: a.id, b: b.id });
      try {
        setJob(await api.startAnalysis({ granuleA: a.id, granuleB: b.id, lat: found.hit.lat, lon: found.hit.lon, place: found.hit.name }));
      } catch (e) { setError(e.message); }
    })();
  }, []);

  const highlightIds = stack ? stack.dates.map(d => d.id) : [];
  const hasReport = !!(job && job.status === 'done' && job.report && job.report.summary);
  const showReport = hasReport && reportOpen;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="logo">N</span> NISAR Change Explorer</div>
        <span className="badge">Provisional NISAR data · prototype</span>
      </header>
      <div className="layout">
        <aside className="sidebar">
          <SearchPanel place={place} onSearch={search} onPickPlace={hit => searchAt(hit)} busy={busy}
            opts={opts} setOpts={setOpts} pinMode={pinMode} onTogglePin={() => setPinMode(m => !m)} />
          {error && <p className="error" role="alert">{error}</p>}
          <ObservationList result={result} searched={searched} busy={busy} stackId={stackId} onPickStack={id => pickStack(id)} />
          <ChangePanel stack={stack} aId={pair.a} bId={pair.b} onPick={pickPair} place={place}
            job={job} onJob={setJob} layer={layer} onLayer={setLayer} />
          <p className="muted small footer-note">Image search: NASA CMR · Radar data: NISAR (NASA/ISRO) via ASF · Novara Labs, NASA Space Apps 2026</p>
        </aside>
        <main className="main">
          <div className="map-area">
            <ExplorerMap place={place} radiusKm={radiusKm} footprints={result ? result.footprints : null}
              selectedIds={highlightIds} job={job} layer={layer} focus={focus} drawerOpen={showReport}
              pinMode={pinMode} onMapPick={pickOnMap} onCancelPin={() => setPinMode(false)} />
            {hasReport && !reportOpen && (
              <button type="button" className="report-tab" onClick={() => setReportOpen(true)}>Show report ›</button>
            )}
          </div>
          {showReport && (
            <ReportPanel job={job} onClose={() => setReportOpen(false)}
              onHotspot={(h, i) => setFocus({ ...h, n: i + 1, t: Date.now() })} />
          )}
        </main>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
