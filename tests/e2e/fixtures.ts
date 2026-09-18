import { ObjectId } from "mongodb";

/**
 * Fixed IDs/credentials shared between global-setup (which seeds them) and
 * the specs (which log in as them). Kept in one place so a spec never has
 * to query for "the category" or "the moderator" — it already knows who
 * they are.
 */
// The add-place form's category <Select> only renders *child* categories as
// selectable items (see src/app/add-place/page.tsx's categoryGroups split)
// — a flat, parent-less category would render an empty, unusable group. So
// this seeds a real two-level pair, same shape as scripts/seed.ts's
// Food → Bakery entry.
export const PARENT_CATEGORY_ID = new ObjectId("6590e2e00000000000000002");
export const PARENT_CATEGORY_SLUG = "food";
export const PARENT_CATEGORY_NAME = "Food";

export const CATEGORY_ID = new ObjectId("6590e2e00000000000000001");
export const CATEGORY_SLUG = "bakery";
export const CATEGORY_NAME = "Bakery";

export const MODERATOR = {
  username: "e2e_moderator",
  email: "e2e-moderator@example.com",
  password: "E2eModerator#2024",
};
