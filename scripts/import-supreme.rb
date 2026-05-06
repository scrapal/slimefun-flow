# encoding: UTF-8

require "json"
require "set"
require "yaml"

ROOT = File.expand_path("..", __dir__)
DATA_PATH = File.join(ROOT, "data", "slimefun-items.json")
SUPREME_SRC = "/tmp/slimefun-addon-src/Supreme"
JAVA_ROOT = File.join(SUPREME_SRC, "src/main/java")
LANG_ZH = File.join(SUPREME_SRC, "src/main/resources/lang/zh-CN.yml")
LANG_EN = File.join(SUPREME_SRC, "src/main/resources/lang/en-US.yml")
ADDON_NAME = "至尊研究院2.0"

RECIPE_TYPE_LABELS = {
  "ENHANCED_CRAFTING_TABLE" => "增强型工作台",
  "SMELTERY" => "冶炼炉",
  "GRIND_STONE" => "磨石",
  "NULL" => "特殊获取",
  "CORE_FABRICATOR" => "至尊核心制造机",
  "MAGICAL_FABRICATOR" => "至尊魔法制造机",
  "GEAR_FABRICATOR" => "至尊装备制造机",
  "TECH_MUTATION" => "生物科技突变机",
  "TECH_ROBOTIC" => "生物科技升级机"
}.freeze

CATEGORY_BY_PATH = [
  [%r{/resource/core/}, "至尊核心组件"],
  [%r{/resource/magical/}, "至尊魔法组件"],
  [%r{/resource/mobtech/}, "生物科技"],
  [%r{/machine/tech/}, "生物科技机器"],
  [%r{/machine/}, "至尊机器"],
  [%r{/generators/}, "至尊电力"],
  [%r{/tools/}, "至尊工具"],
  [%r{/gear/Armor}, "至尊盔甲"],
  [%r{/gear/Weapons}, "至尊武器"],
  [%r{/resource/}, "至尊组件"]
].freeze

SOURCE_CATEGORY_TRANSLATIONS = {
  "Supreme Component" => "至尊组件",
  "Supreme Components" => "至尊组件",
  "Supreme Core Components" => "至尊核心组件",
  "Supreme Magical Components" => "至尊魔法组件",
  "Supreme End-Game Components" => "至尊终局组件",
  "Supreme Advanced Components" => "至尊高级组件",
  "Supreme Machine" => "至尊机器",
  "MultiBlock Machine" => "多方块机器"
}.freeze

TIER_COMPONENTS = {
  "MAGIC" => %w[SUPREME_THORNIUM_BIT_SYNTHETIC SUPREME_CETRUS_IGNIS],
  "RARE" => %w[SUPREME_THORNIUM_DUST_SYNTHETIC SUPREME_CETRUS_VENTUS],
  "EPIC" => %w[SUPREME_THORNIUM_INGOT_SYNTHETIC SUPREME_CETRUS_LUX],
  "LEGENDARY" => %w[SUPREME_THORNIUM_CARBONADO SUPREME_CETRUS_LUMIUM],
  "SUPREME" => %w[SUPREME_THORNIUM_ENERGIZED SUPREME_SUPREME]
}.freeze

ROMAN = {
  1 => "I",
  2 => "II",
  3 => "III",
  4 => "IV",
  5 => "V",
  6 => "VI",
  7 => "VII",
  8 => "VIII",
  9 => "IX"
}.freeze

MATERIAL_MAX_STACK = {
  "BOW" => 1,
  "SHIELD" => 1,
  "ELYTRA" => 1,
  "FISHING_ROD" => 1,
  "FLINT_AND_STEEL" => 1,
  "SHEARS" => 1
}.freeze

def read(path)
  File.read(path, encoding: "UTF-8", invalid: :replace, undef: :replace)
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

def titleize_id(id)
  id.to_s
    .sub(/^SUPREME_/, "")
    .split("_")
    .reject(&:empty?)
    .map { |part| part[0] ? part[0].upcase + part[1..].to_s.downcase : part }
    .join(" ")
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

