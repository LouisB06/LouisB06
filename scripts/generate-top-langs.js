const https = require('https');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.STATS_READ_TOKEN;
if (!TOKEN) {
  console.error('STATS_READ_TOKEN is not set');
  process.exit(1);
}

const LINGUIST_COLORS = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  Shell: '#89e051',
  Go: '#00ADD8',
  Rust: '#dea584',
  PHP: '#4F5D95',
  Ruby: '#701516',
  'Jupyter Notebook': '#DA5B0B',
  Dockerfile: '#384d54',
  SCSS: '#c6538c',
  Vue: '#41b883',
  Kotlin: '#A97BFF',
  Swift: '#F05138',
};
const DEFAULT_COLOR = '#8b8b8b';

function apiGet(reqPath) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: 'api.github.com',
      path: reqPath,
      headers: {
        'User-Agent': 'louisb06-profile-stats',
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${TOKEN}`,
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`${res.statusCode} ${reqPath}: ${data}`));
        }
        resolve({ body: JSON.parse(data), headers: res.headers });
      });
    }).on('error', reject);
  });
}

async function getAllOwnedRepos() {
  const repos = [];
  let pageNum = 1;
  for (;;) {
    const { body } = await apiGet(`/user/repos?per_page=100&page=${pageNum}&affiliation=owner`);
    repos.push(...body);
    if (body.length < 100) break;
    pageNum += 1;
  }
  return repos;
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildSvg(languages) {
  const width = 1200;
  const rowH = 36;
  const top = 92;
  const height = top + languages.length * rowH + 34;
  const trackX = 250;
  const trackW = 760;
  const FONT = "Fira Code, SF Mono, Menlo, Consolas, monospace";

  const total = languages.reduce((s, l) => s + l.pct, 0) || 100;
  let stacked = '';
  let sx = 40;
  const stackW = width - 80;
  for (const lang of languages) {
    const w = (lang.pct / total) * stackW;
    stacked += `<rect x="${sx.toFixed(1)}" y="52" width="${w.toFixed(1)}" height="8" fill="${lang.color}"/>`;
    sx += w;
  }

  let rows = '';
  languages.forEach((lang, i) => {
    const y = top + i * rowH;
    const w = Math.max(6, (lang.pct / languages[0].pct) * trackW);
    const delay = (i * 0.12).toFixed(2);
    rows += `
  <g>
    <circle cx="48" cy="${y + 10}" r="6" fill="${lang.color}" filter="url(#glow)"/>
    <text x="68" y="${y + 15}" font-family="${FONT}" font-size="15" font-weight="600" fill="#FAFAFA">${escapeXml(lang.name)}</text>
    <rect x="${trackX}" y="${y + 3}" width="${trackW}" height="14" rx="7" fill="#ffffff" fill-opacity="0.06"/>
    <rect x="${trackX}" y="${y + 3}" width="${w.toFixed(1)}" height="14" rx="7" fill="${lang.color}" filter="url(#glow)">
      <animate attributeName="width" from="0" to="${w.toFixed(1)}" dur="1.1s" begin="${delay}s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.2 0.8 0.2 1"/>
    </rect>
    <rect x="${trackX}" y="${y + 3}" width="40" height="14" rx="7" fill="#ffffff" fill-opacity="0.35">
      <animate attributeName="x" values="${trackX};${(trackX + w - 40).toFixed(1)};${trackX}" dur="${(3 + i * 0.3).toFixed(1)}s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0;0.8;0" dur="${(3 + i * 0.3).toFixed(1)}s" repeatCount="indefinite"/>
    </rect>
    <text x="${trackX + trackW + 24}" y="${y + 16}" font-family="${FONT}" font-size="15" font-weight="700" fill="${lang.color}">${lang.pct.toFixed(1)}%</text>
  </g>`;
  });

  return `<svg width="100%" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Most used languages across my repositories">
  <defs>
    <filter id="glow" x="-30%" y="-100%" width="160%" height="300%"><feGaussianBlur stdDeviation="1.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#fff" fill-opacity="0.07"/></pattern>
    <linearGradient id="neon" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#38BDF8"/><stop offset="1" stop-color="#A78BFA"/></linearGradient>
    <clipPath id="card"><rect width="${width}" height="${height}" rx="24"/></clipPath>
    <clipPath id="stack"><rect x="40" y="52" width="${stackW}" height="8" rx="4"/></clipPath>
  </defs>
  <g clip-path="url(#card)">
    <rect width="${width}" height="${height}" fill="#09090B"/>
    <rect width="${width}" height="${height}" fill="url(#dots)"/>
    <text x="40" y="36" font-family="${FONT}" font-size="14" font-weight="700" letter-spacing="4" fill="url(#neon)">MOST USED LANGUAGES</text>
    <g clip-path="url(#stack)">${stacked}</g>
    ${rows}
  </g>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="24" fill="none" stroke="#fff" stroke-opacity="0.1"/>
</svg>
`;
}

async function main() {
  const repos = await getAllOwnedRepos();
  const totals = {};

  for (const repo of repos) {
    if (repo.fork) continue;
    try {
      const { body: langs } = await apiGet(`/repos/${repo.full_name}/languages`);
      for (const [lang, bytes] of Object.entries(langs)) {
        totals[lang] = (totals[lang] || 0) + bytes;
      }
    } catch (e) {
      console.error(`Skipping ${repo.full_name}: ${e.message}`);
    }
  }

  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const grandTotal = sorted.reduce((sum, [, bytes]) => sum + bytes, 0);

  if (grandTotal === 0) {
    console.error('No language data found across repos.');
    process.exit(1);
  }

  const TOP_N = 6;
  const top = sorted.slice(0, TOP_N);
  const rest = sorted.slice(TOP_N);

  const languages = top.map(([name, bytes]) => ({
    name,
    pct: (bytes / grandTotal) * 100,
    color: LINGUIST_COLORS[name] || DEFAULT_COLOR,
  }));

  if (rest.length > 0) {
    const restBytes = rest.reduce((sum, [, bytes]) => sum + bytes, 0);
    languages.push({ name: 'Other', pct: (restBytes / grandTotal) * 100, color: DEFAULT_COLOR });
  }

  const svg = buildSvg(languages);
  const outPath = path.join(__dirname, '..', 'assets', 'top-langs.svg');
  fs.writeFileSync(outPath, svg);
  console.log('Wrote', outPath);
  console.log(languages.map((l) => `${l.name}: ${l.pct.toFixed(2)}%`).join('\n'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
