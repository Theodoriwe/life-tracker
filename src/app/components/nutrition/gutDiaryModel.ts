export interface DiaryFood {
  id: string;
  name: string;
  ingredients: string[];
  source?: "starter" | "custom" | "openfoodfacts";
  sourceUrl?: string;
  ingredientsConfirmed?: boolean;
}
export interface FavoriteFood extends DiaryFood { categoryId: string | null }
export interface FoodExposure {
  id: string;
  eatenAt: string;
  foods: DiaryFood[];
  outcome: "unknown" | "well" | "symptoms";
}
export interface DigestiveEpisode {
  id: string;
  occurredAt: string;
  symptoms: string[];
  intensity: number;
  stoolType: number | null;
  mealIds: string[];
  note: string;
}
export interface GutDiaryData {
  meals: FoodExposure[];
  episodes: DigestiveEpisode[];
  favorites: FavoriteFood[];
  categories: { id: string; name: string }[];
}
export const EMPTY_GUT_DIARY: GutDiaryData = { meals: [], episodes: [], favorites: [], categories: [] };
export const normalizeFood = (value: string) => value.trim().toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/\s+/g, " ");
export const BRISTOL = [
  "Отдельные твёрдые комочки", "Плотный, комковатый", "Оформленный, с трещинами",
  "Гладкий и мягкий", "Мягкие кусочки с чёткими краями", "Кашицеобразный, рыхлые кусочки", "Водянистый, без твёрдых частиц",
];
const starter = (name: string, ingredients: string[]): DiaryFood => ({ id: `starter:${name}`, name, ingredients, source: "starter", ingredientsConfirmed: false });
// Recipe suggestions only. Actual recipes must be confirmed by the user.
export const STARTER_FOODS = [
  starter("Капучино", ["кофе", "молоко"]), starter("Латте", ["кофе", "молоко"]), starter("Американо", ["кофе"]),
  starter("Борщ", ["свёкла", "капуста", "картофель", "морковь", "лук", "мясо"]),
  starter("Овсяная каша на молоке", ["овсянка", "молоко"]), starter("Овсяная каша на воде", ["овсянка"]),
  starter("Омлет", ["яйца", "молоко"]), starter("Яичница", ["яйца"]), starter("Сырники", ["творог", "яйца", "пшеничная мука"]),
  starter("Паста карбонара", ["пшеница", "яйца", "сыр", "бекон"]), starter("Пицца", ["пшеничная мука", "сыр", "томаты"]),
  starter("Гречка", ["гречка"]), starter("Рис", ["рис"]), starter("Курица", ["курица"]),
  starter("Йогурт", ["молоко"]), starter("Кефир", ["молоко"]), starter("Творог", ["молоко"]),
  starter("Банан", ["банан"]), starter("Яблоко", ["яблоко"]), starter("Хлеб", ["пшеничная мука"]),
  starter("Салат из овощей", ["огурцы", "томаты"]), starter("Чай", ["чай"]), starter("Молоко", ["молоко"]),
];
export interface FoodPattern { name: string; total: number; assessed: number; affected: number; unknown: number; level: "few" | "frequent" | "sometimes" | "rare"; companions: string[] }
export function analyzeFoodPatterns(data: GutDiaryData, ingredients = false): FoodPattern[] {
  const groups = new Map<string, { name: string; meals: FoodExposure[] }>();
  for (const meal of data.meals) {
    const names = ingredients ? meal.foods.filter(food => food.ingredientsConfirmed).flatMap(food => food.ingredients) : meal.foods.map(food => food.name);
    for (const key of new Set(names.map(normalizeFood).filter(Boolean))) {
      const group = groups.get(key) ?? { name: names.find(name => normalizeFood(name) === key)!, meals: [] };
      group.meals.push(meal); groups.set(key, group);
    }
  }
  return [...groups.values()].map(({ name, meals }) => {
    const linked = new Set(data.episodes.filter(episode => episode.symptoms.length > 0).flatMap(episode => episode.mealIds));
    const assessed = meals.filter(meal => meal.outcome !== "unknown" || linked.has(meal.id));
    const affected = assessed.filter(meal => meal.outcome === "symptoms" || linked.has(meal.id));
    const rate = assessed.length ? affected.length / assessed.length : 0;
    // Descriptive frequency bands, not medically validated risk thresholds.
    const level: FoodPattern["level"] = assessed.length < 5 ? "few" : rate >= .65 ? "frequent" : rate >= .25 ? "sometimes" : "rare";
    const companions = ingredients ? [...new Set(meals.flatMap(meal => meal.foods.map(food => food.name)))] : [];
    return { name, total: meals.length, assessed: assessed.length, affected: affected.length, unknown: meals.length - assessed.length, level, companions };
  }).sort((a, b) => b.affected / Math.max(b.assessed, 1) - a.affected / Math.max(a.assessed, 1) || b.assessed - a.assessed);
}
