import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA_PATH = join(ROOT, "data/slimefun-items.json");
const TEXTURES_DIR = join(ROOT, "textures");
const FALLBACK_ICON = "./textures/item/knowledge_book.png";

const data = JSON.parse(await readFile(DATA_PATH, "utf8"));
const allItems = [...(data.items ?? []), ...(data.vanillaItems ?? [])];
const textureFiles = await collectTextureFiles(TEXTURES_DIR);

let matched = 0;
let fallback = 0;

for (const item of allItems) {
  delete item.localIcon;

  const localIcon = findLocalIcon(item, textureFiles);
  if (localIcon) {
    item.localIcon = localIcon;
    matched += 1;
  } else {
    item.localIcon = FALLBACK_ICON;
    fallback += 1;
  }
}

data.meta.localTextures = "textures/";
data.meta.localTextureMatchedIcons = matched;
data.meta.localTextureFallbackIcons = fallback;

await writeFile(DATA_PATH, `${JSON.stringify(data, null, 2)}\n`);

console.log(`Matched ${matched} local textures. Used non-barrier fallback for ${fallback} items.`);

async function collectTextureFiles(rootDir) {
  const files = new Set();
  await walk(rootDir);
  return files;

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".png") {
        const publicPath = `./${relative(ROOT, path).split(sep).join("/")}`;
        files.add(publicPath);
      }
    }
  }
}

function findLocalIcon(item, files) {
  const icon = normalizeIcon(item.icon ?? item.id);
  const id = normalizeIcon(item.id);
  const candidates = [
    ...candidatePaths(icon),
    ...candidatePaths(id),
    ...derivedCandidatePaths(icon),
    ...derivedCandidatePaths(id),
    ...specialCandidatePaths(icon),
    ...specialCandidatePaths(id)
  ];

  return candidates.find((path) => files.has(path)) ?? null;
}

function candidatePaths(name) {
  if (!name || name === "barrier") return [];

  return [
    `./textures/item/${name}.png`,
    `./textures/block/${name}.png`,
    `./textures/block/${name}_top.png`,
    `./textures/block/${name}_front.png`,
    `./textures/block/${name}_side.png`,
    `./textures/block/${name}_end.png`
  ];
}

function specialCandidatePaths(name) {
  const map = {
    anvil: ["./textures/block/anvil_top.png"],
    brewing_stand: ["./textures/item/brewing_stand.png", "./textures/block/brewing_stand.png"],
    cake: ["./textures/block/cake_top.png"],
    campfire: ["./textures/item/campfire.png", "./textures/block/campfire_log_lit.png"],
    cauldron: ["./textures/item/cauldron.png", "./textures/block/cauldron_top.png"],
    chest: ["./textures/item/chest_minecart.png", "./textures/entity/chest/normal.png"],
    creeper_head: ["./textures/entity/creeper/creeper.png"],
    crossbow: ["./textures/item/crossbow_standby.png"],
    crafting_table: ["./textures/block/crafting_table_front.png", "./textures/block/crafting_table_top.png"],
    dragon_head: ["./textures/entity/enderdragon/dragon.png"],
    dispenser: ["./textures/block/dispenser_front.png"],
    dropper: ["./textures/block/dropper_front.png"],
    enchanting_table: ["./textures/block/enchanting_table_top.png"],
    furnace: ["./textures/block/furnace_front.png"],
    clock: ["./textures/item/clock_00.png"],
    compass: ["./textures/item/compass_00.png"],
    heavy_weighted_pressure_plate: ["./textures/block/iron_block.png"],
    hopper: ["./textures/item/hopper.png"],
    jukebox: ["./textures/block/jukebox_top.png", "./textures/block/jukebox_side.png"],
    magma_block: ["./textures/block/magma.png"],
    nether_brick_fence: ["./textures/block/nether_bricks.png"],
    note_block: ["./textures/block/note_block.png"],
    observer: ["./textures/block/observer_front.png"],
    oak_slab: ["./textures/block/oak_planks.png"],
    piston: ["./textures/block/piston_top.png"],
    player_head: ["./textures/entity/player/wide/steve.png"],
    quartz_slab: ["./textures/block/quartz_block_top.png", "./textures/block/quartz_block_side.png"],
    redstone_lamp: ["./textures/block/redstone_lamp.png"],
    shield: ["./textures/entity/shield_base_nopattern.png", "./textures/entity/shield_base.png"],
    smithing_table: ["./textures/block/smithing_table_front.png", "./textures/block/smithing_table_top.png"],
    spawner: ["./textures/block/spawner.png"],
    sticky_piston: ["./textures/block/piston_top_sticky.png"],
    stone_pressure_plate: ["./textures/block/stone.png"],
    stonecutter: ["./textures/block/stonecutter_top.png", "./textures/block/stonecutter_side.png"],
    tnt: ["./textures/block/tnt_side.png", "./textures/block/tnt_top.png"],
    wither_skeleton_skull: ["./textures/entity/skeleton/wither_skeleton.png"],
    zombie_head: ["./textures/entity/zombie/zombie.png"]
  };

  return map[name] ?? [];
}

function derivedCandidatePaths(name) {
  const candidates = [];
  const pushBase = (base) => {
    candidates.push(...candidatePaths(base));
    candidates.push(...candidatePaths(pluralizeBlockBase(base)));
  };

  if (name.endsWith("_bed")) {
    candidates.push(`./textures/entity/bed/${name.replace(/_bed$/, "")}.png`);
  }

  if (name.endsWith("_wood")) {
    pushBase(name.replace(/_wood$/, "_log"));
  }

  if (name.endsWith("_hyphae")) {
    pushBase(name.replace(/_hyphae$/, "_stem"));
  }

  for (const suffix of ["_fence_gate", "_pressure_plate", "_button", "_fence", "_wall", "_stairs", "_slab"]) {
    if (name.endsWith(suffix)) {
      const base = name.slice(0, -suffix.length);
      pushBase(base);
      pushBase(`${base}_planks`);
    }
  }

  if (name.startsWith("infested_")) {
    pushBase(name.replace(/^infested_/, ""));
  }

  if (name.startsWith("smooth_")) {
    const base = name.replace(/^smooth_/, "");
    pushBase(base);
    if (base === "quartz") pushBase("quartz_block");
    if (base === "sandstone") pushBase("sandstone");
    if (base === "red_sandstone") pushBase("red_sandstone");
  }

  if (name.startsWith("waxed_")) {
    pushBase(name.replace(/^waxed_/, ""));
  }

  return candidates;
}

function pluralizeBlockBase(base) {
  if (base === "brick") return "bricks";
  if (base.endsWith("_brick")) return `${base}s`;
  return base;
}

function normalizeIcon(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/^minecraft:/, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}
