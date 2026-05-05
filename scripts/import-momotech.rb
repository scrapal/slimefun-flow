# encoding: UTF-8

require "json"

ROOT = File.expand_path("..", __dir__)
DATA_PATH = File.join(ROOT, "data", "slimefun-items.json")
MOMOTECH_SRC = "/tmp/slimefun-addon-src/MomoTech"

ITEMS_JAVA = File.join(MOMOTECH_SRC, "src/main/java/cn/qy/MomoTech/Items/Items.java")
ITEM_STACKS_JAVA = File.join(MOMOTECH_SRC, "src/main/java/cn/qy/MomoTech/Items/MomotechItem.java")
ITEM_REGISTER_JAVA = File.join(MOMOTECH_SRC, "src/main/java/cn/qy/MomoTech/tasks/ItemRegisterTask.java")
MACHINE_REGISTER_JAVA = File.join(MOMOTECH_SRC, "src/main/java/cn/qy/MomoTech/tasks/MachineRegisterTask.java")

RECIPE_TYPE_LABELS = {
  "NULL" => "特殊获取",
  "ENHANCED_CRAFTING_TABLE" => "增强型工作台",
  "MAGIC_WORKBENCH" => "魔法工作台",
  "ANCIENT_ALTAR" => "古代祭坛",
  "SMELTERY" => "冶炼炉",
  "COMPRESSOR" => "压缩机",
  "rc" => "乱码凝聚者",
  "rc1" => "磁化机",
  "rc2" => "量子充能器"
}.freeze

GROUP_LABELS = {
  "MOMOTECH_ITEM" => "基础物品",
  "MOMOTECH_FINAL" => "终级物品",
  "MOMOTECH_MACHINE" => "基础机器",
  "MOMOTECH_MINERAL" => "压缩材料",
  "MOMOTECH_ORDINARY_MACHINE" => "基础生产型机器",
  "MOMOTECH_THANKING" => "鸣谢/特殊材料",
  "MOMOTECH_TOOL" => "工具",
  "MOMOTECH__" => "说明",
  "MOMOTECH_ELECTRICITY" => "电力拓展",
  "MOMOTECH_INF" => "无限工程-初级",
  "MOMOTECH_INF_MACHINE" => "无限工程-终焉"
}.freeze

DEPENDENCY_ITEMS = [
  {
    "id" => "NETHER_STAR_REACTOR",
    "name" => "下界之星反应堆",
    "englishName" => "Nether Star Reactor",
    "addonName" => "Slimefun",
    "category" => "发电机",
    "recipeType" => "特殊获取",
    "icon" => "nether_star",
    "recipe" => nil,
    "output" => 1,
    "sourceFile" => "MomoTech 依赖补全"
  }
].freeze

VANILLA_DEPENDENCIES = [
  {
    "id" => "NETHERITE_UPGRADE_SMITHING_TEMPLATE",
    "name" => "下界合金升级锻造模板",
    "englishName" => "Netherite Upgrade Smithing Template",
    "addonName" => "Minecraft",
    "category" => "原版材料",
    "recipeType" => "基础材料",
    "icon" => "netherite_upgrade_smithing_template",
    "recipe" => nil
  }
].freeze

MINERAL_KEYS = %w[DIAMOND_BLOCK NETHERITE_BLOCK COAL_BLOCK EMERALD_BLOCK QUARTZ_BLOCK REDSTONE_BLOCK IRON_BLOCK GOLD_BLOCK LAPIS_BLOCK].freeze
MINERAL_IDS = %w[I II III].freeze
MINERAL_ICONS = %w[diamond netherite_ingot coal emerald quartz redstone iron_ingot gold_ingot lapis_lazuli].freeze
MINERAL_NAMES = [
  %w[壹重压缩钻石 贰重压缩钻石 叁重压缩钻石],
  %w[壹重压缩下界合金 贰重压缩下界合金 叁重压缩下界合金],
  %w[壹重压缩煤炭 贰重压缩煤炭 叁重压缩煤炭],
  %w[壹重压缩绿宝石 贰重压缩绿宝石 叁重压缩绿宝石],
  %w[壹重压缩石英 贰重压缩石英 叁重压缩石英],
  %w[壹重压缩红石 贰重压缩红石 叁重压缩红石],
  %w[壹重压缩铁 贰重压缩铁 叁重压缩铁],
  %w[壹重压缩金 贰重压缩金 叁重压缩金],
  %w[壹重压缩青金石 贰重压缩青金石 叁重压缩青金石]
].freeze

