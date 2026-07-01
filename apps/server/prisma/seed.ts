import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"),
});

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DEMO_EMAIL = "demo@mise.app";
const DEMO_PASSWORD = "password";

type SeedRecipe = {
  key: string;
  name: string;
  description: string;
  image: string[];
  authorName: string;
  datePublished: string;
  prepTime: string;
  cookTime: string;
  totalTime: string;
  recipeYield: string;
  recipeCategory: string;
  recipeCuisine: string;
  keywords: string[];
  suitableForDiet?: string[];
  recipeIngredient: string[];
  recipeInstructions: { "@type": "HowToStep"; text: string }[];
  nutrition?: Record<string, string>;
  ratingValue?: number;
  ratingCount?: number;
};

const recipes: SeedRecipe[] = [
  {
    key: "rec_001",
    name: "Charred Lemon Chicken with Herbed Couscous",
    description:
      "Bright, weeknight-friendly chicken thighs finished under the broiler with caramelized lemon and a fluffy herb couscous.",
    image: ["https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=1200&q=80"],
    authorName: "Ava Marlow",
    datePublished: "2026-04-12",
    prepTime: "PT15M",
    cookTime: "PT30M",
    totalTime: "PT45M",
    recipeYield: "4 servings",
    recipeCategory: "Main Course",
    recipeCuisine: "Mediterranean",
    keywords: ["chicken", "weeknight", "one-pan"],
    suitableForDiet: ["https://schema.org/LowLactoseDiet"],
    recipeIngredient: [
      "4 bone-in chicken thighs",
      "2 lemons, halved",
      "3 tbsp olive oil",
      "1 cup couscous",
      "1 1/2 cups chicken stock",
      "1/2 cup parsley, chopped",
      "2 cloves garlic",
      "Salt and pepper to taste",
    ],
    recipeInstructions: [
      { "@type": "HowToStep", text: "Heat oven to 425°F. Pat chicken dry, season generously." },
      { "@type": "HowToStep", text: "Sear chicken skin-side down until deeply golden, ~8 minutes." },
      { "@type": "HowToStep", text: "Add lemons cut-side down, roast 18 minutes." },
      { "@type": "HowToStep", text: "Pour boiling stock over couscous, fluff with parsley and garlic." },
      { "@type": "HowToStep", text: "Squeeze charred lemons over chicken; serve over couscous." },
    ],
    nutrition: {
      calories: "520 kcal",
      proteinContent: "38 g",
      carbohydrateContent: "42 g",
      fatContent: "22 g",
    },
    ratingValue: 4.8,
    ratingCount: 124,
  },
  {
    key: "rec_002",
    name: "Miso Mushroom Ramen",
    description:
      "A deeply savory, vegetarian ramen with a five-minute miso tare and seared maitake mushrooms.",
    image: ["https://images.unsplash.com/photo-1623341214825-9f4f963727da?w=1200&q=80"],
    authorName: "Theo Marlow",
    datePublished: "2026-03-04",
    prepTime: "PT10M",
    cookTime: "PT20M",
    totalTime: "PT30M",
    recipeYield: "2 servings",
    recipeCategory: "Soup",
    recipeCuisine: "Japanese",
    keywords: ["vegetarian", "ramen", "comfort"],
    suitableForDiet: ["https://schema.org/VegetarianDiet"],
    recipeIngredient: [
      "2 portions fresh ramen noodles",
      "200 g maitake mushrooms",
      "3 tbsp white miso paste",
      "1 tbsp tahini",
      "4 cups vegetable stock",
      "2 soft-boiled eggs",
      "2 scallions, sliced",
      "1 sheet nori",
    ],
    recipeInstructions: [
      { "@type": "HowToStep", text: "Whisk miso and tahini in serving bowls." },
      { "@type": "HowToStep", text: "Sear mushrooms in a dry pan until crisp at the edges." },
      { "@type": "HowToStep", text: "Ladle a splash of stock into the tare and whisk smooth." },
      { "@type": "HowToStep", text: "Cook noodles 2 minutes; divide into bowls, pour over stock." },
      { "@type": "HowToStep", text: "Top with mushrooms, eggs, scallions, nori." },
    ],
    nutrition: { calories: "480 kcal", proteinContent: "21 g" },
    ratingValue: 4.9,
    ratingCount: 86,
  },
  {
    key: "rec_003",
    name: "Slow-Roasted Tomato Pappardelle",
    description:
      "Tomatoes confited low and slow until jammy, tossed with wide ribbons of pasta and basil.",
    image: ["https://images.unsplash.com/photo-1611270629569-8b357cb88da9?w=1200&q=80"],
    authorName: "Ava Marlow",
    datePublished: "2026-05-22",
    prepTime: "PT10M",
    cookTime: "PT90M",
    totalTime: "PT1H40M",
    recipeYield: "4 servings",
    recipeCategory: "Pasta",
    recipeCuisine: "Italian",
    keywords: ["vegetarian", "pasta", "summer"],
    suitableForDiet: ["https://schema.org/VegetarianDiet"],
    recipeIngredient: [
      "1 kg cherry tomatoes",
      "1/2 cup olive oil",
      "6 cloves garlic",
      "400 g pappardelle",
      "1 bunch basil",
      "100 g parmesan, grated",
      "Flaky salt",
    ],
    recipeInstructions: [
      { "@type": "HowToStep", text: "Heat oven to 275°F. Combine tomatoes, oil, garlic; roast 90 minutes." },
      { "@type": "HowToStep", text: "Cook pasta to al dente, reserve 1 cup water." },
      { "@type": "HowToStep", text: "Toss pasta with tomatoes, splash of water, basil, parmesan." },
    ],
    ratingValue: 4.7,
    ratingCount: 212,
  },
  {
    key: "rec_004",
    name: "Buttermilk Pancakes with Brown Butter",
    description: "Tall, tangy buttermilk pancakes finished with nutty brown butter and maple.",
    image: ["https://images.unsplash.com/photo-1528207776546-365bb710ee93?w=1200&q=80"],
    authorName: "Sasha Lin",
    datePublished: "2026-01-18",
    prepTime: "PT10M",
    cookTime: "PT15M",
    totalTime: "PT25M",
    recipeYield: "4 servings",
    recipeCategory: "Breakfast",
    recipeCuisine: "American",
    keywords: ["breakfast", "weekend"],
    recipeIngredient: [
      "2 cups flour",
      "2 tbsp sugar",
      "2 tsp baking powder",
      "1 tsp baking soda",
      "2 cups buttermilk",
      "2 eggs",
      "4 tbsp butter, browned",
      "Maple syrup, to serve",
    ],
    recipeInstructions: [
      { "@type": "HowToStep", text: "Whisk dry; whisk wet; combine just until streaky." },
      { "@type": "HowToStep", text: "Cook 1/4 cup portions on a medium griddle, flipping when bubbles set." },
      { "@type": "HowToStep", text: "Drizzle with brown butter and maple." },
    ],
    ratingValue: 4.9,
    ratingCount: 410,
  },
  {
    key: "rec_005",
    name: "Crispy Chickpea & Kale Bowl",
    description: "A weeknight grain bowl with crackly chickpeas, massaged kale, and lemon-tahini.",
    image: ["https://images.unsplash.com/photo-1543339308-43e59d6b73a6?w=1200&q=80"],
    authorName: "Theo Marlow",
    datePublished: "2026-02-09",
    prepTime: "PT10M",
    cookTime: "PT20M",
    totalTime: "PT30M",
    recipeYield: "2 servings",
    recipeCategory: "Bowl",
    recipeCuisine: "Modern",
    keywords: ["vegan", "lunch", "meal-prep"],
    suitableForDiet: ["https://schema.org/VeganDiet"],
    recipeIngredient: [
      "1 can chickpeas, drained",
      "2 tbsp olive oil",
      "1 bunch lacinato kale",
      "1 cup cooked farro",
      "3 tbsp tahini",
      "1 lemon",
      "1 tsp smoked paprika",
    ],
    recipeInstructions: [
      { "@type": "HowToStep", text: "Roast chickpeas with oil and paprika at 425°F for 20 minutes." },
      { "@type": "HowToStep", text: "Massage kale with lemon juice and salt." },
      { "@type": "HowToStep", text: "Whisk tahini with lemon and water; assemble bowls." },
    ],
    ratingValue: 4.6,
    ratingCount: 92,
  },
  {
    key: "rec_006",
    name: "Brown Butter Chocolate Chip Cookies",
    description: "Crisp edges, fudgy centers, deep toffee notes from browned butter.",
    image: ["https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=1200&q=80"],
    authorName: "Ava Marlow",
    datePublished: "2026-05-30",
    prepTime: "PT20M",
    cookTime: "PT12M",
    totalTime: "PT32M",
    recipeYield: "18 cookies",
    recipeCategory: "Dessert",
    recipeCuisine: "American",
    keywords: ["dessert", "baking"],
    recipeIngredient: [
      "1 cup butter, browned",
      "1 cup brown sugar",
      "1/2 cup white sugar",
      "2 eggs",
      "2 1/4 cups flour",
      "1 tsp baking soda",
      "300 g dark chocolate, chopped",
      "Flaky salt",
    ],
    recipeInstructions: [
      { "@type": "HowToStep", text: "Brown butter, cool 10 minutes; whisk with sugars and eggs." },
      { "@type": "HowToStep", text: "Fold in dry ingredients and chocolate. Rest 30 minutes." },
      { "@type": "HowToStep", text: "Scoop and bake at 375°F for 11–13 minutes; finish with flaky salt." },
    ],
    ratingValue: 4.95,
    ratingCount: 1240,
  },
];

