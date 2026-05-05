import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, dirname, extname, join } from "node:path";
import { tmpdir } from "node:os";

const RESOURCE_PACK_PATHS = [
  fileURLToPath(new URL("../Slimefun-ResourcePack.zip", import.meta.url)),
  fileURLToPath(new URL("../【1.21.4粘液材质】Slimefun-Resourcepack.zip", import.meta.url))
].filter((path) => existsSync(path));
const DATA_PATH = new URL("../data/slimefun-items.json", import.meta.url);
const PUBLIC_DIR = fileURLToPath(new URL("../resourcepack", import.meta.url));
const RENDER_ICON_SCRIPT = fileURLToPath(new URL("./render-minecraft-item-icon.py", import.meta.url));

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

  const { publicPath } = await writeResourceIcon(match);

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
    itemDefinitionEntries: entries.filter((entry) => /(^|\/)assets\/minecraft\/items\/.+\.json$/.test(entry)),
    directModelEntries: entries.filter((entry) => /(^|\/)assets\/(?!minecraft\/)([^/]+)\/models\/.+\.json$/.test(entry)),
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

  for (const entry of pack.itemDefinitionEntries) {
    const itemMaterial = entry.match(/assets\/minecraft\/items\/(.+)\.json$/)?.[1];
    const itemJson = parseJsonEntry(pack, entry);
    const dispatchEntries = collectDispatchEntries(itemJson?.model);

    for (const dispatchEntry of dispatchEntries) {
      const modelRef = dispatchEntry.model?.model;
      if (typeof modelRef !== "string" || modelRef.startsWith("item/") || modelRef.startsWith("block/")) continue;

      const modelJson = parseModelRef(pack, modelRef);
      const textureRefs = findModelTextureRefs(modelJson);
      if (textureRefs.length === 0) continue;

      const textureEntries = textureRefs.map((textureRef) => textureRefToZipEntry(textureRef));
      if (!textureEntries.every((textureEntry) => pack.textureEntries.has(textureEntry))) continue;

      models.push({
        pack,
        namespace: modelRef.split(":", 1)[0],
        itemMaterial,
        customModelData: dispatchEntry.threshold,
        modelRef,
        modelKey: normalize(modelRef),
        modelTokens: tokenize(modelRef),
        basename: normalize(modelRef.split("/").at(-1)),
        textureRefs,
        textureEntries
      });
    }
  }

  for (const entry of pack.directModelEntries) {
    const match = entry.match(/assets\/([^/]+)\/models\/(.+)\.json$/);
    if (!match) continue;

    const [, namespace, modelPath] = match;
    const modelRef = `${namespace}:${modelPath}`;
    const modelJson = parseJsonEntry(pack, entry);
    const textureRefs = findModelTextureRefs(modelJson);
    if (textureRefs.length === 0) continue;

    const textureEntries = textureRefs.map((textureRef) => textureRefToZipEntry(textureRef));
    if (!textureEntries.every((textureEntry) => pack.textureEntries.has(textureEntry))) continue;

    models.push({
      pack,
      namespace,
      itemMaterial: modelPath.split("/").at(-1),
      customModelData: null,
      modelRef,
      modelKey: normalize(modelRef),
      modelTokens: tokenize(modelRef),
      basename: normalize(modelPath.split("/").at(-1)),
      textureRefs,
      textureEntries
    });
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

function findModelTextureRefs(modelJson) {
  const textures = modelJson?.textures;
  if (!textures || typeof textures !== "object") return [];
  const resolved = resolveTextureRefs(textures);
  const layerRefs = Object.entries(resolved)
    .filter(([key, value]) => /^layer\d+$/.test(key) && typeof value === "string")
    .sort(([left], [right]) => Number(left.replace("layer", "")) - Number(right.replace("layer", "")))
    .map(([, value]) => value);

  if (layerRefs.length > 0) return layerRefs;

  const fallback = resolved.particle ?? Object.values(resolved).find((value) => typeof value === "string");
  return fallback ? [fallback] : [];
}

function resolveTextureRefs(textures) {
  const resolved = {};
  for (const key of Object.keys(textures)) {
    resolved[key] = resolveTextureRefValue(textures[key], textures);
  }
  return resolved;
}

function resolveTextureRefValue(value, textures, seen = new Set()) {
  if (typeof value !== "string") return null;
  if (!value.startsWith("#")) return value;

  const key = value.slice(1);
  if (seen.has(key)) return null;
  seen.add(key);
  return resolveTextureRefValue(textures[key], textures, seen);
}

function findBestResourceModel(item, models) {
  if (item.addonName === "Minecraft") return null;

  const allowedNamespaces = addonNamespaces(item.addonName);
  if (allowedNamespaces.size === 0) return null;

  const itemId = normalize(localItemId(item.id));
  const itemTokens = significantTokens(tokenize(localItemId(item.id)));
  const reducedTokens = itemTokens.filter((token) => !["programmable", "advanced", "normal"].includes(token));
  let best = null;

  for (const model of models) {
    if (!allowedNamespaces.has(model.namespace)) continue;
    const score = scoreModel(itemId, itemTokens, reducedTokens, model);
    if (score <= 0) continue;
    if (!best || score > best.score || (score === best.score && model.modelRef.length < best.model.modelRef.length)) {
      best = { score, model };
    }
  }

  return best?.score >= 48 ? best.model : null;
}

function addonNamespaces(addonName) {
  if (addonName === "Slimefun") return new Set(["slimefun"]);
  if (addonName === "无尽贪婪") return new Set(["infinityexpansion", "infinityexpansion2"]);
  return new Set();
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

function localItemId(value) {
  return String(value ?? "").split(":").at(-1);
}

async function writeResourceIcon(match) {
  const firstTextureEntry = match.textureEntries[0];
  const basePublicPath = `${match.pack.publicName}/${firstTextureEntry.slice(firstTextureEntry.indexOf("assets/"))}`;
  const hasAnimation = match.textureEntries.some((textureEntry) => match.pack.entrySet.has(`${textureEntry}.mcmeta`));
  const needsRender = hasAnimation || match.textureEntries.length > 1;

  if (!needsRender) {
    const outputPath = join(PUBLIC_DIR, basePublicPath);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, readZipEntry(match.pack, firstTextureEntry));
    return { publicPath: basePublicPath };
  }

  const extension = hasAnimation ? ".gif" : ".png";
  const publicPath = basePublicPath.replace(new RegExp(`${escapeRegExp(extname(basePublicPath))}$`), extension);
  const outputPath = join(PUBLIC_DIR, publicPath);
  const tempDir = await mkdtemp(join(tmpdir(), "slimefun-icon-"));

  try {
    const layerPaths = [];
    for (const [index, textureEntry] of match.textureEntries.entries()) {
      const layerPath = join(tempDir, `layer-${index}.png`);
      await writeFile(layerPath, readZipEntry(match.pack, textureEntry));
      layerPaths.push(layerPath);

      const metaEntry = `${textureEntry}.mcmeta`;
      if (match.pack.entrySet.has(metaEntry)) {
        await writeFile(`${layerPath}.mcmeta`, readZipEntry(match.pack, metaEntry));
      }
    }

    await mkdir(dirname(outputPath), { recursive: true });
    execFileSync("python3", [RENDER_ICON_SCRIPT, outputPath, ...layerPaths], { stdio: "pipe" });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  return { publicPath };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
