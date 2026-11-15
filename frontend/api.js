// api calls used by the components
window.api = (function () {
  async function getJson(url, options) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail || '');
      throw new Error(detail || `Request failed (${response.status})`);
    }
    return data;
  }

  // place name to lat/lon
  async function geocode(query) {
    const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1' });
    const results = await getJson(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { Accept: 'application/json' },
    });
    const hit = results[0];
    if (!hit) return null;
    const lat = Number(hit.lat), lon = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Location service returned invalid coordinates.');
    return { name: hit.display_name, lat, lon };
  }

  // suggestions while typing (photon)
  function photonLabel(p) {
    const parts = [p.name, p.city, p.county, p.state, p.country].filter(Boolean);
    return [...new Set(parts)].join(', ');
  }
  async function suggest(query, signal) {
    const params = new URLSearchParams({ q: query, limit: '6', lang: 'en' });
    const data = await getJson(`https://photon.komoot.io/api/?${params}`, { signal });
    return (data.features || []).map(f => ({
      name: photonLabel(f.properties),
      title: f.properties.name || photonLabel(f.properties),
      subtitle: [f.properties.county, f.properties.state, f.properties.country].filter(Boolean).filter(x => x !== f.properties.name).join(', '),
      kind: f.properties.osm_value || f.properties.type || '',
      lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0],
    }));
  }

  // name for a pinned point
  async function reverse(lat, lon) {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon), lang: 'en' });
    const data = await getJson(`https://photon.komoot.io/reverse?${params}`);
    const f = (data.features || [])[0];
    return f ? photonLabel(f.properties) : null;
  }

  // past 30 days weather (open-meteo)
  const weatherCache = {};
  async function weather(lat, lon, isoTime) {
    const t = new Date(isoTime);
    const day = t.toISOString().slice(0, 10);
    const from = new Date(t.getTime() - 29 * 86400000).toISOString().slice(0, 10);
    const key = `${lat.toFixed(2)},${lon.toFixed(2)},${day}`;
    if (weatherCache[key]) return weatherCache[key];
    const params = new URLSearchParams({
      latitude: lat.toFixed(4), longitude: lon.toFixed(4), start_date: from, end_date: day, timezone: 'UTC',
      daily: 'precipitation_sum,temperature_2m_max,temperature_2m_min', hourly: 'soil_moisture_0_to_7cm',
    });
    const d = await getJson(`https://archive-api.open-meteo.com/v1/archive?${params}`);
    const rain = d.daily.precipitation_sum.map(v => v || 0);
    const sum = arr => Math.round(arr.reduce((a, b) => a + b, 0) * 10) / 10;
    const hourIdx = d.hourly.time.indexOf(`${day}T${String(t.getUTCHours()).padStart(2, '0')}:00`);
    const out = {
      day, hourUtc: t.getUTCHours(),
      rainDay: rain[rain.length - 1], rainPrevDay: rain[rain.length - 2] || 0,
      rain7: sum(rain.slice(-7)), rain30: sum(rain),
      last7: rain.slice(-7),
      tmax: d.daily.temperature_2m_max.slice(-1)[0], tmin: d.daily.temperature_2m_min.slice(-1)[0],
      soil: hourIdx >= 0 ? d.hourly.soil_moisture_0_to_7cm[hourIdx] : null, // top 7 cm
    };
    weatherCache[key] = out;
    return out;
  }

  // search observations
  function searchObservations({ lat, lon, radiusKm, startDate, endDate }) {
    const params = new URLSearchParams({
      lat: String(lat), lon: String(lon), radius_km: String(radiusKm),
      start_date: startDate, end_date: endDate, limit: '100', // per collection
    });
    return getJson(`/api/observations?${params}`);
  }

  // start and check a comparison
  function startAnalysis({ granuleA, granuleB, lat, lon, place }) {
    return getJson('/api/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ granule_a: granuleA, granule_b: granuleB, lat, lon, place }),
    });
  }
  function getAnalysis(id) { return getJson(`/api/analysis/${id}`); }

  return { geocode, suggest, reverse, weather, searchObservations, startAnalysis, getAnalysis };
})();