const pantry = [
  { name: "Olive oil", category: "Oils", quantityValue: 750, quantityUnit: "ml", location: "Pantry" as const },
  { name: "Cherry tomatoes", category: "Produce", quantityValue: 500, quantityUnit: "g", expires: "2026-07-04", location: "Fridge" as const },
  { name: "Pappardelle", category: "Pasta & Grains", quantityValue: 2, quantityUnit: "boxes", location: "Pantry" as const },
  { name: "White miso", category: "Condiments", quantityValue: 1, quantityUnit: "tub", expires: "2026-12-01", location: "Fridge" as const },
  { name: "Eggs", category: "Dairy", quantityValue: 8, quantityUnit: "ct", expires: "2026-07-08", location: "Fridge" as const },
  { name: "Maitake mushrooms", category: "Produce", quantityValue: 200, quantityUnit: "g", expires: "2026-07-02", location: "Fridge" as const },
  { name: "Flour", category: "Baking", quantityValue: 2, quantityUnit: "kg", location: "Pantry" as const },
  { name: "Dark chocolate", category: "Baking", quantityValue: 300, quantityUnit: "g", location: "Pantry" as const },
  { name: "Lemons", category: "Produce", quantityValue: 4, quantityUnit: "ct", expires: "2026-07-10", location: "Fridge" as const },
  { name: "Buttermilk", category: "Dairy", quantityValue: 1, quantityUnit: "L", expires: "2026-07-05", location: "Fridge" as const },
];

