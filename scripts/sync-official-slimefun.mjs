import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const BASE_URL = "https://raw.githubusercontent.com/Slimefun/Slimefun4/master/src/main/java/io/github/thebusybiscuit/slimefun4";
const ADDON_NAME = "Slimefun";
const JAR_PATH = new URL("../Slimefun4-RC.jar", import.meta.url);
const FILES = {
  items: `${BASE_URL}/implementation/SlimefunItems.java`,
  setup: `${BASE_URL}/implementation/setup/SlimefunItemSetup.java`
};

const recipeTypeNames = {
  ENHANCED_CRAFTING_TABLE: "增强型工作台",
  MAGIC_WORKBENCH: "魔法工作台",
  ARMOR_FORGE: "盔甲锻造台",
  GRIND_STONE: "磨石",
  ORE_CRUSHER: "矿物粉碎机",
  ORE_WASHER: "洗矿机",
  SMELTERY: "冶炼炉",
  COMPRESSOR: "压缩机",
  PRESSURE_CHAMBER: "压力机",
  HEATED_PRESSURE_CHAMBER: "加热压力舱",
  ANCIENT_ALTAR: "远古祭坛",
  GOLD_PAN: "淘金盘",
  MOB_DROP: "生物掉落",
  GEO_MINER: "地质矿机",
  NULL: "不可合成"
};

const classRecipeTypes = {
  AlloyIngot: "冶炼炉",
  AncientAltar: "多方块结构",
  AncientPedestal: "多方块结构",
  ArmorForge: "多方块结构",
  Compressor: "多方块结构",
  ElectricMotor: "增强型工作台",
  EnhancedCraftingTable: "多方块结构",
  GrindStone: "多方块结构",
  MakeshiftSmeltery: "多方块结构",
  OreCrusher: "多方块结构",
  PressureChamber: "多方块结构",
  Smeltery: "多方块结构"
};

const vanillaNameMap = {
  IRON_INGOT: "铁锭",
  GOLD_INGOT: "金锭",
  COPPER_INGOT: "铜锭",
  COAL: "煤炭",
  CHARCOAL: "木炭",
  REDSTONE: "红石粉",
  REDSTONE_BLOCK: "红石块",
  LAPIS_LAZULI: "青金石",
  LAPIS_BLOCK: "青金石块",
  DIAMOND: "钻石",
  EMERALD: "绿宝石",
  QUARTZ: "下界石英",
  GLASS: "玻璃",
  GLASS_PANE: "玻璃板",
  COBBLESTONE: "圆石",
  STONE: "石头",
  OAK_PLANKS: "橡木木板",
  STICK: "木棍",
  STRING: "线",
  BOWL: "碗",
  LEATHER: "皮革",
  PAPER: "纸",
  BOOK: "书",
  FLINT: "燧石",
  FLINT_AND_STEEL: "打火石",
  OBSIDIAN: "黑曜石",
  ENDER_EYE: "末影之眼",
  ENDER_PEARL: "末影珍珠",
  BLAZE_ROD: "烈焰棒",
  BLAZE_POWDER: "烈焰粉",
  FURNACE: "熔炉",
  CRAFTING_TABLE: "工作台",
  DISPENSER: "发射器",
  HOPPER: "漏斗",
  CHEST: "箱子",
  PISTON: "活塞",
  OBSERVER: "侦测器",
  COOKIE: "曲奇",
  WHEAT: "小麦",
  SUGAR: "糖",
  BONE: "骨头",
  BONE_MEAL: "骨粉",
  GLOWSTONE_DUST: "荧石粉",
  GLOWSTONE: "荧石",
  NETHER_WART: "下界疣",
  NETHER_BRICK: "下界砖",
  ICE: "冰",
  PACKED_ICE: "浮冰",
  DAYLIGHT_DETECTOR: "阳光探测器"
};

const categoryNames = {
  weapons: "武器",
  tools: "工具",
  food: "食物",
  basicMachines: "基础机器",
  magicalResources: "魔法材料",
  magicalGadgets: "魔法工具",
  magicalArmor: "魔法盔甲",
  technicalComponents: "科技组件",
  resources: "资源",
  misc: "杂项",
  armor: "盔甲",
  usefulItems: "实用物品",
  backpacks: "背包",
  electricMachines: "电力机器",
  electricity: "能源与电力",
  cargo: "物流",
  androids: "机器人",
  gps: "GPS",
  generators: "发电机"
};

