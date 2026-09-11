"""홈 화면 아이콘 PNG 생성. 앱의 리더보드 막대를 그대로 심볼로 쓴다.
실행: python make_icons.py  (matplotlib 필요)"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle

INK = "#0D1826"
GOLD = "#EFB23C"
MUTED = "#3A506B"


def draw(size: int, path: str) -> None:
    fig = plt.figure(figsize=(size / 100, size / 100), dpi=100)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.axis("off")

    # 배경 — 둥근 사각 (안드로이드 마스킹 대비 여백 확보)
    ax.add_patch(Rectangle((0, 0), 100, 100, facecolor=INK, edgecolor="none"))
    ax.add_patch(
        FancyBboxPatch(
            (10, 10), 80, 80,
            boxstyle="round,pad=0,rounding_size=18",
            facecolor=INK, edgecolor=GOLD, linewidth=2.5,
        )
    )

    # 순위 막대 세 개 — 1위만 금색, 나머지는 가라앉힌 색
    bars = [(27, 30, GOLD), (44, 48, GOLD), (61, 38, MUTED)]
    for x, h, c in bars:
        ax.add_patch(
            FancyBboxPatch(
                (x, 26), 12, h,
                boxstyle="round,pad=0,rounding_size=3",
                facecolor=c, edgecolor="none",
            )
        )

    fig.savefig(path, dpi=100, facecolor=INK)
    plt.close(fig)
    print(f"{path}  {size}x{size}")


for s in (192, 512):
    draw(s, f"icon-{s}.png")
