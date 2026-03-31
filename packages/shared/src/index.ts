// Shared TypeScript types for @feast/api and @feast/web

export type UserRole = 'user' | 'creator' | 'moderator' | 'admin';
export type RecipeStatus = 'draft' | 'published';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type ImportSourceType = 'url' | 'instagram' | 'text' | 'manual';
export type ImportJobStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
}

export interface Recipe {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  source_url: string | null;
  status: RecipeStatus;
  base_servings: number | null;
  cuisine: string | null;
  difficulty: Difficulty | null;
  prep_time_mins: number | null;
  cook_time_mins: number | null;
  cover_media_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  ingredient_id: string | null;
  raw_text: string;
  quantity: number | null;
  unit: string | null;
  preparation: string | null;
  notes: string | null;
  is_optional: boolean;
  display_order: number;
  group_label: string | null;
}

export interface Instruction {
  id: string;
  recipe_id: string;
  step_number: number;
  body: string;
  group_label: string | null;
}

export interface Tag {
  id: string;
  name: string;
  type: 'user' | 'system';
}

export interface Cookbook {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroceryList {
  id: string;
  user_id: string;
  updated_at: string;
}

export interface GroceryListItem {
  id: string;
  grocery_list_id: string;
  ingredient_id: string | null;
  display_name: string;
  quantity: number | null;
  unit: string | null;
  is_checked: boolean;
  notes: string | null;
  display_order: number;
  source_recipe_ids: string[];
}

export interface ImportJob {
  id: string;
  user_id: string;
  source_type: ImportSourceType;
  source_input: string | null;
  status: ImportJobStatus;
  recipe_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiError {
  error: string;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  data: T[];
  cursor: string | null;
  limit: number;
}

// AI parser output schema
export interface ParsedRecipe {
  title: string;
  description: string | null;
  servings: number | null;
  prep_time_mins: number | null;
  cook_time_mins: number | null;
  cuisine: string | null;
  difficulty: Difficulty | null;
  tags: string[];
  source_url: string | null;
  ingredients: ParsedIngredient[];
  instructions: ParsedInstruction[];
}

export interface ParsedIngredient {
  raw_text: string;
  quantity: number | null;
  unit: string | null;
  name: string;
  preparation: string | null;
  notes: string | null;
  is_optional: boolean;
  group_label: string | null;
  confidence: number;
  ambiguous: boolean;
}

export interface ParsedInstruction {
  step_number: number;
  body: string;
  group_label: string | null;
}
