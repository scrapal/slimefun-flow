# encoding: UTF-8

require "json"
require "yaml"

ROOT = File.expand_path("..", __dir__)
DATA_PATH = File.join(ROOT, "data", "slimefun-items.json")

FINALTECH_SRC = "/tmp/slimefun-addon-src/FinalTech"
LOGITECH_SRC = "/tmp/slimefun-addon-src/LogiTech"
FINALTECH_LANG = "/tmp/addon-configs/finaltech/zh-CN.yml"
LOGITECH_LANG = "/tmp/addon-configs/logitech/language.yml"

RECIPE_TYPE_LABELS = {
  "NULL" => "特殊获取",
  "COMMON_TYPE" => "逻辑工艺工作台",
  "ENHANCED_CRAFTING_TABLE" => "增强型工作台",
  "MAGIC_WORKBENCH" => "魔法工作台",
  "ANCIENT_ALTAR" => "古代祭坛",
  "ARMOR_FORGE" => "盔甲锻造台",
  "SMELTERY" => "冶炼炉",
  "STARSMELTERY" => "星辰锻造台",
  "BEDROCK_CRAFT_TABLE" => "基岩合成台",
  "MATRIX_CRAFTING_TABLE" => "矩阵合成台",
  "ENERGY_TABLE" => "能量台",
  "ORDERED_DUST_FACTORY" => "有序尘工厂",
  "ETHER_MINER" => "以太矿机",
  "ITEM_SERIALIZATION_CONSTRUCTOR" => "物品序列化构造器",
  "EQUIVALENT_EXCHANGE_TABLE" => "等价交换台",
  "ENTROPY_SEED" => "熵种子",
  "LOGIC_CRAFTER" => "逻辑合成器",
  "LOGIC_GENERATOR" => "逻辑生成器",
  "CARD_OPERATION_TABLE" => "卡片操作台",
  "ENTROPY_CONSTRUCTOR" => "熵构造器",
  "BukkitUtils.VANILLA_CRAFTTABLE" => "原版工作台",
  "FINALTECH_BEDROCK_CRAFT_TABLE" => "基岩合成台",
  "FINALTECH_MATRIX_CRAFTING_TABLE" => "矩阵合成台",
  "FINALTECH_ENERGY_TABLE" => "能量台",
  "FINALTECH_ORDERED_DUST_FACTORY_DIRT" => "有序尘工厂",
  "FINALTECH_ETHER_MINER" => "以太矿机",
  "FINALTECH_ITEM_SERIALIZATION_CONSTRUCTOR" => "物品序列化构造器",
  "FINALTECH_EQUIVALENT_EXCHANGE_TABLE" => "等价交换台",
  "FINALTECH_ENTROPY_SEED" => "熵种子",
  "FINALTECH_LOGIC_CRAFTER" => "逻辑合成器",
  "FINALTECH_LOGIC_GENERATOR" => "逻辑生成器",
  "FINALTECH_CARD_OPERATION_TABLE" => "卡片操作台",
  "FINALTECH_ENTROPY_CONSTRUCTOR" => "熵构造器"
}.freeze

LOGITECH_SECTION_CATEGORIES = {
  "Items" => "材料",
  "Machines" => "机器",
  "Manuals" => "手动机器",
  "Generators" => "发电机",
  "MultiBlock" => "多方块结构",
  "Cargo" => "货运/存储"
}.freeze

DEPENDENCY_ITEMS = {
  "ENDER_RUNE" => ["末影符文", "Ender Rune", "Slimefun", "魔法物品", "ender_pearl"],
  "AIR_RUNE" => ["风符文", "Air Rune", "Slimefun", "魔法物品", "feather"],
  "FIRE_RUNE" => ["火符文", "Fire Rune", "Slimefun", "魔法物品", "blaze_powder"],
  "STAFF_WIND" => ["风之法杖", "Staff of Wind", "Slimefun", "魔法物品", "stick"],
  "ENDER_CHEST" => ["末影箱", "Ender Chest", "Minecraft", "功能方块", "ender_chest"],
  "END_PORTAL_FRAME" => ["末地传送门框架", "End Portal Frame", "Minecraft", "功能方块", "end_portal_frame"]
}.freeze