const shopping = [
  { name: "Bone-in chicken thighs", quantity: "4 pcs", category: "Meat", checked: false, recipeKey: "rec_001" },
  { name: "Lemons", quantity: "6", category: "Produce", checked: false, recipeKey: "rec_001" },
  { name: "Parsley", quantity: "1 bunch", category: "Produce", checked: true, recipeKey: "rec_001" },
  { name: "Couscous", quantity: "500 g", category: "Pantry", checked: false, recipeKey: "rec_001" },
  { name: "Ramen noodles", quantity: "2 portions", category: "Pantry", checked: false, recipeKey: "rec_002" },
  { name: "Nori sheets", quantity: "1 pack", category: "Pantry", checked: false, recipeKey: "rec_002" },
  { name: "Vegetable stock", quantity: "1 L", category: "Pantry", checked: true, recipeKey: "rec_002" },
  { name: "Lacinato kale", quantity: "1 bunch", category: "Produce", checked: false, recipeKey: "rec_005" },
  { name: "Farro", quantity: "500 g", category: "Pantry", checked: false, recipeKey: "rec_005" },
  { name: "Tahini", quantity: "1 jar", category: "Condiments", checked: false, recipeKey: "rec_005" },
  { name: "Parmesan", quantity: "200 g", category: "Dairy", checked: false, recipeKey: "rec_003" },
  { name: "Basil", quantity: "1 bunch", category: "Produce", checked: false, recipeKey: "rec_003" },
];

const dateOffset = (d: number) => {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().slice(0, 10);
};

