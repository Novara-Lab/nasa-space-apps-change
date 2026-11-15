// step 1: search a place or pin it on the map
function SearchPanel({ place, onSearch, onPickPlace, busy, opts, setOpts, pinMode, onTogglePin }) {
  const [query, setQuery] = React.useState('');
  const [items, setItems] = React.useState([]);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const [error, setError] = React.useState('');
  const typed = React.useRef(false); // true when user typed

  // show the place name in the box
  React.useEffect(() => {
    if (place) { typed.current = false; setQuery(place.name); setOpen(false); }
  }, [place && place.lat, place && place.lon, place && place.name]);

  // wait 300 ms after typing, then get suggestions
  React.useEffect(() => {
    if (!typed.current || query.trim().length < 3) { setItems([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const list = await api.suggest(query.trim(), ctrl.signal);
        setItems(list); setOpen(true); setActive(-1);
      } catch (e) { if (e.name !== 'AbortError') setItems([]); }
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);

  function validDates() {
    if (!opts.startDate || !opts.endDate || opts.startDate > opts.endDate) {
      setError('The start date must be on or before the end date.'); return false;
    }
    return true;
  }

  function choose(item) {
    if (!validDates()) return;
    setOpen(false); setError('');
    onPickPlace({ name: item.name, lat: item.lat, lon: item.lon });
  }

  function submit(event) {
    event.preventDefault();
    if (open && active >= 0 && items[active]) { choose(items[active]); return; }
    if (!query.trim()) { setError('Type a city, town or place, or pin a spot on the map.'); return; }
    if (!validDates()) return;
    setError(''); setOpen(false);
    // use the first suggestion if there is one
    if (items[0]) choose(items[0]); else onSearch(query.trim());
  }

  function onKeyDown(e) {
    if (!open || items.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  return (
    <section className="panel">
      <h2><span className="step">1</span> Where do you want to look?</h2>
      <form onSubmit={submit} autoComplete="off">
        <div className="row suggest-wrap">
          <input aria-label="Place" placeholder="Start typing a place, e.g. Kandy" value={query}
            onChange={e => { typed.current = true; setQuery(e.target.value); setError(''); }}
            onKeyDown={onKeyDown} onFocus={() => items.length && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            disabled={busy} role="combobox" aria-expanded={open} aria-autocomplete="list" />
          <button className="go" type="submit" disabled={busy}>{busy ? 'Searching…' : 'Search'}</button>
          {open && items.length > 0 && (
            <ul className="suggestions" role="listbox">
              {items.map((it, i) => (
                <li key={`${it.lat},${it.lon},${i}`} role="option" aria-selected={i === active}
                  className={i === active ? 'active' : ''}
                  onMouseDown={e => { e.preventDefault(); choose(it); }} onMouseEnter={() => setActive(i)}>
                  <span className="sg-pin" aria-hidden="true">📍</span>
                  <span><strong>{it.title}</strong>{it.kind && <span className="sg-kind"> {it.kind}</span>}
                    {it.subtitle && <span className="muted small d-block">{it.subtitle}</span>}</span>
                </li>
              ))}
              <li className="sg-credit">Suggestions © OpenStreetMap contributors, via Photon</li>
            </ul>
          )}
        </div>
      </form>

      <button type="button" className={`pin-btn ${pinMode ? 'on' : ''}`} onClick={onTogglePin} disabled={busy}>
        {pinMode ? '✕ Cancel: click anywhere on the map' : '📌 Or pick a spot on the map'}
      </button>

      <details className="more">
        <summary>More options (dates, area)</summary>
        <div className="grid2">
          <label>From (UTC)<input type="date" value={opts.startDate} max={opts.endDate}
            onChange={e => setOpts({ ...opts, startDate: e.target.value })} /></label>
          <label>To (UTC)<input type="date" value={opts.endDate} min={opts.startDate}
            onChange={e => setOpts({ ...opts, endDate: e.target.value })} /></label>
        </div>
        <label>Which images
          <select value={opts.radiusKm} onChange={e => setOpts({ ...opts, radiusKm: e.target.value })}>
            <option value="0">Only images that cover this exact place (recommended)</option>
            <option value="10">Images within 10 km</option>
            <option value="25">Images within 25 km</option>
            <option value="50">Images within 50 km</option>
          </select>
        </label>
        <p className="muted small">NISAR data starts in late 2025, so earlier dates find nothing. Changes apply to your next search.</p>
      </details>

      {place && <p className="muted small">📍 {place.lat.toFixed(4)}, {place.lon.toFixed(4)}{place.pinned ? ' · pinned on the map (drag the pin to move it)' : ''}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
