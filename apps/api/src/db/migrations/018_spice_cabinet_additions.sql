-- Add ~53 items to spice_cabinet_master identified as notable gaps.
-- ON CONFLICT DO NOTHING makes this safe to re-run.

INSERT INTO spice_cabinet_master (name, category, sort_order) VALUES

  -- ── Spices & Seasonings (16 additions, continuing from sort 24) ───────────
  ('Fennel Seeds',             'Spices & Seasonings', 25),
  ('Star Anise',               'Spices & Seasonings', 26),
  ('Caraway Seeds',            'Spices & Seasonings', 27),
  ('Mustard Seeds',            'Spices & Seasonings', 28),
  ('Coriander Seeds',          'Spices & Seasonings', 29),
  ('Cumin Seeds',              'Spices & Seasonings', 30),
  ('Celery Seeds',             'Spices & Seasonings', 31),
  ('Chinese Five Spice',       'Spices & Seasonings', 32),
  ('Za''atar',                 'Spices & Seasonings', 33),
  ('Sumac',                    'Spices & Seasonings', 34),
  ('Cajun Seasoning',          'Spices & Seasonings', 35),
  ('Adobo Seasoning',          'Spices & Seasonings', 36),
  ('Lemon Pepper',             'Spices & Seasonings', 37),
  ('Pumpkin Pie Spice',        'Spices & Seasonings', 38),
  ('Chili Flakes',             'Spices & Seasonings', 39),
  ('Fenugreek',                'Spices & Seasonings', 40),

  -- ── Dried Herbs (3 additions, continuing from sort 12) ───────────────────
  ('Herbes de Provence',       'Dried Herbs', 13),
  ('Dried Cilantro',           'Dried Herbs', 14),
  ('Dried Lemongrass',         'Dried Herbs', 15),

  -- ── Oils & Vinegars (9 additions, continuing from sort 9) ────────────────
  ('Avocado Oil',              'Oils & Vinegars', 10),
  ('Canola Oil',               'Oils & Vinegars', 11),
  ('Grapeseed Oil',            'Oils & Vinegars', 12),
  ('Peanut Oil',               'Oils & Vinegars', 13),
  ('Chili Oil',                'Oils & Vinegars', 14),
  ('Red Wine Vinegar',         'Oils & Vinegars', 15),
  ('White Wine Vinegar',       'Oils & Vinegars', 16),
  ('Sherry Vinegar',           'Oils & Vinegars', 17),
  ('Malt Vinegar',             'Oils & Vinegars', 18),

  -- ── Condiment Staples (13 additions, continuing from sort 12) ────────────
  ('Tahini',                   'Condiment Staples', 13),
  ('Miso Paste',               'Condiment Staples', 14),
  ('Oyster Sauce',             'Condiment Staples', 15),
  ('Hoisin Sauce',             'Condiment Staples', 16),
  ('Mirin',                    'Condiment Staples', 17),
  ('Coconut Aminos',           'Condiment Staples', 18),
  ('Gochujang',                'Condiment Staples', 19),
  ('Sambal Oelek',             'Condiment Staples', 20),
  ('Anchovy Paste',            'Condiment Staples', 21),
  ('Capers',                   'Condiment Staples', 22),
  ('Liquid Smoke',             'Condiment Staples', 23),
  ('Beef Stock',               'Condiment Staples', 24),
  ('Bone Broth',               'Condiment Staples', 25),

  -- ── Baking & Sweeteners (5 additions, continuing from sort 14) ───────────
  ('Instant Yeast',            'Baking & Sweeteners', 15),
  ('Molasses',                 'Baking & Sweeteners', 16),
  ('Almond Extract',           'Baking & Sweeteners', 17),
  ('Rolled Oats',              'Baking & Sweeteners', 18),
  ('Corn Syrup',               'Baking & Sweeteners', 19),

  -- ── Nuts & Seeds (7 additions, continuing from sort 8) ───────────────────
  ('Pepitas',                  'Nuts & Seeds',  9),
  ('Pecans',                   'Nuts & Seeds', 10),
  ('Cashews',                  'Nuts & Seeds', 11),
  ('Hazelnuts',                'Nuts & Seeds', 12),
  ('Pistachios',               'Nuts & Seeds', 13),
  ('Peanuts',                  'Nuts & Seeds', 14),
  ('Shredded Coconut',         'Nuts & Seeds', 15)

ON CONFLICT (name) DO NOTHING;
