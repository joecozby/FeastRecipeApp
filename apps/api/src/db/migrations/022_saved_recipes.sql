-- Saved recipes: users can bookmark/save public recipes from other users
CREATE TABLE saved_recipes (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id  UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, recipe_id)
);

CREATE INDEX saved_recipes_user_idx   ON saved_recipes(user_id);
CREATE INDEX saved_recipes_recipe_idx ON saved_recipes(recipe_id);