def read(path)
  File.read(path, encoding: "UTF-8")
end

def clean_name(value)
  String(value)
    .gsub(/§x(?:§[0-9a-fA-F]){6}/, "")
    .gsub(/&x(?:&[0-9a-fA-F]){6}/, "")
    .gsub(/§#[0-9a-fA-F]{6}/, "")
    .gsub(/[&§][0-9a-fk-orA-FK-OR]/, "")
    .gsub(/\s+/, " ")
    .strip
end

def english_from_id(id)
  id.sub(/^MOMOTECH_/, "")
    .split("_")
    .reject(&:empty?)
    .map { |part| part[0] ? part[0].upcase + part[1..].to_s.downcase : part }
    .join(" ")
end

def normalize_icon(material)
  String(material || "knowledge_book").downcase
end

def split_top_level(text)
  parts = []
  current = +""
  depth = 0
  quote = nil
  escaped = false

  text.each_char do |char|
    if quote
      current << char
      if escaped
        escaped = false
      elsif char == "\\"
        escaped = true
      elsif char == quote
        quote = nil
      end
      next
    end

    case char
    when '"', "'"
      quote = char
      current << char
    when "(", "{", "["
      depth += 1
      current << char
    when ")", "}", "]"
      depth -= 1 if depth.positive?
      current << char
    when ","
      if depth.zero?
        parts << current.strip
        current = +""
      else
        current << char
      end
    else
      current << char
    end
  end

  parts << current.strip unless current.strip.empty?
  parts
end

def balanced_after(text, marker, opener = "(", closer = ")")
  index = text.index(marker)
  return nil unless index

  start = text.index(opener, index)
  return nil unless start

  depth = 0
  quote = nil
  escaped = false

  text[start...text.length].each_char.with_index(start) do |char, pos|
    if quote
      if escaped
        escaped = false
      elsif char == "\\"
        escaped = true
      elsif char == quote
        quote = nil
      end
      next
    end

    if char == '"' || char == "'"
      quote = char
      next
    end

    depth += 1 if char == opener
    depth -= 1 if char == closer
    return text[(start + 1)...pos] if depth.zero?
  end

  nil
end

def extract_display_name(expr)
  body = balanced_after(expr, "new CustomItemStack(")
  return nil unless body

  args = split_top_level(body)
  display = args[1].to_s
  parts = display.scan(/"([^"]*)"/).flatten.reject { |part| part.match?(/\A[0-9a-fA-F]{6,64}\z/) }
  name = clean_name(parts.join(" "))
  name.empty? ? nil : name
end

def parse_item_fields
  fields = {}
  read(ITEMS_JAVA).scan(/public\s+static\s+final\s+ItemStack\s+(\w+)\s*=\s*(.*?);/m) do |field, expr|
    material = expr[/Material\.([A-Z0-9_]+)/, 1]
    head_texture = expr[/SlimefunUtils\.getCustomHead\("([0-9a-f]{32,})"\)/i, 1]
    name = extract_display_name(expr) || clean_name(field)
    fields[field] = {
      "name" => name,
      "englishName" => english_from_id(field),
      "icon" => head_texture ? "player_head" : normalize_icon(material),
      "headTexture" => head_texture
    }.compact
  end

  fields
end

def parse_aliases
  aliases = {}
  item_field_by_alias = {}

  read(ITEM_STACKS_JAVA).scan(/public\s+static\s+final\s+SlimefunItemStack\s+(\w+)\s*=\s*new\s+SlimefunItemStack\("([^"]+)",\s*Items\.(\w+)/m) do |name, id, field|
    aliases[name] = id
    item_field_by_alias[name] = field
  end

  MINERAL_KEYS.each_with_index do |key, i|
    MINERAL_IDS.each_with_index do |suffix, j|
      aliases["mineral[#{i}][#{j}]"] = "MOMOTECH_MINERAL_#{key}_#{suffix}"
    end
  end

  50.times { |i| aliases["cobblestone_[#{i}]"] = "MOMOTECH_COBBLESTONE#{i}" }
  aliases["stone_"] = "COBBLESTONE"

  [aliases, item_field_by_alias]
end