def load_lang(path)
  return {} unless File.exist?(path)

  YAML.load_file(path).fetch("items", {})
rescue Psych::SyntaxError
  {}
end

def class_name(path)
  File.basename(path, ".java")
end

def category_for(path, source_category, lang_entry)
  lang_lore = Array(lang_entry && lang_entry["lore"]).map { |line| clean_name(line) }.reject(&:empty?)
  return lang_lore.last if lang_lore.last&.start_with?("至尊", "生物", "多方块")

  cleaned_source = clean_name(source_category)
  return SOURCE_CATEGORY_TRANSLATIONS[cleaned_source] if SOURCE_CATEGORY_TRANSLATIONS[cleaned_source]
  return cleaned_source.sub(/^Supreme /, "至尊") if cleaned_source.include?("Supreme")
  return cleaned_source unless cleaned_source.empty?

  CATEGORY_BY_PATH.each do |pattern, label|
    return label if path.match?(pattern)
  end
  "至尊研究院2.0"
end

def normalize_icon(material, head_texture)
  return "player_head" if head_texture

  material.to_s.empty? ? "knowledge_book" : material.downcase
end

def recipe_entry(id, qty = 1)
  return nil if id.to_s.empty?

  { "id" => id, "qty" => qty.to_i.positive? ? qty.to_i : 1 }
end

def parse_material_token(token)
  if token =~ /Material\.([A-Z0-9_]+)/
    recipe_entry(Regexp.last_match(1), token[/,\s*(\d+)/, 1] || 1)
  end
end

def aggregate(slots)
  counts = Hash.new(0)
  slots.each do |entry|
    next unless entry && entry["id"]

    counts[entry["id"]] += entry["qty"].to_i
  end
  counts.map { |id, qty| { "id" => id, "qty" => qty } }.sort_by { |entry| entry["id"] }
end

def resolve_token(token, refs)
  token = token.to_s.strip
  return nil if token.empty? || token == "null" || token == "new ItemStack[0]"

  if (body = balanced_after(token, "new SlimefunItemStack("))
    args = split_top_level(body)
    item = resolve_token(args[0], refs)
    return nil unless item

    qty = args[1].to_s[/\d+/]&.to_i
    item["qty"] = qty if qty&.positive?
    return item
  end

  if (body = balanced_after(token, "new ItemStack("))
    args = split_top_level(body)
    item = resolve_token(args[0], refs)
    return nil unless item

    qty = args[1].to_s[/\d+/]&.to_i
    item["qty"] = qty if qty&.positive?
    return item
  end

  if token =~ /SlimefunItems\.([A-Z0-9_]+)/
    return recipe_entry(Regexp.last_match(1), token[/,\s*(\d+)/, 1] || 1)
  end

  if token =~ /Material\.([A-Z0-9_]+)/
    return recipe_entry(Regexp.last_match(1), token[/,\s*(\d+)/, 1] || 1)
  end

  normalized = token.gsub(/\s+/, "")
  return recipe_entry(refs[normalized]) if refs[normalized]

  if normalized =~ /([A-Z][A-Za-z0-9_]*)\.get([A-Z][A-Za-z0-9_]*)\(\)/
    getter_key = "#{$1}.get#{$2}()"
    return recipe_entry(refs[getter_key]) if refs[getter_key]
  end

  if normalized =~ /([A-Z][A-Za-z0-9_]*)\.([A-Z0-9_]+)/
    return recipe_entry(refs["#{$1}.#{$2}"] || refs[$2])
  end

  recipe_entry(refs[normalized] || refs[token])
end

def parse_recipe_slots(body, refs)
  split_top_level(body).map { |token| resolve_token(token, refs) }
end

def source_category_from_args(args)
  quoted = args.flat_map { |arg| arg.scan(/"([^"]*)"/).flatten }
  quoted.reverse.find { |part| clean_name(part).match?(/Supreme|至尊|MultiBlock|多方块/) }
end