const manualItems = [
  {
    id: "ENHANCED_CRAFTING_TABLE",
    name: "增强型工作台",
    englishName: "Enhanced Crafting Table",
    addonName: ADDON_NAME,
    category: "基础机器",
    icon: "crafting_table",
    recipeType: "多方块结构",
    recipe: [
      { id: "CRAFTING_TABLE", qty: 1 },
      { id: "DISPENSER", qty: 1 }
    ]
  },
  {
    id: "GRIND_STONE",
    name: "磨石",
    englishName: "Grind Stone",
    addonName: ADDON_NAME,
    category: "基础机器",
    icon: "grindstone",
    recipeType: "多方块结构",
    recipe: [
      { id: "OAK_PLANKS", qty: 4 },
      { id: "COBBLESTONE", qty: 4 },
      { id: "FLINT", qty: 1 }
    ]
  },
  {
    id: "ORE_CRUSHER",
    name: "矿物粉碎机",
    englishName: "Ore Crusher",
    addonName: ADDON_NAME,
    category: "基础机器",
    icon: "blast_furnace",
    recipeType: "多方块结构",
    recipe: [
      { id: "GRIND_STONE", qty: 1 },
      { id: "IRON_INGOT", qty: 4 },
      { id: "PISTON", qty: 1 }
    ]
  },
  {
    id: "ARMOR_FORGE",
    name: "盔甲锻造台",
    englishName: "Armor Forge",
    addonName: ADDON_NAME,
    category: "基础机器",
    icon: "anvil",
    recipeType: "多方块结构",
    recipe: [
      { id: "ANVIL", qty: 1 },
      { id: "DISPENSER", qty: 1 }
    ]
  },
  {
    id: "SMELTERY",
    name: "冶炼炉",
    englishName: "Smeltery",
    addonName: ADDON_NAME,
    category: "基础机器",
    icon: "blast_furnace",
    recipeType: "多方块结构",
    recipe: [
      { id: "NETHER_BRICK_FENCE", qty: 1 },
      { id: "DISPENSER", qty: 1 },
      { id: "NETHER_BRICK", qty: 2 }
    ]
  },
  {
    id: "COMPRESSOR",
    name: "压缩机",
    englishName: "Compressor",
    addonName: ADDON_NAME,
    category: "基础机器",
    icon: "piston",
    recipeType: "多方块结构",
    recipe: [
      { id: "PISTON", qty: 1 },
      { id: "NETHER_BRICK_FENCE", qty: 1 },
      { id: "DISPENSER", qty: 1 }
    ]
  },
  {
    id: "PRESSURE_CHAMBER",
    name: "压力舱",
    englishName: "Pressure Chamber",
    addonName: ADDON_NAME,
    category: "基础机器",
    icon: "heavy_weighted_pressure_plate",
    recipeType: "多方块结构",
    recipe: [
      { id: "GLASS", qty: 1 },
      { id: "DISPENSER", qty: 1 },
      { id: "PISTON", qty: 1 }
    ]
  }
];

const [itemsSource, setupSource] = await Promise.all([
  fetchText(FILES.items),
  fetchText(FILES.setup)
]);

const headTextures = parseHeadTexturesFromJar();
const itemDefinitions = parseItemDefinitions(itemsSource);
const recipes = parseRecipeRegistrations(setupSource);
const items = mergeItems(itemDefinitions, recipes);
const vanillaItems = collectBaseItems(recipes, items);

const dataset = {
  meta: {
    name: "Slimefun4-RC derived data",
    version: new Date().toISOString().slice(0, 10),
    source: "Slimefun4-RC.jar + https://github.com/Slimefun/Slimefun4",
    note: "参考本地 Slimefun4-RC.jar，并结合官方源码抽取可识别配方。复杂机器、动态产物和服务器魔改配方可能需要手动补充。"
  },
  items,
  vanillaItems
};

await writeFile(new URL("../data/slimefun-items.json", import.meta.url), `${JSON.stringify(dataset, null, 2)}\n`);
console.log(`Wrote ${items.length} craftable Slimefun items and ${vanillaItems.length} vanilla/material entries.`);

