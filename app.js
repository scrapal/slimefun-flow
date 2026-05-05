const DATA_URL = "./data/slimefun-items.json";
const HEAD_TEXTURE_BASE = "https://textures.minecraft.net/texture";
const LOCAL_FALLBACK_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'%3E%3Crect width='48' height='48' rx='8' fill='%23e7f2eb'/%3E%3Cpath d='M13 13h18a4 4 0 0 1 4 4v19H17a4 4 0 0 0-4 4V13z' fill='%232f7d59'/%3E%3Cpath d='M17 17h15v16H17a4 4 0 0 0-4 4V17a4 4 0 0 1 4-4z' fill='%23fff8ee'/%3E%3Cpath d='M20 21h8M20 25h9M20 29h6' stroke='%232f7d59' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E";
const CHECKLIST_STORAGE_KEY = "slimefun-flow.checklist.v1";
const EXPORT_MAX_PIXELS = 24_000_000;
const TREE_NODE_LIMIT = 1200;

const state = {
  itemMap: new Map(),
  craftableItems: [],
  allItems: [],
  selectedId: null,
  zoom: 1,
  compact: false,
  deep: true,
  checklist: loadChecklist(),
  collapsed: new Map()
};

const els = {
  searchInput: document.querySelector("#searchInput"),
  searchResults: document.querySelector("#searchResults"),
  graphTitle: document.querySelector("#graphTitle"),
  graphSubTitle: document.querySelector("#graphSubTitle"),
  graphViewport: document.querySelector("#graphViewport"),
  graphCanvas: document.querySelector("#graphCanvas"),
  edgeLayer: document.querySelector("#edgeLayer"),
  nodeLayer: document.querySelector("#nodeLayer"),
  resetChecklistBtn: document.querySelector("#resetChecklistBtn"),
  rightItemInfo: document.querySelector("#rightItemInfo"),
  directRecipe: document.querySelector("#directRecipe"),
  deepToggle: document.querySelector("#deepToggle"),
  compactToggle: document.querySelector("#compactToggle"),
  dataImport: document.querySelector("#dataImport"),
  zoomOutBtn: document.querySelector("#zoomOutBtn"),
  zoomResetBtn: document.querySelector("#zoomResetBtn"),
  zoomInBtn: document.querySelector("#zoomInBtn"),
  fitBtn: document.querySelector("#fitBtn"),
  exportImageBtn: document.querySelector("#exportImageBtn")
};

init();

async function init() {
  try {
    const response = await fetch(DATA_URL);
    const dataset = await response.json();
    loadDataset(dataset);
    bindEvents();
    const defaultItem = state.itemMap.has("SOLAR_GENERATOR") ? "SOLAR_GENERATOR" : state.craftableItems[0]?.id;
    selectItem(defaultItem);
  } catch (error) {
    els.searchResults.innerHTML = `<div class="empty">数据加载失败，请用本地服务器打开页面</div>`;
    els.graphSubTitle.textContent = `数据加载失败：${error.message}`;
  }
}

