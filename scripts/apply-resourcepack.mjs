import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";

const RESOURCE_PACK_PATHS = [
  fileURLToPath(new URL("../Slimefun-ResourcePack.zip", import.meta.url)),
  fileURLToPath(new URL("../【1.21.4粘液材质】Slimefun-Resourcepack.zip", import.meta.url))
].filter((path) => existsSync(path));
const DATA_PATH = new URL("../data/slimefun-items.json", import.meta.url);
const PUBLIC_DIR = fileURLToPath(new URL("../resourcepack", import.meta.url));

if (RESOURCE_PACK_PATHS.length === 0) {
  throw new Error("No resource pack zip found.");
}

const resourcePacks = RESOURCE_PACK_PATHS.map(loadResourcePack);
const resourceModels = resourcePacks.flatMap(parseResourceModels);
const data = JSON.parse(await readFile(DATA_PATH, "utf8"));
const allItems = [...data.items, ...data.vanillaItems];

let matched = 0;
let extracted = 0;

await rm(PUBLIC_DIR, { recursive: true, force: true });

for (const item of allItems) {
  delete item.resourcePackIcon;
  delete item.resourcePackModel;
  delete item.resourcePackCustomModelData;
  delete item.resourcePackSource;
  delete item.blockIcon;

  const match = findBestResourceModel(item, resourceModels);
  if (!match) continue;

  const publicPath = `${match.pack.publicName}/${match.textureEntry.slice(match.textureEntry.indexOf("assets/"))}`;
  const outputPath = join(PUBLIC_DIR, publicPath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, readZipEntry(match.pack, match.textureEntry));

  item.resourcePackIcon = `./resourcepack/${publicPath}`;
  item.resourcePackModel = match.modelRef;
  item.resourcePackCustomModelData = match.customModelData;
  item.resourcePackSource = match.pack.fileName;
  matched += 1;
  extracted += 1;
}

data.meta.resourcePack = resourcePacks.map((pack) => pack.fileName).join(" + ");
data.meta.resourcePackMatchedIcons = matched;
await writeFile(DATA_PATH, `${JSON.stringify(data, null, 2)}\n`);

console.log(`Matched ${matched} items and extracted ${extracted} resource-pack textures.`);

function loadResourcePack(path) {
  const entries = listZipEntries(path);
  return {
    path,
    fileName: basename(path),
    publicName: basename(path, ".zip").replace(/[^\w.-]+/g, "_"),
    entries,
    entrySet: new Set(entries),
    modelEntries: entries.filter((entry) => /(^|\/)assets\/minecraft\/items\/.+\.json$/.test(entry)),
    textureEntries: new Set(entries.filter((entry) => /(^|\/)assets\/.+\/textures\/.+\.png$/.test(entry)))
  };
}

