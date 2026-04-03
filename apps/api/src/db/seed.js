import 'dotenv/config'
import pg from 'pg'
import bcrypt from 'bcryptjs'

const { Pool } = pg

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const DEMO_USER = {
  email: 'demo@feast.app',
  password: 'password123',
  display_name: 'Feast Demo',
  username: 'demo',
}

const SYSTEM_TAGS = [
  'breakfast', 'lunch', 'dinner', 'snack', 'dessert',
  'vegetarian', 'vegan', 'gluten-free', 'dairy-free',
  'quick', 'meal-prep', 'one-pot', 'under-30-mins',
  'healthy', 'comfort-food', 'spicy', 'kid-friendly',
]

// 52 core ingredients with canonical names and aliases
const CORE_INGREDIENTS = [
  // Pantry staples
  { name: 'all-purpose flour',    aliases: ['plain flour', 'ap flour', 'white flour'] },
  { name: 'bread flour',          aliases: ['strong flour'] },
  { name: 'whole wheat flour',    aliases: ['wholemeal flour', 'whole grain flour'] },
  { name: 'granulated sugar',     aliases: ['white sugar', 'sugar'] },
  { name: 'brown sugar',          aliases: ['light brown sugar', 'dark brown sugar'] },
  { name: 'powdered sugar',       aliases: ['confectioners sugar', 'icing sugar'] },
  { name: 'baking powder',        aliases: [] },
  { name: 'baking soda',          aliases: ['bicarbonate of soda', 'bicarb'] },
  { name: 'salt',                 aliases: ['kosher salt', 'sea salt', 'table salt'] },
  { name: 'black pepper',         aliases: ['ground black pepper', 'pepper'] },
  { name: 'olive oil',            aliases: ['extra virgin olive oil', 'evoo'] },
  { name: 'vegetable oil',        aliases: ['canola oil', 'sunflower oil', 'neutral oil'] },
  { name: 'butter',               aliases: ['unsalted butter', 'salted butter'] },
  { name: 'soy sauce',            aliases: ['shoyu', 'tamari'] },
  { name: 'apple cider vinegar',  aliases: ['acv', 'cider vinegar'] },
  { name: 'white wine vinegar',   aliases: [] },
  { name: 'honey',                aliases: ['raw honey'] },
  { name: 'maple syrup',          aliases: ['pure maple syrup'] },
  { name: 'chicken broth',        aliases: ['chicken stock', 'chicken bouillon'] },
  { name: 'vegetable broth',      aliases: ['vegetable stock'] },
  // Dairy & eggs
  { name: 'egg',                  aliases: ['large egg', 'eggs', 'whole egg'] },
  { name: 'milk',                 aliases: ['whole milk', 'cow milk', '2% milk'] },
  { name: 'heavy cream',          aliases: ['double cream', 'whipping cream', 'heavy whipping cream'] },
  { name: 'sour cream',           aliases: [] },
  { name: 'cream cheese',         aliases: [] },
  { name: 'parmesan',             aliases: ['parmigiano reggiano', 'parmesan cheese', 'parmigiano'] },
  { name: 'mozzarella',           aliases: ['fresh mozzarella', 'mozzarella cheese'] },
  { name: 'cheddar',              aliases: ['cheddar cheese', 'sharp cheddar'] },
  // Produce
  { name: 'garlic',               aliases: ['garlic clove', 'garlic cloves', 'fresh garlic'] },
  { name: 'onion',                aliases: ['yellow onion', 'white onion', 'brown onion'] },
  { name: 'red onion',            aliases: [] },
  { name: 'green onion',          aliases: ['scallion', 'scallions', 'spring onion', 'green onions'] },
  { name: 'shallot',              aliases: ['shallots'] },
  { name: 'tomato',               aliases: ['tomatoes', 'roma tomato', 'beefsteak tomato'] },
  { name: 'lemon',                aliases: ['lemon juice', 'fresh lemon'] },
  { name: 'lime',                 aliases: ['lime juice', 'fresh lime'] },
  { name: 'fresh ginger',         aliases: ['ginger', 'ginger root'] },
  { name: 'cilantro',             aliases: ['coriander leaves', 'fresh cilantro', 'coriander', 'dhania'] },
  { name: 'flat-leaf parsley',    aliases: ['italian parsley', 'parsley', 'fresh parsley'] },
  { name: 'basil',                aliases: ['fresh basil', 'sweet basil'] },
  { name: 'thyme',                aliases: ['fresh thyme', 'dried thyme'] },
  { name: 'rosemary',             aliases: ['fresh rosemary', 'dried rosemary'] },
  // Protein
  { name: 'chicken breast',       aliases: ['boneless skinless chicken breast', 'chicken breast fillet'] },
  { name: 'chicken thigh',        aliases: ['boneless skinless chicken thigh', 'chicken thighs'] },
  { name: 'ground beef',          aliases: ['minced beef', 'beef mince'] },
  { name: 'bacon',                aliases: ['streaky bacon', 'back bacon'] },
  { name: 'salmon fillet',        aliases: ['salmon', 'fresh salmon'] },
  { name: 'shrimp',               aliases: ['prawns', 'large shrimp', 'peeled shrimp'] },
  // Grains & pasta
  { name: 'spaghetti',            aliases: ['spaghetti pasta'] },
  { name: 'penne',                aliases: ['penne pasta', 'penne rigate'] },
  { name: 'long-grain white rice', aliases: ['white rice', 'jasmine rice', 'basmati rice'] },
  { name: 'rolled oats',          aliases: ['oats', 'old-fashioned oats', 'porridge oats'] },
]

