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
| Prototype cheat: drop a random die | G |

## How dice work

- Dice are rare. A **King Slime** shows up at 0:30 and then every 45 seconds, and always drops one. Normal enemies have a 0.3% chance.
- Bigger dice are rarer and take more backpack space: d3 to d10 are 1×1, d12 is 2×1, d20 is 2×2.
- **Tap a die** in the backpack to roll it. It turns into a number.
- **Drag the number** onto one of Fireball's two sockets:
  - **Count:** fireballs per cast. Large counts fan out wide, and very large ones become a full ring.
  - **Speed:** each pip makes casting 8% faster.
- Putting a number in a filled socket sends the old one back to your bag. Dragging between sockets swaps them.

## Tuning

Every number that affects feel or balance is in [`src/config.ts`](src/config.ts): movement, fireball stats, enemy stats, spawn rates, XP curve, dice drop odds and backpack size.

## Code map

| File | What it does |
|---|---|
| `src/main.ts` | Startup, input, fixed-rate game loop, HUD |
| `src/game.ts` | The simulation: player, enemies, fireballs, pickups, effects |
| `src/render.ts` | Draws the world and HUD to the canvas |
| `src/backpack.ts` | The backpack screen: dragging, rolling, sockets |
| `src/inventory.ts` | Backpack grid and item data, Fireball stats |
| `src/dice.ts` | Die types, drop odds, rolling |
| `src/art/palette.ts` | Color ramps for every material |
| `src/art/painter.ts` | The shading tool: lit shapes snapped onto color ramps, plus automatic outlines |
| `src/art/characters.ts` | Wizard, slimes, King Slime, bats and skeletons, with animation frames |
| `src/art/items.ts` | Gems, fireballs, dice, the scroll, smoke and sparks |
| `src/art/world.ts` | Endless ground and props (trees, bushes, rocks, mushrooms, stumps) |
| `src/art/font.ts` | Pixel font for damage numbers |

## Art

All art is generated in code at startup. Each sprite is built from shapes that are lit from the top left and then mapped onto hand-picked color ramps, so everything shares the same lighting and palette. To inspect the art up close, run `npm run dev` and open `/art-preview.html` (add `?z=10` to zoom).
