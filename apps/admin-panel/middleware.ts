import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rutas públicas — siempre accesibles
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // El cookie 'auth-session' se establece en el login y se borra al logout
  const session = request.cookies.get('auth-session');

  if (!session?.value) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Proteger todas las rutas excepto _next, static y favicon
    '/((?!_next/static|_next/image|favicon.ico|api/).*)',
  ],
};
