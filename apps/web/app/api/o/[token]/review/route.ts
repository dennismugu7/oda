import { after } from 'next/server';
import { getBuyerReview, writeBuyerReview } from '@/server/reviews';

export const dynamic = 'force-dynamic';

// The buyer's review of a delivered order (M7, 5d): read, create, edit within 7 days.
export const GET = getBuyerReview;

export function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  return writeBuyerReview(request, ctx, after);
}

export function PUT(request: Request, ctx: { params: Promise<{ token: string }> }) {
  return writeBuyerReview(request, ctx, after);
}