def parse_recipe_token(token, aliases)
  token = token.strip
  return nil if token.empty? || token == "null" || token.include?("new CustomItemStack")

  if (body = balanced_after(token, "new SlimefunItemStack("))
    args = split_top_level(body)
    item = parse_recipe_token(args[0].to_s, aliases)
    item ||= { id: args[0][/"([^"]+)"/, 1], qty: 1 } if args[0].to_s.include?('"')
    return nil unless item && item[:id]

    item[:qty] = args[1].to_i if args[1].to_s.match?(/\A\d+\z/)
    return item
  end

  if token =~ /new\s+ItemStack\(Material\.([A-Z0-9_]+)\s*(?:,\s*(\d+))?/
    return { id: Regexp.last_match(1), qty: (Regexp.last_match(2) || 1).to_i }
  end

  if token =~ /new\s+ItemStack\(Utils\.it\[(\d+)\]\)/
    return { id: MINERAL_ICONS[Regexp.last_match(1).to_i].upcase, qty: 1 }
  end

  if token =~ /SlimefunItems\.([A-Z0-9_]+)/
    return { id: Regexp.last_match(1), qty: 1 }
  end

  if token =~ /MomotechItem\.(\w+)/
    id = aliases[Regexp.last_match(1)]
    return { id: id, qty: 1 } if id
  end

  if token =~ /cobblestone_\[(\d+)\]/
    return { id: "MOMOTECH_COBBLESTONE#{Regexp.last_match(1)}", qty: 1 }
  end

  if token =~ /cobblestone_\[i\s*-\s*1\]/
    return { id: "MOMOTECH_COBBLESTONE_PREVIOUS", qty: 1 }
  end

  if token =~ /mineral\[(\d+)\]\[(\d+)\]/
    return { id: "MOMOTECH_MINERAL_#{MINERAL_KEYS[Regexp.last_match(1).to_i]}_#{MINERAL_IDS[Regexp.last_match(2).to_i]}", qty: 1 }
  end

  if token =~ /"([A-Z0-9_]+)"/
    return { id: Regexp.last_match(1), qty: 1 }
  end

  if (id = aliases[token])
    return { id: id, qty: 1 }
  end

  nil
end

def aggregate(entries)
  totals = Hash.new(0)
  entries.compact.each { |entry| totals[entry[:id]] += entry[:qty].to_i }
  totals.map { |id, qty| { "id" => id, "qty" => qty } }
end

def parse_recipe_body(body, aliases)
  split_top_level(body).map { |token| parse_recipe_token(token, aliases) }
end

def parse_array_recipes(java, aliases)
  recipes = {}
  offset = 0
  pattern = /ItemStack\[\]\s+(\w+)\s*=\s*\{/

  while (match = java.match(pattern, offset))
    name = match[1]
    start = match.end(0) - 1
    body = balanced_after(java[start..], "{", "{", "}")
    slots = parse_recipe_body(body.to_s, aliases)
    recipes[name] = {
      slots: slots,
      recipe: aggregate(slots.compact)
    }
    offset = start + body.to_s.length + 2
  end

  recipes
end

def parse_inline_recipe(expr, aliases)
  body = balanced_after(expr, "new ItemStack[]", "{", "}")
  return nil unless body

  slots = parse_recipe_body(body, aliases)
  { slots: slots, recipe: aggregate(slots.compact) }
end

def label_recipe_type(raw)
  key = String(raw).split(".").last.strip
  RECIPE_TYPE_LABELS[raw] || RECIPE_TYPE_LABELS[key] || key.split("_").map(&:capitalize).join(" ")
end

def label_group(raw)
  key = String(raw)[/Items\.(MOMOTECH_\w+)/, 1] || String(raw).split(".").last
  GROUP_LABELS[key] || "乱码科技"
end

def make_registration(id:, field:, group:, recipe_type:, recipe_data:)
  return nil unless id && !id.empty?

  slots = recipe_data && recipe_data[:slots].length == 9 ? recipe_data[:slots].map { |slot| slot ? { "id" => slot[:id], "qty" => slot[:qty] } : nil } : nil
  recipe = recipe_data && !recipe_data[:recipe].empty? ? recipe_data[:recipe] : nil
  {
    id: id,
    field: field,
    category: label_group(group),
    recipe_type: recipe ? label_recipe_type(recipe_type) : label_recipe_type(recipe_type || "NULL"),
    recipe: recipe,
    recipe_slots: slots
  }
end

def parse_item_registrations(recipes, aliases)
  registrations = []
  java = read(ITEM_REGISTER_JAVA)

  offset = 0
  while (index = java.index("SfUtils.RegisterItem(", offset))
    body = balanced_after(java[index..], "SfUtils.RegisterItem(")
    args = split_top_level(body.to_s)
    offset = index + body.to_s.length + 1
    next if args[0].to_s.include?("+")

    id = args[0].to_s[/"([^"]+)"/, 1]
    next if id.nil?
    next if id.match?(/\AMOMOTECH_COBBLESTONE\d+\z/)

    field = args[1].to_s[/Items\.(\w+)/, 1]
    recipe_data = recipes[args[4].to_s] || parse_inline_recipe(args[4].to_s, aliases) || { slots: [], recipe: [] }
    registrations << make_registration(id: id, field: field, group: args[2], recipe_type: args[3], recipe_data: recipe_data)
  end

  registrations.compact
end

def parse_machine_registrations(recipes, aliases)
  registrations = []
  read(MACHINE_REGISTER_JAVA).each_line do |line|
    next unless line.include?(".register(")

    body = balanced_after(line, "new ")
    next unless body

    args = split_top_level(body)
    id_index = args.index { |arg| arg.match?(/"MOMOTECH_[A-Z0-9_]+"/) }
    next unless id_index

    id = args[id_index][/"([^"]+)"/, 1]
    recipe_type_index = args.index { |arg| arg.include?("RecipeType.") }
    field = args[(id_index + 1)..]&.find { |arg| arg.include?("Items.") }.to_s[/Items\.(\w+)/, 1]
    field ||= args.find { |arg| arg.include?("Items.") }.to_s[/Items\.(\w+)/, 1]
    group = args.find { |arg| arg.include?("Items.MOMOTECH_") }
    recipe_arg = recipe_type_index ? args[recipe_type_index + 1].to_s : args.last.to_s
    recipe_data = recipes[recipe_arg] || parse_inline_recipe(recipe_arg, aliases) || { slots: [], recipe: [] }
    registrations << make_registration(id: id, field: field, group: group, recipe_type: recipe_type_index ? args[recipe_type_index] : "NULL", recipe_data: recipe_data)
  end

  item_java = read(ITEM_REGISTER_JAVA)
  item_java.each_line do |line|
    next unless line.include?(".register(")
    next unless line.include?("new IDDisplay(") || line.include?("new ProtectArmor(")

    body = balanced_after(line, "new ")
    args = split_top_level(body.to_s)
    id = args.find { |arg| arg.match?(/"MOMOTECH_[A-Z0-9_]+"/) }.to_s[/"([^"]+)"/, 1]
    field = args.find { |arg| arg.include?("Items.") }.to_s[/Items\.(\w+)/, 1]
    recipe_name = args.last.to_s.gsub(/\).*/, "").strip
    recipe_data = recipes[recipe_name] || parse_inline_recipe(args.last.to_s, aliases) || { slots: [], recipe: [] }
    registrations << make_registration(id: id, field: field, group: line.include?("ProtectArmor") ? "Items.MOMOTECH_TOOL" : "Items.MOMOTECH_FINAL", recipe_type: "NULL", recipe_data: recipe_data)
  end

  registrations.compact
