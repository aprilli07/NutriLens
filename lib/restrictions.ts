/**
 * Dietary restriction definitions.
 *
 * Ingredient terms are matched on whole words against normalized text (see lib/text.ts),
 * so "malt" does not match "maltodextrin" and "nut" does not match "nutmeg".
 * French terms are included because Canadian labels are bilingual.
 */
import type { RestrictionId } from './types';

export interface TermGroup {
  /** Shown to the user, e.g. "milk". */
  reason: string;
  terms: string[];
  /** Matches in this group are only a caution (e.g. oats for gluten-free). */
  cautionOnly?: boolean;
}

export interface RestrictionDef {
  id: RestrictionId;
  label: string;
  emoji: string;
  description: string;
  /** Bit used for the precomputed search filter masks. Never reorder. */
  bit: number;
  groups: TermGroup[];
  /** Open Food Facts allergen tags that mean the product contains the restricted item. */
  allergenTags: string[];
  /** Labels that claim the product is free of the restricted item. */
  freeFromLabels: string[];
  /** Per-100 g thresholds for nutrient-based restrictions (UK FSA traffic-light values). */
  nutrient?: { key: 'sugars' | 'salt'; caution: number; avoid: number; reason: string };
}

const MILK: TermGroup = {
  reason: 'milk',
  terms: [
    'milk', 'milks', 'cream', 'butter', 'buttermilk', 'cheese', 'cheeses', 'yogurt', 'yoghurt', 'whey',
    'casein', 'caseinate', 'caseinates', 'sodium caseinate', 'calcium caseinate', 'lactose', 'ghee', 'curd',
    'curds', 'kefir', 'lactalbumin', 'lactoglobulin', 'milkfat', 'milk fat', 'milk solids', 'skim milk',
    'skimmed milk', 'paneer', 'ricotta', 'mozzarella', 'parmesan', 'cheddar', 'custard', 'quark',
    'dairy', 'milk powder', 'lait', 'creme', 'beurre', 'fromage', 'lactoserum', 'babeurre', 'yaourt', 'lactosérum',
    // de / nl / es / it
    'milch', 'vollmilch', 'magermilch', 'sahne', 'kase', 'molke', 'melk', 'kaas', 'leche', 'queso', 'nata', 'latte', 'formaggio', 'panna',
  ],
};

const EGG: TermGroup = {
  reason: 'egg',
  terms: [
    'egg', 'eggs', 'egg white', 'egg whites', 'egg yolk', 'egg yolks', 'albumen', 'ovalbumin', 'lysozyme',
    'mayonnaise', 'meringue', 'oeuf', 'oeufs', 'blanc d oeuf', 'jaune d oeuf',
    'eier', 'vollei', 'eigelb', 'eiwit', 'eieren', 'huevo', 'huevos', 'uovo', 'uova',
  ],
};

const MEAT_FISH: TermGroup = {
  reason: 'meat or fish',
  terms: [
    'meat', 'meats', 'animal rennet', 'beef', 'pork', 'chicken', 'turkey', 'lamb', 'mutton', 'veal', 'ham', 'bacon', 'sausage',
    'pepperoni', 'salami', 'chorizo', 'prosciutto', 'pancetta', 'jerky', 'meatball', 'meatballs', 'bison', 'duck', 'goose', 'venison', 'gelatin', 'gelatine', 'lard', 'tallow', 'suet',
    'collagen', 'bone broth', 'chicken broth', 'beef broth', 'chicken stock', 'beef stock', 'anchovy',
    'anchovies', 'fish', 'tuna', 'salmon', 'cod', 'sardine', 'sardines', 'mackerel', 'shrimp', 'shrimps',
    'prawn', 'prawns', 'tilapia', 'pollock', 'pollack', 'swordfish', 'herring', 'haddock', 'halibut', 'trout',
    'catfish', 'carp', 'snapper', 'mahi mahi', 'sole', 'flounder', 'perch', 'pike', 'eel', 'roe', 'caviar', 'surimi',
    'krill', 'scallop', 'scallops', 'octopus', 'cuttlefish', 'calamari', 'crab', 'lobster', 'shellfish', 'oyster', 'oysters', 'clam', 'clams', 'mussel',
    'mussels', 'squid', 'fish sauce', 'oyster sauce', 'isinglass', 'boeuf', 'porc', 'poulet', 'dinde',
    'jambon', 'viande', 'poisson', 'thon', 'saumon', 'crevette', 'crevettes', 'gelatine de porc',
    'schweinefleisch', 'rindfleisch', 'hahnchen', 'fisch', 'speck', 'varkensvlees', 'rundvlees', 'kip', 'cerdo', 'pollo',
    'pescado', 'atun', 'gelatina', 'maiale', 'manzo', 'pesce', 'tonno', 'prosciutto',
  ],
};

/** Insect-derived ingredients: avoided by vegans and most vegetarians. */
const INSECT: TermGroup = {
  reason: 'insect-derived ingredient',
  terms: ['carmine', 'cochineal', 'shellac', 'confectioner s glaze', 'e120'],
};