zh_lang = load_lang(LANG_ZH)
en_lang = load_lang(LANG_EN)
java_files = Dir[File.join(JAVA_ROOT, "com/github/relativobr/supreme/**/*.java")]

items = {}
refs = {}
recipe_arrays = {}
custom_core_recipes = {}
source_recipe_types = {}

java_files.each do |path|
  text = read(path)
  cls = class_name(path)

  text.scan(/public\s+static\s+final\s+SlimefunItemStack\s+(\w+)\s*=\s*new\s+SupremeItemStack\s*\((.*?)\);/m) do |field, body|
    args = split_top_level(body)
    id = args[0].to_s[/"([^"]+)"/, 1]
    next unless id

    head_texture = args[1].to_s[/"([0-9a-fA-F]{32,128})"/, 1]
    material = args[1].to_s[/Material\.([A-Z0-9_]+)/, 1]
    lang_entry = zh_lang[id.downcase]
    en_entry = en_lang[id.downcase]
    source_names = args[2..].to_a.flat_map { |arg| arg.scan(/"([^"]*)"/).flatten }
    english_name = clean_name((en_entry && en_entry["name"]) || source_names.find { |part| clean_name(part).match?(/[A-Za-z]/) } || titleize_id(id))
    name = clean_name((lang_entry && lang_entry["name"]) || english_name)
    category = category_for(path, source_category_from_args(args), lang_entry)

    item = {
      "id" => id,
      "name" => name.empty? ? titleize_id(id) : name,
      "englishName" => english_name.empty? ? titleize_id(id) : english_name,
      "addonName" => ADDON_NAME,
      "category" => category,
      "recipeType" => "特殊获取",
      "icon" => normalize_icon(material, head_texture),
      "recipe" => nil,
      "output" => 1,
      "sourceFile" => "Supreme/#{path.sub("#{SUPREME_SRC}/", "")}"
    }
    item["headTexture"] = head_texture.downcase if head_texture
    items[id] = item

    refs[field] ||= id
    refs["#{cls}.#{field}"] = id
  end

  text.scan(/public\s+static\s+final\s+ItemStack\[\]\s+(\w+)\s*=\s*(?:new\s+ItemStack\[\]\s*)?\{(.*?)\};/m) do |field, body|
    recipe_arrays["#{cls}.#{field}"] = body
    recipe_arrays[field] ||= body
  end

  text.scan(/public\s+static\s+final\s+CustomCoreRecipe\s+(\w+)\s*=\s*new\s+CustomCoreRecipe\s*\((.*?)\);/m) do |field, body|
    custom_core_recipes["#{cls}.#{field}"] = body
    custom_core_recipes[field] ||= body
  end
end

%w[Magic Bomb Fortune Impetus].each do |name|
  field = "ATTRIBUTE_#{name.upcase}"
  refs["SupremeAttribute.get#{name}()"] = refs["SupremeAttribute.#{field}"] if refs["SupremeAttribute.#{field}"]
end

def assign_recipe(item, slots, type)
  parsed_slots = slots.compact
  item["recipeSlots"] = slots.map { |entry| entry && { "id" => entry["id"], "qty" => entry["qty"] } } if slots.length == 9
  item["recipe"] = aggregate(parsed_slots)
  item["recipeType"] = type
end

def recipe_type_for_item(item)
  category = item["category"].to_s
  return RECIPE_TYPE_LABELS["GEAR_FABRICATOR"] if category.include?("工具") || category.include?("盔甲") || category.include?("武器")
  return RECIPE_TYPE_LABELS["CORE_FABRICATOR"] if category.include?("核心")
  return RECIPE_TYPE_LABELS["MAGICAL_FABRICATOR"] if category.include?("魔法")

  RECIPE_TYPE_LABELS["ENHANCED_CRAFTING_TABLE"]
end

