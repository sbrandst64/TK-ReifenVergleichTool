// Supabase Edge Function "cart" (Deno): puts selected tyres into a shop's cart, never orders.
// All logic lives in the runtime-neutral handler, which is also used by the local Node dev
// server (scripts/dev-server.ts).
import { handleCart } from '../_shared/cart-handler.ts'

Deno.serve((req: Request) => handleCart(req, Deno.env.toObject()))
