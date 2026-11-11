# Bunny Wizard (working title)

A cute pixel-art survivors game for phones and desktop. You're a bunny wizard whose spells cast themselves; you steer, pick up gems, and grow one big spell tree. Most of the tree is sealed, and the scrolls you find decide which parts open.

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
| Move around the tree | Drag; pinch to zoom; ◎ goes back to the middle | Drag; mouse wheel to zoom |
| Sound on/off | ♪ in the spellbook | M |

The game pauses on its own when you switch apps or tabs.

## How a run works

- Survive **15 minutes** to win, then choose to **keep going** in overtime, where the danger keeps climbing until something gets you.
- Every level-up gives **1 skill point** for the tree. The spellbook opens so you can spend it, or save it for later. **Undo** takes back anything you took since opening the book.
- **King Slimes** arrive at 0:40 and about every 85 seconds after, and always drop a scroll. Picking one up offers 3 choices.
- **Golden elites** start showing up at 2:00. They're much tougher and drop a **treasure chest** worth a skill point.
- A **magnet** drops about every 80 seconds and pulls every gem on the map to you. **Carrots** heal, and turn up more often when you're hurt.

## The spell tree

You start on **Fireball** in the middle. You can take any node next to one you already own. Small nodes are stat bumps; **notables** change how your magic works; **keystones** (diamond-shaped) are big with a catch, such as Inferno Heart (+60% damage, but you take 30% more) or Patient Flame (slower casts, double damage, dice always roll high). Tap a node to see what it does and exactly how your numbers would change.

The open middle is fire: Scatter (1d4 fireballs), Heavy Orb, Blast, Ignite, Fire Ring, Hot Paws, Firestorm, Phoenix and four keystones.

### Sealed regions

Each region opens when you carry the scrolls it needs, and its first node comes free.

| Needs | Region |
|---|---|
| Meteor | Cinder Rain: meteors, Meteor Shower (1d3), Scorched Earth |
| Sun | Little Suns: orbiting suns, Solar Flare, Supernova |
| Green Flame | Verdant Flame: spreading green fire, Witchfire, Everburn |
| Totem | Flame Totem: totems that shoot for you, Twin Totems, Totem Nova |
| Frost | Frost: Frost Nova, Shatter, Snow Pals (snowmen that pull enemies away from you), Yeti |
| Storm | Storm: Zap Chain, Forked (1d6 + 1 jumps), Storm Call, Overload |
| Moon | Moon: Moon Orbs, Full Moon, Lunar Cycle, Werebunny |
| Toxic | Toxic: Stink Puddle, Spores (1d3), Corrode, Toxic Bloom |
| Fire + Frost | Frostfire: Thermal Shock, Steam Burst |
| Frost + Meteor | Comets: freezing meteors, Ice Crater |
| Meteor + Storm | Thunderfall: meteors call lightning, Ion Rock |
| Storm + Sun | Plasma: lightning ignites, Solar Arc |
| Sun + Moon | Eclipse: screen-wide dizziness, Corona |
| Moon + Toxic | Moonshrooms: dripping moons, Lunacy |
| Toxic + Green Flame | Rot Garden: burning poison, Compost |
| Green Flame + Totem | Wicker Totems: walking, burning totems, Burning Effigy |
| Frost + Storm | Thundersnow: Superconductor, Hailstorm |
| Frost + Moon | Aurora: Moonfrost, Aurora |
| Storm + Toxic | Acid Rain: Acid Rain, Electrolysis |
| Totem + Storm | Tesla Totems: Tesla Totems, Lightning Fence |
| Frost + Storm + Sun | Weather Witch: blizzards, thunderstorms and heatwaves |
| Frost + Storm + Toxic + Moon | Elemental Avatar: +15% damage per element, Overflow |

### Niche scrolls (rare)

