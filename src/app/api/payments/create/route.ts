import type { NextRequest } from 'next/server';
import { POST as proxyPost } from '../../payments/route';

export async function POST(req: NextRequest) {
    return proxyPost(req);
}