end

def generated_mineral_items
  items = []
  MINERAL_KEYS.each_with_index do |key, i|
    MINERAL_IDS.each_with_index do |suffix, j|
      input_id = j.zero? ? MINERAL_ICONS[i].upcase : "MOMOTECH_MINERAL_#{key}_#{MINERAL_IDS[j - 1]}"
      slots = Array.new(9) { |slot| slot == 4 ? { "id" => "MOMOTECH_EMPTY_SHELL", "qty" => 1 } : { "id" => input_id, "qty" => 1 } }
      items << {
        "id" => "MOMOTECH_MINERAL_#{key}_#{suffix}",
        "name" => MINERAL_NAMES[i][j],
        "englishName" => english_from_id("MOMOTECH_MINERAL_#{key}_#{suffix}"),
        "addonName" => "乱码科技",
        "category" => "压缩材料",
        "recipeType" => "增强型工作台",
        "icon" => MINERAL_ICONS[i],
        "recipe" => aggregate(slots.map { |slot| { id: slot["id"], qty: slot["qty"] } }),
        "recipeSlots" => slots,
        "output" => 1,
        "sourceFile" => "MomoTech-v1.1.11.jar / QYhB05/MomoTech 源码"
      }
    end
  end
  items
end

def generated_cobblestone_items
  (0...50).map do |i|
    input_id = i.zero? ? "COBBLESTONE" : "MOMOTECH_COBBLESTONE#{i - 1}"
    slots = Array.new(9) { |slot| slot == 4 && i.zero? ? { "id" => "MOMOTECH_EMPTY_SHELL", "qty" => 1 } : { "id" => input_id, "qty" => 1 } }
    {
      "id" => "MOMOTECH_COBBLESTONE#{i}",
      "name" => "#{i + 1}重压缩圆石",
      "englishName" => "#{i + 1}x Compressed Cobblestone",
      "addonName" => "乱码科技",
      "category" => "压缩材料",
      "recipeType" => "增强型工作台",
      "icon" => "cobblestone",
      "recipe" => aggregate(slots.map { |slot| { id: slot["id"], qty: slot["qty"] } }),
      "recipeSlots" => slots,
      "output" => 1,
      "sourceFile" => "MomoTech-v1.1.11.jar / QYhB05/MomoTech 源码"
    }
  end
