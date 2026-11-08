# Bunny Wizard (working title)

A cute pixel-art survivors game for phones and desktop. You're a bunny wizard whose spells cast themselves; you steer, pick up gems, and grow your spells through a skill tree on each scroll.

## Run it

```sh
npm install
npm run dev      # local dev server with hot reload
npm run build    # typecheck and build to dist/
npm run sim      # headless balance playtest (see below)
```

## Controls

| | Phone | Desktop |
|---|---|---|
| Move | Drag anywhere (a thumb stick appears under your finger) | WASD or arrow keys |
| Spellbook (pauses) | Book button, bottom right | Tab or B |

The game pauses on its own when you switch apps or tabs.

## How a run works

- Survive **15 minutes** to win. Enemies get more numerous, tougher and harder-hitting over time.
- Every level-up gives **1 skill point**. The spellbook opens so you can spend it in a scroll's tree, or save it for later.
- **Scrolls are loot.** A King Slime arrives at 0:40 and every minute after, and always drops one; normal enemies very rarely do. Picking one up offers 2 scrolls you don't have.
- You have **3 scroll slots**. Each empty slot makes your attack scrolls 15% stronger, so a focused one-scroll build is a real option. When your slots are full, a new scroll replaces one and refunds half its points.

## The scrolls

| Scroll | What it does | Form choice (pick one) |
|---|---|---|
| Fire | Fireballs at the nearest enemy | Scatter (1d4 fireballs) or Heavy Orb |
| Frost | Rings of ice that chill | Ripples (1d3 waves) or Glacier (freezes) |
| Storm | Lightning that chains between enemies | Forked (1d6 + 1 jumps) or Thunderbolt |
| Moon | Little moons circling you | Constellation (1d4 + 1 moons) or Full Moon |
| Toxic | Poison puddles | Spores (1d3 puddles) or Bog (slows) |
| Light | Support: healing, ward, speed, luck | Ward or Regrowth |

Every tree has the same shape: a **form** choice, **power** ranks, an **impact** choice, **haste** ranks, a **capstone** choice, and a bottomless **Mastery** node. Choosing one side of a fork closes the other for the run. Dice nodes roll on every cast, and rolling the maximum shows a gold number. Lucky Star (Light capstone) adds +1 to every roll.

## Tuning

- `src/config.ts`: movement, enemies, spawn curve, XP curve, drop chances.
- `src/content.ts`: scroll trees, node text, empty-slot bonus.
- `src/game.ts`: each spell's numbers sit next to its code in `cast()`.

## Balance bot

`npm run sim -- [runs] [minutes] [maxScrolls]` plays headless runs with a bot that kites enemies, collects gems and scrolls, and spends points (half the time on Power, otherwise at random). It prints each run's time, level and build. `maxScrolls` 1 tests the focused build, 3 the spread build.

At the time of writing, with 8 runs each: the 3-scroll bot survived 10:43 on average and won 3 of 8 (measured with a 20% empty-slot bonus, which only affects it through any slot it leaves empty); the 1-scroll Fire bot, with the current 15% bonus, survived 13:40 on average and won 5 of 8. The bot spreads points at random, so a thoughtful player will do better with several scrolls than it does.

## Code map

| File | What it does |
|---|---|
| `src/main.ts` | Startup, HUD, input (keys and thumb stick), pausing, game loop |
| `src/game.ts` | Simulation: player, enemies, every spell and tree effect, pickups |
| `src/book.ts` | Scroll slots, skill points and the rules for learning nodes |
| `src/content.ts` | The six scrolls and their skill trees |
| `src/ui/spellbook.ts` | Spellbook and scroll-found screens |
| `src/render.ts` | Draws the world, characters, spells and effects |
| `src/art/` | All pixel art, generated in code: the bunny, enemies, spells, scrolls, ground and props |

To inspect the art up close, run `npm run dev` and open `/art-preview.html?z=8`.
