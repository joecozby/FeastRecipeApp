-- Seed the spice_cabinet_master table with the curated list of 84 staples.
-- Uses ON CONFLICT DO NOTHING so re-running is safe.

INSERT INTO spice_cabinet_master (name, category, sort_order) VALUES
  -- ── Spices & Seasonings ───────────────────────────────────────────────────
  ('Allspice',                 'Spices & Seasonings',  1),
  ('Cardamom',                 'Spices & Seasonings',  2),
  ('Cayenne Pepper',           'Spices & Seasonings',  3),
  ('Chili Powder',             'Spices & Seasonings',  4),
  ('Cinnamon',                 'Spices & Seasonings',  5),
  ('Cloves',                   'Spices & Seasonings',  6),
  ('Coriander',                'Spices & Seasonings',  7),
  ('Cumin',                    'Spices & Seasonings',  8),
  ('Curry Powder',             'Spices & Seasonings',  9),
  ('Garam Masala',             'Spices & Seasonings', 10),
  ('Garlic Powder',            'Spices & Seasonings', 11),
  ('Ginger',                   'Spices & Seasonings', 12),
  ('Mustard Powder',           'Spices & Seasonings', 13),
  ('Nutmeg',                   'Spices & Seasonings', 14),
  ('Onion Powder',             'Spices & Seasonings', 15),
  ('Paprika',                  'Spices & Seasonings', 16),
  ('Smoked Paprika',           'Spices & Seasonings', 17),
  ('Red Pepper Flakes',        'Spices & Seasonings', 18),
  ('Turmeric',                 'Spices & Seasonings', 19),
  ('White Pepper',             'Spices & Seasonings', 20),
  ('Black Pepper',             'Spices & Seasonings', 21),
  ('Italian Seasoning',        'Spices & Seasonings', 22),
  ('Everything Bagel Seasoning','Spices & Seasonings',23),
  ('Old Bay Seasoning',        'Spices & Seasonings', 24),

  -- ── Dried Herbs ───────────────────────────────────────────────────────────
  ('Dried Basil',              'Dried Herbs',  1),
  ('Bay Leaves',               'Dried Herbs',  2),
  ('Dried Dill',               'Dried Herbs',  3),
  ('Dried Marjoram',           'Dried Herbs',  4),
  ('Dried Mint',               'Dried Herbs',  5),
  ('Dried Oregano',            'Dried Herbs',  6),
  ('Dried Parsley',            'Dried Herbs',  7),
  ('Dried Rosemary',           'Dried Herbs',  8),
  ('Dried Sage',               'Dried Herbs',  9),
  ('Dried Tarragon',           'Dried Herbs', 10),
  ('Dried Thyme',              'Dried Herbs', 11),
  ('Dried Chives',             'Dried Herbs', 12),

  -- ── Salts ─────────────────────────────────────────────────────────────────
  ('Table Salt',               'Salts',  1),
  ('Kosher Salt',              'Salts',  2),
  ('Fine Sea Salt',            'Salts',  3),
  ('Flaked Sea Salt',          'Salts',  4),
  ('Celery Salt',              'Salts',  5),

  -- ── Oils & Vinegars ───────────────────────────────────────────────────────
  ('Olive Oil',                'Oils & Vinegars',  1),
  ('Extra Virgin Olive Oil',   'Oils & Vinegars',  2),
  ('Vegetable Oil',            'Oils & Vinegars',  3),
  ('Coconut Oil',              'Oils & Vinegars',  4),
  ('Sesame Oil',               'Oils & Vinegars',  5),
  ('Apple Cider Vinegar',      'Oils & Vinegars',  6),
  ('White Vinegar',            'Oils & Vinegars',  7),
  ('Balsamic Vinegar',         'Oils & Vinegars',  8),
  ('Rice Vinegar',             'Oils & Vinegars',  9),

  -- ── Condiment Staples ─────────────────────────────────────────────────────
  ('Soy Sauce',                'Condiment Staples',  1),
  ('Tamari',                   'Condiment Staples',  2),
  ('Worcestershire Sauce',     'Condiment Staples',  3),
  ('Fish Sauce',               'Condiment Staples',  4),
  ('Hot Sauce',                'Condiment Staples',  5),
  ('Dijon Mustard',            'Condiment Staples',  6),
  ('Tomato Paste',             'Condiment Staples',  7),
  ('Canned Diced Tomatoes',    'Condiment Staples',  8),
  ('Chicken Stock',            'Condiment Staples',  9),
  ('Vegetable Stock',          'Condiment Staples', 10),
  ('Canned Coconut Milk',      'Condiment Staples', 11),
  ('Sriracha',                 'Condiment Staples', 12),

  -- ── Baking & Sweeteners ───────────────────────────────────────────────────
  ('All-Purpose Flour',        'Baking & Sweeteners',  1),
  ('Bread Flour',              'Baking & Sweeteners',  2),
  ('Baking Soda',              'Baking & Sweeteners',  3),
  ('Baking Powder',            'Baking & Sweeteners',  4),
  ('Cornstarch',               'Baking & Sweeteners',  5),
  ('Active Dry Yeast',         'Baking & Sweeteners',  6),
  ('Cream of Tartar',          'Baking & Sweeteners',  7),
  ('Cocoa Powder',             'Baking & Sweeteners',  8),
  ('Vanilla Extract',          'Baking & Sweeteners',  9),
  ('Granulated Sugar',         'Baking & Sweeteners', 10),
  ('Brown Sugar',              'Baking & Sweeteners', 11),
  ('Powdered Sugar',           'Baking & Sweeteners', 12),
  ('Honey',                    'Baking & Sweeteners', 13),
  ('Maple Syrup',              'Baking & Sweeteners', 14),

  -- ── Nuts & Seeds ──────────────────────────────────────────────────────────
  ('Sesame Seeds',             'Nuts & Seeds',  1),
  ('Poppy Seeds',              'Nuts & Seeds',  2),
  ('Chia Seeds',               'Nuts & Seeds',  3),
  ('Flaxseeds',                'Nuts & Seeds',  4),
  ('Pine Nuts',                'Nuts & Seeds',  5),
  ('Slivered Almonds',         'Nuts & Seeds',  6),
  ('Walnuts',                  'Nuts & Seeds',  7),
  ('Sunflower Seeds',          'Nuts & Seeds',  8)

ON CONFLICT (name) DO NOTHING;