end

def load_momotech_items
  fields = parse_item_fields
  aliases, = parse_aliases
  recipes = parse_array_recipes(read(ITEM_REGISTER_JAVA), aliases).merge(parse_array_recipes(read(MACHINE_REGISTER_JAVA), aliases))
  registrations = parse_item_registrations(recipes, aliases) + parse_machine_registrations(recipes, aliases)

  items = registrations.each_with_object({}) do |registration, hash|
    field = fields[registration[:field]] || {}
    id = registration[:id]
    item = {
      "id" => id,
      "name" => field["name"] || english_from_id(id),
      "englishName" => field["englishName"] || english_from_id(id),
      "addonName" => "乱码科技",
      "category" => registration[:category],
      "recipeType" => registration[:recipe_type],
      "icon" => field["icon"] || "knowledge_book",
      "recipe" => registration[:recipe],
      "output" => 1,
      "sourceFile" => "MomoTech-v1.1.11.jar / QYhB05/MomoTech 源码"
    }
    item["recipeSlots"] = registration[:recipe_slots] if registration[:recipe_slots]
    item["headTexture"] = field["headTexture"] if field["headTexture"]
    hash[id] = item
  end.values

  items + generated_mineral_items + generated_cobblestone_items
end

def merge_items(data, imported)
  imported_by_id = imported.each_with_object({}) { |item, hash| hash[item["id"]] = item }
  before = data.fetch("items").length
  data["items"].reject! { |item| imported_by_id.key?(item["id"]) || item["addonName"] == "乱码科技" }
  data["items"].concat(imported_by_id.values.sort_by { |item| [item["category"].to_s, item["name"].to_s, item["id"].to_s] })
  [before, data["items"].length, imported_by_id.length]
end

data = JSON.parse(File.read(DATA_PATH, encoding: "UTF-8"))
imported = load_momotech_items
imported.concat(DEPENDENCY_ITEMS)
before, after, imported_count = merge_items(data, imported)

data["vanillaItems"] ||= []
vanilla_by_id = data["vanillaItems"].each_with_object({}) { |item, hash| hash[item["id"]] = item }
VANILLA_DEPENDENCIES.each { |item| vanilla_by_id[item["id"]] ||= item }
data["vanillaItems"] = vanilla_by_id.values.sort_by { |item| item["name"].to_s }

data["meta"]["addonImports"] ||= {}
data["meta"]["addonImports"]["MomoTech"] = {
  "source" => "downloads/addons/MomoTech-v1.1.11.jar",
  "items" => imported.count { |item| item["addonName"] == "乱码科技" },
  "withRecipes" => imported.count { |item| item["addonName"] == "乱码科技" && item["recipe"] }
}

File.write(DATA_PATH, "#{JSON.pretty_generate(data)}\n", encoding: "UTF-8")

puts "Imported #{data["meta"]["addonImports"]["MomoTech"]["items"]} MomoTech items (+ #{imported_count - data["meta"]["addonImports"]["MomoTech"]["items"]} dependency). Items: #{before} -> #{after}."
puts "MomoTech recipes: #{data["meta"]["addonImports"]["MomoTech"]["withRecipes"]}/#{data["meta"]["addonImports"]["MomoTech"]["items"]}."