java_files.each do |path|
  text = read(path).gsub(%r{//.*$}, "").gsub(/\s+/, " ")

  text.scan(/register(Smeltery|EnhancedCraft|NullRecipe|GrindStone|MagicalFabricator|CoreFabricator|TechMutation)\((.*?)\);/) do |kind, body|
    args = split_top_level(body)
    args.shift if args.first&.start_with?("ItemGroups.")
    item_ref = args[0]
    item = resolve_token(item_ref, refs)
    next unless item

    type_key = {
      "Smeltery" => "SMELTERY",
      "EnhancedCraft" => "ENHANCED_CRAFTING_TABLE",
      "NullRecipe" => "NULL",
      "GrindStone" => "GRIND_STONE",
      "MagicalFabricator" => "MAGICAL_FABRICATOR",
      "CoreFabricator" => "CORE_FABRICATOR",
      "TechMutation" => "TECH_MUTATION"
    }[kind]
    source_recipe_types[item["id"]] = RECIPE_TYPE_LABELS[type_key]
  end

  text.scan(/new\s+\w+\((.*?)\)(?:\.[^;]*)?\.register\((?:sup|plugin)\)/) do |body|
    args = split_top_level(body[0])
    item = args.map { |arg| resolve_token(arg, refs) }.compact.find { |entry| items[entry["id"]] }
    next unless item

    recipe_type = args.find { |arg| arg.include?("RecipeType.") }.to_s[/RecipeType\.([A-Z0-9_]+)/, 1]
    source_recipe_types[item["id"]] = RECIPE_TYPE_LABELS[recipe_type] if recipe_type
  end
end

items.each_value do |item|
  field_key = refs.key(item["id"])
  field = field_key.to_s.split(".").last
  recipe_key = "RECIPE_#{field}"

  recipe_body = recipe_arrays[recipe_key] || recipe_arrays["MACHINE_#{field}"]
  if recipe_body
    slots = parse_recipe_slots(recipe_body, refs)
    assign_recipe(item, slots, source_recipe_types[item["id"]] || recipe_type_for_item(item))
    next
  end

  custom_body = custom_core_recipes[recipe_key]
  if custom_body
    args = split_top_level(custom_body)
    materials = args[1..].to_a.map { |arg| arg[/Material\.([A-Z0-9_]+)/, 1] }.compact
    materials = [materials[0], materials[0], materials[0]] if materials.length == 1
    materials = [materials[0], materials[1], materials[0]] if materials.length == 2
    slots = materials.each_with_object([]) do |material, memo|
      3.times { memo << recipe_entry(material, MATERIAL_MAX_STACK.fetch(material, 64)) }
    end
    assign_recipe(item, slots, RECIPE_TYPE_LABELS["CORE_FABRICATOR"])
  end
end

java_files.grep(%r{/machine/multiblock/MultiBlock}).each do |path|
  text = read(path)
  text.scan(/super\(ItemGroups\.MACHINES_CATEGORY,\s*(\w+),\s*new\s+ItemStack\[\]\s*\{(.*?)\}\s*,/m) do |field, body|
    id = refs["#{class_name(path)}.#{field}"] || refs[field]
    next unless id && items[id] && items[id]["recipe"].nil?

    assign_recipe(items[id], parse_recipe_slots(body, refs), "多方块结构")
  end
end

def tier_recipe(previous_id, tier)
  component_id, center_id = TIER_COMPONENTS.fetch(tier)
  [
    recipe_entry(component_id), recipe_entry(previous_id), recipe_entry(component_id),
    recipe_entry(component_id), recipe_entry(center_id), recipe_entry(component_id),
    recipe_entry(component_id), recipe_entry(previous_id), recipe_entry(component_id)
  ]
end

items.each_value do |item|
  id = item["id"]
  next unless item["recipe"].nil?

  TIER_COMPONENTS.keys.each do |tier|
    suffix = "_#{tier}"
    next unless id.end_with?(suffix)

    previous_id =
      case tier
      when "MAGIC" then id.sub(/_MAGIC$/, "_THORNIUM")
      when "RARE" then id.sub(/_RARE$/, "_MAGIC")
      when "EPIC" then id.sub(/_EPIC$/, "_RARE")
      when "LEGENDARY" then id.sub(/_LEGENDARY$/, "_EPIC")
      when "SUPREME" then id.sub(/_SUPREME$/, "_LEGENDARY")
      end
    next unless items[previous_id]

    assign_recipe(item, tier_recipe(previous_id, tier), RECIPE_TYPE_LABELS["GEAR_FABRICATOR"])
    break
  end
end

java_files.each do |path|
  text = read(path)
  text.scan(/public\s+static\s+final\s+MobTechGeneric\s+(\w+)\s*=\s*new\s+MobTechGeneric\s*\((.*?)\);/m) do |_field, body|
    args = split_top_level(body)
    base_id = args[0][/"([^"]+)"/, 1]
    base_name = args[1][/"([^"]+)"/, 1]
    texture = args[2][/"([0-9a-fA-F]{32,128})"/, 1]
    mob_type = args[3].to_s[/MobTechType\.([A-Z0-9_]+)/, 1]
    next unless base_id && base_name && texture && mob_type

    tiers = mob_type == "SIMPLE" ? [0] : (1..9).to_a
    tiers.each do |tier|
      id = tier.zero? ? base_id : "#{base_id}_#{ROMAN[tier]}"
      name = tier.zero? ? base_name : "#{base_name} #{ROMAN[tier]}"
      recipe_type = "特殊获取"
      slots = nil

      if mob_type == "SIMPLE"
        slots = [recipe_entry("SUPREME_MOB_COLLECTOR_TOOL_I")]
      elsif mob_type.start_with?("ROBOTIC_") && tier == 1
        mob_material = base_id.include?("_BEE") ? "HONEYCOMB" : (base_id.include?("_GOLEM") ? "POPPY" : "ROTTEN_FLESH")
        rune = {
          "ROBOTIC_ACCELERATION" => "FIRE_RUNE",
          "ROBOTIC_CLONING" => "RAINBOW_RUNE",
          "ROBOTIC_EFFICIENCY" => "LIGHTNING_RUNE"
        }[mob_type]
        slots = [
          recipe_entry("PLASTIC_SHEET"), recipe_entry(rune), recipe_entry("PLASTIC_SHEET"),
          recipe_entry("PLASTIC_SHEET"), recipe_entry("ANDROID_MEMORY_CORE"), recipe_entry("PLASTIC_SHEET"),
          recipe_entry("SUPREME_SYNTHETIC_RUBY"), recipe_entry(mob_material), recipe_entry("SUPREME_SYNTHETIC_RUBY")
        ]
        recipe_type = RECIPE_TYPE_LABELS["ENHANCED_CRAFTING_TABLE"]
      elsif mob_type.start_with?("ROBOTIC_")
        slots = [recipe_entry("#{base_id}_#{ROMAN[tier - 1]}")]
        recipe_type = RECIPE_TYPE_LABELS["TECH_ROBOTIC"]
      elsif mob_type.start_with?("MUTATION_") && tier == 1
        mob_base = base_id.include?("_BEE") ? "SUPREME_SIMPLE_BEE" : (base_id.include?("_GOLEM") ? "SUPREME_SIMPLE_GOLEM" : "SUPREME_SIMPLE_ZOMBIE")
        gene = {
          "MUTATION_BERSERK" => "SUPREME_GENE_BERSERK",
          "MUTATION_INTELLIGENCE" => "SUPREME_GENE_INTELLIGENCE",
          "MUTATION_LUCK" => "SUPREME_GENE_LUCK"
        }[mob_type]
        slots = [recipe_entry(mob_base), recipe_entry(gene)]
        recipe_type = RECIPE_TYPE_LABELS["TECH_MUTATION"]
      elsif mob_type.start_with?("MUTATION_")
        previous = "#{base_id}_#{ROMAN[tier - 1]}"
        slots = [recipe_entry(previous), recipe_entry(previous)]
        recipe_type = RECIPE_TYPE_LABELS["TECH_MUTATION"]
      end

      item = {
        "id" => id,
        "name" => name,
        "englishName" => name,
        "addonName" => ADDON_NAME,
        "category" => "生物科技",
        "recipeType" => recipe_type,
        "icon" => "player_head",
        "headTexture" => texture.downcase,
        "recipe" => nil,
        "output" => 1,
        "sourceFile" => "Supreme/#{path.sub("#{SUPREME_SRC}/", "")}"
      }
      assign_recipe(item, slots, recipe_type) if slots
      items[id] = item
    end
  end
end

center_card = {
  1 => "SUPREME_CENTER_CARD_SIMPLE",
  2 => "SUPREME_CENTER_CARD_ADVANCED",
  3 => "SUPREME_CENTER_CARD_ULTIMATE"
}

java_files.grep(%r{/setup/Setup(SimpleCard|AdvancedCard)\.java}).each do |path|
  text = read(path).gsub(/\s+/, " ")
  text.scan(/TechGenerator\.preSetup\((.*?)\);/) do |match|
    args = split_top_level(match[0])
    args.shift
    tier = args.first.to_s[/\A\d+\z/] ? args.shift.to_i : 1
    card = resolve_token(args.shift, refs)
    next unless card && items[card["id"]]

    input1 = resolve_token(args.shift, refs)
    input2_or_output = resolve_token(args.shift, refs)
    output = resolve_token(args.shift, refs)
    input2 = output ? input2_or_output : input1
    next unless input1 && input2

    slots = [
      input1, input2, input1,
      input2, recipe_entry(center_card.fetch(tier.clamp(1, 3))), input2,
      input1, input2, input1
    ]
    assign_recipe(items[card["id"]], slots, RECIPE_TYPE_LABELS["ENHANCED_CRAFTING_TABLE"])
  end
end

java_files.grep(%r{/setup/SetupTechComponents\.java}).each do |path|
  text = read(path).gsub(/\s+/, " ")
  text.scan(/TechMutation\.addRecipeTechMutation\((.*?)\);/) do |match|
    args = split_top_level(match[0])
    inputs = args[0..1].map { |arg| resolve_token(arg, refs) }
    output = resolve_token(args.last, refs)
    next unless output && items[output["id"]] && inputs.all?

    assign_recipe(items[output["id"]], inputs, RECIPE_TYPE_LABELS["TECH_MUTATION"])
  end
end

data = JSON.parse(File.read(DATA_PATH))
existing_items = data.fetch("items", [])
data["items"] = existing_items.reject { |item| item["addonName"] == ADDON_NAME } +
                items.values.sort_by { |item| [item["category"].to_s, item["id"].to_s] }

known_ids = (data["items"] + data.fetch("vanillaItems", [])).map { |item| item["id"] }.to_set
vanilla_names = JSON.parse(File.read(File.join(ROOT, "data", "minecraft-zh_cn.json")))
vanilla_refs = items.values.flat_map { |item| Array(item["recipe"]).map { |entry| entry["id"] } }

vanilla_refs.each do |id|
  next if known_ids.include?(id)
  next if id.to_s.start_with?("SUPREME_")

  name = vanilla_names["item.minecraft.#{id.downcase}"] || vanilla_names["block.minecraft.#{id.downcase}"] || titleize_id(id)
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

data["meta"]["supremeSource"] = "Slimefun-Addon-Community/Supreme"
data["meta"]["supremeImportedItems"] = items.size
data["meta"]["supremeAddonName"] = ADDON_NAME

File.write(DATA_PATH, "#{JSON.pretty_generate(data)}\n")

missing_supreme_refs = items.values.flat_map { |item| Array(item["recipe"]).map { |entry| entry["id"] } }
  .select { |id| id.start_with?("SUPREME_") && !items.key?(id) && !known_ids.include?(id) }
  .uniq

puts "Imported #{items.size} Supreme items."
warn "Missing Supreme refs: #{missing_supreme_refs.join(", ")}" unless missing_supreme_refs.empty?
