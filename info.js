const INFO_DATA_URL = "./data/slimefun-info.json";

const els = {
  input: document.querySelector("#infoSearchInput"),
  filters: document.querySelector("#infoFilters"),
  results: document.querySelector("#infoResults"),
  meta: document.querySelector("#infoResultMeta")
};

const state = {
  entries: [],
  activeCategory: "全部"
};

init();

async function init() {
  try {
    const response = await fetch(INFO_DATA_URL);
    const data = await response.json();
    state.entries = data.entries ?? [];
    bindEvents();
    renderFilters();

    const query = new URLSearchParams(window.location.search).get("q");
    if (query) els.input.value = query;
    renderResults();
  } catch (error) {
    els.results.innerHTML = `<div class="empty">资料加载失败，请用本地服务器打开页面</div>`;
    els.meta.textContent = `资料加载失败：${error.message}`;
  }
}

function bindEvents() {
  els.input.addEventListener("input", renderResults);
}

function renderFilters() {
  const categories = ["全部", ...new Set(state.entries.map((entry) => entry.category).filter(Boolean))];
  els.filters.innerHTML = categories.map((category) => `
    <button class="${category === state.activeCategory ? "active" : ""}" type="button" data-category="${escapeHtml(category)}">
      ${escapeHtml(category)}
    </button>
  `).join("");

  els.filters.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeCategory = button.dataset.category;
      renderFilters();
      renderResults();
    });
  });
}

function renderResults() {
  const query = normalize(els.input.value);
  const results = state.entries
    .filter((entry) => state.activeCategory === "全部" || entry.category === state.activeCategory)
    .filter((entry) => matches(entry, query))
    .sort((a, b) => scoreEntry(b, query) - scoreEntry(a, query) || a.title.localeCompare(b.title, "zh-Hans-CN"));

  els.meta.textContent = query ? `找到 ${results.length} 条资料` : `共 ${results.length} 条资料`;

  if (!results.length) {
    els.results.innerHTML = `<div class="empty">没有找到匹配资料</div>`;
    return;
  }

  els.results.innerHTML = results.map((entry) => `
    <article class="info-entry" id="${escapeHtml(entry.id)}">
      <div class="info-entry-head">
        <span class="portal-card-kicker">${escapeHtml(entry.category)}</span>
        <h3>${escapeHtml(entry.title)}</h3>
      </div>
      <p>${escapeHtml(entry.summary)}</p>
      <ul>
        ${(entry.details ?? []).map((detail) => `<li>${escapeHtml(detail)}</li>`).join("")}
      </ul>
      ${(entry.related ?? []).length ? `
        <div class="info-related">
          ${(entry.related ?? []).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
        </div>
      ` : ""}
      ${entry.source ? `<div class="info-source">来源：${escapeHtml(entry.source)}</div>` : ""}
    </article>
  `).join("");
}

function matches(entry, query) {
  if (!query) return true;
  return [entry.title, entry.category, entry.summary, ...(entry.aliases ?? []), ...(entry.details ?? []), ...(entry.related ?? [])]
    .some((value) => normalize(value).includes(query));
}

function scoreEntry(entry, query) {
  if (!query) return 0;
  let score = 0;
  const title = normalize(entry.title);
  if (title === query) score += 100;
  if (title.includes(query)) score += 50;
  if ((entry.aliases ?? []).some((alias) => normalize(alias) === query)) score += 45;
  if (normalize(entry.category).includes(query)) score += 15;
  return score;
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