| Needs | Region |
|---|---|
| Spirit | Wisp Friends: fallen enemies rise as ghosts that fight for you; Legion, Haunt |
| Burrow | Carrot Missiles, Rabbit Hole (dive underground, pop up stunning), Golden Carrot |
| Dice | Loaded Dice (every die gets 2 more sides), Jackpot, Gambler (a d20 every 15 seconds) |
| Clock | Slow Time, Stopwatch (time stops), Rewind (cheat death once every 90 seconds) |
| Mirror | Echo (reflections copy your fireballs), Hall of Mirrors, Reflect |
| Gravity | Black Hole, Event Horizon, Heavy Thoughts |
| Burrow + Dice | Lucky Foot: golden carrots |
| Gravity + Meteor | Singularity: meteors open black holes |
| Moon + Spirit + Clock | Witching Hour |
| Meteor + Gravity + Storm | Cataclysm: a giant meteor every 30 seconds |
| Clock + Mirror + Gravity + Dice | Unravel Reality: a d20 that can stop time, tear holes, heal every enemy, or delete the screen |

### Support scrolls

Separate from the tree. You carry up to **two**, and finding one again levels it up (to level 3).

| Scroll | What it does |
|---|---|
| Dizzy Dust | Enemies in a puff wander, can't hurt you, and bump into their friends |
| Heart Charm | The toughest nearby enemy fights for you for a while |
| Moonlight | Heals you on a timer |
| Bubble Ward | A bubble of invulnerability on a timer |
| Swift Paws | Move speed |
| Lucky Clover | +1 to dice, longer gem reach, more drops |

## Enemies keep getting harder

A **danger** tier under the timer climbs from Calm to Breezy, Tricky, Wild, Fierce, Frantic and Overtime. Each step adds new enemies:

| Enemy | From | Behavior |
|---|---|---|
| Slime, bat | start | Swarm you |
| Skeleton | 1:00 | Sturdier |
| Ghost | 2:30 | Weaves and drifts through the crowd |
| Mushroom | 3:30 | Keeps its distance and spits spores you need to dodge |
| Jelly | 5:00 | Splits into two slimes when it pops |
| Boar | 6:30 | Stops, stamps (a red **!** warns you), then charges in a straight line |
| Golem | 8:30 | Slow, heavy, shrugs off knockback |

On top of that: enemy health grows every minute (and faster after minute 8), spawn rates rise, and **horde waves** surround you with a ring of bats, slimes, ghosts, skeletons, boars or jellies on a schedule that repeats and grows.

## Tuning

- `src/config.ts`: movement, enemies, danger tiers, waves, spawn and health curves, XP curve, drop rates.
- `src/content.ts`: the tree (every node, region and requirement) and the support scrolls.
- `src/game.ts`: every spell's numbers sit next to its code.

## Balance bot

`npm run sim -- [runs] [minutes] [style] [endless]` plays headless runs with a bot that kites enemies, sidesteps spores, picks up gems and scrolls (always preferring spell scrolls), and walks the tree toward named nodes (`style` "random" spends at random instead). It prints each run's time, level, what killed it, its scrolls, and which sources did the damage. Add `endless` to keep playing past 15:00.

At the time of writing, over 12 runs the bot won about half, usually dying between 5 and 8 minutes when it lost (mostly to spores, which it dodges poorly). In endless mode a winning bot lasted about 5 more minutes. Burning is the biggest damage source, followed by totems, so those are the first things to watch when tuning.

## Code map

| File | What it does |
|---|---|
| `src/main.ts` | Startup, HUD, input (keys and thumb stick), pausing, end screens, game loop |
| `src/game.ts` | Simulation: player, enemies, every spell and tree effect, pickups |
| `src/book.ts` | The tree's rules: taking and refunding nodes, scrolls, sealed regions, support slots |
| `src/content.ts` | The tree layout and text, regions, scrolls, support scrolls |
| `src/ui/spellbook.ts` | The draggable tree, node details, and the scroll-found screen |
| `src/render.ts` | Draws the world, characters, spells and effects |
| `src/sfx.ts` | Synthesized sound effects |
| `src/art/` | All pixel art, generated in code: the bunny, enemies, helpers, spells, scrolls, tree icons, ground and props |

To inspect the art up close, run `npm run dev` and open `/art-preview.html?z=8`.
