// report shown after a comparison
function ReportPanel({ job, onHotspot, onClose }) {
  if (!job || job.status !== 'done' || !job.report || !job.report.summary) return null;
  const r = job.report;
  const ba = r.before_after;
  const shift = r.level === 'shift';
  const changedPct = shift ? r.local_changed_pct : r.changed.total_pct;
  // min 10% so small values look small
  const maxZone = Math.max(...r.zones.map(z => z.changed_pct || 0), 10);
  const icon = { low: '✓', medium: '◐', high: '!', shift: '≈' }[r.level] || '•';

  return (
    <aside className="report-drawer" aria-label="Comparison report">
      <div className="drawer-head">
        <div>
          <div className="eyebrow">What happened here?</div>
          <div className="muted small">{formatDay(r.period.from)} → {formatDay(r.period.to)} · {r.period.days} days</div>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close report" title="Close report">✕</button>
      </div>

      <div className={`hero lvl-${r.level}`}>
        <span className="hero-icon" aria-hidden="true">{icon}</span>
        <div>
          <div className="hero-title">{r.headline}</div>
          <div className="small">{levelHint(r.level)}</div>
        </div>
      </div>

      <p className="lead">{r.summary}</p>

      <div className="tiles">
        <div className="tile"><strong>{changedPct}%</strong><small>{shift ? 'changed locally' : 'of the area changed'}</small></div>
        <div className="tile"><strong className="up">{r.changed.brighter_ha} ha</strong><small>got brighter</small></div>
        <div className="tile"><strong className="down">{r.changed.darker_ha} ha</strong><small>got darker</small></div>
      </div>

      <Section title={`Hotspots to look at (${r.hotspots.length})`} open>
        {r.hotspots.length === 0
          ? <p className="muted small">No compact clusters of change. Changes are scattered, which usually means noise or gradual change.</p>
          : r.hotspots.map((h, i) => (
            <button key={i} type="button" className="hs-card" onClick={() => onHotspot(h, i)} title="Zoom the map to this spot">
              <span className={`hs-num ${h.direction}`}>{i + 1}</span>
              <span>
                <strong>{h.distance_km} km {h.bearing}</strong>
                <span className="small"> · {h.relative ? `${h.direction} than surroundings` : `got ${h.direction}`}</span>
                <span className="muted small d-block">{h.area_ha} ha changed · {h.mean_db > 0 ? '+' : ''}{h.mean_db} dB · click for weather &amp; zoom</span>
              </span>
            </button>
          ))}
        {r.hotspots.length > 0 && <p className="muted small">Blue = brighter, red = darker. Click a hotspot to zoom there and see the weather before each date.</p>}
      </Section>

      <Section title="Where in the area?" open>
        <div className="zone-grid" aria-label="Share of clearly changed area in each ninth of the square, north at the top">
          {r.zones.map(z => {
            const alpha = 0.08 + 0.7 * (z.changed_pct || 0) / maxZone;
            return (
            <div key={z.name} className="zone" title={`${z.name}: ${z.changed_pct}% changed`}
              style={{ background: `rgba(250, 204, 21, ${alpha})`, color: alpha > 0.45 ? '#111' : 'var(--text)' }}>
              <small>{z.name}</small><strong>{z.changed_pct ?? '–'}%</strong>
            </div>
            );
          })}
        </div>
        <p className="muted small">North is at the top. Stronger yellow = more of that part changed.</p>
      </Section>

      <Section title="Before vs after">
        <table className="ba">
          <thead><tr><th></th><th>Before</th><th>After</th></tr></thead>
          <tbody>
            <tr><td>Typical brightness</td><td>{ba.median_db_before} dB</td><td>{ba.median_db_after} dB</td></tr>
            <tr><td>Very dark area <span className="muted">(often water)</span></td><td>{ba.very_dark_pct_before}%</td><td>{ba.very_dark_pct_after}%</td></tr>
          </tbody>
        </table>
        <p className="muted small">Use the <strong>Before</strong> / <strong>After</strong> buttons on the left to see each radar image.</p>
      </Section>

      {r.possible_causes.length > 0 && (
        <Section title="What could cause this?">
          <p className="muted small">Radar alone cannot tell which of these happened. Treat them as ideas to check.</p>
          {r.possible_causes.map(c => (
            <div key={c.pattern} className="cause"><strong>{c.pattern}</strong>
              <ul>{c.examples.map(e => <li key={e}>{e}</li>)}</ul></div>
          ))}
        </Section>
      )}

      <Section title="How to check it">
        <ul className="notes">{r.next_steps.map(n => <li key={n}>{n}</li>)}</ul>
      </Section>

      <Section title={`Things to keep in mind (${r.notes.length})`}>
        <ul className="notes">{r.notes.map(n => <li key={n}>{n}</li>)}</ul>
      </Section>

      <p className="notice small">This is a <strong>provisional radar signal change</strong> measured by NISAR (provisional data).
        It does not confirm damage, flooding or ground movement.</p>
    </aside>
  );
}

function levelHint(level) {
  return {
    low: 'Very little of the area changed between the two dates.',
    medium: 'A few patches changed; the rest stayed similar.',
    high: 'A large share of the area changed.',
    shift: 'The whole area changed together, which usually has an area-wide cause.',
  }[level] || '';
}

function Section({ title, open, children }) {
  return (
    <details className="r-section" open={open}>
      <summary>{title}</summary>
      <div className="r-body">{children}</div>
    </details>
  );
}