// Demo recipe: Classic Spaghetti Aglio e Olio
const DEMO_RECIPE = {
  title: 'Classic Spaghetti Aglio e Olio',
  description: 'A simple, elegant Italian pasta made with garlic, olive oil, red pepper flakes, and parsley. Ready in under 30 minutes with pantry staples.',
  cuisine: 'Italian',
  difficulty: 'easy',
  prep_time_mins: 5,
  cook_time_mins: 20,
  base_servings: 4,
  status: 'published',
  tags: ['dinner', 'under-30-mins', 'vegetarian', 'quick'],
  ingredients: [
    { raw_text: '400g spaghetti',                    name: 'spaghetti',         quantity: 400,  unit: 'g',   display_order: 0 },
    { raw_text: '8 cloves garlic, thinly sliced',   name: 'garlic',            quantity: 8,    unit: null,  preparation: 'thinly sliced', display_order: 1 },
    { raw_text: '1/2 cup extra virgin olive oil',   name: 'olive oil',         quantity: 0.5,  unit: 'cup', display_order: 2 },
    { raw_text: '1 tsp red pepper flakes',          name: 'red pepper flakes', quantity: 1,    unit: 'tsp', display_order: 3 },
    { raw_text: '1/2 cup flat-leaf parsley, chopped', name: 'flat-leaf parsley', quantity: 0.5, unit: 'cup', preparation: 'chopped', display_order: 4 },
    { raw_text: '1/2 cup grated parmesan (optional)', name: 'parmesan',        quantity: 0.5,  unit: 'cup', preparation: 'grated', is_optional: true, display_order: 5 },
    { raw_text: 'Salt, to taste',                   name: 'salt',              quantity: null, unit: null,  notes: 'to taste', display_order: 6 },
    { raw_text: 'Black pepper, to taste',           name: 'black pepper',      quantity: null, unit: null,  notes: 'to taste', display_order: 7 },
  ],
  instructions: [
    { step_number: 1, body: 'Bring a large pot of salted water to a boil. Cook spaghetti until al dente according to package directions. Reserve 1 cup of pasta cooking water before draining.' },
    { step_number: 2, body: 'While the pasta cooks, heat the olive oil in a large skillet over medium-low heat. Add the sliced garlic and cook, stirring frequently, until golden and fragrant — about 4–5 minutes. Do not let it brown.' },
    { step_number: 3, body: 'Add the red pepper flakes to the garlic oil and cook for 30 seconds more.' },
    { step_number: 4, body: 'Add the drained pasta to the skillet along with 1/4 cup of the reserved pasta water. Toss vigorously over medium heat until the sauce emulsifies and coats the pasta, adding more pasta water as needed.' },
    { step_number: 5, body: 'Remove from heat. Stir in the chopped parsley and season with salt and black pepper to taste.' },
    { step_number: 6, body: 'Serve immediately, topped with grated parmesan if desired.' },
  ],
}

