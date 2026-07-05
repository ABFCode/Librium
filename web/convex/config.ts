import { query } from "./_generated/server";
import { allowSignUp } from "./authPolicy";

// Public, unauthenticated: lets the sign-in / landing UI reflect whether
// registration is currently open. Mirrors the server-side enforcement in
// auth.ts (emailAndPassword.disableSignUp) so both track the same env flag.
export const signupEnabled = query({
  args: {},
  handler: async () => allowSignUp,
});