function loadDataset(dataset) {
  state.itemMap.clear();
  const vanillaItems = dataset.vanillaItems ?? [];
  const craftableItems = dataset.items ?? [];

  for (const item of [...vanillaItems, ...craftableItems]) {
    state.itemMap.set(item.id, {
      addonName: item.addonName ?? "未知附属",
      category: item.category ?? "原版材料",
      recipe: item.recipe ?? null,
      recipeType: item.recipeType ?? "基础材料",
      ...item
    });
  }

  state.craftableItems = craftableItems
    .filter((item) => Array.isArray(item.recipe))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
  state.allItems = [...state.itemMap.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
  renderSearchResults();
}

function bindEvents() {
  els.searchInput.addEventListener("input", renderSearchResults);
  els.deepToggle.addEventListener("change", () => {
    state.deep = els.deepToggle.checked;
    renderSelected();
  });
  els.compactToggle.addEventListener("change", () => {
    state.compact = els.compactToggle.checked;
    renderSelected();
  });
  els.dataImport.addEventListener("change", handleImport);
  els.zoomOutBtn.addEventListener("click", () => setZoom(state.zoom - 0.1));
  els.zoomInBtn.addEventListener("click", () => setZoom(state.zoom + 0.1));
  els.zoomResetBtn.addEventListener("click", () => setZoom(1));
  els.fitBtn.addEventListener("click", fitGraph);
  els.exportImageBtn.addEventListener("click", exportGraphImage);
  els.graphViewport.addEventListener("wheel", handleWheel, { passive: false });
  els.resetChecklistBtn.addEventListener("click", resetCurrentChecklist);
}

function renderSearchResults() {
  const query = normalize(els.searchInput.value);
  const sourceItems = query ? state.allItems : state.craftableItems;
  const results = sourceItems
    .filter((item) => matchesQuery(item, query))
    .sort((a, b) => searchResultScore(b) - searchResultScore(a) || a.name.localeCompare(b.name, "zh-Hans-CN"))
    .slice(0, 60);

  if (results.length === 0) {
    els.searchResults.innerHTML = `<div class="empty">没有匹配的物品</div>`;
    return;
  }

  els.searchResults.innerHTML = results
    .map((item) => `
      <button class="result-item ${item.id === state.selectedId ? "active" : ""}" data-id="${item.id}">
        ${iconHtml(item, "item-icon")}
        <span>
          <span class="item-name">${escapeHtml(item.name)}</span>
          <span class="item-id">${escapeHtml(item.englishName ?? item.id)}</span>
        </span>
        <span class="tag-stack">
          <span class="type-pill">${escapeHtml(item.addonName ?? "未知附属")}</span>
          <span class="qty-pill">${escapeHtml(item.category)}</span>
        </span>
      </button>
    `)
    .join("");

  els.searchResults.querySelectorAll(".result-item").forEach((button) => {
    button.addEventListener("click", () => selectItem(button.dataset.id));
  });
}

function matchesQuery(item, query) {
  if (!query) return true;
  return [item.name, item.englishName, item.id, item.category, item.addonName]
    .filter(Boolean)
    .some((value) => normalize(value).includes(query));
}

function searchResultScore(item) {
  let score = iconQualityScore(item) * 100;
  if (item.id === state.selectedId) score += 10;
  if (Array.isArray(item.recipe)) score += 4;
  if (item.addonName === "Minecraft") score += 2;
  return score;
}

function iconQualityScore(item) {
  if (item.resourcePackIcon) return 6;
  if (item.blockIcon || item.headBlockIcon) return 5;
  if (item.addonName === "Minecraft" && item.localIcon) return 4;
  if (item.localIcon && !isDefaultIconPath(item.localIcon)) return 3;
  if (item.headTexture) return 2;
  if (item.icon && item.icon !== "knowledge_book" && item.icon !== "barrier") return 1;
  return 0;
}

function isDefaultIconPath(path) {
  return String(path ?? "").includes("/knowledge_book.png") || String(path ?? "").includes("/barrier.png");
}

function selectItem(id) {
  if (!id || !state.itemMap.has(id)) return;
  state.selectedId = id;
  if (!state.collapsed.has(id)) state.collapsed.set(id, new Set());
  renderSearchResults();
  renderSelected();
}

function renderSelected() {
  const item = state.itemMap.get(state.selectedId);
  if (!item) return;

  const treeOptions = { maxNodes: TREE_NODE_LIMIT };
  const tree = buildTree(item.id, 1, 0, [], item.id, treeOptions);
  const checklistOptions = { forceDeep: true, ignoreCollapsed: true, maxNodes: TREE_NODE_LIMIT };
  const checklistTree = buildTree(item.id, 1, 0, [], item.id, checklistOptions);
  const layout = layoutTree(tree);
  const checklist = currentChecklist();
  const checklistCount = countNodes(checklistTree);
  const visibleCount = countNodes(tree);
  const limitedLabel = treeOptions.nodeBudget?.truncated
    ? ` · 材料树过大，已先显示 ${visibleCount} 个节点`
    : "";

  els.graphTitle.textContent = item.name;
  els.graphSubTitle.textContent = `${item.recipeType} · ${visibleCount} 个图中节点 · ${checklist.size}/${checklistCount} 项已勾选${limitedLabel}`;
  els.resetChecklistBtn.disabled = checklist.size === 0;
  els.exportImageBtn.disabled = false;
  renderRightItemInfo(item);
  renderGraph(layout);
  renderDirectRecipe(item);
}

function buildTree(id, qty, depth, path, key = id, options = {}) {
  if (!options.nodeBudget) {
    options.nodeBudget = {
      remaining: options.maxNodes ?? Infinity,
      truncated: false
    };
  }

  options.nodeBudget.remaining -= 1;
  const item = state.itemMap.get(id) ?? unknownItem(id);
  const hasRecipe = Boolean(item.recipe?.length);
  const isCollapsed = !options.ignoreCollapsed && collapsedForSelected().has(key);
  const shouldExpand = options.forceDeep || state.deep;
  const canExpand = shouldExpand && hasRecipe && !isCollapsed && !path.includes(id) && options.nodeBudget.remaining > 0;
  const output = itemOutput(item);
  const children = [];

  if (canExpand) {
    item.recipe.forEach((entry, index) => {
      if (options.nodeBudget.remaining <= 0) {
        options.nodeBudget.truncated = true;
        return;
      }

      const childItem = state.itemMap.get(entry.id) ?? unknownItem(entry.id);
      const childQty = childRecipeQty(item, childItem, entry, qty, output);
      children.push(buildTree(entry.id, childQty, depth + 1, [...path, id], `${key}.${index}`, options));
    });
  } else if (hasRecipe && !isCollapsed && !path.includes(id) && options.nodeBudget.remaining <= 0) {
    options.nodeBudget.truncated = true;
  }

  return {
    id: `${id}-${depth}-${path.join(".")}-${Math.random().toString(36).slice(2, 7)}`,
    key,
    itemId: id,
    item,
    qty,
    depth,
    hasRecipe,
    isCollapsed,
    isBase: children.length === 0,
    children
  };
}

function childRecipeQty(parentItem, childItem, entry, parentQty, parentOutput) {
  if (isSourceMachineEntry(parentItem, childItem)) return entry.qty;
  return (entry.qty * parentQty) / parentOutput;
}

function isSourceMachineEntry(parentItem, childItem) {
  if (parentItem.recipeType !== "特殊获取") return false;
  if (childItem.addonName === "Minecraft") return false;
  if (!childItem.recipe?.length) return false;
  return isLikelyMachineSource(childItem);
}

function isLikelyMachineSource(item) {
  const category = String(item.category ?? "");
  const key = normalizeKeyForInfo(`${item.id ?? ""} ${item.englishName ?? ""}`);
  const name = String(item.name ?? "");
  return (
    category.includes("机器") ||
    matchesAny(key, ["MACHINE", "GENERATOR", "CONSTRUCTOR", "COMBINATOR", "MINER", "FIXER", "CHANGER", "COPIER", "MAGNETIZE"]) ||
    /机|器|矿机|生成器|构造器|集成器|计算器|递增器|电容|收集器/.test(name)
  );
}

function layoutTree(root) {
  const nodeWidth = state.compact ? 188 : 220;
  const nodeHeight = state.compact ? 66 : 78;
  const horizontalGap = state.compact ? 235 : 282;
  const verticalGap = state.compact ? 82 : 112;
  let leafIndex = 0;
  const nodes = [];
  const edges = [];

  function walk(node) {
    for (const child of node.children) {
      walk(child);
      edges.push([node, child]);
    }

    if (node.children.length === 0) {
      node.y = leafIndex * verticalGap + 32;
      leafIndex += 1;
    } else {
      node.y = (node.children[0].y + node.children[node.children.length - 1].y) / 2;
    }

    node.x = node.depth * horizontalGap + 32;
    node.width = nodeWidth;
    node.height = nodeHeight;
    nodes.push(node);
  }

  walk(root);
  const maxX = Math.max(...nodes.map((node) => node.x + node.width)) + 80;
  const maxY = Math.max(...nodes.map((node) => node.y + node.height)) + 80;
  return { nodes, edges, width: maxX, height: maxY, nodeWidth, nodeHeight };
}

function renderGraph(layout) {
  const checklist = currentChecklist();
  els.graphCanvas.style.width = `${layout.width}px`;
  els.graphCanvas.style.height = `${layout.height}px`;
  els.edgeLayer.setAttribute("width", layout.width);
  els.edgeLayer.setAttribute("height", layout.height);
  els.edgeLayer.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);

  els.edgeLayer.innerHTML = layout.edges
    .map(([parent, child]) => edgePath(parent, child, parent.depth === 0))
    .join("");

  els.nodeLayer.innerHTML = layout.nodes
    .map((node) => {
      const rootClass = node.depth === 0 ? "root" : "";
      const baseClass = node.isBase ? "base" : "";
      const expandableClass = node.hasRecipe && state.deep ? "expandable" : "";
      const collapsedClass = node.isCollapsed ? "collapsed" : "";
      const doneClass = checklist.has(node.key) ? "done" : "";
      const title = node.hasRecipe && state.deep
        ? `${node.item.name} ×${formatQty(node.qty)}，点击${node.isCollapsed ? "展开" : "收起"}材料，Shift+左键进入该材料`
        : `${node.item.name} ×${formatQty(node.qty)}，Shift+左键进入该材料`;
      return `
        <div class="graph-node ${rootClass} ${baseClass} ${expandableClass} ${collapsedClass} ${doneClass}" style="left:${node.x}px;top:${node.y}px;width:${node.width}px;min-height:${node.height}px" data-id="${escapeHtml(node.itemId)}" data-key="${escapeHtml(node.key)}" title="${escapeHtml(title)}">
          <input class="node-check" type="checkbox" data-key="${escapeHtml(node.key)}" title="勾选这个材料和它的衍生材料" ${checklist.has(node.key) ? "checked" : ""} />
          ${iconHtml(node.item, "node-icon")}
          <span>
            <span class="node-title">${escapeHtml(node.item.name)}</span>
            <span class="node-meta">×${formatQty(node.qty)} · ${escapeHtml(node.item.addonName ?? "未知附属")} · ${escapeHtml(node.item.recipeType)}${node.hasRecipe && state.deep ? ` · ${node.isCollapsed ? "可展开" : "可收起"}` : ""}</span>
          </span>
        </div>
      `;
    })
    .join("");

  els.nodeLayer.querySelectorAll(".graph-node").forEach((node) => {
    node.addEventListener("click", (event) => {
      if (event.target.closest(".node-check")) return;
      if (event.shiftKey && event.button === 0) {
        selectItem(node.dataset.id);
        return;
      }
      toggleNodeCollapse(node.dataset.key, node.dataset.id);
    });
  });

  els.nodeLayer.querySelectorAll(".node-check").forEach((checkbox) => {
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", () => toggleChecklistItem(checkbox.dataset.key, checkbox.checked));
  });

  setZoom(state.zoom);
}