const OTHER_ANIMAL: TermGroup = {
  reason: 'animal product',
  terms: ['honey', 'beeswax', 'lanolin', 'royal jelly', 'propolis', 'miel', 'cire d abeille'],
};

const GLUTEN: TermGroup = {
  reason: 'gluten',
  terms: [
    'wheat', 'barley', 'rye', 'spelt', 'kamut', 'triticale', 'farro', 'durum', 'semolina', 'couscous',
    'bulgur', 'seitan', 'malt', 'malt extract', 'malt vinegar', 'malted barley', 'gluten', 'wheat gluten',
    'graham', 'einkorn', 'emmer', 'freekeh', 'farina', 'flour', 'enriched flour', 'breadcrumbs',
    'bread crumbs', 'brewer s yeast', 'ble', 'orge', 'seigle', 'epeautre', 'farine',
    'weizen', 'weizenmehl', 'gerste', 'roggen', 'dinkel', 'tarwe', 'tarwebloem', 'gerst', 'rogge', 'trigo', 'cebada', 'centeno',
    'frumento', 'orzo', 'segale', 'farro',
  ],
};

const OATS: TermGroup = { reason: 'oats (often cross-contaminated)', terms: ['oat', 'oats', 'oatmeal', 'avoine'], cautionOnly: true };

const TREE_NUTS: TermGroup = {
  reason: 'tree nuts',
  terms: [
    'nut', 'nuts', 'tree nuts', 'almond', 'almonds', 'cashew', 'cashews', 'hazelnut', 'hazelnuts',
    'filbert', 'filberts', 'walnut', 'walnuts', 'pecan', 'pecans', 'pistachio', 'pistachios', 'macadamia',
    'brazil nut', 'brazil nuts', 'pine nut', 'pine nuts', 'chestnut', 'chestnuts', 'praline', 'marzipan', 'gianduja', 'amande',
    'amandes', 'noisette', 'noisettes', 'noix', 'pistache', 'pistaches', 'cajou',
    'haselnuss', 'haselnusse', 'mandel', 'mandeln', 'walnusse', 'hazelnoot', 'hazelnoten', 'amandel', 'amandelen', 'almendra',
    'almendras', 'avellana', 'avellanas', 'nocciola', 'nocciole', 'mandorla', 'mandorle',
  ],
};

const PEANUT: TermGroup = {
  reason: 'peanuts',
  terms: ['peanut', 'peanuts', 'groundnut', 'groundnuts', 'arachis', 'monkey nuts', 'arachide', 'arachides', 'cacahuete', 'cacahuetes', 'erdnuss', 'erdnusse', 'pinda', 'pindas', 'arachidi'],
};

const SOY: TermGroup = {
  reason: 'soy',
  terms: [
    'soy', 'soya', 'soybean', 'soybeans', 'soy lecithin', 'soya lecithin', 'tofu', 'edamame', 'tempeh',
    'miso', 'tamari', 'shoyu', 'soja',
  ],
};

export const RESTRICTIONS: RestrictionDef[] = [
  {
    id: 'vegan', label: 'Vegan', emoji: '🌱', bit: 0,
    description: 'No animal products: meat, fish, dairy, eggs or honey.',
    groups: [MEAT_FISH, MILK, EGG, INSECT, OTHER_ANIMAL],
    allergenTags: ['en:milk', 'en:eggs', 'en:fish', 'en:crustaceans', 'en:molluscs'],
    freeFromLabels: ['en:vegan'],
  },
  {
    id: 'vegetarian', label: 'Vegetarian', emoji: '🥬', bit: 1,
    description: 'No meat, fish or insect-derived colours. Dairy and eggs are fine.',
    groups: [MEAT_FISH, INSECT],
    allergenTags: ['en:fish', 'en:crustaceans', 'en:molluscs'],
    freeFromLabels: ['en:vegetarian', 'en:vegan'],
  },
  {
    id: 'glutenFree', label: 'Gluten-free', emoji: '🌾', bit: 2,
    description: 'No wheat, barley, rye or other gluten grains.',
    groups: [GLUTEN, OATS],
    allergenTags: ['en:gluten'],
    freeFromLabels: ['en:gluten-free', 'en:no-gluten', 'en:certified-gluten-free'],
  },
  {
    id: 'dairyFree', label: 'Dairy-free', emoji: '🥛', bit: 3,
    description: 'No milk or anything made from milk.',
    groups: [MILK],
    allergenTags: ['en:milk'],
    freeFromLabels: ['en:no-milk', 'en:dairy-free', 'en:no-dairy', 'en:vegan'],
  },
  {
    id: 'eggFree', label: 'Egg-free', emoji: '🥚', bit: 4,
    description: 'No eggs or egg ingredients.',
    groups: [EGG],
    allergenTags: ['en:eggs'],
    freeFromLabels: ['en:no-eggs', 'en:egg-free', 'en:vegan'],
  },
  {
    id: 'nutFree', label: 'Tree-nut-free', emoji: '🌰', bit: 5,
    description: 'No almonds, cashews, hazelnuts, walnuts or other tree nuts.',
    groups: [TREE_NUTS],
    allergenTags: ['en:nuts'],
    freeFromLabels: ['en:nut-free', 'en:no-nuts'],
  },
  {
    id: 'peanutFree', label: 'Peanut-free', emoji: '🥜', bit: 6,
    description: 'No peanuts or peanut ingredients.',
    groups: [PEANUT],
    allergenTags: ['en:peanuts'],
    freeFromLabels: ['en:peanut-free', 'en:no-peanuts'],
  },
  {
    id: 'soyFree', label: 'Soy-free', emoji: '🫘', bit: 7,
    description: 'No soy, soybeans, tofu or soy lecithin.',
    groups: [SOY],
    allergenTags: ['en:soybeans'],
    freeFromLabels: ['en:soy-free', 'en:no-soy'],
  },
  {
    id: 'lowSugar', label: 'Low sugar', emoji: '🍬', bit: 8,
    description: 'Flags foods with more than 22.5 g sugar per 100 g.',
    groups: [], allergenTags: [], freeFromLabels: ['en:no-added-sugar', 'en:sugar-free'],
    nutrient: { key: 'sugars', caution: 5, avoid: 22.5, reason: 'high sugar' },
  },
  {
    id: 'lowSodium', label: 'Low salt', emoji: '🧂', bit: 9,
    description: 'Flags foods with more than 1.5 g salt per 100 g.',
    groups: [], allergenTags: [], freeFromLabels: ['en:low-salt', 'en:no-salt'],
    nutrient: { key: 'salt', caution: 0.3, avoid: 1.5, reason: 'high salt' },
  },
];

