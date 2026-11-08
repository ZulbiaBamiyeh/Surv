# Surv (prototype)

A cute pixel-art survivors-style game. You're a little wizard whose Fireball scroll casts by itself, and dice you find can be rolled and slotted into the scroll to power it up.

## Run it

```sh
npm install
npm run dev      # local dev server with hot reload
npm run build    # typecheck and build to dist/
```

## Controls

| Action | Keys |
|---|---|
| Move | WASD, arrow keys, or drag on the screen |
| Open or close the backpack (pauses) | Tab, B or I |
| Restart after dying | R |
| Pick a level-up reward | 1, 2, 3 or click |
| Prototype cheat: drop a random die | G |

## How a run works

- Survive **15 minutes** to win. Enemies get more numerous, tougher and harder-hitting over time.
- Every level-up pauses the game and offers **3 items**. Pick one and it goes into your backpack.
- Picking an item you already have **merges** it into the next tier automatically (up to tier III). You can also drag two matching items together in the backpack.
- If your bag is full, the new item waits in a **holding tray** until you make room.

### Spell scrolls (1×2)

| Scroll | What it does | Count socket |
|---|---|---|
| Fireball | Shoots at the nearest enemy | Fireballs per cast |
| Frost Nova | Ring of ice that damages and chills (slows) | Waves per cast |
| Zap Chain | Lightning that jumps between enemies | Extra jumps |
| Orbit Rocks | Rocks circle you and knock enemies away | Rocks |
| Stink Puddle | Poison puddle that hurts anything inside | Puddles per cast |
| Ward | A bubble of invulnerability every 24s | Extra half-seconds |
| Mend | Heals you every 35s | Extra healing |

Every scroll has a **Speed** socket too: each pip makes it cast 8% faster (Orbit Rocks spin faster).

### Gear

| Gear | Effect |
|---|---|
| Hourglass | All scrolls cast faster |
| Comfy Boots | Move faster |
| Magnet | Bigger pickup range |
| Big Heart | More max health |
| Lucky Clover | More dice drops |
| Ember Ring *(touching)* | Touching scrolls set enemies on fire |
| Whetstone *(touching)* | Touching scrolls deal more damage |
| Prism *(touching)* | Touching scrolls get +1 count |
| Big Lens *(touching)* | Touching scrolls get bigger area |

Gear marked *touching* only boosts scrolls that share an edge with it in the backpack, so where you put things matters.

## How dice work

- Dice are rare. A **King Slime** shows up at 0:30 and then every 45 seconds, and always drops one. Normal enemies have a small chance (more with a Lucky Clover).
- Bigger dice are rarer and take more backpack space: d3 to d10 are 1×1, d12 is 2×1, d20 is 2×2.
- **Tap a die** in the backpack to roll it. It turns into a number.
- **Drag the number** onto a scroll (or onto a socket in the scroll's detail panel) to set its Count or Speed.
- Putting a number in a filled socket sends the old one back to your bag.

## Playtest bot

`npm run sim -- 10 16` plays 10 headless runs (up to 16 minutes each) with a simple bot that kites enemies, picks rewards and rolls dice, then prints how long each run lasted and the final build. Use it to check balance after changing `src/config.ts` or `src/content.ts`.

## Tuning

Every number that affects feel or balance is in [`src/config.ts`](src/config.ts): movement, fireball stats, enemy stats, spawn rates, XP curve, dice drop odds and backpack size.

## Code map

| File | What it does |
|---|---|
| `src/main.ts` | Startup, input, fixed-rate game loop, HUD |
| `src/game.ts` | The simulation: player, enemies, spells, statuses, pickups, level-up offers |
| `src/render.ts` | Draws the world and HUD to the canvas |
| `src/backpack.ts` | The backpack screen: dragging, rolling, sockets, merging, item details |
| `src/content.ts` | Every spell scroll and piece of gear |
| `src/inventory.ts` | Backpack grid, items, merging, adjacency and spell stats |
| `src/dice.ts` | Die types, drop odds, rolling |
| `src/art/palette.ts` | Color ramps for every material |
| `src/art/painter.ts` | The shading tool: lit shapes snapped onto color ramps, plus automatic outlines |
| `src/art/characters.ts` | Wizard, slimes, King Slime, bats and skeletons, with animation frames |
| `src/art/items.ts` | Gems, fireballs, dice, the scroll, smoke and sparks |
| `src/art/world.ts` | Endless ground and props (trees, bushes, rocks, mushrooms, stumps) |
| `src/art/font.ts` | Pixel font for damage numbers |

## Art

All art is generated in code at startup. Each sprite is built from shapes that are lit from the top left and then mapped onto hand-picked color ramps, so everything shares the same lighting and palette. To inspect the art up close, run `npm run dev` and open `/art-preview.html` (add `?z=10` to zoom).
