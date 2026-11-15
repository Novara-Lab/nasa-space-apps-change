// map component (leaflet)
function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const FOOTPRINT_STYLE = {
  GCOV: { color: '#22c3a6', weight: 1.5, fill: false },
  GUNW: { color: '#a78bfa', weight: 1.5, fill: false, dashArray: '4 4' },
};

function ExplorerMap({ place, radiusKm, footprints, selectedIds, job, layer, focus, drawerOpen, pinMode, onMapPick, onCancelPin }) {
  const divRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const placeLayer = React.useRef(null);
  const footprintLayer = React.useRef(null);
  const overlayRef = React.useRef(null);
  const hotspotLayer = React.useRef(null);
  const hotspotMarkers = React.useRef([]);
  // latest values for map events
  const pickRef = React.useRef({ pinMode, onMapPick, onCancelPin });
  pickRef.current = { pinMode, onMapPick, onCancelPin };

  // create map
  React.useEffect(() => {
    const map = L.map(divRef.current, { worldCopyJump: true }).setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors (basemap only)',
    }).addTo(map);
    // keep the pin on top
    map.createPane('place').style.zIndex = 450;
    footprintLayer.current = L.layerGroup().addTo(map);
    placeLayer.current = L.layerGroup().addTo(map);
    hotspotLayer.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // click to pick a place
    map.on('click', e => {
      if (pickRef.current.pinMode) pickRef.current.onMapPick(e.latlng.lat, L.Util.wrapNum(e.latlng.lng, [-180, 180], true));
    });
    const onKey = e => { if (e.key === 'Escape' && pickRef.current.pinMode) pickRef.current.onCancelPin(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); map.remove(); };
  }, []);

  // pin and search circle
  React.useEffect(() => {
    placeLayer.current.clearLayers();
    if (!place) return;
    const center = [place.lat, place.lon];
    // drag the pin to search again
    const pinIcon = L.divIcon({ className: '', html: '<div class="place-pin"></div>', iconSize: [26, 26], iconAnchor: [13, 26] });
    L.marker(center, { icon: pinIcon, pane: 'place', draggable: true, autoPan: true })
      .bindPopup(`<strong>${escapeHtml(place.name)}</strong><br>Drag the pin to search another spot.`)
      .on('dragend', e => { const ll = e.target.getLatLng(); pickRef.current.onMapPick(ll.lat, L.Util.wrapNum(ll.lng, [-180, 180], true)); })
      .addTo(placeLayer.current);
    if (Number(radiusKm) > 0) {
      const circle = L.circle(center, { pane: 'place', radius: Number(radiusKm) * 1000, weight: 2, color: '#f97316', fill: false, dashArray: '6 6' })
        .addTo(placeLayer.current);
      mapRef.current.fitBounds(circle.getBounds(), { padding: [30, 30] });
    } else if (place.pinned && mapRef.current.getZoom() >= 9) {
      mapRef.current.panTo(center);
    } else {
      mapRef.current.setView(center, 11);
    }
  }, [place && place.lat, place && place.lon, place && place.name, radiusKm]);

  // crosshair when picking
  React.useEffect(() => {
    mapRef.current.getContainer().classList.toggle('picking', !!pinMode);
  }, [pinMode]);

  // footprints
  React.useEffect(() => {
    footprintLayer.current.clearLayers();
    if (!footprints || footprints.features.length === 0) return;
    L.geoJSON(footprints, {
      style: f => {
        const base = FOOTPRINT_STYLE[f.properties.product] || FOOTPRINT_STYLE.GCOV;
        if (selectedIds.includes(f.properties.id)) return { ...base, weight: 3, color: '#facc15' };
        return selectedIds.length ? { ...base, opacity: 0.35 } : base;
      },
      onEachFeature: (f, layer) => layer.bindPopup(
        `<strong>${escapeHtml(f.properties.product)}</strong> footprint (metadata)<br>` +
        `<small>${escapeHtml(f.properties.id)}</small><br>${escapeHtml(f.properties.start)}`),
    }).addTo(footprintLayer.current);
  }, [footprints, selectedIds]);

  // result image on the map
  const showOverlay = job && job.status === 'done' && layer !== 'none';
  React.useEffect(() => {
    if (overlayRef.current) { overlayRef.current.remove(); overlayRef.current = null; }
    if (!showOverlay) return;
    const file = { change: 'image', a: 'a', b: 'b' }[layer];
    overlayRef.current = L.imageOverlay(`/api/analysis/${job.id}/${file}.png`, job.bounds, { opacity: 0.9, zIndex: 300 })
      .addTo(mapRef.current);
  }, [job && job.id, job && job.status, layer]);
  // move map so popup is visible
  function keepInView(popup) {
    const el = popup.getElement(), map = mapRef.current;
    if (!el) return;
    const p = el.getBoundingClientRect(), m = map.getContainer().getBoundingClientRect(), pad = 12;
    let dx = 0, dy = 0;
    if (p.top < m.top + pad) dy = p.top - m.top - pad;
    else if (p.bottom > m.bottom - pad) dy = Math.min(p.bottom - m.bottom + pad, p.top - m.top - pad);
    if (p.left < m.left + pad) dx = p.left - m.left - pad;
    else if (p.right > m.right - pad) dx = p.right - m.right + pad;
    if (dx || dy) map.panBy([dx, dy], { animate: true });
  }

  // hotspot markers
  React.useEffect(() => {
    hotspotLayer.current.clearLayers();
    const spots = job && job.status === 'done' && job.report ? job.report.hotspots || [] : [];
    const roots = [];
    hotspotMarkers.current = spots.map((h, i) => {
      const icon = L.divIcon({ className: '', html: `<div class="hs-marker ${h.direction}">${i + 1}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] });
      // popup loads when first opened
      const box = document.createElement('div');
      let root = null;
      const marker = L.marker([h.lat, h.lon], { icon, pane: 'place' })
        .bindPopup(box, { minWidth: 320, maxWidth: 360, maxHeight: 460, autoPanPadding: [20, 20] })
        .on('popupopen', e => {
          if (!root) { root = ReactDOM.createRoot(box); roots.push(root); root.render(<HotspotPopup h={h} n={i + 1} job={job} />); }
          // resize after weather loads
          [60, 600, 1500].forEach(ms => setTimeout(() => { if (e.popup.isOpen()) { e.popup.update(); keepInView(e.popup); } }, ms));
        })
        .addTo(hotspotLayer.current);
      return marker;
    });
    return () => roots.forEach(r => setTimeout(() => r.unmount()));
  }, [job && job.id, job && job.status]);
  // zoom to clicked hotspot
  React.useEffect(() => {
    if (!focus) return;
    mapRef.current.setView([focus.lat, focus.lon], 15);
    const m = hotspotMarkers.current[focus.n - 1];
    if (m) setTimeout(() => m.openPopup(), 300);
  }, [focus && focus.t]);

  // fix map size when report opens
  React.useEffect(() => {
    const t = setTimeout(() => mapRef.current.invalidateSize(), 250);
    return () => clearTimeout(t);
  }, [drawerOpen]);

  // zoom to result
  React.useEffect(() => {
    if (job && job.status === 'done') mapRef.current.fitBounds(job.bounds, { padding: [20, 20] });
  }, [job && job.id, job && job.status]);

  const n = footprints ? footprints.features.length : 0;
  return (
    <div className="map-wrap">
      <div ref={divRef} className="map" />
      {pinMode && (
        <div className="pick-banner">📌 Click anywhere on the map to choose a spot
          <button type="button" onClick={onCancelPin}>Cancel</button></div>
      )}
      <div className="map-legend">
        <strong>What you are seeing</strong>
        <div><span className="sw" style={{ background: '#ddd' }} /> Basemap: OpenStreetMap (not NASA data)</div>
        <div><span className="sw ring" style={{ borderColor: '#f97316' }} /> Your place{Number(radiusKm) > 0 ? ' and search area' : ''}</div>
        <div><span className="sw ring" style={{ borderColor: '#22c3a6' }} /> GCOV footprint: metadata outline, not a measurement</div>
        <div><span className="sw ring dashed" style={{ borderColor: '#a78bfa' }} /> GUNW footprint: metadata outline</div>
        <div><span className="sw ring" style={{ borderColor: '#facc15' }} /> Chosen satellite view</div>
        {job && job.report && job.report.hotspots && job.report.hotspots.length > 0 &&
          <div><span className="hs-marker brighter legend-dot">1</span> Numbered hotspot (see report)</div>}
        <div className="muted small">{n} footprint{n === 1 ? '' : 's'} drawn</div>
      </div>
      {showOverlay && (
        <div className="map-legend result-legend">
          {layer === 'change' ? <>
            <strong>Provisional radar signal change</strong>
            <div className="muted small">{formatDay(job.granule_a.start)} → {formatDay(job.granule_b.start)}. NISAR {job.polarisation}, After − Before (dB). Real measurement, provisional data.</div>
            <div className="ramp" />
            <div className="ramp-labels"><span>−6 dB</span><span>0</span><span>+6 dB</span></div>
            <div><span className="sw" style={{ background: '#b2182b' }} /> Darker after (signal decreased)</div>
            <div><span className="sw" style={{ background: '#2166ac' }} /> Brighter after (signal increased)</div>
            <div><span className="sw nodata" /> Clear: no good data on one of the dates</div>
          </> : <>
            <strong>Radar image, {layer === 'a' ? 'before' : 'after'}</strong>
            <div className="muted small">{formatUtc(job[layer === 'a' ? 'granule_a' : 'granule_b'].start)} · {job.polarisation}. Real measurement, provisional data.</div>
            <div className="ramp grey" />
            <div className="ramp-labels"><span>dark (low)</span><span>bright (high)</span></div>
          </>}
        </div>
      )}
    </div>
  );
}