function edgePath(parent, child, primary) {
  const startX = parent.x + parent.width;
  const startY = parent.y + parent.height / 2;
  const endX = child.x;
  const endY = child.y + child.height / 2;
  const midX = startX + (endX - startX) * 0.48;
  return `<path class="edge-path ${primary ? "primary" : ""}" d="M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}" />`;
}

function renderRightItemInfo(item) {
  const rows = itemInfoRows(item);
  const tags = itemInfoTags(item);

  els.rightItemInfo.innerHTML = `
    <div class="info-hero">
      ${iconHtml(item, "info-icon")}
      <div>
        <div class="item-name">${escapeHtml(item.name)}</div>
        <div class="item-id">${escapeHtml(item.englishName ?? item.id)}</div>
        <div class="info-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
      </div>
    </div>
    <div class="info-grid">
      ${rows
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([label, value]) => `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`)
        .join("")}
    </div>
  `;
}

function itemInfoRows(item) {
  const output = itemOutput(item);
  const toolStats = inferToolStats(item);
  const armorStats = inferArmorStats(item);
  const mining = inferBestMiningTool(item);

  const rows = [
    ["物品 ID", item.id],
    ["附属", item.addonName ?? "未知附属"],
    ["分类", item.category ?? "未知"],
    ["合成方式", item.recipeType ?? "基础材料"],
    ["每次产出", `×${formatQty(output)}`],
    ["最佳挖掘工具", mining],
    ["物品类型", inferItemType(item)],
    ["图标材质", item.icon],
    ["资源包模型", item.resourcePackModel],
    ["CustomModelData", item.resourcePackCustomModelData],
    ["配方来源", recipeAliasLabel(item)],
    ["研究 ID", item.research],
    ["研究消耗", item.researchCost],
    ["排序 ID", item.sortid],
  ];

  if (toolStats) {
    rows.push(
      ["工具类型", toolStats.type],
      ["工具材质", toolStats.material],
      ["耐久", toolStats.durability],
      ["攻击伤害", toolStats.damage],
      ["攻击速度", toolStats.attackSpeed],
      ["挖掘速度", toolStats.miningSpeed],
      ["挖掘等级", toolStats.tier],
      ["可附魔性", toolStats.enchantability],
    );
  }

  if (armorStats) {
    rows.push(
      ["护甲类型", armorStats.type],
      ["护甲材质", armorStats.material],
      ["耐久", armorStats.durability],
      ["护甲值", armorStats.defense],
      ["盔甲韧性", armorStats.toughness],
      ["击退抗性", armorStats.knockbackResistance],
      ["可附魔性", armorStats.enchantability],
    );
  }

  return rows;
}

function recipeAliasLabel(item) {
  if (!item.recipeAliasOf) return null;
  return `${item.recipeAliasAddon ?? "未知附属"} · ${item.recipeAliasOf}`;
}

function itemInfoTags(item) {
  const tags = [item.addonName ?? "未知附属", item.recipeType ?? "基础材料"];
  if (inferToolStats(item)) tags.push("工具/武器");
  if (inferArmorStats(item)) tags.push("护甲");
  if (isLikelyBlock(item)) tags.push("方块");
  return [...new Set(tags)];
}