async function fetchText(url) {
  const cachePath = url.includes("SlimefunItems.java") ? "/tmp/SlimefunItems.java" : "/tmp/SlimefunItemSetup.java";
  try {
    const cached = await readFile(cachePath, "utf8");
    if (cached.length > 10_000) return cached;
  } catch {}

  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url} returned ${response.status}`);
      return response.text();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 900));
    }
  }
  throw lastError;
}

function parseItemDefinitions(source) {
  const definitions = new Map();
  const lines = source.split("\n").filter((line) => line.includes("public static final SlimefunItemStack"));

  for (const line of lines) {
    const field = line.match(/SlimefunItemStack\s+([A-Z0-9_]+)\s*=/)?.[1];
    const args = extractConstructorArgs(line);
    const id = unquote(args[0]) ?? field;
    const name = stripColorCodes(extractDisplayName(args) ?? titleCase(id));
    const material = args[1]?.match(/Material\.([A-Z0-9_]+)/)?.[1];
    const headTextureKey = args[1]?.match(/HeadTexture\.([A-Z0-9_]+)/)?.[1];
    const inlineHeadTexture = unquote(args[1]);
    const headTexture = headTextures.get(headTextureKey) ?? (/^[0-9a-f]{32,128}$/.test(inlineHeadTexture ?? "") ? inlineHeadTexture : null);
    const guessedIcon = guessIcon(id);
    const icon = material && !(material === "PAPER" && guessedIcon !== "paper") ? material.toLowerCase() : guessedIcon;
    definitions.set(field, {
      id,
      name,
      englishName: name,
      addonName: ADDON_NAME,
      icon,
      ...(headTexture ? { headTexture } : {}),
      category: "粘液科技",
      recipeType: "未收录配方"
    });
  }

  return definitions;
}

function extractConstructorArgs(line) {
  const argsStart = line.indexOf("new SlimefunItemStack(");
  if (argsStart === -1) return [];
  return splitTopLevel(line.slice(argsStart).replace(/^new SlimefunItemStack\(/, "").replace(/\);\s*$/, ""));
}

function extractDisplayName(args) {
  const display = args.find((arg, index) => index > 1 && /^"[^"]*"/.test(arg.trim()));
  return display ? JSON.parse(display.trim().match(/^"[^"]*"/)[0]) : null;
}

function parseHeadTexturesFromJar() {
  try {
    const command = `unzip -p ${JSON.stringify(JAR_PATH.pathname)} io/github/thebusybiscuit/slimefun4/utils/HeadTexture.class | strings`;
    const output = execFileSync("sh", ["-lc", command], { encoding: "utf8" });
    const lines = output.split(/\r?\n/).filter(Boolean);
    const nameStart = lines.indexOf("PORTABLE_CRAFTER");
    const nameEnd = lines.indexOf("texture");
    const names = lines.slice(nameStart, nameEnd).filter((line) => /^[A-Z0-9_]+$/.test(line));
    const hashes = lines.map((line) => line.match(/[0-9a-f]{50,128}/)?.[0]).filter(Boolean);
    return new Map(names.map((name, index) => [name, hashes[index]]).filter((entry) => entry[1]));
  } catch {
    return new Map();
  }
}

function parseRecipeRegistrations(source) {
  const registrations = new Map();
  const blocks = source
    .split(".register(plugin);")
    .map((segment) => segment.match(/(?:^|\n)\s*new\s+[A-Za-z0-9_]+\([\s\S]*$/)?.[0])
    .filter(Boolean)
    .map((block) => `${block}.register(plugin);`);

  for (const block of blocks) {
    const className = block.match(/new\s+([A-Za-z0-9_]+)\(/)?.[1];
    const output = block.match(/SlimefunItems\.([A-Z0-9_]+)/)?.[1];
    const explicitRecipeType = block.match(/RecipeType\.([A-Z0-9_]+)/)?.[1];
    const recipeType = explicitRecipeType ? recipeTypeNames[explicitRecipeType] ?? explicitRecipeType : classRecipeTypes[className];
    const recipeBody = extractRecipeArray(block);
    const categoryKey = block.match(/itemGroups\.([A-Za-z0-9_]+)/)?.[1];
    if (!output || !recipeType || !recipeBody) continue;

    const recipe = compactRecipe(splitTopLevel(recipeBody).map(parseIngredient).filter(Boolean));
    if (recipe.length === 0) continue;

    registrations.set(output, {
      recipeType,
      category: categoryNames[categoryKey] ?? "粘液科技",
      recipe
    });
  }

  return registrations;
}

function extractRecipeArray(block) {
  const marker = "new ItemStack[]";
  const start = block.indexOf(marker);
  if (start === -1) return null;
  const open = block.indexOf("{", start);
  if (open === -1) return null;

  let depth = 0;
  for (let index = open; index < block.length; index += 1) {
    const char = block[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return block.slice(open + 1, index);
    }
  }

  return null;
}

function parseIngredient(raw) {
  const entry = raw.trim();
  if (!entry || entry === "null") return null;

  const slimefunStack = entry.match(/new SlimefunItemStack\(SlimefunItems\.([A-Z0-9_]+)\s*,\s*(\d+)/);
  if (slimefunStack) return { id: toItemId(slimefunStack[1]), qty: Number(slimefunStack[2]) };

  const slimefunItem = entry.match(/SlimefunItems\.([A-Z0-9_]+)/);
  if (slimefunItem) return { id: toItemId(slimefunItem[1]), qty: 1 };

  const material = entry.match(/Material\.([A-Z0-9_]+)/);
  if (material) {
    const quantity = entry.match(/Material\.[A-Z0-9_]+\s*,\s*(\d+)/)?.[1];
    return { id: material[1], qty: quantity ? Number(quantity) : 1 };
  }

  return null;
}

function compactRecipe(recipe) {
  const byId = new Map();
  for (const entry of recipe) byId.set(entry.id, (byId.get(entry.id) ?? 0) + entry.qty);
  return [...byId.entries()].map(([id, qty]) => ({ id, qty }));
}

function collectBaseItems(_recipes, craftableItems) {
  const craftableIds = new Set(craftableItems.map((item) => item.id));
  const baseIds = new Set();
  for (const definition of itemDefinitions.values()) {
    if (!craftableIds.has(definition.id)) baseIds.add(definition.id);
  }
  for (const item of craftableItems) {
    for (const entry of item.recipe ?? []) {
      if (!craftableIds.has(entry.id)) baseIds.add(entry.id);
    }
  }

  return [...baseIds]
    .sort()
    .map((id) => {
      const definition = findDefinitionById(id);
      if (definition) {
        return {
          ...definition,
          category: definition.category === "粘液科技" ? "粘液科技材料" : definition.category,
          recipeType: "基础材料",
          addonName: definition.addonName ?? ADDON_NAME,
          recipe: null
        };
      }

      return {
        id,
        name: vanillaNameMap[id] ?? titleCase(id),
        englishName: titleCase(id),
        addonName: "Minecraft",
        category: "原版材料",
        recipeType: "基础材料",
        icon: id.toLowerCase()
      };
    });
}

function toItemId(fieldName) {
  return itemDefinitions.get(fieldName)?.id ?? fieldName;
}

function findDefinitionById(id) {
  return [...itemDefinitions.values()].find((item) => item.id === id);
}

function mergeItems(definitions, recipes) {
  const byId = new Map();

  for (const [field, item] of definitions.entries()) {
    const registration = recipes.get(field);
    byId.set(item.id, {
      ...item,
      ...(registration ?? {}),
      recipe: registration?.recipe ?? null
    });
  }

  for (const item of manualItems) byId.set(item.id, item);

  return [...byId.values()]
    .filter((item) => item.recipe?.length)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function splitTopLevel(value) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let inString = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const previous = value[index - 1];
    if (char === "\"" && previous !== "\\") inString = !inString;
    if (inString) continue;
    if (char === "(" || char === "{" || char === "[") depth += 1;
    if (char === ")" || char === "}" || char === "]") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  parts.push(value.slice(start).trim());
  return parts;
}

function stripColorCodes(value) {
  return value.replace(/&[0-9A-FK-ORa-fk-or]/g, "").trim();
}

function unquote(value) {
  const trimmed = value?.trim();
  if (!trimmed?.startsWith("\"")) return null;
  return JSON.parse(trimmed.match(/^"[^"]*"/)[0]);
}

function titleCase(id) {
  return id.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function guessIcon(id) {
  if (id.includes("RUNE")) return "enchanted_book";
  if (id.includes("JUICE") || id.includes("CIDER") || id.includes("MILK") || id.includes("CHOCOLATE") || id.includes("EGG_NOG")) return "potion";
  if (id.includes("BANDAGE") || id.includes("RAG") || id.includes("CLOTH")) return "white_wool";
  if (id.includes("PLASTIC")) return "white_stained_glass_pane";
  if (id.includes("PLATE")) return "iron_trapdoor";
  if (id.includes("SCROLL")) return "map";
  if (id.includes("BOOK")) return "book";
  if (id.includes("INGOT")) return "iron_ingot";
  if (id.includes("DUST")) return "gunpowder";
  if (id.includes("HELMET")) return "iron_helmet";
  if (id.includes("CHESTPLATE")) return "iron_chestplate";
  if (id.includes("LEGGINGS")) return "iron_leggings";
  if (id.includes("BOOTS")) return "iron_boots";
  if (id.includes("SWORD")) return "iron_sword";
  if (id.includes("PICKAXE")) return "iron_pickaxe";
  if (id.includes("AXE")) return "iron_axe";
  if (id.includes("SHOVEL")) return "iron_shovel";
  if (id.includes("BOW")) return "bow";
  if (id.includes("MACHINE") || id.includes("GENERATOR")) return "furnace";
  return "paper";
}
