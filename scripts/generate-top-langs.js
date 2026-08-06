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
  const cols = 2;
  const rows = Math.ceil(languages.length / cols);
  const width = 380;
  const barY = 55;
  const rowStart = barY + 41;
  const rowHeight = 24;
  const height = rowStart + rows * rowHeight + 10;

  let bars = '';
  let x = 25;
  const barWidth = 330;
  for (const lang of languages) {
    const w = (lang.pct / 100) * barWidth;
    bars += `<rect x="${x.toFixed(1)}" y="${barY}" width="${w.toFixed(1)}" height="10" fill="${lang.color}"/>`;
    x += w;
  }

  let entries = '';
  languages.forEach((lang, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = 25 + col * 175;
    const cy = rowStart + row * rowHeight;
    entries += `
    <circle cx="${cx}" cy="${cy}" r="5" fill="${lang.color}"/>
    <text x="${cx + 14}" y="${cy + 4}" font-family="Segoe UI, sans-serif" font-size="13" fill="#ebdbb2">${escapeXml(lang.name)} ${lang.pct.toFixed(2)}%</text>`;
  });

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" rx="10" width="${width - 2}" height="${height - 2}" fill="#1d2021" stroke="#504945" stroke-width="1"/>
  <text x="25" y="38" font-family="Segoe UI, sans-serif" font-size="19" font-weight="700" fill="#fe8019">Most Used Languages</text>
  <rect x="25" y="${barY}" width="${barWidth}" height="10" rx="5" fill="#3c3836"/>
  ${bars}
  ${entries}
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
