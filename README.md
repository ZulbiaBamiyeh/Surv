# Bunny Wizard

A cozy pixel-art survivors game for phones and browsers. You're a bunny wizard out on a moonlit meadow. Your spells cast themselves; you steer, gather stardust, light stars in the night sky, and try to make it to dawn.

## Run it

```sh
npm install
npm run dev      # local dev server with hot reload
npm run build    # typecheck and build to dist/ (index.html, index.css, game.js)
npm run sim      # headless balance playtest (see below)
```

## Controls

| | Phone | Desktop |
|---|---|---|
| Move | Drag anywhere (a thumb stick appears under your finger) | WASD or arrow keys |
| Open the sky | ✦ button, bottom right | Tab or E |
| Pause | Ⅱ button, top right | Esc or P |

The game pauses on its own when you switch apps or tabs. Sound, music and screen shake can be turned off on the title and pause screens.

## How a night works

- A night lasts **10 minutes**. Survive it and dawn breaks. Winning a night unlocks the next, harder one (there are five).
- You start with **Moonbolt** and choose **one of three constellations**.
- Enemies drop **stardust**. Fill the bar to earn a star point, then light a star next to one that's already lit.
- **You can only light 16 stars a night**, out of 38 in the whole sky. Once you've earned all 16, spare stardust heals you instead.
- **Falling stars** land four times a night (an arrow points the way). Walk to one to choose a new constellation: it appears in your sky, its first star comes free, you heal a little, and a burst of starlight clears the enemies around you. A night uses five of the eight constellations at most.
- **King Slime** arrives at 4:15 and the **Slime Emperor** at 8:15. Each drops a feast that heals you fully.
- Golden enemies drop a carrot. A magnet now and then pulls in all the stardust on the map.

## The sky

The Moon sits in the middle with six simple stars around it: Bright Moon (+25% damage), Twin Bolt, Thick Fur, Quick Paws (+20% cast speed), Long Ears and Swift Hop.

Each constellation is a new spell (free), three upgrades, and one bright star that changes how it works.

| Constellation | Spell | Upgrades | Bright star |
|---|---|---|---|
| The Fox | Foxfire: a fan of flames that set enemies alight | Kindle, Five Tails, Fire Path | Wildfire: burning enemies explode and spread fire |
| The Stag | Frost Ring: pushes enemies back and slows them | Deep Winter, Shatter, Icicles | Freeze Solid: every third ring freezes |
| The Owl | Chain Lightning: jumps between enemies | Forked, Static, Storm Cloud | Overload: lightning kills spark onto neighbors |
| The Toad | Bog Bubble: a splat, then a poison puddle | Big Bog, Corrode, Sticky | Plague: the poisoned leave puddles behind |
| The Moth | Moon Moths: circle you and bonk what comes close | Swarm, Moth Dust, Flutter | Moonbeam: every moth fires a beam |
| The Whale | Whirlpool: drags a crowd together, then bursts | Undertow, Deep Water, Twin Tides | Leviathan: triple damage and a stun |
| The Cat | Charm: the toughest nearby enemy fights for you | Crush, Two Hearts, Heartbreak | Nine Lives: get back up once a night |
| The Hare | Lucky Dice: each Moonbolt cast rolls 1 to 3 bolts | Loaded Dice, Lucky Star, Jackpot | High Roller: a d20 every 12 seconds |

The constellations are built to work together without special rules: Shatter, Corrode and Deep Water raise all damage on chilled, poisoned or whirlpooled enemies; Whirlpool gathers crowds for rings, puddles and Wildfire; Lucky Star's critical hits apply to every spell.

## Tuning

- `src/config.ts`: movement, enemies, the spawn curve, waves, bosses, falling stars, stardust curve, and how much harder each night is.
- `src/sky.ts`: the Moon's stars and the eight constellations (names, text, layout) and the 16-star limit.
- `src/game.ts`: each spell's numbers sit next to its code.

## Balance bot

`npm run sim -- [runs] [night] [constellation]` plays whole nights with a bot that steers by testing directions for danger, walks to stardust, carrots and fallen stars, picks constellations at random, and lights random stars. It prints each run and then averages: survival time, time by starting constellation, stars earned by minute, damage per second by minute, crowd size by minute, and each spell's share of damage.

At the time of writing, over 32 runs on night 1 the bot reached dawn 10 times and survived 8:31 on average; every starting constellation averaged between 7:27 and 9:31. On night 3 it never reached dawn (5:11 on average over 16 runs). The bot picks stars at random, so a player who builds on purpose should do better.

## Code map

| File | What it does |
|---|---|
| `src/main.ts` | Title, HUD, pause and end screens, input, saving, the game loop |
| `src/game.ts` | Simulation: player, enemies, bosses, every spell, pickups, falling stars |
| `src/sky.ts` | The sky: stars, constellations, and the rules for lighting them |
| `src/ui/sky.ts` | The sky screen, the constellation picker, and the "constellation appears" animation |
| `src/render.ts` | Draws the night meadow, characters, spells and effects |
| `src/sfx.ts` | Synthesized sound effects and the generated lullaby |
| `src/save.ts` | Best times, unlocked nights and settings (kept in the browser, if allowed) |
| `src/art/` | All pixel art, generated in code |

## The earlier version

`archive/v1-big-tree/` holds the previous game (five element cores, 245 nodes, 20 scrolls) exactly as it was. To play it: `npx vite archive/v1-big-tree`.
