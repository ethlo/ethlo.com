# ethlo logo

Two interfaces: `eth` outlined, `lo` solid. JetBrains Mono Bold, orange `#FF5A1F` on ink `#0E1013`.

The files in `static/img/` are outlined paths, so they need no font:

| File | Use |
| --- | --- |
| `ethlo-wordmark.svg` | Wordmark on dark backgrounds, 60px tall and up |
| `ethlo-wordmark-small.svg` | Same, with a heavier frame for small sizes (headers, footers) |
| `ethlo-wordmark-light.svg` / `-light-small.svg` | On light backgrounds |
| `ethlo-icon-stacked.svg` | The favicon and app icon: `eth` stacked over `lo` in one square |
| `ethlo-icon-stacked-16.svg` | The same without text, for 16px |
| `ethlo-icon.svg` | The `lo` block on its own, as an alternative icon |

Keep clear space of at least the frame's height around the wordmark, and don't recolour the `lo` block.

## Rebuilding

`make-logo.py` draws everything from the font, so the files can be remade or tweaked:

```sh
pip install fonttools
python3 brand/make-logo.py static/img path/to/JetBrainsMono[wght].ttf
```

The font is the variable JetBrains Mono from [google/fonts](https://github.com/google/fonts/tree/main/ofl/jetbrainsmono) (OFL). The PNG favicons in `static/` are renders of the stacked icon SVGs (the 16px one from `-16`). There is no SVG favicon on purpose: browsers would scale the lettered one down to 16px.
