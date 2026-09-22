export type Recipe = {
  slug: string; name: string; category: string; time: string;
  serves: number; spice: string; ingredients: string[]; steps: string[];
}

export const RECIPES: Recipe[] = [
  { slug: "masala-chai", name: "Masala Chai", category: "chai", time: "8 min", serves: 2, spice: "mild",
    ingredients: ["2 tsp strong Assam CTC", "2 cardamom pods, crushed", "1 cm ginger, crushed", "1 clove", "1 cup water", "3/4 cup milk"],
    steps: ["Boil water with the spices for 2 minutes", "Add tea, simmer 1 minute", "Add milk, bring to a boil, kill the heat", "Steep 1 minute, strain, sweeten, drink"] },
  { slug: "kadak-cutting", name: "Kadak Cutting Chai", category: "chai", time: "5 min", serves: 1, spice: "none",
    ingredients: ["1.5 tsp dust-grade tea", "3/4 cup water", "1/4 cup milk", "sugar, unapologetically"],
    steps: ["Everything in the pan at once", "Boil hard until it threatens to climb", "Strain into a small glass", "Drink standing up"] },
  { slug: "dal-tadka", name: "Dal Tadka", category: "dal", time: "35 min", serves: 4, spice: "medium",
    ingredients: ["1 cup toor dal", "2 tomatoes", "ghee 2 tbsp", "cumin, garlic, dried red chilli", "asafoetida", "coriander"],
    steps: ["Pressure cook dal with tomatoes and turmeric, 4 whistles", "Whisk smooth, salt, keep warm", "Fry cumin garlic chilli in ghee until garlic blonds", "Pour the sizzling tadka over the dal, cover, wait 2 minutes", "Finish with coriander"] },
  { slug: "dal-makhani", name: "Dal Makhani", category: "dal", time: "90 min", serves: 4, spice: "mild",
    ingredients: ["1 cup whole urad", "kidney beans, a handful", "butter, more than you think", "cream 2 tbsp", "kasuri methi"],
    steps: ["Soak overnight, pressure cook until soft", "Simmer low with tomato puree for an hour", "Butter, cream, crush the kasuri methi in your palm", "Rest 10 minutes before serving"] },
  { slug: "dal-fry-light", name: "Light Dal Fry", category: "dal", time: "25 min", serves: 3, spice: "mild",
    ingredients: ["3/4 cup moong dal", "onion, tomato", "mustard seeds", "curry leaves", "coconut oil"],
    steps: ["Cook moong dal soft but not mushy", "Temper mustard seeds and curry leaves in coconut oil", "Add onion, then tomato, then the dal", "Thin with hot water to your preferred texture"] },
]

export function findRecipe(slug: string) { return RECIPES.find((r) => r.slug === slug) ?? null }
