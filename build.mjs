// Builds the static ethlo.com page into dist/.
//
// Data is fetched from the GitHub and YouTube APIs and written to data/*.json.
// If a fetch fails, the last committed data/*.json is used instead, so a
// flaky API never publishes an empty section. Set FIXTURES_DIR to build from
// local JSON files without network access.

import { readFile, writeFile, mkdir, cp, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);
const dist = path.join(root, 'dist');
const dataDir = path.join(root, 'data');
const config = JSON.parse(await readFile(path.join(root, 'site.config.json'), 'utf8'));

const CSS_FILES = [
  'style.css', 'style-responsive.css', 'vertical-rhythm.min.css', 'magnific-popup.css',
  'owl.carousel.css', 'animate.min.css', 'splitting.css',
];
const JS_FILES = [
  'owl.carousel.min.js', 'isotope.pkgd.min.js', 'imagesloaded.pkgd.min.js', 'jquery.magnific-popup.min.js',
  'masonry.pkgd.min.js', 'jquery.lazyload.min.js', 'wow.min.js', 'morphext.js', 'typed.min.js', 'all.js',
  'splitting.min.js',
];

// ---------- data ----------

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': 'ethlo.com-build', ...headers } });
  if (!res.ok) throw new Error(`${url.split('?')[0]} -> HTTP ${res.status}`);
  return { body: await res.json(), headers: res.headers };
}

async function fetchGithubRepos() {
  const { user } = config.github;
  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const repos = [];
  let url = `https://api.github.com/users/${user}/repos?per_page=100&type=owner`;
  while (url) {
    const { body, headers: h } = await getJson(url, headers);
    repos.push(...body);
    url = /<([^>]+)>;\s*rel="next"/.exec(h.get('link') ?? '')?.[1];
  }
  return repos.map((r) => ({
    name: r.name,
    html_url: r.html_url,
    description: r.description,
    language: r.language,
    topics: r.topics ?? [],
    fork: r.fork,
    archived: r.archived,
    stargazers_count: r.stargazers_count,
    forks_count: r.forks_count,
    pushed_at: r.pushed_at,
    updated_at: r.updated_at,
  }));
}

async function fetchYoutubeApi(key) {
  const base = 'https://www.googleapis.com/youtube/v3/';
  const { channelId } = config.youtube;
  const ch = await getJson(`${base}channels?part=contentDetails&id=${channelId}&key=${key}`);
  const uploads = ch.body.items[0].contentDetails.relatedPlaylists.uploads;
  const videos = [];
  let pageToken = '';
  do {
    const { body } = await getJson(
      `${base}playlistItems?part=snippet&maxResults=50&playlistId=${uploads}&key=${key}${pageToken ? `&pageToken=${pageToken}` : ''}`,
    );
    for (const item of body.items) {
      const s = item.snippet;
      videos.push({
        id: s.resourceId.videoId,
        published_at: s.publishedAt,
        title: s.title,
        description: s.description ?? '',
      });
    }
    pageToken = body.nextPageToken;
  } while (pageToken);
  return videos;
}

// The RSS feed needs no key but only lists the latest 15 uploads.
async function fetchYoutubeRss() {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${config.youtube.channelId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube RSS -> HTTP ${res.status}`);
  const xml = await res.text();
  const tag = (s, t) => decodeXml(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`).exec(s)?.[1] ?? '');
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    id: tag(e, 'yt:videoId'),
    published_at: tag(e, 'published'),
    title: tag(e, 'title'),
    description: tag(e, 'media:description'),
  }));
}

async function fetchYoutube() {
  const key = process.env.YOUTUBE_API_KEY;
  if (key) {
    try {
      return await fetchYoutubeApi(key);
    } catch (e) {
      console.warn(`YouTube Data API failed (${e.message}), falling back to RSS`);
    }
  }
  return fetchYoutubeRss();
}

// Fetch fresh data, or reuse the last committed snapshot if the fetch fails.
async function load(name, fetcher) {
  const file = path.join(dataDir, `${name}.json`);
  if (process.env.FIXTURES_DIR) {
    return JSON.parse(await readFile(path.join(process.env.FIXTURES_DIR, `${name}.json`), 'utf8'));
  }
  try {
    const data = await fetcher();
    if (!data.length) throw new Error('no items returned');
    await writeFile(file, JSON.stringify(data, null, 2) + '\n');
    return data;
  } catch (e) {
    if (!existsSync(file)) throw new Error(`${name}: ${e.message}, and no cached ${file}`);
    console.warn(`::warning::${name}: ${e.message}; using cached data/${name}.json`);
    return JSON.parse(await readFile(file, 'utf8'));
  }
}

