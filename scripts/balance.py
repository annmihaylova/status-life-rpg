import math
import sys

# Windows-консоль по умолчанию не UTF-8: без этого русский вывод превращается в кракозябры
sys.stdout.reconfigure(encoding="utf-8")

def xp_to_next_level(L): return round(100 * L**1.2)
def xp_to_next_point(v): return round(600 * (v - 9)**1.2)      # v -> v+1
def days_required(v): return min(10, 2 + (v - 10)//2)            # distinct active days per +1 point

def level_day(target, xp_per_day=360):
    cum = sum(xp_to_next_level(L) for L in range(1, target))
    return cum, cum / xp_per_day

def simulate(start, xp_per_day, active_days_per_week, days):
    """Returns list of (day, value, stars) at each point gain."""
    v, pool, act, events = start, 0.0, 0, []
    for d in range(1, days + 1):
        active = (d % 7) < active_days_per_week
        if active:
            pool += xp_per_day * 7 / active_days_per_week   # same weekly volume
            act += 1
        while pool >= xp_to_next_point(v) and act >= days_required(v):
            pool -= xp_to_next_point(v); v += 1; act = 0
            events.append((d, v))
    return v, events

print("== Уровень персонажа (360 XP/день) ==")
for L in (5, 10, 15, 20, 25, 30):
    cum, d = level_day(L); print(f"ур.{L}: {cum} XP, ~{d:.0f} дн (~{d/30.4:.1f} мес)")

print("\n== Очко характеристики: стоимость, звезда = 1/10, дней активности ==")
for v in (10, 11, 12, 14, 16, 18, 20, 25):
    print(f"{v}->{v+1}: {xp_to_next_point(v)} XP, звезда {xp_to_next_point(v)/10:.0f} XP, нужно дней {days_required(v)}")

_, d20 = level_day(20)
D = round(d20)
print(f"\n== Профиль, похожий на студентку-исследовательницу, до ур.20 (день {D}) ==")
profile = {"Разум": (15, 240, 7), "Дух": (13, 80, 5), "Тело": (12, 40, 2)}
for name, (start, xpd, adw) in profile.items():
    v, ev = simulate(start, xpd, adw, D)
    print(f"{name}: старт {start} -> {v} к дню {D}, заработано в приложении +{v-start}; очки на днях {[e[0] for e in ev]}")

print("\n== Эталоны для раскрытия: сколько очков набирает общая характеристика к ур.20 ==")
for xpd in (20, 40, 80, 150, 240):
    for start in (10, 12, 15):
        v, ev = simulate(start, xpd, 5, D)
        print(f"{xpd:>3} XP/день, старт {start}: +{v-start}")
