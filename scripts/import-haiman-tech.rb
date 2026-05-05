#!/usr/bin/env ruby
# frozen_string_literal: true

require "json"
require "base64"
require "set"
require "stringio"
require "yaml"
require "zlib"

ROOT = File.expand_path("..", __dir__)
DATA_PATH = File.join(ROOT, "data", "slimefun-items.json")
SOURCE_ROOT = File.join(ROOT, "HaimanTech2-Release-1.9.10", "RSC_HaimanTech2")
ADDON_NAME = "海曼科技院"
DEFAULT_ICON = "knowledge_book"

CONFIG_FILES = {
  "items.yml" => "物品",
  "recipe_machines.yml" => "机器",
  "simple_machines.yml" => "机器",
  "generators.yml" => "发电机",
  "solar_generators.yml" => "太阳能发电机",
  "mat_generators.yml" => "材料生成器",
  "capacitors.yml" => "电容",
  "mob_drops.yml" => "生物掉落"
}.freeze

BUILTIN_RECIPE_TYPES = {
  "ENHANCED_CRAFTING_TABLE" => "增强型工作台",
  "ANCIENT_ALTAR" => "古代祭坛",
  "MAGIC_WORKBENCH" => "魔法工作台",
  "ARMOR_FORGE" => "盔甲锻造台",
  "SMELTERY" => "冶炼炉",
  "COMPRESSOR" => "压缩机",
  "ORE_CRUSHER" => "矿石粉碎机",
  "GEO_MINER" => "地理资源采集",
  "NULL" => "未收录配方"
}.freeze

def load_yaml(path)
  YAML.load_file(path) || {}
rescue StandardError
  {}
end

