# Pickup macros — the "suction cup" loot grab

The "suction cup" is a single key that hammers your **pickup / interact** key several times in fast succession — so a half-second tap empties an Offspawn floor without you having to mash. The rest of the scene runs it because the offspawn-fight winner is usually whoever finished looting first.

This guide covers both keyboard families that can do it without third-party macro software:

- **Wooting (60HE / 60HE+ / 80HE / etc.)** — built-in via **Dynamic Keystroke (DKS)** in Wootility's Advanced Keys tab.
- **SteelSeries Apex Pro (TKL / Mini / Gen 2 / Gen 3)** — built-in via **SteelSeries GG → Engine → Macro Editor**.

Both run on-keyboard firmware — no software runs at game time, nothing hooks the game process, nothing flags on anticheat that looks at host-side automation drivers.

---

## ⚠ Anticheat reality check

A keyboard firmware macro and a software macro **look identical to a server**: rapid keypresses on a single bind. Epic's EAC + BattlEye don't ban for it today because there's no signal that distinguishes "hardware repeating a keystroke" from "human spamming it." That said:

- **FNCS explicitly bans hardware macros — this is not a gray area.** The current [FNCS Divisional Cups Chapter 7 Season 1 Official Rules](https://www.fortnite.com/competitive/rules-guidelines/rules-library/fncs-divisional-cups-chapter-7-season-1-official-rules) (dated Nov 30, 2025) enumerate, under **Section 8.2.1 (Competitive Integrity, examples of unfair play)**, the line: *"Using macro keys or similar methods to automate in-game actions."* The same prohibition appears in the [Performance Evaluation Ch7 rules](https://www.fortnite.com/competitive/rules-guidelines/rules-library/fortnite-performance-evaluation-chapter-7-official-rules) and the [$1M Unreal Cup rules](https://www.fortnite.com/competitive/rules-guidelines/rules-library/1-million-dollar-unreal-cup-chapter-7-season-1-official-rules), and it dates back to at least the 2024 ruleset — so this is a long-standing, explicit ban, not a broad clause an admin "could" stretch. A single-key pickup/suction macro that fires the interact key multiple times is squarely "macro keys ... to automate in-game actions." **In any sanctioned Fortnite event, running this macro is a rules violation that can get you DQ'd.** Still read the rulebook for whatever you compete in, but for FNCS the answer is unambiguous.
- **What 100% gets you banned: in-game advantage macros** (auto-aim, auto-build, recoil control). The pickup macro is technically lighter — it just spams a key you'd already be spamming — but it is still automating an in-game action and is covered by the same Section 8.2.1 language. Don't blame us if Epic changes their stance.
- **Don't post videos** of your DKS / GG macro UI with the pickup binding visible. Don't draw attention.

Use at your own risk in ranked. Bench it for tournament play unless the rulebook says it's clear.

---

## Wooting — DKS (Dynamic Keystroke)

The Wooting Hall-Effect keyboards have **four actuation positions per key** because the magnetic sensor reads continuous travel. DKS lets you bind a different action to each position. That's the building block.

**Where to find it in Wootility:**

1. Plug the keyboard in. Open **Wootility** (web at `wootility.io` or the desktop app).
2. Select your profile (you can have up to four; bind the macro on a non-default profile if you want a "comp" vs "casual" split).
3. Click **Advanced Keys** in the bottom navigation bar.
4. Hover over the key you want to bind (E by default for Fortnite pickup). Click the green **+** button that appears.
5. Pick **Dynamic Keystroke (DKS)** from the popover.

**Setting up the suction-cup pattern:**

DKS shows a 4-column grid:

| Column | What it fires on |
|---|---|
| 1 | Key first crosses the actuation point (going down) |
| 2 | Key reaches the bottom |
| 3 | Key starts releasing (going up) |
| 4 | Key returns past the actuation point |

For each column, you can assign up to **4 actions** (4 rows). For pickup spam, you bind the same key (`E`) to multiple columns so a single press fires it 2–4 times.

A solid starter pattern that doesn't feel jittery to your normal taps:

| Row \ Column | Press down (1) | Bottom (2) | Start release (3) | Released (4) |
|---|---|---|---|---|
| 1 | `E` (tap) | `E` (tap) | `E` (tap) | `E` (tap) |

Save the profile to the keyboard. That's it — one press of `E` now fires the interact action **four times** in firmware-fast succession.

**Tuning tips:**

- If pickup doesn't reliably register, drop a column (3 fires is often enough — too many and the game may ignore duplicates).
- Set the **actuation point** for E to ~0.3 mm so the press registers fast — DKS rides on top of normal actuation.
- If you want the macro to ONLY fire when you press hard (deliberate intent), set columns 1+2 to tap and columns 3+4 to nothing — gives you single-tap behavior on shallow press and quadruple-tap when you bottom it out.

Wooting's own how-to: [help.wooting.io — How to use DKS](https://help.wooting.io/article/99-how-to-use-dks)

---

## SteelSeries Apex Pro — GG / Engine macro

The Apex Pro line uses on-keyboard macro storage (the keyboard remembers macros across reboots without GG running). The editor lives in **SteelSeries GG → Engine → your keyboard → Macro Editor**.

**Setup:**

1. Download **SteelSeries GG** from `steelseries.com/gg`. Install. Open it.
2. Click into **Engine** (not the storefront). Pick your Apex Pro from the device list.
3. Open **Macro Editor** (gear icon → Macros).
4. Click **+ New Macro**, name it "pickup-spam" or whatever.
5. **Record** the macro:
   - Click record. Press `E` once. Click stop.
   - Open the recorded sequence. Manually duplicate the `E` press 3-4 times.
   - Set the delay between each event to **15-30 ms** (too short = the game eats duplicates; too long = it feels like lag on your tap).
6. Save the macro.

**Bind it to E:**

1. In the keyboard config view, click on the **E** key.
2. **Assign Macro** → pick "pickup-spam."
3. Set the trigger to **On press** (not "On hold" — hold trigger keeps re-firing while held, which can hurt builds).
4. Save / write to keyboard. The macro now lives in keyboard firmware.

**Practical settings:**

- 3 repeats with 20 ms gaps is the consensus on most pickup-macro tutorials.
- If you ever need to disable it, swap profiles (Apex Pro supports multiple profiles via Fn+1/2/3/4) or just rebind E back to default in GG.
- Test it in Creative or Sandbox before ranked — some interaction surfaces double-trigger on macros and that can leave you holding two consumables when you meant one.

SteelSeries' official walkthroughs are in their support center; community walkthroughs on YouTube cover the visual flow (search "SteelSeries Apex Pro macro Fortnite" for a recent one).

---

## What pros call it

- **Suction cup** — most common slang. The macro "sucks up" everything on the floor in one press.
- **Pickup macro / loot macro** — generic name, used in tutorials.
- **Spam pickup / hold E spam** — older naming from when it was done via software (AutoHotkey).

Veno + Khanada + multiple Wooting-sponsored pros run on-keyboard pickup macros — the fact that top players use them in ranked/casual is real and not in dispute. But the "normalized at the top of the bracket" framing understates the 2025-26 reality: macros became an active enforcement and controversy topic around FNCS Globals, with [FNCompetitive/Epic issuing pre-event integrity warnings](https://www.youtube.com/watch?v=0sATfdbG6C0), [Clix on record saying macros are "ruining FNCS"](https://www.youtube.com/watch?v=ZBBrJuvy9qA), and high-profile macro accusations (e.g. Peterbot) during sanctioned play. Combined with the explicit Section 8.2.1 ban above, the honest read is: pickup macros are widely used in ranked but are **explicitly rule-violating in FNCS and under active scrutiny.** Use them in ranked at your own risk; **bench them for any sanctioned event** (read the rules before any tournament you enter).

---

## Sources

- [help.wooting.io — How to use Dynamic Keystroke (DKS)](https://help.wooting.io/article/99-how-to-use-dks)
- [help.wooting.io — How can I use macros with my Wooting?](https://help.wooting.io/article/150-how-can-i-use-macros-with-my-wooting)
- SteelSeries GG download + Engine docs: `steelseries.com/gg`
- Community walkthroughs (Wooting + Apex Pro pickup-macro tutorials) on YouTube — search before you copy a setting blind, the macro field evolves
