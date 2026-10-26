"""
精确判定徽章是否有「方框残留」。

判据：取徽章方框最外一圈像素，若「边框素材在该点透明」而「渲染结果不是卡片背景」，
      说明有不该出现的内容（立绘）漏出来 → 残留。
      若边框素材在该点不透明，那画出来的就是边框本身，属正常。
"""
import sys
from PIL import Image

KINDS = [('basic', 'b'), ('m', 'm'), ('s1', 's1'), ('s2', 's2')]
CARD_BG_TOL = 10

_cache = {}
def frame_alpha(src, x, y):
    if src not in _cache:
        _cache[src] = Image.open(f'public/img/common/{src}.webp').convert('RGBA')
    im = _cache[src]
    W, H = im.size
    x = min(W - 1, max(0, int(x)))
    y = min(H - 1, max(0, int(y)))
    return im.getchannel('A').getpixel((x, y))

fails = []
for kind, src in KINDS:
    im = Image.open(f'/tmp/edge-{kind}.png').convert('RGB')
    W, H = im.size
    dpr = W // 56          # 截图是 (48+8)*dpr 见方
    B, S = 4 * dpr, 48 * dpr
    bg = im.getpixel((2, 2))

    def is_bg(c):
        return max(abs(c[i] - bg[i]) for i in range(3)) <= CARD_BG_TOL

    # 右下 26x26 是角标（B/M/S1/S2），它本来就画到边上，跳过
    lab = B + S - 26 * dpr

    ring = []
    for i in range(S):
        ring.append((B + i, B))
        ring.append((B + i, B + S - 1))
        ring.append((B, B + i))
        ring.append((B + S - 1, B + i))

    dirty = []
    for (px, py) in ring:
        if px >= lab and py >= lab:
            continue
        c = im.getpixel((px, py))
        if is_bg(c):
            continue
        sx, sy = (px - B) / dpr, (py - B) / dpr
        if frame_alpha(src, sx, sy) < 20:
            dirty.append((px, py, c))

    if dirty:
        fails.append(kind)
        print(f'✗ {kind}: {len(dirty)} 个残留像素  例: {dirty[:4]}')
    else:
        print(f'✓ {kind}: 方框外圈干净（边框素材透明处均为卡片底色）')

if fails:
    print(f'❌ {len(fails)} 种徽章有方框残留')
    sys.exit(1)
print('✅ 四种徽章均无方框残留')
