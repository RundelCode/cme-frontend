import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const res = NextResponse.next();

  const supabase = createMiddlewareClient({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const isAuthPage =
    pathname.startsWith('/login') || pathname.startsWith('/register');


  if (!session && !isAuthPage) {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', pathname + (search || ''));
    return NextResponse.redirect(url);
  }
  if (session && isAuthPage) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/).*)',
  ],
};
