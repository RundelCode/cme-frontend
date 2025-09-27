import { NextResponse } from 'next/server';

const COOKIE_NAMES = ['session', 'access_token', 'id_token', 'jwt', 'cme_session'];

export async function POST() {
  const res = NextResponse.json({ ok: true });
  for (const name of COOKIE_NAMES) {
    res.cookies.set(name, '', {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 0,
    });
  }
  return res;
}
