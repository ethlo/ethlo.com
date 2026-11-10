// Builds the static ethlo.com page into dist/.
//
// Data is fetched from the GitHub and YouTube APIs and written to data/*.json.
// If a fetch fails, the last committed data/*.json is used instead, so a
// flaky API never publishes an empty section. Set FIXTURES_DIR to build from
// local JSON files without network access.

import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);
const dist = path.join(root, 'dist');
const dataDir = path.join(root, 'data');
const config = JSON.parse(await readFile(path.join(root, 'site.config.json'), 'utf8'));

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

// Repos named in `order` come first, in that order; the rest follow by stars, forks, last push.
function selectRepos(repos) {
  const c = config.github;
  const exclude = new Set(c.exclude);
  const rank = new Map((c.order ?? []).map((name, i) => [name, i]));
  const byRank = (r) => rank.get(r.name) ?? Infinity;
  return repos
    .filter((r) => !(c.excludeForks && r.fork))
    .filter((r) => !(c.excludeArchived && r.archived))
    .filter((r) => !c.includeTopic || r.topics.includes(c.includeTopic))
    .filter((r) => !exclude.has(r.name))
    .sort((a, b) =>
      (byRank(a) - byRank(b) || 0) ||
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

const ARROW = '<svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>';

function renderVideo(v) {
  const id = encodeURIComponent(v.id);
  return `
                <a class="stack video" href="https://youtu.be/${id}">
                    <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" loading="lazy" alt="" width="480" height="270">
                    <span>${esc(v.title)}</span>
                </a>`;
}

const stars = (r) => (r.stargazers_count > 0 ? ` · ★ ${r.stargazers_count}` : '');

// Featured repos get a big card; text comes from config.github.featured, numbers from GitHub.
function renderFeatured(r, f) {
  const url = f.url ?? r.html_url;
  return `
            <article class="stack card">
                <div class="card-top"><span>${esc(f.label ?? r.language ?? '')}</span><span class="accent">${esc(f.badge ?? '')}</span></div>
                <h3>${esc(f.title ?? r.name)}</h3>
                <p class="tagline">${esc(f.tagline ?? r.description)}</p>
                ${f.summary ? `<p class="summary">${esc(f.summary)}</p>` : ''}
                <p class="meta">${esc(f.stack ?? r.language ?? '')}${stars(r)}</p>
                <div style="display:flex; flex-wrap:wrap; gap:8px 24px">
                    <a class="link-under" href="${esc(url)}">${esc(url.replace(/^https?:\/\//, ''))} ${ARROW}</a>
                    ${f.url ? `<a class="link-under" href="${esc(r.html_url)}">Source ${ARROW}</a>` : ''}
                </div>
            </article>`;
}

function renderRepo(r) {
  return `
            <a class="stack lib" href="${esc(r.html_url)}">
                <span class="lib-name">${esc(r.name)}</span>
                <span class="lib-desc">${esc(r.description)}</span>
                <span class="lib-meta">${esc(r.language ?? '')}${stars(r)}</span>
            </a>`;
}

// ---------- main ----------

await mkdir(dataDir, { recursive: true });
const [repos, videos] = await Promise.all([
  load('github', fetchGithubRepos).then(selectRepos),
  load('youtube', fetchYoutube).then(selectVideos),
]);

const featuredConfig = config.github.featured ?? {};
const featured = repos.filter((r) => featuredConfig[r.name]);
const others = repos.filter((r) => !featuredConfig[r.name]);

const now = new Date();
const template = await readFile(path.join(root, 'src', 'index.html'), 'utf8');
const html = template
  .replace('{{featured}}', () => featured.map((r) => renderFeatured(r, featuredConfig[r.name])).join(''))
  .replace('{{repos}}', () => others.map(renderRepo).join(''))
  .replace('{{videos}}', () => videos.map(renderVideo).join(''))
  .replaceAll('{{year}}', String(now.getUTCFullYear()))
  .replaceAll('{{built_at}}', now.toISOString());

await rm(dist, { recursive: true, force: true });
await cp(path.join(root, 'static'), dist, { recursive: true });
await mkdir(path.join(dist, 'data'));
await writeFile(path.join(dist, 'data', 'github.json'), JSON.stringify(repos, null, 2));
await writeFile(path.join(dist, 'data', 'youtube.json'), JSON.stringify(videos, null, 2));
await writeFile(path.join(dist, 'index.html'), html);

console.log(`Built dist/index.html with ${repos.length} repos and ${videos.length} videos`);
