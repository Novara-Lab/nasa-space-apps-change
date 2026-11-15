// about us page
// edit the team here
const TEAM = [
  {
    name: 'Kavindu Hansajith', role: 'UX Designer', photo: 'kavindu',
    intro: 'UX designer and undergraduate at VIT, based in Melbourne. Cares about clean, simple screens that make complex data easy to use.',
    linkedin: 'https://www.linkedin.com/in/kavindu-hansajith-8775261a9/', github: 'https://github.com/HansDevX',
  },
  {
    name: 'Rameesha Perera', role: 'Developer', photo: 'rameesha',
    intro: 'Melbourne-based developer who builds web apps, from a learning platform (EduFlex LMS) to the Eco-Lanka website.',
    linkedin: 'https://www.linkedin.com/in/rameesha-perera/', github: 'https://github.com/RamiiDevX',
  },
  {
    name: 'Sugandha K A D P', role: 'Developer', photo: 'sugandha',
    intro: 'Builds practical web tools, with 60+ public projects on GitHub. Turns everyday problems into simple apps.',
    linkedin: 'https://www.linkedin.com/in/sugandha-kadp/', github: 'https://github.com/sugandha-kadp',
  },
  {
    name: 'Udith Jayasinghe', role: 'Software Engineer', photo: 'udith',
    intro: 'Software engineer based in Melbourne, working across Java, C# APIs and web front ends.',
    linkedin: 'https://www.linkedin.com/in/udith-jayasinghe-350b21136/', github: 'https://github.com/udith97',
  },
  {
    name: 'Manuga Samajith', role: 'Team member', photo: 'manuga',
    intro: 'Part of the Novara Labs team building NISAR Change Explorer for NASA Space Apps 2026.',
    linkedin: 'https://www.linkedin.com/in/manuga-samajith/', github: 'https://github.com/ManuSamajith31',
  },
];

const REPO_URL = 'https://github.com/Novara-Lab/nasa-space-apps-change';
const CHALLENGE_URL = 'https://www.spaceappschallenge.org/2026/challenges/dancing-with-the-sars/';

// blob shapes, one per card
const BLOBS = [
  '58% 42% 63% 37% / 45% 55% 45% 55%',
  '42% 58% 38% 62% / 55% 40% 60% 45%',
  '63% 37% 54% 46% / 38% 52% 48% 62%',
  '45% 55% 66% 34% / 58% 43% 57% 42%',
  '52% 48% 40% 60% / 40% 62% 38% 60%',
];

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4.98 3.5C4.98 4.88 3.87 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1 4.98 2.12 4.98 3.5zM.22 8.02h4.56V23H.22zM8.34 8.02h4.37v2.05h.06c.61-1.15 2.1-2.36 4.32-2.36 4.62 0 5.47 3.04 5.47 7v8.29h-4.56v-7.35c0-1.75-.03-4.01-2.44-4.01-2.45 0-2.82 1.91-2.82 3.88V23H8.34z" /></svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
  );
}

function MemberCard({ m, i }) {
  return (
    <article className="member" tabIndex={0}>
      <div className="member-photo">
        <span className="member-blob" style={{ borderRadius: BLOBS[i % BLOBS.length] }} aria-hidden="true" />
        <img src={`assets/team/${m.photo}.jpg`} alt={`Photo of ${m.name}`} loading="lazy"
          style={{ borderRadius: BLOBS[(i + 2) % BLOBS.length] }} />
      </div>
      <div className="member-card">
        <span className="member-role">{m.role}</span>
        <h3>{m.name}</h3>
        <p>{m.intro}</p>
        <div className="member-links">
          <a href={m.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`${m.name} on LinkedIn`} title="LinkedIn"><LinkedInIcon /></a>
          <a href={m.github} target="_blank" rel="noopener noreferrer" aria-label={`${m.name} on GitHub`} title="GitHub"><GitHubIcon /></a>
        </div>
      </div>
    </article>
  );
}

function AboutPage() {
  return (
    <div className="page">
      <section className="page-hero">
        <div className="eyebrow">About us</div>
        <h1>We are <span className="hl">Novara Labs</span></h1>
        <p className="page-lead">A team of five who built <strong>NISAR Change Explorer</strong> for the NASA Space Apps Challenge 2026.
          Our goal: let anyone pick a place on Earth and see, in plain words, how the ground there changed between two dates,
          using brand-new radar data from the NASA–ISRO NISAR satellite.</p>
      </section>

      <section className="page-section">
        <div className="info-grid">
          <div className="info-card">
            <div className="eyebrow">The event</div>
            <h2>NASA Space Apps Challenge 2026</h2>
            <p>Space Apps is NASA's international hackathon, where teams around the world spend a weekend building
              solutions with NASA's free and open data. The 2026 edition runs on <strong>14–15 November 2026</strong> with
              the theme <strong>“The Next Frontier”</strong> and 14 challenges to choose from.</p>
            <a className="text-link" href="https://www.spaceappschallenge.org/" target="_blank" rel="noopener noreferrer">spaceappschallenge.org ↗</a>
          </div>
          <div className="info-card accent">
            <div className="eyebrow">Our challenge · Earth Science</div>
            <h2>Dancing with the SARs</h2>
            <p>Use radar observations from <strong>NISAR</strong>, the joint NASA–ISRO satellite, to visualise changes across
              Earth's surface, from glaciers to forests.</p>
            <a className="text-link" href={CHALLENGE_URL} target="_blank" rel="noopener noreferrer">Read the challenge ↗</a>
          </div>
        </div>

        <h2 className="section-title">How we answered it</h2>
        <div className="answer-grid">
          <div><span className="answer-icon" aria-hidden="true">🛰️</span><strong>Real NISAR data</strong>
            <p>We read the actual radar images from NASA (via the Alaska Satellite Facility), not a simulation.</p></div>
          <div><span className="answer-icon" aria-hidden="true">🗺️</span><strong>Any place, two dates</strong>
            <p>Search or pin a spot, pick a before and after date, and see a colour map of what changed.</p></div>
          <div><span className="answer-icon" aria-hidden="true">💬</span><strong>Plain-language report</strong>
            <p>Hotspots, weather on both dates, possible causes and how to check them, plus a PDF to share.</p></div>
        </div>
      </section>

      <section className="page-section">
        <div className="eyebrow">The team</div>
        <h2 className="section-title">Meet the people behind it</h2>
        <div className="team-grid">
          {TEAM.map((m, i) => <MemberCard key={m.name} m={m} i={i} />)}
        </div>
      </section>

      <section className="page-section reach">
        <div className="eyebrow">Get in touch</div>
        <h2 className="section-title">How to reach us</h2>
        <p>The quickest way is LinkedIn: use the <LinkedInIcon /> button on any team card above.
          Found a bug or have an idea? Open an issue on our GitHub project.</p>
        <div className="reach-actions">
          <a className="btn-primary" href={`${REPO_URL}/issues`} target="_blank" rel="noopener noreferrer"><GitHubIcon /> Open an issue</a>
          <a className="btn-ghost" href={REPO_URL} target="_blank" rel="noopener noreferrer">View the code ↗</a>
        </div>
      </section>

      <footer className="page-footer muted small">Novara Labs · NASA Space Apps Challenge 2026 · Data: NISAR (NASA/ISRO) via ASF, NASA CMR, OpenStreetMap, Open-Meteo</footer>
    </div>
  );
}