function renderDirectRecipe(item) {
  if (!item.recipe?.length) {
    els.directRecipe.classList.remove("recipe-slots");
    els.directRecipe.innerHTML = `<div class="empty">基础材料没有配方</div>`;
    return;
  }

  const slots = Array.isArray(item.recipeSlots) && item.recipeSlots.length === 9 ? item.recipeSlots : null;
  els.directRecipe.classList.toggle("recipe-slots", Boolean(slots));

  if (slots) {
    els.directRecipe.innerHTML = slots
      .map((slot) => {
        if (!slot) {
          return `<div class="recipe-slot empty-slot" aria-hidden="true"></div>`;
        }

        const recipeItem = state.itemMap.get(slot.id) ?? unknownItem(slot.id);
        const tooltip = `${recipeItem.name} ×${formatQty(slot.qty)}`;
        return `
          <button class="recipe-slot" data-id="${escapeHtml(slot.id)}" data-tooltip="${escapeHtml(tooltip)}" type="button" title="${escapeHtml(tooltip)}">
            ${iconHtml(recipeItem, "item-icon")}
            <span class="slot-qty">×${formatQty(slot.qty)}</span>
          </button>
        `;
      })
      .join("");
  } else {
    els.directRecipe.innerHTML = item.recipe
      .map((entry) => {
        const recipeItem = state.itemMap.get(entry.id) ?? unknownItem(entry.id);
        const tooltip = `${recipeItem.name} ×${formatQty(entry.qty)}`;
        return `
          <button class="recipe-cell" data-id="${escapeHtml(entry.id)}" data-tooltip="${escapeHtml(tooltip)}" type="button" title="${escapeHtml(tooltip)}">
            ${iconHtml(recipeItem, "item-icon")}
            <span>
              <span class="item-name">${escapeHtml(recipeItem.name)}</span>
              <span class="item-id">${escapeHtml(recipeItem.addonName ?? "未知附属")} · ${escapeHtml(recipeItem.englishName ?? recipeItem.id)}</span>
            </span>
            <span class="qty-pill">×${formatQty(entry.qty)}</span>
          </button>
        `;
      })
      .join("");
  }

  els.directRecipe.querySelectorAll("[data-id]").forEach((cell) => {
    cell.addEventListener("click", () => {
      if (state.itemMap.has(cell.dataset.id)) selectItem(cell.dataset.id);
    });
  });
}

function countNodes(node) {
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
}

function setZoom(value) {
  state.zoom = Math.min(1.6, Math.max(0.45, Number(value.toFixed(2))));
  els.graphCanvas.style.transform = `scale(${state.zoom})`;
  els.zoomResetBtn.textContent = `${Math.round(state.zoom * 100)}%`;
}

function fitGraph() {
  const viewportWidth = els.graphViewport.clientWidth - 34;
  const viewportHeight = els.graphViewport.clientHeight - 34;
  const canvasWidth = els.graphCanvas.offsetWidth;
  const canvasHeight = els.graphCanvas.offsetHeight;
  const nextZoom = Math.min(viewportWidth / canvasWidth, viewportHeight / canvasHeight, 1);
  setZoom(nextZoom);
  els.graphViewport.scrollTo({ left: 0, top: 0, behavior: "smooth" });
}

function handleWheel(event) {
  if (!event.metaKey && !event.ctrlKey) return;
  event.preventDefault();
  setZoom(state.zoom + (event.deltaY > 0 ? -0.08 : 0.08));
}

async function exportGraphImage() {
  const item = state.itemMap.get(state.selectedId);
  if (!item) return;

  const originalLabel = els.exportImageBtn.textContent;
  els.exportImageBtn.disabled = true;
  els.exportImageBtn.textContent = "导出中…";

  try {
    const tree = buildTree(item.id, 1, 0, []);
    const layout = layoutTree(tree);
    const blob = await renderGraphToPngBlob(item, layout);
    const link = document.createElement("a");
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = `${safeFilename(item.name || item.id)}-材料树.png`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch (error) {
    alert(`导出失败：${error.message}`);
  } finally {
    els.exportImageBtn.disabled = false;
    els.exportImageBtn.textContent = originalLabel;
  }
}

async function renderGraphToPngBlob(item, layout) {
  const titleHeight = 82;
  const margin = 26;
  const width = Math.ceil(layout.width + margin * 2);
  const height = Math.ceil(layout.height + titleHeight + margin * 2);
  const scale = Math.min(2, Math.sqrt(EXPORT_MAX_PIXELS / (width * height)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(width * scale));
  canvas.height = Math.max(1, Math.floor(height * scale));

  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#fbfcfa";
  ctx.fillRect(0, 0, width, height);
  drawExportGrid(ctx, width, height);

  ctx.fillStyle = "rgba(245, 247, 242, 0.92)";
  ctx.fillRect(0, 0, width, titleHeight);
  ctx.fillStyle = "#121d18";
  ctx.font = "700 24px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText(item.name, margin, 36);
  ctx.fillStyle = "#5f7169";
  ctx.font = "15px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText(`${item.recipeType} · ${layout.nodes.length} 个图中节点 · 粘液科技配方图`, margin, 61);

  ctx.save();
  ctx.translate(margin, titleHeight + margin);

  layout.edges.forEach(([parent, child]) => {
    drawExportEdge(ctx, parent, child, parent.depth === 0);
  });

  const images = await preloadLayoutImages(layout);
  const checklist = currentChecklist();
  layout.nodes
    .sort((a, b) => a.depth - b.depth)
    .forEach((node) => drawExportNode(ctx, node, images.get(node.key), checklist.has(node.key)));

  ctx.restore();

  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("浏览器没有生成图片"));
    }, "image/png");
  });
}