const mealPlan = [
  { date: dateOffset(0), mealType: "Breakfast" as const, recipeKey: "rec_004", servings: 4, assignee: "ava" },
  { date: dateOffset(0), mealType: "Dinner" as const, recipeKey: "rec_001", servings: 4, assignee: "theo" },
  { date: dateOffset(1), mealType: "Lunch" as const, recipeKey: "rec_005", servings: 2, assignee: "sasha" },
  { date: dateOffset(1), mealType: "Dinner" as const, recipeKey: "rec_002", servings: 2, assignee: "ava" },
  { date: dateOffset(2), mealType: "Dinner" as const, recipeKey: "rec_003", servings: 4, assignee: "theo" },
  { date: dateOffset(3), mealType: "Dinner" as const, recipeKey: "rec_001", servings: 4, assignee: "ava" },
  { date: dateOffset(4), mealType: "Breakfast" as const, recipeKey: "rec_004", servings: 2, assignee: "sasha" },
  { date: dateOffset(6), mealType: "Dinner" as const, recipeKey: "rec_005", servings: 4, assignee: "theo" },
];

async function main() {
  // Idempotent: wipe any previous demo data (household cascade removes recipes,
  // meals, shopping, pantry, members, invitations), then recreate.
  const previous = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
    include: { memberships: true },
  });
  if (previous) {
    await prisma.household.deleteMany({
      where: { id: { in: previous.memberships.map((m) => m.householdId) } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [DEMO_EMAIL, "theo@mise.app", "sasha@mise.app"] } },
    });
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const ava = await prisma.user.create({
    data: { email: DEMO_EMAIL, displayName: "Ava Marlow", passwordHash, avatarColor: "oklch(0.62 0.16 42)" },
  });
  const theo = await prisma.user.create({
    data: { email: "theo@mise.app", displayName: "Theo Marlow", passwordHash, avatarColor: "oklch(0.55 0.12 200)" },
  });
  const sasha = await prisma.user.create({
    data: { email: "sasha@mise.app", displayName: "Sasha Lin", passwordHash, avatarColor: "oklch(0.58 0.14 140)" },
  });
  const userIds: Record<string, string> = { ava: ava.id, theo: theo.id, sasha: sasha.id };

  const household = await prisma.household.create({
    data: {
      name: "The Marlow Kitchen",
      createdById: ava.id,
      members: {
        create: [
          { userId: ava.id, role: "Owner" },
          { userId: theo.id, role: "Admin" },
          { userId: sasha.id, role: "Member" },
        ],
      },
      invitations: { create: [{ email: "noah@marlow.co" }] },
    },
  });

  const recipeIdByKey: Record<string, string> = {};
  for (const r of recipes) {
    const created = await prisma.recipe.create({
      data: {
        householdId: household.id,
        createdById: ava.id,
        name: r.name,
        description: r.description,
        image: r.image,
        authorName: r.authorName,
        datePublished: r.datePublished,
        prepTime: r.prepTime,
        cookTime: r.cookTime,
        totalTime: r.totalTime,
        recipeYield: r.recipeYield,
        recipeCategory: r.recipeCategory,
        recipeCuisine: r.recipeCuisine,
        keywords: r.keywords,
        suitableForDiet: r.suitableForDiet ?? [],
        recipeIngredient: r.recipeIngredient,
        recipeInstructions: r.recipeInstructions,
        nutrition: r.nutrition
          ? { "@type": "NutritionInformation", ...r.nutrition }
          : undefined,
        ratingValue: r.ratingValue ?? null,
        ratingCount: r.ratingCount ?? null,
      },
    });
    recipeIdByKey[r.key] = created.id;
  }

  await prisma.pantryItem.createMany({
    data: pantry.map((p) => ({ ...p, householdId: household.id })),
  });

  await prisma.shoppingItem.createMany({
    data: shopping.map((s) => ({
      householdId: household.id,
      name: s.name,
      quantity: s.quantity,
      category: s.category,
      checked: s.checked,
      fromRecipeId: recipeIdByKey[s.recipeKey] ?? null,
    })),
  });

  await prisma.plannedMeal.createMany({
    data: mealPlan.map((m) => ({
      householdId: household.id,
      date: m.date,
      mealType: m.mealType,
      recipeId: recipeIdByKey[m.recipeKey] ?? null,
      servings: m.servings,
      assigneeId: userIds[m.assignee] ?? null,
    })),
  });

  console.log(`Seeded household "${household.name}" with ${recipes.length} recipes.`);
  console.log(`Demo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
