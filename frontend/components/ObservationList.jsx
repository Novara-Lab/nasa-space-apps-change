// step 2: pick a satellite view (only dates in the same view can be compared)
function formatUtc(value) {
  if (!value) return 'Date not supplied';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

function formatDay(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function stackTitle(s) {
  return `${s.direction === 'ASCENDING' ? 'Ascending' : 'Descending'} pass · Track ${s.track}, Frame ${s.frame}`;
}

function ObservationList({ result, searched, busy, stackId, onPickStack }) {
  const stacks = result ? result.stacks : [];
  const all = result ? result.observations : [];
  return (
    <section className="panel">
      <h2><span className="step">2</span> Pick a satellite view</h2>
      {!searched && <p className="muted">Search a place to see which NISAR radar images cover it.</p>}
      {searched && busy && <p className="muted">Looking for NISAR images of this place…</p>}
      {searched && !busy && result && stacks.length === 0 && (
        <p className="notice">No NISAR radar images cover this exact place in the chosen dates.
          Try another place nearby, or widen the area under “More options”.</p>
      )}
      {stacks.length > 0 && (
        <p className="muted small">NISAR photographs the same strip of ground about every 12 days.
          Each view below is one repeating strip; you can compare any two of its dates.</p>
      )}
      <div className="stack-list">
        {stacks.map(s => (
          <button type="button" key={s.stack_id} className={`stack ${s.stack_id === stackId ? 'on' : ''}`}
            onClick={() => onPickStack(s.stack_id)} disabled={s.count < 2}>
            <div className="stack-head">
              <strong>{stackTitle(s)}</strong>
              <span className="count-pill">{s.count} date{s.count === 1 ? '' : 's'}</span>
            </div>
            <div className="small">{formatDay(s.first)} → {formatDay(s.last)}</div>
            <div className="mat-row">
              {['BETA', 'PROVISIONAL', 'VALIDATED'].map(m => {
                const n = s.dates.filter(d => d.maturity === m).length;
                return n ? <span key={m} className={`tag mat-${m}`}>{n} {m.toLowerCase()}</span> : null;
              })}
            </div>
            {s.count < 2 && <div className="muted small">Only one date, so nothing to compare yet.</div>}
          </button>
        ))}
      </div>

      {all.length > 0 && (
        <details className="more">
          <summary>All {all.length} images found (advanced)</summary>
          <div className="obs-list">
            {all.map(item => (
              <div key={`${item.product}-${item.id}`} className="obs">
                <div className="obs-head">
                  <span className={`tag ${item.product}`}>{item.product}</span>
                  <span className={`tag mat-${item.maturity}`}>{item.maturity}</span>
                  <strong>{formatUtc(item.start)}</strong>
                </div>
                <div className="small">Stack {item.pairing.stack_id || '?'} · {(item.pairing.polarizations || []).join('/')}</div>
                <div className="obs-id">{item.id}</div>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
