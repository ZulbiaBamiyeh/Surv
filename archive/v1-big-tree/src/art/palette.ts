// Color ramps, dark to light. Shadows shift toward purple and blue, highlights toward warm yellow,
// which is what gives pixel art its rich, painted look.

export type Ramp = readonly string[];

export const OUTLINE = "#140d1c";

export const RAMPS = {
  skin: ["#4a2232", "#8c4a45", "#d0806a", "#f2b48e", "#ffe1c4"],
  blush: ["#a83a5a", "#e8607a", "#ff8a9a"],
  robe: ["#2e0f2a", "#6e1838", "#b52a3e", "#e8553f", "#ff9466"],
  hat: ["#151338", "#202a6a", "#2f4cab", "#4a85e6", "#94cbff"],
  gold: ["#3a1f12", "#874516", "#cf8a24", "#ffc83d", "#fff2a0"],
  hair: ["#2a1626", "#5a2c34", "#9a4c3c", "#d27a4a", "#f5b070"],
  leather: ["#1a1020", "#3a2030", "#5e3438", "#8a5048", "#b87860"],
  wood: ["#24140f", "#4e2c1e", "#7e4a2c", "#b0743e", "#dca464"],
  magic: ["#0e2340", "#13507a", "#1e94c0", "#46d6f0", "#c6fbff"],
  slime: ["#3a1340", "#86246c", "#cc4596", "#ff83c0", "#ffd2ec"],
  king: ["#3a2410", "#8a5414", "#d49a1c", "#ffd640", "#fff8b8"],
  bone: ["#2a2238", "#5a5476", "#9894b2", "#d4d2e2", "#fbfbff"],
  bat: ["#1a0f2e", "#3a1d5c", "#64309a", "#9658d4", "#c9a0ff"],
  wing: ["#140b22", "#2e1748", "#4e2878", "#7646a8", "#a476d8"],
  gemBlue: ["#0f2244", "#164c86", "#2490d0", "#50d2ff", "#c8f6ff"],
  gemPink: ["#3a1040", "#7e2070", "#c23a9c", "#f070c8", "#ffc8ee"],
  fire: ["#5a1414", "#b8281a", "#f05a1a", "#ffa424", "#ffe46a", "#fffbe0"],
  paper: ["#4a2c1e", "#94643e", "#d0a46a", "#f0d6a0", "#fff6d8"],
  stone: ["#1e1a2a", "#3e3a52", "#66667e", "#9a9cb0", "#d0d4de"],
  leaf: ["#0f2a24", "#1a4a30", "#2a6e38", "#47963e", "#7cc050", "#b6e070"],
  grass: ["#1d3a2c", "#2a5a32", "#3c7e38", "#55a03e", "#6cb444", "#8ccc52", "#b0e070"],
  dirt: ["#2e1c1c", "#4e3430", "#7a5440", "#9c7656", "#bc9a72"],
  mushroom: ["#3a0f1e", "#7a1a2a", "#c42a36", "#f05a4a", "#ff9a80"],
  ivory: ["#3a3450", "#7a7896", "#b8b8cc", "#e8e8f2", "#ffffff"],
  shadowEye: ["#140d1c", "#2a1530", "#5a1a2a"],
  red: ["#3a0a14", "#7a1424", "#d02a2a", "#ff5a3a", "#ffb08a"],
};

export type RampName = keyof typeof RAMPS;

/** Each die type has its own ramp so they read at a glance. */
export const DIE_RAMPS: Record<number, Ramp> = {
  3: ["#0f2a1e", "#1e5a34", "#2f9a4a", "#5ad66a", "#b4f5a0"],
  4: ["#0f2244", "#164c86", "#2490d0", "#50d2ff", "#c8f6ff"],
  6: RAMPS.ivory,
  8: ["#3a1040", "#7e2070", "#c23a9c", "#f070c8", "#ffc8ee"],
  10: ["#1a0f2e", "#3a1d5c", "#64309a", "#9658d4", "#d0b0ff"],
  12: ["#3a1408", "#8a3414", "#d8641c", "#ffa040", "#ffd8a0"],
  20: RAMPS.king,
};