function listZipEntries(path) {
  return execFileSync("unzip", ["-Z1", path], { encoding: "utf8" })
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readZipEntry(pack, entry) {
  return execFileSync("unzip", ["-p", pack.path, entry]);
}

function parseResourceModels(pack) {
  const models = [];

  for (const entry of pack.modelEntries) {
    const itemMaterial = entry.match(/assets\/minecraft\/items\/(.+)\.json$/)?.[1];
    const itemJson = parseJsonEntry(pack, entry);
    const dispatchEntries = collectDispatchEntries(itemJson?.model);

    for (const dispatchEntry of dispatchEntries) {
      const modelRef = dispatchEntry.model?.model;
      if (typeof modelRef !== "string" || modelRef.startsWith("item/") || modelRef.startsWith("block/")) continue;

      const modelJson = parseModelRef(pack, modelRef);
      const textureRef = findModelTextureRef(modelJson);
      if (!textureRef) continue;

      const textureEntry = textureRefToZipEntry(textureRef);
      if (!pack.textureEntries.has(textureEntry)) continue;

      models.push({
        pack,
        namespace: modelRef.split(":", 1)[0],
        itemMaterial,
        customModelData: dispatchEntry.threshold,
        modelRef,
        modelKey: normalize(modelRef),
        modelTokens: tokenize(modelRef),
        basename: normalize(modelRef.split("/").at(-1)),
        textureRef,
        textureEntry
      });
    }
  }

  return models;
}

function parseJsonEntry(pack, entry) {
  if (!pack.entrySet.has(entry)) return null;
  try {
    return JSON.parse(readZipEntry(pack, entry).toString("utf8"));
  } catch {
    return null;
  }
}

function parseModelRef(pack, modelRef) {
  const [namespace, path] = modelRef.includes(":") ? modelRef.split(":", 2) : ["minecraft", modelRef];
  const modelEntry = `assets/${namespace}/models/${path}.json`;
  return parseJsonEntry(pack, modelEntry);
}

function collectDispatchEntries(model) {
  if (!model) return [];
  const entries = [];

  if (Array.isArray(model.entries)) entries.push(...model.entries);
  if (Array.isArray(model.cases)) entries.push(...model.cases.flatMap((entry) => entry.model?.entries ?? []));
  if (model.fallback) entries.push(...collectDispatchEntries(model.fallback));

  return entries;
}

function textureRefToZipEntry(textureRef) {
  const [namespace, path] = textureRef.includes(":") ? textureRef.split(":", 2) : ["minecraft", textureRef];
  return `assets/${namespace}/textures/${path}.png`;
}

function findModelTextureRef(modelJson) {
  const textures = modelJson?.textures;
  if (!textures || typeof textures !== "object") return null;
  return textures.layer0 ?? textures.particle ?? Object.values(textures).find((value) => typeof value === "string" && !value.startsWith("#"));
}

function findBestResourceModel(item, models) {
  if (item.addonName === "Minecraft") return null;

  const allowedNamespace = addonNamespace(item.addonName);
  if (!allowedNamespace) return null;

  const itemId = normalize(item.id);
  const itemTokens = significantTokens(tokenize(item.id));
  const reducedTokens = itemTokens.filter((token) => !["programmable", "advanced", "normal"].includes(token));
  let best = null;

  for (const model of models) {
    if (allowedNamespace && model.namespace !== allowedNamespace) continue;
    const score = scoreModel(itemId, itemTokens, reducedTokens, model);
    if (score <= 0) continue;
    if (!best || score > best.score || (score === best.score && model.modelRef.length < best.model.modelRef.length)) {
      best = { score, model };
    }
  }

  return best?.score >= 48 ? best.model : null;
}

function addonNamespace(addonName) {
  if (addonName === "Slimefun") return "slimefun";
  return null;
}

function scoreModel(itemId, itemTokens, reducedTokens, model) {
  if (model.basename === itemId) return 120;
  if (model.modelKey.endsWith(itemId)) return 112;

  const modelTokens = significantTokens(model.modelTokens);
  const modelKey = model.modelKey;
  const tokenSet = new Set(modelTokens);
  const directMatches = itemTokens.filter((token) => tokenSet.has(token) || modelKey.includes(token));
  const reducedMatches = reducedTokens.filter((token) => tokenSet.has(token) || modelKey.includes(token));

  if (itemTokens.length > 0 && directMatches.length === itemTokens.length) return 90 + directMatches.length;
  if (reducedTokens.length >= 2 && reducedMatches.length === reducedTokens.length) return 70 + reducedMatches.length;
  if (itemTokens.length >= 2 && directMatches.length >= Math.ceil(itemTokens.length * 0.75)) return 50 + directMatches.length;

  return 0;
}

function tokenize(value) {
  return String(value)
    .toLowerCase()
    .replace(/([a-z])(\d)/g, "$1_$2")
    .replace(/(\d)([a-z])/g, "$1_$2")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function significantTokens(tokens) {
  return tokens
    .map((token) => token.replace(/s$/, ""))
    .filter((token) => token.length > 1)
    .filter((token) => !["item", "slimefun", "resource", "resources", "miscellaneous", "technical", "component", "components"].includes(token));
}

function normalize(value) {
  return tokenize(value).join("");
}
