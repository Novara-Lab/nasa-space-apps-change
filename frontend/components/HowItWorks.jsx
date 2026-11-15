// how it works page
const HOW_STEPS = [
  {
    title: 'Find a place', images: [['step1-search', 'Search box with place suggestions']],
    text: 'Start typing a place name and pick one of the suggestions, or press “Or pick a spot on the map” and click anywhere on the map. You can drag the pin to move it.',
    points: [
      'Under “More options” you can change the dates. They start in October 2025, when NISAR data became available.',
      '“Only images that cover this exact place” is the safest choice. Wider areas find more images.',
    ],
  },
  {
    title: 'Pick a satellite view', images: [['step2-views', 'List of satellite views with their dates']],
    text: 'NISAR passes over the same spot again and again on a fixed orbit. The app groups the images by “view” (pass direction, track and frame).',
    points: [
      'Only images from the same view line up exactly, so you always compare inside one view.',
      'The view with the most dates is picked for you.',
    ],
  },
  {
    title: 'Choose Before and After, then Compare', images: [['step3-compare', 'Compare panel with Before and After dates and the result']],
    text: 'Pick the two dates, or use the quick buttons “Longest gap” and “Latest two”, then press Compare.',
    points: [
      'The app reads the real radar images from NASA, so the first run takes about a minute. Opening the same pair again is instant.',
      'If the two images come from different data releases (beta vs validated), you will see a note.',
    ],
  },
  {
    title: 'Read the change map', images: [['step4-map', 'Change map: blue is brighter, red is darker'], ['step4-before', 'The Before radar image on the map']],
    text: 'The coloured layer shows After minus Before for a ~10 km square around your place.',
    points: [
      'Blue = the radar echo got stronger (brighter). Red = it got weaker (darker). Faint colours are small changes.',
      'Use the Change / Before / After / Hide buttons to flip between the change map and each radar image.',
    ],
  },
  {
    title: 'See “What happened here?”', images: [['step5-report', 'The report panel on the right of the map']],
    text: 'A plain-language report opens on the right of the map as soon as the comparison is done.',
    points: [
      'A one-line verdict and summary, how much of the area changed, and how many hectares got brighter or darker.',
      'Hotspots, a 3×3 “where in the area” grid, before vs after numbers, possible causes and how to check them.',
    ],
  },
  {
    title: 'Check hotspots and the weather', images: [['step6-hotspot', 'Hotspot popup with the weather before each date']],
    text: 'Click a numbered hotspot to zoom the map to it. A popup shows the rain and soil moisture before each date.',
    points: [
      'Rain and wet soil make radar brighter, so this helps you tell real change from weather.',
    ],
  },
  {
    title: 'Download the report', images: [['step7-download', 'Download report button'], ['step7-pdf', 'Pages of the PDF report']],
    text: 'Press “Download report (PDF)” at the top of the report to save everything as a tidy A4 PDF.',
    points: [
      'It includes a location map, both radar images, the change map with hotspots, all numbers, the weather and the notes.',
      'Good for sharing with your team, a teacher or local officials.',
    ],
  },
];

function HowItWorks() {
  return (
    <div className="page">
      <section className="page-hero">
        <div className="eyebrow">How it works</div>
        <h1>See how the ground changed, <span className="hl">in 3 steps</span></h1>
        <p className="page-lead">NISAR Change Explorer compares two radar images of the same place, taken on different dates,
          and explains the difference in plain words.</p>
        <ol className="quick-steps">
          <li><span>1</span>Pick a place</li>
          <li><span>2</span>Pick two dates</li>
          <li><span>3</span>Read the change</li>
        </ol>
        <a className="btn-primary" href="#explorer">Start exploring →</a>
        <img className="how-overview" src="assets/how/overview.jpg"
          alt="The explorer: search and dates on the left, change map in the middle, report on the right" />
      </section>

      <section className="page-section">
        <h2 className="section-title">Why radar?</h2>
        <div className="answer-grid">
          <div><span className="answer-icon" aria-hidden="true">☁️</span><strong>Sees through clouds</strong>
            <p>NISAR sends its own microwave signal, so it works through clouds, smoke and at night.</p></div>
          <div><span className="answer-icon" aria-hidden="true">🌗</span><strong>Bright and dark</strong>
            <p>Buildings, rough or wet ground and plants echo strongly (bright). Calm water and smooth ground echo weakly (dark).</p></div>
          <div><span className="answer-icon" aria-hidden="true">🔁</span><strong>Same view, every pass</strong>
            <p>The satellite repeats its path, so two images of the same view can be compared pixel by pixel.</p></div>
        </div>
      </section>

      <section className="page-section">
        <h2 className="section-title">Step by step</h2>
        <div className="how-steps">
          {HOW_STEPS.map((s, i) => (
            <article key={s.title} className={`how-step ${i % 2 ? 'flip' : ''}`}>
              <div className="how-text">
                <span className="how-num">{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                <ul>{s.points.map(p => <li key={p}>{p}</li>)}</ul>
              </div>
              <div className={`how-shots n${s.images.length}`}>
                {s.images.map(([file, alt]) => (
                  <figure key={file}><img src={`assets/how/${file}.jpg`} alt={alt} loading="lazy" /><figcaption>{alt}</figcaption></figure>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="page-section">
        <div className="notice">
          <strong>Good to know.</strong> The app shows a <strong>provisional radar signal change</strong>. Soil moisture, crops,
          building work and water can all change radar brightness, so a change does not by itself confirm damage, flooding
          or ground movement. Always check with other sources.
        </div>
        <p className="muted small">Tip: you can link straight to a place, e.g. <code>/?q=Kandy</code> or <code>/?lat=7.29&amp;lon=80.63</code>.</p>
      </section>

      <footer className="page-footer muted small">Data: NISAR (NASA/ISRO) via the Alaska Satellite Facility · Image search: NASA CMR · Maps: © OpenStreetMap contributors · Weather: Open-Meteo</footer>
    </div>
  );
}
