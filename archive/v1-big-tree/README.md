# Bunny Wizard (working title)

A cute pixel-art survivors game for phones and desktop. You're a bunny wizard whose spells cast themselves; you steer, pick up gems, and grow one huge spell tree. You start on one element's corner of it, and the scrolls you find decide which other parts open.

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

- Pick your magic: **one of three elements**, drawn at random from Fire, Frost, Storm, Toxic and Moon. You start on that element's core of the tree.
- Survive **15 minutes** to win, then choose to **keep going** in overtime, where the danger keeps climbing until something gets you.
- Every level-up gives **1 skill point**. The spellbook opens so you can spend it, or save it for later. **Undo** takes back anything you took since opening the book.
- **King Slimes** arrive at 0:40 and about every 85 seconds after, and always drop a scroll. Picking one up offers 3 to choose from. Scrolls and chests fly to you from a good distance.
- **Golden elites** start showing up at 2:00. They're much tougher and drop a **treasure chest** worth a skill point.
- A **magnet** drops about every 80 seconds and pulls every gem on the map to you. **Carrots** heal, and turn up more often when you're hurt.

## The spell tree

One big tree shaped like a five-pointed star. Each point is an **element core**: a first spell in the middle, six spokes of nodes, a ring joining them and two to four **keystones** (diamond-shaped: big, with a catch). You can take any node next to one you already own. Small nodes are stat bumps; **notables** change how your magic works. Tap a node to see exactly how your numbers would change.

| Element | First spell | Some of its notables and keystones |
|---|---|---|
| Fire | Fireball | Scatter (1d4), Blast, Ignite, Fire Ring, Hot Paws (a path of fire behind you), Heavy Orb, Phoenix · Inferno Heart, Wildfire, Patient Flame, Ember Heart |
| Frost | Ice Shard (piercing, chills) | Frost Nova, Ripples (1d3 waves), Icicle Fan, Shatter, Deep Freeze, Snow Pals, Yeti · Glacial Heart, Permafrost |
| Storm | Zap Chain | Forked (1d6 + 1 jumps), Storm Call, Overload, Static, Thunderbolt, Endless Arc · Lightning Rod, Conductor |
| Toxic | Poison Glob (lobbed, leaves a puddle) | Spores (1d3 globs), Stink Trail, Corrode, Toxic Bloom, Contagion, Bog, Miasma · Plague Bearer, Acid Blood |
| Moon | Moon Orbs (three moons that breathe in and out; one beams) | Full Moon, Lunar Cycle, Werebunny, Crater Kick, Constellation (1d4 more moons), Tides, Moonbeam · Blood Moon, Gravity Moon |

### Everything else is sealed

A region opens when you carry every scroll it needs, and its first node comes free. Finding another element's scroll opens its whole core.

| Needs | Region |
|---|---|
| Two neighboring elements | Frostfire (Fire + Frost), Thundersnow (Frost + Storm), Acid Rain (Storm + Toxic), Moonshrooms (Toxic + Moon), Harvest Moon (Moon + Fire) |
| Two elements across the star | Plasma (Fire + Storm), Black Ice (Frost + Toxic), Charged Moons (Storm + Moon), Fumes (Fire + Toxic), Aurora (Frost + Moon) |
| All five elements | Elemental Avatar, in the very middle |
| Meteor, Sun, Green Flame, Totem | Fire's own branches: Cinder Rain, Little Suns, Verdant Flame, Flame Totem |
| A branch plus an element | Comets, Thunderfall, Solar Arc, Eclipse, Rot Garden, Tesla Totems, Wicker Totems, and Weather Witch (Frost + Storm + Sun) |
| Support scrolls | Charm (charmed enemies fight for you; Crush, Two Hearts, Love Bomb), Dizzy Dust (Spin Cycle, Clumsy, Bonk Party), Bubbles (Thick Bubble, Pop!), Mending (Blossom, Second Wind), Swift (Zoomies, Slipstream) |
| Rare niche scrolls | Spirit (ghost friends), Burrow (carrot missiles, Rabbit Hole), Dice (Loaded Dice, Lucky Clover, Jackpot, Gambler), Clock (Slow Time, Stopwatch, Rewind), Mirror (reflections copy your attacks), Gravity (black holes) |
| Niche combinations | Lucky Foot (Burrow + Dice), Singularity (Gravity + Meteor), Witching Hour (Moon + Spirit + Clock), Cataclysm (Meteor + Gravity + Storm), Unravel Reality (Clock + Mirror + Gravity + Dice) |

There are about 245 nodes in 44 regions, and a run finds roughly 10 scrolls, so every run opens a different slice of the tree.

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

The bot cycles through the five starting elements. At the time of writing, over 25 runs it survived on average: Fire 13:26, Storm 10:33, Toxic 10:58, Moon 6:37, Frost about 5 to 8 minutes (it varies a lot between batches). Fire is the strongest start and Moon and Frost the weakest, so those are the first things to tune. The bot is a poor dodger and walks away from enemies, which undersells melee builds like Moon.

## Code map

| File | What it does |
|---|---|
| `src/main.ts` | Startup, HUD, input (keys and thumb stick), pausing, end screens, game loop |
| `src/game.ts` | Simulation: player, enemies, every spell and tree effect, pickups |
| `src/book.ts` | The tree's rules: taking and refunding nodes, scrolls and sealed regions |
| `src/content.ts` | The tree: element cores, regions, scrolls, node text and layout |
| `src/ui/spellbook.ts` | The draggable tree, node details, the scroll-found screen and the start picker |
| `src/render.ts` | Draws the world, characters, spells and effects |
| `src/sfx.ts` | Synthesized sound effects |
| `src/art/` | All pixel art, generated in code: the bunny, enemies, helpers, spells, scrolls, tree icons, ground and props |

To inspect the art up close, run `npm run dev` and open `/art-preview.html?z=8`.