export const RESTRICTION_IDS = RESTRICTIONS.map((r) => r.id);

const BY_ID = new Map(RESTRICTIONS.map((r) => [r.id, r]));

export function getRestriction(id: string): RestrictionDef | undefined {
  return BY_ID.get(id as RestrictionId);
}

export function isRestrictionId(id: unknown): id is RestrictionId {
  return typeof id === 'string' && BY_ID.has(id as RestrictionId);
}

/** Bitmask for a set of restrictions (used by the search filter). */
export function restrictionMask(ids: RestrictionId[]): number {
  return ids.reduce((mask, id) => mask | (1 << BY_ID.get(id)!.bit), 0);
}

/**
 * Phrases where one word looks restricted but is not, as [phrase, word to ignore].
 * Only that word is blanked, so "peanut butter" still matches "peanut" but not "butter".
 */
export const FALSE_FRIENDS: Array<[string, string]> = [
  // dairy look-alikes
  ['coconut milk', 'milk'], ['coconut cream', 'cream'], ['almond milk', 'milk'], ['oat milk', 'milk'],
  ['soy milk', 'milk'], ['soya milk', 'milk'], ['rice milk', 'milk'], ['cashew milk', 'milk'],
  ['cocoa butter', 'butter'], ['shea butter', 'butter'], ['peanut butter', 'butter'], ['nut butter', 'butter'],
  ['almond butter', 'butter'], ['cashew butter', 'butter'], ['apple butter', 'butter'], ['sunflower butter', 'butter'],
  ['seed butter', 'butter'], ['butter beans', 'butter'], ['cream of tartar', 'cream'], ['creme de tartre', 'creme'],
  ['beurre de cacao', 'beurre'], ['lait de coco', 'lait'], ['creme de coco', 'creme'], ['milk thistle', 'milk'],
  // egg look-alikes
  ['egg plant', 'egg'],
  // nut look-alikes
  ['noix de coco', 'noix'], ['noix de muscade', 'noix'], ['water chestnut', 'chestnut'], ['water chestnuts', 'chestnuts'],
  ['shea nut', 'nut'], ['cola nut', 'nut'], ['kola nut', 'nut'],
  // gluten look-alikes
  ['ble noir', 'ble'], ['rice flour', 'flour'], ['corn flour', 'flour'], ['maize flour', 'flour'],
  ['almond flour', 'flour'], ['coconut flour', 'flour'], ['tapioca flour', 'flour'], ['potato flour', 'flour'],
  ['chickpea flour', 'flour'], ['soy flour', 'flour'], ['soya flour', 'flour'], ['cassava flour', 'flour'],
  ['sorghum flour', 'flour'], ['millet flour', 'flour'], ['quinoa flour', 'flour'], ['bean flour', 'flour'],
  ['lentil flour', 'flour'], ['pea flour', 'flour'], ['rice malt', 'malt'], ['corn malt', 'malt'],
  ['farine de riz', 'farine'], ['farine de mais', 'farine'], ['gluten free oats', 'oats'], ['gluten free oat', 'oat'],
  // meat/fish look-alikes
  ['imitation bacon', 'bacon'], ['vegetable broth', 'broth'],
  ['nata de coco', 'nata'],
];
