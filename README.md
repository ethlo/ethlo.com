# ethlo.com

Source for [ethlo.com](https://ethlo.com): a static page listing my open-source projects on GitHub and my YouTube videos.

A GitHub Action (`.github/workflows/publish.yml`) rebuilds and publishes the page to GitHub Pages every day, on every push to `main`, and on demand from the Actions tab ("Run workflow").

## How it works

`node build.mjs` (Node 22, no dependencies):

1. Fetches public repos for the configured user from the GitHub API and all uploads from the YouTube channel.
2. Writes the raw data to `data/github.json` and `data/youtube.json`. The workflow commits these, and the build falls back to them if an API call fails.
3. Filters and sorts the data, renders `src/index.html`, and writes the site to `dist/`.

YouTube uses the Data API when the `YOUTUBE_API_KEY` repository secret is set (all uploads). Without it, or if the API call fails, it uses the channel RSS feed, which only lists the latest 15 uploads.

## Choosing what is shown

Edit `site.config.json`:

- `github.exclude`: repo names to hide.
- `github.excludeForks`, `github.excludeArchived`: hide forks and archived repos.
- `github.includeTopic`: set to a topic name (for example `"showcase"`) to show only repos tagged with it.
- `youtube.maxVideos`: `0` shows all videos. `youtube.excludeIds`: video ids to hide.

Repos are sorted by stars, then forks, then last push.

## Local build

```sh
node build.mjs                              # live data (set GITHUB_TOKEN / YOUTUBE_API_KEY as needed)
FIXTURES_DIR=test/fixtures node build.mjs   # offline, from sample data
npx serve dist
```
