const https = require('https');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.STATS_READ_TOKEN;
const USER = process.env.STATS_USER || 'LouisB06';

const QUERY = `
query($login: String!) {
  user(login: $login) {
    contributionsCollection { contributionCalendar { totalContributions } }
    pullRequests { totalCount }
    issues { totalCount }
    repositoriesContributedTo(first: 1, contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY]) { totalCount }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false, orderBy: { field: STARGAZERS, direction: DESC }) {
      nodes { stargazerCount }
    }
  }
}`;

function graphql(query, variables) {
  const payload = JSON.stringify({ query, variables });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'User-Agent': 'louisb06-profile-stats',
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`${res.statusCode}: ${data}`));
        const json = JSON.parse(data);
        if (json.errors) return reject(new Error(JSON.stringify(json.errors)));
        resolve(json.data);
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

const FONT = 'Fira Code,SF Mono,Menlo,Consolas,monospace';

function icon(kind, x, y, c) {
  const base = `<g transform="translate(${x} ${y})" filter="url(#glow)" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">`;
  switch (kind) {
    case 'commit':
      return `${base}<circle r="8"><animate attributeName="r" values="8;10;8" dur="2s" repeatCount="indefinite"/></circle><path d="M-26 0H-8 M8 0H26"/></g>`;
    case 'star':
      return `${base}<path d="M0 -14 L4 -4 L15 -3 L7 4 L9 15 L0 9 L-9 15 L-7 4 L-15 -3 L-4 -4 Z"><animateTransform attributeName="transform" type="rotate" values="-8;8;-8" dur="3s" repeatCount="indefinite"/></path></g>`;
    case 'pr':
      return `${base}<circle cx="-9" cy="-10" r="4"/><circle cx="-9" cy="12" r="4"/><circle cx="12" cy="12" r="4"/><path d="M-9 -6V8 M12 8V-4 C12 -8 8 -10 2 -10"/></g>`;
    case 'issue':
      return `${base}<circle r="14"/><circle r="2.5" fill="${c}"><animate attributeName="opacity" values="1;0.3;1" dur="1.6s" repeatCount="indefinite"/></circle></g>`;
    default:
      return `${base}<path d="M-14 0 A14 14 0 0 1 14 0 M14 0 A14 14 0 0 1 -14 0"/><path d="M0 -14 V14 M-14 0 H14"/><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="10s" repeatCount="indefinite" additive="sum"/></g>`;
  }
}

function buildSvg(s) {
  const W = 1200;
  const H = 230;
  const stats = [
    [String(s.contributions), 'CONTRIBUTIONS', 'last year', '#38BDF8', 'commit'],
    [String(s.stars), 'STARS', 'earned', '#818CF8', 'star'],
    [String(s.prs), 'PULL REQUESTS', 'total', '#A78BFA', 'pr'],
    [String(s.issues), 'ISSUES', 'total', '#38BDF8', 'issue'],
    [String(s.contributedTo), 'CONTRIBUTED', 'to other repos', '#818CF8', 'contrib'],
  ];
  const n = stats.length;
  const gap = 16;
  const tw = (W - 40 - gap * (n - 1)) / n;
  const h = 190;
  const y = 20;

  let tiles = '';
  stats.forEach(([val, label, sub, c, ic], i) => {
    const x = 20 + i * (tw + gap);
    const d = (i * 0.4).toFixed(1);
    const per = Math.round(2 * (tw + h));
    const mid = (x + tw / 2).toFixed(0);
    tiles += `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -4;0 0" dur="${(4 + i * 0.4).toFixed(1)}s" begin="${d}s" repeatCount="indefinite"/>
<rect x="${x.toFixed(0)}" y="${y}" width="${tw.toFixed(0)}" height="${h}" rx="18" fill="url(#card)" stroke="${c}" stroke-opacity="0.45" stroke-width="1.5"/>
<rect x="${x.toFixed(0)}" y="${y}" width="${tw.toFixed(0)}" height="${h}" rx="18" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="50 ${per}" filter="url(#glow)"><animate attributeName="stroke-dashoffset" values="0;-${per}" dur="6s" begin="${d}s" repeatCount="indefinite"/></rect>
${icon(ic, x + tw / 2, y + 44, c)}
<text x="${mid}" y="${y + 120}" text-anchor="middle" font-family="Inter,Segoe UI,Helvetica,Arial,sans-serif" font-size="54" font-weight="800" fill="${c}" filter="url(#glow)">${val}</text>
<text x="${mid}" y="${y + 148}" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="700" letter-spacing="3" fill="#FAFAFA">${label}</text>
<text x="${mid}" y="${y + 168}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="#71717A">${sub}</text></g>
`;
  });

  return `<svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GitHub stats: ${s.contributions} contributions in the last year, ${s.stars} stars, ${s.prs} pull requests, ${s.issues} issues, ${s.contributedTo} repos contributed to">
<defs>
<filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<linearGradient id="card" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.07"/><stop offset="1" stop-color="#fff" stop-opacity="0.015"/></linearGradient>
<pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#fff" fill-opacity="0.07"/></pattern>
<clipPath id="c"><rect width="${W}" height="${H}" rx="24"/></clipPath>
</defs>
<g clip-path="url(#c)"><rect width="${W}" height="${H}" fill="#09090B"/><rect width="${W}" height="${H}" fill="url(#dots)"/>
${tiles}</g><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="24" fill="none" stroke="#fff" stroke-opacity="0.1"/></svg>
`;
}

async function main() {
  if (!TOKEN) {
    console.error('STATS_READ_TOKEN is not set');
    process.exit(1);
  }
  const { user } = await graphql(QUERY, { login: USER });
  const stats = {
    contributions: user.contributionsCollection.contributionCalendar.totalContributions,
    stars: user.repositories.nodes.reduce((sum, r) => sum + r.stargazerCount, 0),
    prs: user.pullRequests.totalCount,
    issues: user.issues.totalCount,
    contributedTo: user.repositoriesContributedTo.totalCount,
  };
  const outPath = path.join(__dirname, '..', 'assets', 'stats.svg');
  fs.writeFileSync(outPath, buildSvg(stats));
  console.log('Wrote', outPath);
  console.log(stats);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { buildSvg };