function drawExportGrid(ctx, width, height) {
  ctx.save();
  ctx.strokeStyle = "#d5dfd9";
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawExportEdge(ctx, parent, child, primary) {
  const startX = parent.x + parent.width;
  const startY = parent.y + parent.height / 2;
  const endX = child.x;
  const endY = child.y + child.height / 2;
  const midX = startX + (endX - startX) * 0.48;

  ctx.save();
  ctx.strokeStyle = primary ? "#2f7d59" : "#7b8f84";
  ctx.lineWidth = primary ? 3 : 2.5;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.bezierCurveTo(midX, startY, midX, endY, endX, endY);
  ctx.stroke();
  ctx.restore();
}

function drawExportNode(ctx, node, iconImage, done) {
  const x = node.x;
  const y = node.y;
  const radius = 8;
  const borderColor = node.depth === 0 ? "#c06a32" : node.isBase ? "#347b9f" : "#2f7d59";
  const fill = done ? "#f4f7f5" : node.depth === 0 ? "#fff9f2" : "rgba(255,255,255,0.97)";

  ctx.save();
  ctx.globalAlpha = done ? 0.72 : 1;
  ctx.shadowColor = "rgba(28, 42, 35, 0.12)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 9;
  drawRoundedRect(ctx, x, y, node.width, node.height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "#cbd7cf";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = borderColor;
  roundedRectPath(ctx, x, y, 6, node.height, 6);
  ctx.fill();

  drawExportCheckbox(ctx, x + 24, y + node.height / 2, done);

  if (iconImage) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(iconImage, x + 58, y + (node.height - 42) / 2, 42, 42);
  } else {
    drawExportPlaceholderIcon(ctx, x + 58, y + (node.height - 42) / 2);
  }

  const textX = x + 112;
  const textWidth = node.width - 124;
  ctx.fillStyle = "#121d18";
  ctx.font = "700 16px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  drawEllipsizedText(ctx, node.item.name, textX, y + 29, textWidth);
  if (done) {
    ctx.strokeStyle = "#5f7169";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(textX, y + 24);
    ctx.lineTo(textX + Math.min(textWidth, ctx.measureText(node.item.name).width), y + 24);
    ctx.stroke();
  }

  ctx.fillStyle = "#5f7169";
  ctx.font = "13px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const meta = `×${formatQty(node.qty)} · ${node.item.addonName ?? "未知附属"} · ${node.item.recipeType}${node.hasRecipe && state.deep ? ` · ${node.isCollapsed ? "可展开" : "可收起"}` : ""}`;
  drawWrappedText(ctx, meta, textX, y + 53, textWidth, 17, 2);

  if (node.hasRecipe && state.deep) {
    ctx.fillStyle = "#e7f2eb";
    ctx.beginPath();
    ctx.arc(x + node.width - 16, y + 16, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2f7d59";
    ctx.font = "700 14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(node.isCollapsed ? "+" : "−", x + node.width - 16, y + 15);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  ctx.restore();
}

function drawExportCheckbox(ctx, centerX, centerY, checked) {
  ctx.save();
  ctx.strokeStyle = checked ? "#2f7d59" : "#7b8f84";
  ctx.fillStyle = checked ? "#2f7d59" : "#ffffff";
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, centerX - 9, centerY - 9, 18, 18, 3);
  ctx.fill();
  ctx.stroke();
  if (checked) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(centerX - 5, centerY);
    ctx.lineTo(centerX - 1, centerY + 5);
    ctx.lineTo(centerX + 7, centerY - 6);
    ctx.stroke();
  }
  ctx.restore();
}

function drawExportPlaceholderIcon(ctx, x, y) {
  ctx.save();
  drawRoundedRect(ctx, x, y, 42, 42, 8);
  ctx.fillStyle = "#e7f2eb";
  ctx.fill();
  ctx.fillStyle = "#2f7d59";
  ctx.fillRect(x + 12, y + 10, 17, 23);
  ctx.fillStyle = "#fff8ee";
  ctx.fillRect(x + 16, y + 14, 13, 15);
  ctx.restore();
}

async function preloadLayoutImages(layout) {
  const entries = await Promise.all(
    layout.nodes.map(async (node) => [node.key, await loadExportImage(exportIconSrc(node.item))])
  );
  return new Map(entries);
}

function exportIconSrc(item) {
  if (item.addonName === "Minecraft" && item.localIcon) return item.localIcon;
  return item.headBlockIcon ?? item.blockIcon ?? item.resourcePackIcon ?? item.localIcon ?? null;
}

async function loadExportImage(src) {
  if (!src) return null;

  return await new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  roundedRectPath(ctx, x, y, width, height, radius);
  return ctx;
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, r);
    return;
  }

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function drawEllipsizedText(ctx, text, x, y, maxWidth) {
  const value = String(text ?? "");
  if (ctx.measureText(value).width <= maxWidth) {
    ctx.fillText(value, x, y);
    return;
  }

  let output = value;
  while (output.length > 1 && ctx.measureText(`${output}…`).width > maxWidth) {
    output = output.slice(0, -1);
  }
  ctx.fillText(`${output}…`, x, y);
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const source = String(text ?? "");
  const chars = source.split("");
  let line = "";
  let lines = [];

  for (const char of chars) {
    const nextLine = `${line}${char}`;
    if (line && ctx.measureText(nextLine).width > maxWidth) {
      lines.push(line);
      line = char;
      if (lines.length >= maxLines) break;
    } else {
      line = nextLine;
    }
  }

  if (line && lines.length < maxLines) lines.push(line);
  lines = lines.slice(0, maxLines);
  if (lines.length === maxLines && source !== lines.join("")) {
    let last = lines.at(-1);
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[lines.length - 1] = `${last}…`;
  }

  lines.forEach((lineText, index) => ctx.fillText(lineText, x, y + index * lineHeight));
}

function safeFilename(value) {
  return String(value ?? "materials")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80) || "materials";
}

async function handleImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const dataset = JSON.parse(await file.text());
    if (!Array.isArray(dataset.items)) throw new Error("items must be an array");
    loadDataset(dataset);
    selectItem(state.craftableItems[0]?.id);
  } catch (error) {
    alert(`导入失败：${error.message}`);
  } finally {
    event.target.value = "";
  }
}

function checklistKey() {
  return state.selectedId ?? "__none__";
}

function currentChecklist() {
  const ids = state.checklist[checklistKey()] ?? [];
  return new Set(ids);
}

function toggleChecklistItem(key, done) {
  if (!key) return;

  const checklist = currentChecklist();
  const keys = checklistBranchKeys(key);
  if (done) {
    keys.forEach((branchKey) => checklist.add(branchKey));
    collapseCheckedNode(key);
  } else {
    keys.forEach((branchKey) => checklist.delete(branchKey));
  }

  state.checklist[checklistKey()] = [...checklist].sort();
  saveChecklist();
  renderSelected();
}