def clean_text(value)
  value.to_s
       .gsub(/\{#[0-9a-fA-F]{6}\}/, "")
       .gsub(/[&§][0-9a-fk-orA-FK-OR]/, "")
       .gsub(/\s+/, " ")
       .strip
end

def titleize_id(id)
  id.to_s.downcase.split("_").map(&:capitalize).join(" ")
end

def normalize_id(value)
  value.to_s.upcase.gsub(/^MINECRAFT:/, "").gsub(/^SLIMEFUN:/, "").strip
end

def saved_item_index
  Dir[File.join(SOURCE_ROOT, "saveditems", "*.yml")].each_with_object({}) do |path, index|
    key = File.basename(path, ".yml").to_s
    saved = load_yaml(path)
    item = saved["item"] || {}
    material = item["type"] || item["id"].to_s.sub(/^minecraft:/, "").upcase
    meta = item["meta"] || {}
    name = component_text(meta["display-name"])

    index[key] = {
      "material" => material.to_s.empty? ? DEFAULT_ICON.upcase : material.to_s,
      "name" => name,
      "headTexture" => extract_head_texture(item)
    }
  end
end

def extract_head_texture(node)
  strings = []
  collect_strings(node, strings)

  strings.each do |value|
    texture = texture_hash_from_text(value)
    return texture if texture

    decoded_values(value).each do |decoded|
      texture = texture_hash_from_text(decoded)
      return texture if texture

      decoded.scan(/[A-Za-z0-9+\/=]{80,}/).each do |encoded_fragment|
        decoded_values(encoded_fragment).each do |nested_decoded|
          texture = texture_hash_from_text(nested_decoded)
          return texture if texture
        end
      end
    end
  end

  nil
end

def collect_strings(node, strings)
  case node
  when Hash
    node.each_value { |value| collect_strings(value, strings) }
  when Array
    node.each { |value| collect_strings(value, strings) }
  else
    strings << node.to_s unless node.nil?
  end
end

def texture_hash_from_text(text)
  text.to_s[%r{textures\.minecraft\.net/texture/([0-9a-f]{32,128})}i, 1]
end

def decoded_values(value)
  text = value.to_s.strip
  return [] if text.length < 32 || !text.match?(/\A[A-Za-z0-9+\/=\s]+\z/)

  decoded = Base64.decode64(text)
  values = [decoded.dup.force_encoding("UTF-8").scrub]
  values << Zlib::GzipReader.new(StringIO.new(decoded)).read.force_encoding("UTF-8").scrub if decoded.start_with?("\x1f\x8b".b)
  values
rescue StandardError
  []
end

def component_text(value)
  return nil if value.nil?

  parsed = JSON.parse(value.to_s)
  parts = []
  collect_component_text(parsed, parts)
  clean_text(parts.join)
rescue StandardError
  clean_text(value)
end

def collect_component_text(node, parts)
  case node
  when Hash
    parts << node["text"].to_s if node.key?("text")
    Array(node["extra"]).each { |child| collect_component_text(child, parts) }
  when Array
    node.each { |child| collect_component_text(child, parts) }
  end
end

def item_material(item, saved_items)
  material_type = item["material_type"].to_s
  material = item["material"] || DEFAULT_ICON.upcase

  if material_type == "saveditem"
    saved = saved_items[material.to_s]
    return saved["material"] if saved && !saved["material"].to_s.empty?
  end

  material.to_s
end

def item_name(id, item, saved_items)
  name = clean_text(item["name"])
  return name unless name.empty?

  if item["material_type"].to_s == "saveditem"
    saved = saved_items[item["material"].to_s]
    return saved["name"] if saved && !saved["name"].to_s.empty?
  end

  titleize_id(id)
end

def icon_from_item(item, saved_items)
  return "player_head" if item["material_type"].to_s == "skull_hash"
  if item["material_type"].to_s == "saveditem"
    saved = saved_items[item["material"].to_s]
    return "player_head" if saved && !saved["headTexture"].to_s.empty?
  end

  material = item_material(item, saved_items)
  material.start_with?("SKULL") ? "player_head" : material.downcase
end

def head_texture_from_item(item, saved_items)
  material_type = item["material_type"].to_s
  material = item["material"].to_s
  return material if material_type == "skull_hash" && material.match?(/\A[0-9a-f]{32,128}\z/i)
  return material.sub(/^SKULL/i, "") if material.match?(/\ASKULL[0-9a-f]{32,128}\z/i)
  if material_type == "saveditem"
    saved = saved_items[material]
    return saved["headTexture"] if saved && !saved["headTexture"].to_s.empty?
  end

  nil
end

def recipe_type_name(value, recipe_type_names)
  key = value.to_s
  return nil if key.empty?
  return recipe_type_names[key] if recipe_type_names[key]
  return BUILTIN_RECIPE_TYPES[key] if BUILTIN_RECIPE_TYPES[key]

  clean_text(key).split("_").map(&:capitalize).join(" ")
end

def normalize_ingredient(raw)
  return nil unless raw.is_a?(Hash)

  type = raw["material_type"].to_s
  material = raw["material"] || raw["id"]
  return nil if material.nil? || material.to_s.empty? || material.to_s == "N/A" || type == "none"

  {
    "id" => normalize_id(material),
    "qty" => normalize_amount(raw["amount"] || 1),
    "kind" => type
  }
end

def normalize_amount(value)
  amount = value.to_f
  return amount.to_i if amount.positive? && amount == amount.to_i
  return amount if amount.positive?

  1
end

def recipe_slots(recipe_hash)
  slots = Array.new(9)
  return slots unless recipe_hash.is_a?(Hash)

  recipe_hash.each do |slot, raw|
    index = slot.to_i - 1
    next unless index.between?(0, 8)

    ingredient = normalize_ingredient(raw)
    slots[index] = ingredient&.slice("id", "qty")
  end

  slots
end

def flatten_slots(slots)
  totals = {}
  slots.compact.each do |entry|
    totals[entry["id"]] ||= 0
    totals[entry["id"]] += entry["qty"].to_f
  end
  totals.map { |id, qty| { "id" => id, "qty" => qty == qty.to_i ? qty.to_i : qty } }
end

def category_index
  groups = load_yaml(File.join(SOURCE_ROOT, "groups.yml"))
  groups.transform_values do |group|
    clean_text(group.dig("item", "name")).sub(/^海曼科技院\s*-\s*/, "")
  end
end

def recipe_type_index
  types = load_yaml(File.join(SOURCE_ROOT, "recipe_types.yml"))
  types.transform_values { |type| clean_text(type["name"]) }
end

def research_index
  researches = load_yaml(File.join(SOURCE_ROOT, "researches.yml"))
  index = {}

  researches.each_value do |research|
    Array(research["items"]).each do |item_id|
      index[normalize_id(item_id)] = {
        "research" => research["id"],
        "researchCost" => research["levelCost"]
      }
    end
  end

  index
end

def build_item(id, raw, file_label, categories, recipe_type_names, researches, saved_items)
  item = raw["item"] || {}
  slots = recipe_slots(raw["recipe"])
  recipe = flatten_slots(slots)
  recipe_type = recipe_type_name(raw["recipe_type"], recipe_type_names)
  head_texture = head_texture_from_item(item, saved_items)
  output = normalize_amount(item["amount"] || 1)

  result = {
    "id" => normalize_id(id),
    "name" => item_name(id, item, saved_items),
    "englishName" => titleize_id(id),
    "addonName" => ADDON_NAME,
    "category" => categories[raw["item_group"].to_s] || file_label,
    "recipeType" => recipe_type || file_label,
    "icon" => icon_from_item(item, saved_items),
    "recipe" => recipe.empty? ? nil : recipe,
    "recipeSlots" => recipe.empty? ? nil : slots,
    "output" => output,
    "sourceFile" => "HaimanTech2-Release-1.9.10/RSC_HaimanTech2/#{file_label}"
  }.merge(researches[normalize_id(id)] || {})

  result["headTexture"] = head_texture if head_texture
  result.compact
end

def apply_processing_recipes(items_by_id, machine_defs)
  machine_defs.each do |machine_id, machine|
    machine_name = clean_text(machine.dig("item", "name"))
    machine_name = titleize_id(machine_id) if machine_name.empty?
    machine_recipes = machine["recipes"]
    next unless machine_recipes.is_a?(Hash)

    machine_recipes.each_value do |recipe|
      slots = recipe_slots(recipe["input"])
      ingredients = flatten_slots(slots)
      next if ingredients.empty?

      outputs = recipe["output"]
      next unless outputs.is_a?(Hash)

      outputs.each_value do |raw_output|
        output = normalize_ingredient(raw_output)
        next unless output

        target = items_by_id[output["id"]]
        next unless target && target["addonName"] == ADDON_NAME
        next if target["recipe"] && target["recipeType"] != "未收录配方"

        target["recipe"] = ingredients
        target["recipeSlots"] = slots
        target["recipeType"] = machine_name
        target["output"] = output["qty"]
      end
    end
  end
end

data = JSON.parse(File.read(DATA_PATH))
categories = category_index
recipe_type_names = recipe_type_index
researches = research_index
saved_items = saved_item_index
items_by_id = {}
machine_defs = {}

CONFIG_FILES.each do |file_name, label|
  entries = load_yaml(File.join(SOURCE_ROOT, file_name))
  next unless entries.is_a?(Hash)

  entries.each do |id, raw|
    next unless raw.is_a?(Hash) && raw["item"].is_a?(Hash)

    normalized_id = normalize_id(id)
    items_by_id[normalized_id] = build_item(id, raw, label, categories, recipe_type_names, researches, saved_items)
    machine_defs[normalized_id] = raw if raw["recipes"].is_a?(Hash)
  end
end

apply_processing_recipes(items_by_id, machine_defs)

existing_items = data.fetch("items", [])
without_haiman = existing_items.reject { |item| item["addonName"] == ADDON_NAME }
data["items"] = without_haiman + items_by_id.values.sort_by { |item| [item["category"].to_s, item["id"].to_s] }

known_ids = (data["items"] + data.fetch("vanillaItems", [])).map { |item| item["id"] }.to_set
vanilla_names = JSON.parse(File.read(File.join(ROOT, "data", "minecraft-zh_cn.json")))
vanilla_refs = items_by_id.values.flat_map { |item| Array(item["recipe"]).map { |entry| entry["id"] } }
vanilla_refs.each do |id|
  next if known_ids.include?(id)

  key = "item.minecraft.#{id.downcase}"
  block_key = "block.minecraft.#{id.downcase}"
  name = vanilla_names[key] || vanilla_names[block_key] || titleize_id(id)
  data["vanillaItems"] << {
    "id" => id,
    "name" => name,
    "englishName" => titleize_id(id),
    "addonName" => "Minecraft",
    "category" => "Minecraft",
    "recipeType" => "基础材料",
    "recipe" => nil,
    "icon" => id.downcase
  }
  known_ids << id
end

data["meta"]["haimanTechSource"] = "HaimanTech2-Release-1.9.10/RSC_HaimanTech2"
data["meta"]["haimanTechImportedItems"] = items_by_id.size
data["meta"]["haimanTechVersion"] = "Release-1.9.10"

File.write(DATA_PATH, "#{JSON.pretty_generate(data)}\n")
puts "Imported #{items_by_id.size} HaimanTech2 items from #{SOURCE_ROOT}."
