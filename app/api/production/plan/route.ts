import {authenticatedUser} from '@/lib/auth';
import {productionPlan} from '@/lib/production-pipeline';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!authenticatedUser(request)) {
    return Response.json({error: 'Sign in to view the production plan.'}, {status: 401});
  }
  return Response.json(productionPlan(), {
    headers: {'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'},
  });
}