function collapseCheckedNode(key) {
  const root = buildTree(state.selectedId, 1, 0, [], state.selectedId, { forceDeep: true, ignoreCollapsed: true });
  const target = findNodeByKey(root, key);
  if (!target?.hasRecipe) return;

  collapsedForSelected().add(target.key);
}

function checklistBranchKeys(key) {
  const root = buildTree(state.selectedId, 1, 0, [], state.selectedId, { forceDeep: true, ignoreCollapsed: true, maxNodes: TREE_NODE_LIMIT });
  const target = findNodeByKey(root, key);
  if (!target) return [key];

  const keys = [];
  function collect(node) {
    keys.push(node.key);
    node.children.forEach(collect);
  }

  collect(target);
  return keys;
}

function findNodeByKey(node, key) {
  if (node.key === key) return node;
  for (const child of node.children) {
    const found = findNodeByKey(child, key);
    if (found) return found;
  }
  return null;
}

function resetCurrentChecklist() {
  delete state.checklist[checklistKey()];
  saveChecklist();
  renderSelected();
}

function collapsedForSelected() {
  if (!state.selectedId) return new Set();
  if (!state.collapsed.has(state.selectedId)) state.collapsed.set(state.selectedId, new Set());
  return state.collapsed.get(state.selectedId);
}

function toggleNodeCollapse(key, id) {
  const item = state.itemMap.get(id);
  if (!state.deep || !item?.recipe?.length) return;

  const collapsed = collapsedForSelected();
  if (collapsed.has(key)) {
    collapsed.delete(key);
  } else {
    collapsed.add(key);
  }

  renderSelected();
}

function loadChecklist() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHECKLIST_STORAGE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, ids]) => Array.isArray(ids))
        .map(([key, ids]) => [key, ids.filter((id) => typeof id === "string")])
    );
  } catch {
    return {};
  }
}

function saveChecklist() {
  localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(state.checklist));
}

function iconUrl(item) {
  if (item.localIcon) return item.localIcon;
  const icon = (item.icon ?? item.id ?? "knowledge_book").toLowerCase();
  return `./textures/item/${icon}.png`;
}

function iconHtml(item, className) {
  if (item.addonName === "Minecraft" && item.localIcon) {
    return imageHtml(item.localIcon, className);
  }

  if (item.headBlockIcon) {
    return imageHtml(item.headBlockIcon, className);
  }

  if (item.blockIcon) {
    return imageHtml(item.blockIcon, className);
  }

  if (item.resourcePackIcon) {
    return imageHtml(item.resourcePackIcon, className);
  }

  if (item.headTexture) {
    const textureUrl = `${HEAD_TEXTURE_BASE}/${encodeURIComponent(item.headTexture)}`;
    return `<span class="${className} head-icon" style="--head-url: url('${textureUrl}')" aria-hidden="true"></span>`;
  }

  if (item.localIcon) {
    return imageHtml(item.localIcon, className);
  }

  return placeholderIconHtml(item, className);
}

function imageHtml(src, className) {
  return `<img class="${className}" src="${escapeHtml(src)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${LOCAL_FALLBACK_ICON}'" />`;
}

function placeholderIconHtml(item, className) {
  const initial = String(item.name ?? item.id ?? "?").trim().slice(0, 1) || "?";
  return `<span class="${className} placeholder-icon" aria-hidden="true">${escapeHtml(initial)}</span>`;
}

