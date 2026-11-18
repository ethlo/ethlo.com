"""Builds the ethlo C1 logo as outlined SVG (no font needed).

Geometry copies the C1 board: JetBrains Mono 700 at 96px, letter-spacing -0.04em,
"eth" in a 6px frame open on the right (padding 12/20/16/20), "lo" in a solid
block (padding 18/26/22/26). Both boxes come out 136px tall.
"""
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

FONT = sys.argv[2] if len(sys.argv) > 2 else 'JetBrainsMono.ttf'  # the variable font from google/fonts
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'

font = instantiateVariableFont(TTFont(FONT), {'wght': 700})
gs = font.getGlyphSet()
cmap = font.getBestCmap()
upm = font['head'].unitsPerEm
asc, desc = font['hhea'].ascent, -font['hhea'].descent

SIZE = 96.0
S = SIZE / upm
LS = -0.04 * SIZE                                    # letter-spacing per glyph
BASE = (SIZE - (asc + desc) * S) / 2 + asc * S       # baseline inside a line-height:1 box


def text_path(text, x, y_top, size=SIZE, ls=None):
    """Path data for text whose line box (line-height 1) starts at (x, y_top)."""
    s = size / upm
    ls = -0.04 * size if ls is None else ls
    base = y_top + (size - (asc + desc) * s) / 2 + asc * s
    pen = SVGPathPen(gs, ntos=lambda v: f'{v:.2f}'.rstrip('0').rstrip('.'))
    for ch in text:
        name = cmap[ord(ch)]
        tp = TransformPen(pen, (s, 0, 0, -s, x, base))
        gs[name].draw(tp)
        x += gs[name].width * s + ls
    return pen.getCommands()


def advance(text, size=SIZE):
    s = size / upm
    return sum(gs[cmap[ord(c)]].width * s - 0.04 * size for c in text)


def n(v):
    return f'{v:.2f}'.rstrip('0').rstrip('.')


INK, WHITE, ORANGE = '#0E1013', '#FFFFFF', '#FF5A1F'

# --- wordmark ---
lo_w = 26 + advance('lo') + 26
H = 136                               # 6 + 12 + 96 + 16 + 6, same as 18 + 96 + 22


def wordmark(fg, lo_text, B=6):
    # B is the frame weight; the text stays put, the padding gives way. B=10 is for small sizes.
    eth_w = 6 + 20 + advance('eth') + 20
    W = eth_w + lo_w
    frame = f'M0 0H{n(eth_w)}V{B}H{B}V{n(H - B)}H{n(eth_w)}V{n(H)}H0Z'
    eth = text_path('eth', 6 + 20, 6 + 12)
    block = f'M{n(eth_w)} 0H{n(W)}V{n(H)}H{n(eth_w)}Z'
    lo = text_path('lo', eth_w + 26, 18)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {n(W)} {n(H)}" width="{n(W)}" height="{n(H)}" role="img" aria-label="ethlo">'
            f'<path fill="{fg}" d="{frame}{eth}"/>'
            f'<path fill="{ORANGE}" d="{block}"/>'
            f'<path fill="{lo_text}" d="{lo}"/></svg>\n')


open(f'{OUT}/ethlo-wordmark.svg', 'w').write(wordmark(WHITE, INK))              # on dark
open(f'{OUT}/ethlo-wordmark-small.svg', 'w').write(wordmark(WHITE, INK, B=10))  # on dark, under ~60px tall
open(f'{OUT}/ethlo-wordmark-light.svg', 'w').write(wordmark(INK, INK))          # on light
open(f'{OUT}/ethlo-wordmark-light-small.svg', 'w').write(wordmark(INK, INK, B=10))

# --- icon: the "lo" block on its own, square ---
I = 64


def icon(isz, path):
    iw = advance('lo', isz)
    ix = (I - iw) / 2 + 0.02 * isz        # trailing letter-spacing is not part of the ink
    icon_lo = text_path('lo', ix, (I - isz) / 2 - isz * 0.03, size=isz)
    open(path, 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {I} {I}" width="{I}" height="{I}" role="img" aria-label="ethlo">'
        f'<path fill="{ORANGE}" d="M0 0H{I}V{I}H0Z"/><path fill="{INK}" d="{icon_lo}"/></svg>\n')


icon(34, f'{OUT}/ethlo-icon.svg')
icon(44, f'{OUT}/ethlo-icon-16.svg')   # bigger letters for the 16px favicon
print('done')


# --- favicon: C3, eth stacked over lo in one square ---
def stacked(path, with_text=True):
    B = 4 if with_text else 8              # frame; the 16px version has no text and a heavier frame
    h = I / 2
    frame = f'M0 0H{I}V{h}H{I - B}V{B}H{B}V{h}H0Z'
    parts = [f'<path fill="{INK}" d="M0 0H{I}V{h}H0Z"/>',
             f'<path fill="{WHITE}" d="{frame}"/>',
             f'<path fill="{ORANGE}" d="M0 {h}H{I}V{I}H0Z"/>']
    if with_text:
        sz = 25
        for text, fill, top in (('eth', WHITE, (h - sz) / 2 + B / 2), ('lo', INK, h + (h - sz) / 2)):
            x = (I - advance(text, sz)) / 2 + 0.02 * sz
            parts.append(f'<path fill="{fill}" d="{text_path(text, x, top - sz * 0.03, size=sz)}"/>')
    open(path, 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {I} {I}" width="{I}" height="{I}" role="img" aria-label="ethlo">'
                          + ''.join(parts) + '</svg>\n')


stacked(f'{OUT}/ethlo-icon-stacked.svg')
stacked(f'{OUT}/ethlo-icon-stacked-16.svg', with_text=False)