// ---------------------------------------------------------------------------
// Spice Cabinet Master List (84 items across 7 categories)
// ---------------------------------------------------------------------------

const SPICE_CABINET_MASTER = [
  // Baking & Sweeteners
  { name: 'All-Purpose Flour',        category: 'Baking & Sweeteners',  sort_order: 1 },
  { name: 'Bread Flour',              category: 'Baking & Sweeteners',  sort_order: 2 },
  { name: 'Baking Soda',              category: 'Baking & Sweeteners',  sort_order: 3 },
  { name: 'Baking Powder',            category: 'Baking & Sweeteners',  sort_order: 4 },
  { name: 'Cornstarch',               category: 'Baking & Sweeteners',  sort_order: 5 },
  { name: 'Active Dry Yeast',         category: 'Baking & Sweeteners',  sort_order: 6 },
  { name: 'Cream of Tartar',          category: 'Baking & Sweeteners',  sort_order: 7 },
  { name: 'Cocoa Powder',             category: 'Baking & Sweeteners',  sort_order: 8 },
  { name: 'Vanilla Extract',          category: 'Baking & Sweeteners',  sort_order: 9 },
  { name: 'Granulated Sugar',         category: 'Baking & Sweeteners',  sort_order: 10 },
  { name: 'Brown Sugar',              category: 'Baking & Sweeteners',  sort_order: 11 },
  { name: 'Powdered Sugar',           category: 'Baking & Sweeteners',  sort_order: 12 },
  { name: 'Honey',                    category: 'Baking & Sweeteners',  sort_order: 13 },
  { name: 'Maple Syrup',              category: 'Baking & Sweeteners',  sort_order: 14 },
  // Oils & Vinegars
  { name: 'Olive Oil',                category: 'Oils & Vinegars',      sort_order: 1 },
  { name: 'Extra Virgin Olive Oil',   category: 'Oils & Vinegars',      sort_order: 2 },
  { name: 'Vegetable Oil',            category: 'Oils & Vinegars',      sort_order: 3 },
  { name: 'Coconut Oil',              category: 'Oils & Vinegars',      sort_order: 4 },
  { name: 'Sesame Oil',               category: 'Oils & Vinegars',      sort_order: 5 },
  { name: 'Apple Cider Vinegar',      category: 'Oils & Vinegars',      sort_order: 6 },
  { name: 'White Vinegar',            category: 'Oils & Vinegars',      sort_order: 7 },
  { name: 'Balsamic Vinegar',         category: 'Oils & Vinegars',      sort_order: 8 },
  { name: 'Rice Vinegar',             category: 'Oils & Vinegars',      sort_order: 9 },
  // Spices & Seasonings
  { name: 'Allspice',                 category: 'Spices & Seasonings',  sort_order: 1 },
  { name: 'Cardamom',                 category: 'Spices & Seasonings',  sort_order: 2 },
  { name: 'Cayenne Pepper',           category: 'Spices & Seasonings',  sort_order: 3 },
  { name: 'Chili Powder',             category: 'Spices & Seasonings',  sort_order: 4 },
  { name: 'Cinnamon',                 category: 'Spices & Seasonings',  sort_order: 5 },
  { name: 'Cloves',                   category: 'Spices & Seasonings',  sort_order: 6 },
  { name: 'Coriander',                category: 'Spices & Seasonings',  sort_order: 7 },
  { name: 'Cumin',                    category: 'Spices & Seasonings',  sort_order: 8 },
  { name: 'Curry Powder',             category: 'Spices & Seasonings',  sort_order: 9 },
  { name: 'Garam Masala',             category: 'Spices & Seasonings',  sort_order: 10 },
  { name: 'Garlic Powder',            category: 'Spices & Seasonings',  sort_order: 11 },
  { name: 'Ginger',                   category: 'Spices & Seasonings',  sort_order: 12 },
  { name: 'Mustard Powder',           category: 'Spices & Seasonings',  sort_order: 13 },
  { name: 'Nutmeg',                   category: 'Spices & Seasonings',  sort_order: 14 },
  { name: 'Onion Powder',             category: 'Spices & Seasonings',  sort_order: 15 },
  { name: 'Paprika',                  category: 'Spices & Seasonings',  sort_order: 16 },
  { name: 'Smoked Paprika',           category: 'Spices & Seasonings',  sort_order: 17 },
  { name: 'Red Pepper Flakes',        category: 'Spices & Seasonings',  sort_order: 18 },
  { name: 'Turmeric',                 category: 'Spices & Seasonings',  sort_order: 19 },
  { name: 'White Pepper',             category: 'Spices & Seasonings',  sort_order: 20 },
  { name: 'Black Pepper',             category: 'Spices & Seasonings',  sort_order: 21 },
  { name: 'Italian Seasoning',        category: 'Spices & Seasonings',  sort_order: 22 },
  { name: 'Everything Bagel Seasoning', category: 'Spices & Seasonings', sort_order: 23 },
  { name: 'Old Bay Seasoning',        category: 'Spices & Seasonings',  sort_order: 24 },
  // Dried Herbs
  { name: 'Dried Basil',              category: 'Dried Herbs',          sort_order: 1 },
  { name: 'Bay Leaves',               category: 'Dried Herbs',          sort_order: 2 },
  { name: 'Dried Dill',               category: 'Dried Herbs',          sort_order: 3 },
  { name: 'Dried Marjoram',           category: 'Dried Herbs',          sort_order: 4 },
  { name: 'Dried Mint',               category: 'Dried Herbs',          sort_order: 5 },
  { name: 'Dried Oregano',            category: 'Dried Herbs',          sort_order: 6 },
  { name: 'Dried Parsley',            category: 'Dried Herbs',          sort_order: 7 },
  { name: 'Dried Rosemary',           category: 'Dried Herbs',          sort_order: 8 },
  { name: 'Dried Sage',               category: 'Dried Herbs',          sort_order: 9 },
  { name: 'Dried Tarragon',           category: 'Dried Herbs',          sort_order: 10 },
  { name: 'Dried Thyme',              category: 'Dried Herbs',          sort_order: 11 },
  { name: 'Dried Chives',             category: 'Dried Herbs',          sort_order: 12 },
  // Salts
  { name: 'Table Salt',               category: 'Salts',                sort_order: 1 },
  { name: 'Kosher Salt',              category: 'Salts',                sort_order: 2 },
  { name: 'Fine Sea Salt',            category: 'Salts',                sort_order: 3 },
  { name: 'Flaked Sea Salt',          category: 'Salts',                sort_order: 4 },
  { name: 'Celery Salt',              category: 'Salts',                sort_order: 5 },
  // Condiment Staples
  { name: 'Soy Sauce',                category: 'Condiment Staples',    sort_order: 1 },
  { name: 'Tamari',                   category: 'Condiment Staples',    sort_order: 2 },
  { name: 'Worcestershire Sauce',     category: 'Condiment Staples',    sort_order: 3 },
  { name: 'Fish Sauce',               category: 'Condiment Staples',    sort_order: 4 },
  { name: 'Hot Sauce',                category: 'Condiment Staples',    sort_order: 5 },
  { name: 'Dijon Mustard',            category: 'Condiment Staples',    sort_order: 6 },
  { name: 'Tomato Paste',             category: 'Condiment Staples',    sort_order: 7 },
  { name: 'Canned Diced Tomatoes',    category: 'Condiment Staples',    sort_order: 8 },
  { name: 'Chicken Stock',            category: 'Condiment Staples',    sort_order: 9 },
  { name: 'Vegetable Stock',          category: 'Condiment Staples',    sort_order: 10 },
  { name: 'Canned Coconut Milk',      category: 'Condiment Staples',    sort_order: 11 },
  { name: 'Sriracha',                 category: 'Condiment Staples',    sort_order: 12 },
  // Nuts & Seeds
  { name: 'Sesame Seeds',             category: 'Nuts & Seeds',         sort_order: 1 },
  { name: 'Poppy Seeds',              category: 'Nuts & Seeds',         sort_order: 2 },
  { name: 'Chia Seeds',               category: 'Nuts & Seeds',         sort_order: 3 },
  { name: 'Flaxseeds',                category: 'Nuts & Seeds',         sort_order: 4 },
  { name: 'Pine Nuts',                category: 'Nuts & Seeds',         sort_order: 5 },
  { name: 'Slivered Almonds',         category: 'Nuts & Seeds',         sort_order: 6 },
  { name: 'Walnuts',                  category: 'Nuts & Seeds',         sort_order: 7 },
  { name: 'Sunflower Seeds',          category: 'Nuts & Seeds',         sort_order: 8 },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg) { console.log(`  ${msg}`) }

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seed() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    // ---- Demo user ----------------------------------------------------------
    log('Seeding demo user...')
    const passwordHash = await bcrypt.hash(DEMO_USER.password, 12)

    const { rows: [user] } = await pool.query(
      `INSERT INTO users (email, password_hash, username, role)
       VALUES ($1, $2, $3, 'user')
       ON CONFLICT (email) DO UPDATE SET username = EXCLUDED.username, updated_at = now()
       RETURNING id`,
      [DEMO_USER.email, passwordHash, DEMO_USER.username]
    )
    const userId = user.id

    await pool.query(
      `INSERT INTO profiles (user_id, display_name)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, DEMO_USER.display_name]
    )
    log(`  user id: ${userId}`)

    // ---- System tags --------------------------------------------------------
    log('Seeding system tags...')
    const tagIds = {}
    for (const name of SYSTEM_TAGS) {
      const { rows: [tag] } = await pool.query(
        `INSERT INTO tags (name, type)
         VALUES ($1, 'system')
         ON CONFLICT (name) DO UPDATE SET type = 'system'
         RETURNING id`,
        [name]
      )
      tagIds[name] = tag.id
    }
    log(`  ${SYSTEM_TAGS.length} tags seeded`)

    // ---- Core ingredients ---------------------------------------------------
    log('Seeding core ingredients...')
    const ingredientIds = {}
    for (const ing of CORE_INGREDIENTS) {
      const { rows: [row] } = await pool.query(
        `INSERT INTO ingredients (canonical_name)
         VALUES ($1)
         ON CONFLICT (canonical_name) DO UPDATE SET canonical_name = EXCLUDED.canonical_name
         RETURNING id`,
        [ing.name]
      )
      ingredientIds[ing.name] = row.id

      for (const alias of ing.aliases) {
        await pool.query(
          `INSERT INTO ingredient_aliases (ingredient_id, alias)
           VALUES ($1, $2)
           ON CONFLICT (alias, locale) DO NOTHING`,
          [row.id, alias]
        )
      }
    }
    log(`  ${CORE_INGREDIENTS.length} ingredients seeded`)

    // ---- Demo recipe --------------------------------------------------------
    log('Seeding demo recipe...')

    // Upsert by title + owner so re-running is safe
    const { rows: [existingRecipe] } = await pool.query(
      `SELECT id FROM recipes WHERE owner_id = $1 AND title = $2 AND deleted_at IS NULL`,
      [userId, DEMO_RECIPE.title]
    )

    let recipeId
    if (existingRecipe) {
      recipeId = existingRecipe.id
      log(`  recipe already exists: ${recipeId}`)
    } else {
      const { rows: [recipe] } = await pool.query(
        `INSERT INTO recipes
           (owner_id, title, description, cuisine, difficulty,
            prep_time_mins, cook_time_mins, base_servings, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id`,
        [
          userId,
          DEMO_RECIPE.title,
          DEMO_RECIPE.description,
          DEMO_RECIPE.cuisine,
          DEMO_RECIPE.difficulty,
          DEMO_RECIPE.prep_time_mins,
          DEMO_RECIPE.cook_time_mins,
          DEMO_RECIPE.base_servings,
          DEMO_RECIPE.status,
        ]
      )
      recipeId = recipe.id
      log(`  recipe id: ${recipeId}`)

      // Ingredients
      for (const ing of DEMO_RECIPE.ingredients) {
        const ingredientId = ingredientIds[ing.name] ?? null
        await pool.query(
          `INSERT INTO recipe_ingredients
             (recipe_id, ingredient_id, raw_text, quantity, unit,
              preparation, notes, is_optional, display_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            recipeId,
            ingredientId,
            ing.raw_text,
            ing.quantity ?? null,
            ing.unit ?? null,
            ing.preparation ?? null,
            ing.notes ?? null,
            ing.is_optional ?? false,
            ing.display_order,
          ]
        )
      }

      // Instructions
      for (const step of DEMO_RECIPE.instructions) {
        await pool.query(
          `INSERT INTO instructions (recipe_id, step_number, body)
           VALUES ($1,$2,$3)`,
          [recipeId, step.step_number, step.body]
        )
      }

      // Tags
      for (const tagName of DEMO_RECIPE.tags) {
        const tagId = tagIds[tagName]
        if (tagId) {
          await pool.query(
            `INSERT INTO recipe_tags (recipe_id, tag_id)
             VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [recipeId, tagId]
          )
        }
      }
    }

    // ---- Demo cookbook ------------------------------------------------------
    log('Seeding demo cookbook...')
    const { rows: [existingCookbook] } = await pool.query(
      `SELECT id FROM cookbooks WHERE owner_id = $1 AND title = $2 AND deleted_at IS NULL`,
      [userId, 'Weeknight Dinners']
    )

    let cookbookId
    if (existingCookbook) {
      cookbookId = existingCookbook.id
      log(`  cookbook already exists: ${cookbookId}`)
    } else {
      const { rows: [cookbook] } = await pool.query(
        `INSERT INTO cookbooks (owner_id, title, description)
         VALUES ($1, 'Weeknight Dinners', 'Quick and satisfying recipes for busy weeknights.')
         RETURNING id`,
        [userId]
      )
      cookbookId = cookbook.id
      log(`  cookbook id: ${cookbookId}`)

      await pool.query(
        `INSERT INTO cookbook_recipes (cookbook_id, recipe_id)
         VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [cookbookId, recipeId]
      )
    }

    // ---- Grocery list -------------------------------------------------------
    log('Seeding grocery list...')
    await pool.query(
      `INSERT INTO grocery_lists (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    )
    log('  grocery list ready')

    // ---- Spice cabinet master list -----------------------------------------
    log('Seeding spice cabinet master list...')
    for (const item of SPICE_CABINET_MASTER) {
      await pool.query(
        `INSERT INTO spice_cabinet_master (name, category, sort_order)
         VALUES ($1, $2, $3)
         ON CONFLICT (name) DO NOTHING`,
        [item.name, item.category, item.sort_order]
      )
    }
    log(`  ${SPICE_CABINET_MASTER.length} spice cabinet items seeded`)

    console.log('\nSeed complete.')
    console.log(`  Login: ${DEMO_USER.email} / ${DEMO_USER.password}`)
  } finally {
    await pool.end()
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err.message)
  process.exit(1)
})