function unknownItem(id) {
  return {
    id,
    name: id,
    englishName: id,
    category: "未知材料",
    addonName: "未知附属",
    recipeType: "基础材料",
    icon: "knowledge_book",
    localIcon: LOCAL_FALLBACK_ICON,
    recipe: null
  };
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatQty(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function itemOutput(item) {
  const output = Number(item.output ?? 1);
  return Number.isFinite(output) && output > 0 ? output : 1;
}

function inferItemType(item) {
  if (inferToolStats(item)) return "工具/武器";
  if (inferArmorStats(item)) return "护甲";
  if (isLikelyBlock(item)) return "方块";
  if (item.addonName !== "Minecraft" && item.recipe?.length) return "插件材料/组件";
  return "普通物品";
}

function inferBestMiningTool(item) {
  const itemKey = item.id ?? "";
  if (inferToolStats(item) || inferArmorStats(item)) return "不适用（工具/装备）";
  if (!isLikelyBlock(item)) return "不适用（非方块物品）";

  if (matchesAny(itemKey, ["WOOL", "CARPET", "COBWEB", "VINE"])) return "剪刀";
  if (matchesAny(itemKey, ["LEAVES"])) return "剪刀 / 锄";
  if (matchesAny(itemKey, ["DIRT", "GRASS_BLOCK", "SAND", "GRAVEL", "CLAY", "SNOW", "MUD", "SOUL_SAND", "SOUL_SOIL", "PATH"])) return "锹";
  if (matchesAny(itemKey, ["LOG", "WOOD", "PLANKS", "STEM", "HYPHAE", "CHEST", "BARREL", "BOOKSHELF", "CRAFTING_TABLE", "FENCE", "DOOR", "TRAPDOOR", "SIGN", "BAMBOO"])) return "斧";
  if (matchesAny(itemKey, ["HAY_BLOCK", "WART_BLOCK", "SCULK", "SPONGE", "MOSS_BLOCK", "TARGET"])) return "锄";
  if (matchesAny(itemKey, ["GLASS", "ICE", "GLOWSTONE", "SEA_LANTERN"])) return "任意工具（破坏可能不掉落，需精准采集时例外）";
  if (item.addonName !== "Minecraft" && (item.blockIcon || matchesAny(itemKey, ["MACHINE", "GENERATOR", "CAPACITOR", "FURNACE", "PRESS", "CHAMBER", "TABLE"]))) return "镐";
  return "镐";
}

function inferToolStats(item) {
  const parsedTool = parseTool(item);
  if (!parsedTool) return null;

  if (parsedTool.special) {
    const specialStats = SPECIAL_TOOL_STATS[parsedTool.special];
    return {
      type: specialStats.type,
      material: specialStats.material,
      durability: specialStats.durability,
      damage: specialStats.damage,
      attackSpeed: specialStats.attackSpeed,
      miningSpeed: specialStats.miningSpeed,
      tier: specialStats.tier,
      enchantability: specialStats.enchantability,
    };
  }

  const materialStats = TOOL_MATERIAL_STATS[parsedTool.materialKey];
  const typeStats = TOOL_TYPE_STATS[parsedTool.typeKey] ?? {};
  return {
    type: parsedTool.typeName,
    material: materialStats.name,
    durability: infoValue(materialStats.durability),
    damage: infoValue(typeStats.damage?.[parsedTool.materialKey]),
    attackSpeed: infoValue(typeStats.attackSpeed?.[parsedTool.materialKey] ?? typeStats.attackSpeed),
    miningSpeed: infoValue(typeStats.usesMiningSpeed ? materialStats.miningSpeed : undefined),
    tier: infoValue(materialStats.tier),
    enchantability: infoValue(materialStats.enchantability),
  };
}

function inferArmorStats(item) {
  const parsedArmor = parseArmor(item);
  if (!parsedArmor) return null;

  const materialStats = ARMOR_MATERIAL_STATS[parsedArmor.materialKey];
  const typeStats = ARMOR_TYPE_STATS[parsedArmor.typeKey];
  return {
    type: typeStats.name,
    material: materialStats.name,
    durability: infoValue(materialStats.durability[typeStats.slot]),
    defense: infoValue(materialStats.defense[typeStats.slot]),
    toughness: infoValue(materialStats.toughness),
    knockbackResistance: infoValue(materialStats.knockbackResistance),
    enchantability: infoValue(materialStats.enchantability),
  };
}

function parseTool(item) {
  const candidates = itemCandidates(item);
  for (const specialKey of Object.keys(SPECIAL_TOOL_STATS)) {
    if (candidates.some((candidate) => candidate === specialKey)) return { special: specialKey };
  }

  const typeEntry = Object.entries(TOOL_TYPE_NAMES).find(([typeKey]) => candidates.some((candidate) => candidate.endsWith(`_${typeKey}`) || candidate.includes(typeKey)));
  if (!typeEntry) return null;

  const [typeKey, typeName] = typeEntry;
  const exactCandidate = candidates.find((candidate) => candidate.endsWith(`_${typeKey}`));
  const materialKey = Object.keys(TOOL_MATERIAL_STATS).find((key) => candidates.some((candidate) => candidate.startsWith(`${key}_`) && candidate.endsWith(`_${typeKey}`)));
  const fallbackMaterialKey = Object.keys(TOOL_MATERIAL_STATS).find((key) => candidates.some((candidate) => candidate.startsWith(`${key}_`)));
  const finalMaterialKey = materialKey ?? fallbackMaterialKey;
  if (!finalMaterialKey) return null;

  return {
    typeKey,
    typeName,
    materialKey: finalMaterialKey,
    inferred: item.addonName !== "Minecraft" || exactCandidate !== item.id,
  };
}

function parseArmor(item) {
  const candidates = itemCandidates(item);
  if (candidates.includes("ELYTRA")) {
    return { typeKey: "ELYTRA", materialKey: "ELYTRA", inferred: item.addonName !== "Minecraft" };
  }
  if (candidates.includes("TURTLE_HELMET")) {
    return { typeKey: "HELMET", materialKey: "TURTLE", inferred: item.addonName !== "Minecraft" };
  }

  const typeEntry = Object.entries(ARMOR_TYPE_STATS).find(([typeKey]) => candidates.some((candidate) => candidate.endsWith(`_${typeKey}`)));
  if (!typeEntry) return null;

  const [typeKey] = typeEntry;
  const exactCandidate = candidates.find((candidate) => candidate.endsWith(`_${typeKey}`));
  const materialKey = Object.keys(ARMOR_MATERIAL_STATS).find((key) => candidates.some((candidate) => candidate.startsWith(`${key}_`) && candidate.endsWith(`_${typeKey}`)));
  if (!materialKey) return null;

  return {
    typeKey,
    materialKey,
    inferred: item.addonName !== "Minecraft" || exactCandidate !== item.id,
  };
}

function itemCandidates(item) {
  return [item.id, item.icon, item.englishName]
    .filter(Boolean)
    .map((value) => normalizeKeyForInfo(value));
}

function normalizeKeyForInfo(value) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

function isLikelyBlock(item) {
  const itemKey = item.id ?? "";
  return Boolean(
    item.blockIcon ||
    item.localIcon?.includes("/block/") ||
    item.resourcePackModel?.includes("/blocks/") ||
    item.resourcePackModel?.includes("/machines/") ||
    matchesAny(itemKey, BLOCK_HINTS)
  );
}

function matchesAny(value, patterns) {
  return patterns.some((pattern) => String(value ?? "").includes(pattern));
}

function infoValue(value) {
  if (value === undefined || value === null || value === "") return "未知";
  return value;
}

const TOOL_MATERIAL_STATS = {
  WOODEN: { name: "木", durability: 59, miningSpeed: 2, tier: "木级", enchantability: 15 },
  STONE: { name: "石", durability: 131, miningSpeed: 4, tier: "石级", enchantability: 5 },
  IRON: { name: "铁", durability: 250, miningSpeed: 6, tier: "铁级", enchantability: 14 },
  GOLDEN: { name: "金", durability: 32, miningSpeed: 12, tier: "木级", enchantability: 22 },
  DIAMOND: { name: "钻石", durability: 1561, miningSpeed: 8, tier: "钻石级", enchantability: 10 },
  NETHERITE: { name: "下界合金", durability: 2031, miningSpeed: 9, tier: "下界合金级", enchantability: 15 },
};

const TOOL_TYPE_NAMES = {
  PICKAXE: "镐",
  AXE: "斧",
  SHOVEL: "锹",
  HOE: "锄",
  SWORD: "剑",
};

const TOOL_TYPE_STATS = {
  PICKAXE: {
    usesMiningSpeed: true,
    attackSpeed: 1.2,
    damage: { WOODEN: 2, STONE: 3, IRON: 4, GOLDEN: 2, DIAMOND: 5, NETHERITE: 6 },
  },
  AXE: {
    usesMiningSpeed: true,
    attackSpeed: { WOODEN: 0.8, STONE: 0.8, IRON: 0.9, GOLDEN: 1, DIAMOND: 1, NETHERITE: 1 },
    damage: { WOODEN: 7, STONE: 9, IRON: 9, GOLDEN: 7, DIAMOND: 9, NETHERITE: 10 },
  },
  SHOVEL: {
    usesMiningSpeed: true,
    attackSpeed: 1,
    damage: { WOODEN: 2.5, STONE: 3.5, IRON: 4.5, GOLDEN: 2.5, DIAMOND: 5.5, NETHERITE: 6.5 },
  },
  HOE: {
    usesMiningSpeed: true,
    attackSpeed: { WOODEN: 1, STONE: 2, IRON: 3, GOLDEN: 1, DIAMOND: 4, NETHERITE: 4 },
    damage: { WOODEN: 1, STONE: 1, IRON: 1, GOLDEN: 1, DIAMOND: 1, NETHERITE: 1 },
  },
  SWORD: {
    usesMiningSpeed: false,
    attackSpeed: 1.6,
    damage: { WOODEN: 4, STONE: 5, IRON: 6, GOLDEN: 4, DIAMOND: 7, NETHERITE: 8 },
  },
};

const SPECIAL_TOOL_STATS = {
  BOW: { type: "弓", material: "原版", durability: 384, damage: "按拉弓时间变化", attackSpeed: "不适用", miningSpeed: "不适用", tier: "不适用", enchantability: 1 },
  CROSSBOW: { type: "弩", material: "原版", durability: 465, damage: "按弹药变化", attackSpeed: "不适用", miningSpeed: "不适用", tier: "不适用", enchantability: 1 },
  TRIDENT: { type: "三叉戟", material: "原版", durability: 250, damage: "9 近战 / 8 投掷", attackSpeed: 1.1, miningSpeed: "不适用", tier: "不适用", enchantability: 1 },
  MACE: { type: "重锤", material: "原版", durability: 500, damage: "6 + 下落加成", attackSpeed: 0.6, miningSpeed: "不适用", tier: "不适用", enchantability: 15 },
  SHEARS: { type: "剪刀", material: "原版", durability: 238, damage: 1, attackSpeed: "不适用", miningSpeed: "羊毛/藤蔓/树叶专用", tier: "不适用", enchantability: 15 },
  FISHING_ROD: { type: "钓鱼竿", material: "原版", durability: 64, damage: "无", attackSpeed: "不适用", miningSpeed: "不适用", tier: "不适用", enchantability: 1 },
  SHIELD: { type: "盾牌", material: "原版", durability: 336, damage: "无", attackSpeed: "不适用", miningSpeed: "不适用", tier: "不适用", enchantability: 1 },
  FLINT_AND_STEEL: { type: "打火石", material: "原版", durability: 64, damage: "无", attackSpeed: "不适用", miningSpeed: "不适用", tier: "不适用", enchantability: 0 },
};

const ARMOR_TYPE_STATS = {
  HELMET: { name: "头盔", slot: "helmet" },
  CHESTPLATE: { name: "胸甲", slot: "chestplate" },
  LEGGINGS: { name: "护腿", slot: "leggings" },
  BOOTS: { name: "靴子", slot: "boots" },
  ELYTRA: { name: "鞘翅", slot: "elytra" },
};

const ARMOR_MATERIAL_STATS = {
  LEATHER: { name: "皮革", durability: { helmet: 55, chestplate: 80, leggings: 75, boots: 65 }, defense: { helmet: 1, chestplate: 3, leggings: 2, boots: 1 }, toughness: 0, knockbackResistance: 0, enchantability: 15 },
  CHAINMAIL: { name: "锁链", durability: { helmet: 165, chestplate: 240, leggings: 225, boots: 195 }, defense: { helmet: 2, chestplate: 5, leggings: 4, boots: 1 }, toughness: 0, knockbackResistance: 0, enchantability: 12 },
  IRON: { name: "铁", durability: { helmet: 165, chestplate: 240, leggings: 225, boots: 195 }, defense: { helmet: 2, chestplate: 6, leggings: 5, boots: 2 }, toughness: 0, knockbackResistance: 0, enchantability: 9 },
  GOLDEN: { name: "金", durability: { helmet: 77, chestplate: 112, leggings: 105, boots: 91 }, defense: { helmet: 2, chestplate: 5, leggings: 3, boots: 1 }, toughness: 0, knockbackResistance: 0, enchantability: 25 },
  DIAMOND: { name: "钻石", durability: { helmet: 363, chestplate: 528, leggings: 495, boots: 429 }, defense: { helmet: 3, chestplate: 8, leggings: 6, boots: 3 }, toughness: 2, knockbackResistance: 0, enchantability: 10 },
  NETHERITE: { name: "下界合金", durability: { helmet: 407, chestplate: 592, leggings: 555, boots: 481 }, defense: { helmet: 3, chestplate: 8, leggings: 6, boots: 3 }, toughness: 3, knockbackResistance: 0.1, enchantability: 15 },
  TURTLE: { name: "海龟壳", durability: { helmet: 275 }, defense: { helmet: 2 }, toughness: 0, knockbackResistance: 0, enchantability: 9 },
  ELYTRA: { name: "鞘翅", durability: { elytra: 432 }, defense: { elytra: 0 }, toughness: 0, knockbackResistance: 0, enchantability: 1 },
};

const BLOCK_HINTS = [
  "_BLOCK",
  "_ORE",
  "_LOG",
  "_WOOD",
  "_PLANKS",
  "_STONE",
  "_BRICKS",
  "_GLASS",
  "_WOOL",
  "_CONCRETE",
  "_TERRACOTTA",
  "_SLAB",
  "_STAIRS",
  "_WALL",
  "_FENCE",
  "_DOOR",
  "_TRAPDOOR",
  "_PRESSURE_PLATE",
  "_BUTTON",
  "_SIGN",
  "FURNACE",
  "CHEST",
  "TABLE",
  "GENERATOR",
  "MACHINE",
  "CAPACITOR",
  "CHAMBER",
];