function selectRepos(repos) {
  const c = config.github;
  const exclude = new Set(c.exclude);
  return repos
    .filter((r) => !(c.excludeForks && r.fork))
    .filter((r) => !(c.excludeArchived && r.archived))
    .filter((r) => !c.includeTopic || r.topics.includes(c.includeTopic))
    .filter((r) => !exclude.has(r.name))
    .sort((a, b) =>
      b.stargazers_count - a.stargazers_count ||
      b.forks_count - a.forks_count ||
      b.pushed_at.localeCompare(a.pushed_at));
}

function selectVideos(videos) {
  const { maxVideos, excludeIds } = config.youtube;
  const exclude = new Set(excludeIds);
  const list = videos
    .filter((v) => !exclude.has(v.id))
    .sort((a, b) => b.published_at.localeCompare(a.published_at));
  return maxVideos > 0 ? list.slice(0, maxVideos) : list;
}

// ---------- rendering ----------

function decodeXml(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function renderVideo(v) {
  const id = encodeURIComponent(v.id);
  const summary = v.description.split(/\r?\n/)[0];
  return `
                    <li class="work-item mix video">
                        <a href="https://youtu.be/${id}" class="work-ext-link">
                            <div class="work-img">
                                <div class="work-img-bg wow-p scalexIn"></div>
                                <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg"
                                     srcset="https://i.ytimg.com/vi_webp/${id}/maxresdefault.webp 1100w, https://i.ytimg.com/vi/${id}/hqdefault.jpg 480w"
                                     sizes="(min-width: 1000px) 33vw, 100vw"
                                     loading="lazy" alt="${esc(v.title)}" class="wow-p fadeIn" data-wow-delay=".2s"/>
                            </div>
                            <div class="work-intro">
                                <h3 class="work-title">${esc(v.title)}</h3>
                                <div class="work-descr">${esc(summary)}</div>
                            </div>
                        </a>
                    </li>`;
}

function renderRepo(r) {
  return `
                        <div class="col-sm-4 mb-40">
                            <div class="text" style="padding:2rem">
                                <h5><a class="text-link" style="font-size:20px; text-transform: none" href="${esc(r.html_url)}">
                                    <i class="fab fa-github"></i> ${esc(r.name)}</a>
                                </h5>
                                <div class="row">
                                    <div class="col">
                                        <i class="fas fa-star" style="color:darkgoldenrod" aria-hidden="true"></i> ${r.stargazers_count}&nbsp;
                                        <i class="fas fa-code-branch" style="color: #888" aria-hidden="true"></i> ${r.forks_count}
                                    </div>
                                    <div class="col align-right">${esc(r.pushed_at.slice(0, 10))}</div>
                                </div>
                                <p>${esc(r.description)}</p>
                            </div>
                        </div>`;
}

function renderRepos(repos) {
  const rows = [];
  for (let i = 0; i < repos.length; i += 3) {
    rows.push(`\n                    <div class="row">${repos.slice(i, i + 3).map(renderRepo).join('')}\n                    </div>`);
  }
  return rows.join('');
}

// ---------- main ----------

await mkdir(dataDir, { recursive: true });
const [repos, videos] = await Promise.all([
  load('github', fetchGithubRepos).then(selectRepos),
  load('youtube', fetchYoutube).then(selectVideos),
]);

const now = new Date();
const template = await readFile(path.join(root, 'src', 'index.html'), 'utf8');
const html = template
  .replace('{{videos}}', () => videos.map(renderVideo).join(''))
  .replace('{{repos}}', () => renderRepos(repos))
  .replaceAll('{{year}}', String(now.getUTCFullYear()))
  .replaceAll('{{built_at}}', now.toISOString());

await rm(dist, { recursive: true, force: true });
await cp(path.join(root, 'static'), dist, { recursive: true });
const concat = async (dir, files) =>
  (await Promise.all(files.map((f) => readFile(path.join(dist, dir, f), 'utf8')))).join('\n\n');
await writeFile(path.join(dist, 'css', 'site.css'), await concat('css', CSS_FILES));
await writeFile(path.join(dist, 'js', 'site.js'), await concat('js', JS_FILES));
for (const dir of ['css', 'js']) {
  for (const f of await readdir(path.join(dist, dir))) {
    if (/\.(css|js)$/.test(f) && !f.startsWith('site.')) await rm(path.join(dist, dir, f));
  }
}
await mkdir(path.join(dist, 'data'));
await writeFile(path.join(dist, 'data', 'github.json'), JSON.stringify(repos, null, 2));
await writeFile(path.join(dist, 'data', 'youtube.json'), JSON.stringify(videos, null, 2));
await writeFile(path.join(dist, 'index.html'), html);

console.log(`Built dist/index.html with ${repos.length} repos and ${videos.length} videos`);
