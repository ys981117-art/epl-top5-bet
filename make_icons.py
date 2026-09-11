"""홈 화면 아이콘 생성.

프리미어리그 사자 로고(ESPN CDN 제공, 어두운 배경용 흰색 버전)에서
아래쪽 워드마크를 빼고 사자만 크롭해 EPL 퍼플 배경에 올린다.
아이콘은 개인용 내기 앱 식별용으로만 쓴다.

실행: python make_icons.py
"""
import io
import urllib.request

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

# 어두운 배경용(500-dark) 로고는 워드마크가 사자를 원호로 감싸고 있어 떼어낼 수 없다.
# 컬러 버전은 사자 아래에 워드마크가 따로 놓여 있어 가로줄로 깔끔하게 갈린다.
SRC = "https://a.espncdn.com/i/leaguelogos/soccer/500/23.png"
PURPLE = "#37003C"          # 프리미어리그 퍼플
GAP = 10                    # 이만큼 빈 줄이 이어지면 사자와 워드마크의 경계로 본다


def load_lion() -> np.ndarray:
    """원본은 사자 아래에 'Premier League' 워드마크가 붙어 있다.
    비율을 보고 자르면 폰트 레이아웃에 따라 글자 조각이 남으므로,
    알파 채널에서 내용이 끊기는 지점을 찾아 첫 덩어리(사자)만 가져온다."""
    with urllib.request.urlopen(SRC, timeout=30) as r:
        img = plt.imread(io.BytesIO(r.read()), format="png")

    alpha = img[:, :, 3] if img.shape[2] == 4 else np.ones(img.shape[:2])
    rows = np.where(alpha.max(axis=1) > 0.05)[0]
    if rows.size == 0:
        raise SystemExit("로고에서 아무것도 찾지 못했습니다")

    breaks = np.where(np.diff(rows) > GAP)[0]
    last_row = rows[breaks[0]] if breaks.size else rows[-1]
    img = img[rows[0]: last_row + 1]

    alpha = img[:, :, 3] if img.shape[2] == 4 else np.ones(img.shape[:2])
    cols = np.where(alpha.max(axis=0) > 0.05)[0]
    img = img[:, cols[0]: cols[-1] + 1]

    # 원본 사자는 퍼플 단색이라 퍼플 배경 위에서 사라진다. 모양(알파)은 두고 색만 흰색으로.
    img = img.copy()
    img[:, :, :3] = 1.0

    # 정사각으로 맞춰 비율이 찌그러지지 않게 한다
    ih, iw = img.shape[:2]
    side = max(ih, iw)
    pad = np.zeros((side, side, 4), dtype=img.dtype)
    y0, x0 = (side - ih) // 2, (side - iw) // 2
    pad[y0:y0 + ih, x0:x0 + iw] = img
    return pad


def draw(lion: np.ndarray, size: int, scale: float, path: str) -> None:
    fig = plt.figure(figsize=(size / 100, size / 100), dpi=100, facecolor=PURPLE)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    ax.set_facecolor(PURPLE)

    half = scale / 2
    ax.imshow(lion, extent=(0.5 - half, 0.5 + half, 0.5 - half, 0.5 + half),
              interpolation="antialiased", aspect="auto", zorder=2)

    fig.savefig(path, dpi=100, facecolor=PURPLE)
    plt.close(fig)
    print(f"{path}  {size}x{size}")


lion = load_lion()
# 일반 아이콘은 꽉 차게, 마스커블은 원형으로 잘려도 살아남게 더 작게
draw(lion, 192, 0.72, "icon-192.png")
draw(lion, 512, 0.72, "icon-512.png")
draw(lion, 512, 0.56, "icon-maskable-512.png")
