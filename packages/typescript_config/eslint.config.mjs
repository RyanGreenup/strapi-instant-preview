import { defineConfig } from '@rs/eslint-config'

// No framework and nothing to type-check here; antfu's jsonc rules lint the
// shared tsconfig JSON files and package.json.
export default defineConfig()