def read(path)
  File.read(path, encoding: "UTF-8")
end

def clean_name(value)
  String(value)
    .gsub(/\{color:[^}]+\}/, "")
    .gsub(/&x(?:&[0-9a-fA-F]){6}/, "")
    .gsub(/[&§][0-9a-fk-orA-FK-OR]/, "")
    .gsub(/\s+/, " ")
    .strip
end

def normalize_icon(material)
  String(material || "knowledge_book").downcase
end

def english_from_id(id)
  id.sub(/^LOGITECH_/, "")
    .sub(/^FINALTECH_/, "")
    .split("_")
    .map { |part| part[0] ? part[0].upcase + part[1..].to_s.downcase : part }
    .join(" ")
end

def label_recipe_type(raw)
  key = String(raw).split(".").last
  RECIPE_TYPE_LABELS[raw] || RECIPE_TYPE_LABELS[key] || key.split("_").map(&:capitalize).join(" ")
end

def aggregate(entries)
  totals = Hash.new(0)
  entries.compact.each { |entry| totals[entry[:id]] += entry[:qty].to_i }
  totals.map { |id, qty| { "id" => id, "qty" => qty } }
end

def parse_static_item_fields(java, prefix: nil)
  fields = {}
  custom_heads = parse_custom_heads

  java.scan(/public\s+static\s+final\s+SlimefunItemStack\s+(\w+)\s*=\s*(.*?);/m) do |field, expr|
    id = expr[/\"([A-Z0-9_]+)\"/, 1] || field
    id = "#{prefix}#{id}" if prefix && !id.start_with?(prefix)
    material = expr[/Material\.([A-Z0-9_]+)/, 1]
    english = expr.scan(/\"([^"]+)\"/).flatten.last
    head_texture = nil
    head_texture = expr.scan(/\"([0-9a-f]{32,})\"/i).flatten.first if material.nil?
    if head_texture.nil? && expr =~ /CustomHead\.(\w+)/
      head_texture = custom_heads[Regexp.last_match(1)]
      material = "PLAYER_HEAD" if head_texture
    end

    fields[field] = {
      "id" => id,
      "icon" => normalize_icon(material),
      "englishName" => clean_name(english || english_from_id(id)),
      "headTexture" => head_texture
    }
  end

  fields
end

def parse_custom_heads
  path = File.join(LOGITECH_SRC, "src/main/java/me/matl114/logitech/utils/UtilClass/SpecialItemClass/CustomHead.java")
  return {} unless File.exist?(path)

  read(path).scan(/(\w+)\(\"([0-9a-f]{32,})\"\)/i).to_h
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

def parse_recipe_token(token, local_fields, prefix: nil)
  token = token.strip
  return nil if token.empty? || token == "null"

  if (body = balanced_after(token, "setC("))
    args = split_top_level(body)
    item = parse_recipe_token(args[0].to_s, local_fields, prefix: prefix)
    return nil unless item
    item[:qty] = args[1].to_i if args[1].to_s[/\A\d+\z/]
    return item
  end

  if (body = balanced_after(token, "ItemStackUtil.cloneItem("))
    args = split_top_level(body)
    item = parse_recipe_token(args[0].to_s, local_fields, prefix: prefix)
    return nil unless item
    item[:qty] = args[1].to_i if args[1].to_s[/\A\d+\z/]
    return item
  end

  if token =~ /FinalTechItemStacks\.(\w+)/
    field = Regexp.last_match(1)
    id = local_fields.dig(field, "id") || "FINALTECH_#{field}"
    return { id: id, qty: 1 }
  end

  if token =~ /AddItem\.(\w+)/
    field = Regexp.last_match(1)
    id = local_fields.dig(field, "id") || "#{prefix}#{field}"
    return { id: id, qty: 1 }
  end

  if token =~ /SlimefunItems\.(\w+)/
    return { id: Regexp.last_match(1), qty: 1 }
  end

  if token =~ /Material\.([A-Z0-9_]+)/
    return { id: Regexp.last_match(1), qty: 1 }
  end

  if token =~ /"([0-9]*)([A-Z0-9_]+)"/
    qty = Regexp.last_match(1).empty? ? 1 : Regexp.last_match(1).to_i
    return { id: Regexp.last_match(2), qty: qty }
  end

  nil
end

def parse_recipe_body(body, local_fields, prefix: nil)
  split_top_level(body).map { |token| parse_recipe_token(token, local_fields, prefix: prefix) }
end

def parse_finaltech_recipes(fields)
  java = read(File.join(FINALTECH_SRC, "src/main/java/io/taraxacum/finaltech/setup/FinalTechRecipes.java"))
  recipes = {}

  java.scan(/public\s+static\s+final\s+ItemStack\[\]\s+(\w+)\s*=\s*new\s+ItemStack\[\]\s*\{(.*?)\};/m) do |name, body|
    slots = parse_recipe_body(body, fields)
    entries = slots.compact
    recipes[name] = {
      slots: slots,
      recipe: aggregate(entries)
    }
  end

  recipes
end

def parse_finaltech_registrations(fields)
  java = read(File.join(FINALTECH_SRC, "src/main/java/io/taraxacum/finaltech/setup/FinalTechItems.java"))
  registrations = {}

  java.scan(/public\s+static\s+final\s+\w+\s+(\w+)\s*=\s*new\s+\w+\((.*?)\);/m) do |field, args_body|
    args = split_top_level(args_body)
    item_index = args.index { |arg| arg.include?("FinalTechItemStacks.") }
    item_ref = item_index ? args[item_index] : nil
    search_start = item_index ? item_index + 1 : 0
    recipe_type_ref = args[search_start..]&.find { |arg| arg.include?("FinalTechRecipeTypes.") || arg.include?("RecipeType.") }
    recipe_ref = args.find { |arg| arg.include?("FinalTechRecipes.") }
    stack_field = item_ref&.split(".")&.last&.gsub(/\W.*/, "")
    next unless stack_field

    recipe_type_id = recipe_type_ref&.split(".")&.last&.gsub(/\W.*/, "")
    recipe_id = recipe_ref&.split(".")&.last&.gsub(/\W.*/, "")
    registrations[stack_field] = {
      recipe_type: recipe_type_id,
      recipe_id: recipe_id,
      category: finaltech_category(stack_field)
    }
  end

  registrations
end

def finaltech_category(field)
  return "基础材料" if field =~ /(DUST|GEARWHEEL|BUG|ETHER|SHINE|ENTROPY|CARD|MODULE|LOGIC|DIGITAL|SINGULARITY|SHELL|PHONY|ANNULAR|CONCEPT)/
  return "电力系统" if field =~ /(GENERATOR|CAPACITOR|ELECTRICITY|CHARGE|ENERGY|ACCELERATOR)/
  return "货运/存储" if field =~ /(STORAGE|TRANSFER|TRANSPORTER|ACCESSOR|CARGO|PORT)/
  return "工具" if field =~ /(SHOVEL|PICKAXE|AXE|HOE|RUNE|VIEWER|RECORDER|CONFIGURATOR|TICKET)/
  return "机器" if field =~ /(MACHINE|TABLE|FACTORY|CONVERSION|EXTRACTION|SMELTERY|FURNACE|JUICER|PRESS|GRINDER|WASHER|CRUCIBLE|COMPRESSOR|CONSTRUCTOR|PARSER|MINER|TOWER)/
  "乱序技艺"
end

def load_finaltech_items
  lang = YAML.load_file(FINALTECH_LANG)
  names = lang.fetch("items", {})
  fields = parse_static_item_fields(read(File.join(FINALTECH_SRC, "src/main/java/io/taraxacum/finaltech/setup/FinalTechItemStacks.java")))
  by_id = fields.values.each_with_object({}) { |field, hash| hash[field["id"]] = field }
  recipes = parse_finaltech_recipes(fields)
  registrations = parse_finaltech_registrations(fields)

  names.map do |id, raw_name|
    field_name = fields.key(by_id[id]) || id.sub(/^FINALTECH_/, "")
    field = by_id[id] || { "id" => id, "icon" => "knowledge_book", "englishName" => english_from_id(id) }
    registration = registrations[field_name] || {}
    recipe_data = recipes[registration[:recipe_id] || field_name]
    recipe = recipe_data && !recipe_data[:recipe].empty? ? recipe_data[:recipe] : nil
    slots = recipe_data && recipe_data[:slots].length == 9 ? recipe_data[:slots].map { |slot| slot ? { "id" => slot[:id], "qty" => slot[:qty] } : nil } : nil
    name = raw_name.is_a?(Hash) ? (raw_name["name"] || raw_name["Name"] || field["englishName"]) : raw_name
    recipe_type = if recipe
      registration[:recipe_type] ? label_recipe_type(registration[:recipe_type]) : "多方块/特殊结构"
    else
      "特殊获取"
    end

    item = {
      "id" => id,
      "name" => clean_name(name),
      "englishName" => field["englishName"],
      "addonName" => "乱序技艺",
      "category" => registration[:category] || finaltech_category(field_name),
      "recipeType" => recipe_type,
      "icon" => field["icon"],
      "recipe" => recipe,
      "output" => 1,
      "sourceFile" => "FinalTECH.v2.0-preview-2.jar / FinalTech 源码"
    }
    item["recipeSlots"] = slots if slots
    item["headTexture"] = field["headTexture"] if field["headTexture"]
    item
  end
end

def logitech_names
  zh = YAML.load_file(LOGITECH_LANG).fetch("zh_CN")
  result = {}

  LOGITECH_SECTION_CATEGORIES.each do |section, category|
    next unless zh[section].is_a?(Hash)

    zh[section].each do |key, value|
      name = value.is_a?(Hash) ? value["Name"] : value
      next unless name

      result["LOGITECH_#{key}"] = {
        name: clean_name(name),
        category: category,
        section: section
      }
    end
  end

  result
end

def parse_logitech_fields
  fields = parse_static_item_fields(read(File.join(LOGITECH_SRC, "src/main/java/me/matl114/logitech/core/AddItem.java")), prefix: "LOGITECH_")
  fields.transform_values do |field|
    field["icon"] = "player_head" if field["icon"] == "knowledge_book" && field["headTexture"]
    field
  end
end

def parse_logitech_registrations(fields)
  java = read(File.join(LOGITECH_SRC, "src/main/java/me/matl114/logitech/core/AddSlimefunItems.java"))
  registrations = {}

  java.scan(/public\s+static\s+(?:final\s+)?SlimefunItem\s+(\w+)\s*=\s*new\s+[\w<>]+(?:\([^;]*?\)\s*)?;/m) do
    block = Regexp.last_match(0)
    item_ref = block[/AddItem\.(\w+)/, 1]
    next unless item_ref

    args_body = balanced_after(block, "new ")
    args = args_body ? split_top_level(args_body) : []
    item_index = args.index { |arg| arg.include?("AddItem.#{item_ref}") }
    recipe_type = item_index ? args[item_index + 1] : nil
    recipe_type = recipe_type.to_s.split(":").last.strip if recipe_type.to_s.include?("?")

    recipe_body = balanced_after(block, "recipe(")
    slots = recipe_body ? parse_recipe_body(recipe_body, fields, prefix: "LOGITECH_") : []
    recipe = slots.compact.empty? ? nil : aggregate(slots.compact)

    output = 1
    if block =~ /\.setOutput\(setC\([^,]+,\s*(\d+)\)\)/
      output = Regexp.last_match(1).to_i
    end

    registrations["LOGITECH_#{item_ref}"] = {
      recipe_type: recipe_type && !recipe_type.empty? ? label_recipe_type(recipe_type) : "特殊获取",
      recipe: recipe,
      recipe_slots: slots.length == 9 ? slots.map { |slot| slot ? { "id" => slot[:id], "qty" => slot[:qty] } : nil } : nil,
      output: output
    }
  end

  registrations
end

def load_logitech_items
  names = logitech_names
  fields_by_field = parse_logitech_fields
  fields = fields_by_field.values.each_with_object({}) { |field, hash| hash[field["id"]] = field }
  registrations = parse_logitech_registrations(fields_by_field)

  names.map do |id, info|
    field = fields[id] || { "id" => id, "icon" => "knowledge_book", "englishName" => english_from_id(id) }
    registration = registrations[id] || {}
    item = {
      "id" => id,
      "name" => info[:name],
      "englishName" => field["englishName"],
      "addonName" => "逻辑工艺",
      "category" => info[:category],
      "recipeType" => registration[:recipe] ? registration[:recipe_type] : "特殊获取",
      "icon" => field["icon"],
      "recipe" => registration[:recipe],
      "output" => registration[:output] || 1,
      "sourceFile" => "LogiTech v1.0.3.jar / LogiTech 源码"
    }
    item["recipeSlots"] = registration[:recipe_slots] if registration[:recipe_slots]
    item["headTexture"] = field["headTexture"] if field["headTexture"]
    item
  end
end

def merge_items(data, imported)
  imported_by_id = imported.each_with_object({}) { |item, hash| hash[item["id"]] = item }
  before = data.fetch("items").length
  data["items"].reject! { |item| imported_by_id.key?(item["id"]) }
  data["items"].concat(imported_by_id.values.sort_by { |item| [item["addonName"].to_s, item["category"].to_s, item["name"].to_s, item["id"].to_s] })
  [before, data["items"].length, imported_by_id.length]
end

data = JSON.parse(File.read(DATA_PATH, encoding: "UTF-8"))
imported = load_finaltech_items + load_logitech_items
imported.concat(
  DEPENDENCY_ITEMS.map do |id, (name, english, addon, category, icon)|
    {
      "id" => id,
      "name" => name,
      "englishName" => english,
      "addonName" => addon,
      "category" => category,
      "recipeType" => "基础材料",
      "icon" => icon,
      "recipe" => nil,
      "sourceFile" => "FinalTECH/LogiTech 依赖补全"
    }
  end
)
before, after, imported_count = merge_items(data, imported)

data["meta"]["addonImports"] ||= {}
data["meta"]["addonImports"]["FinalTECH"] = {
  "source" => "downloads/addons/FinalTECH.v2.0-preview-2.jar",
  "items" => imported.count { |item| item["addonName"] == "乱序技艺" },
  "withRecipes" => imported.count { |item| item["addonName"] == "乱序技艺" && item["recipe"] }
}
data["meta"]["addonImports"]["LogiTech"] = {
  "source" => "downloads/addons/LogiTech v1.0.3.jar",
  "items" => imported.count { |item| item["addonName"] == "逻辑工艺" },
  "withRecipes" => imported.count { |item| item["addonName"] == "逻辑工艺" && item["recipe"] }
}

File.write(DATA_PATH, "#{JSON.pretty_generate(data)}\n", encoding: "UTF-8")

puts "Imported #{imported_count} addon items. Items: #{before} -> #{after}."
puts "FinalTECH recipes: #{data["meta"]["addonImports"]["FinalTECH"]["withRecipes"]}/#{data["meta"]["addonImports"]["FinalTECH"]["items"]}."
puts "LogiTech recipes: #{data["meta"]["addonImports"]["LogiTech"]["withRecipes"]}/#{data["meta"]["addonImports"]["LogiTech"]["items"]}."
