import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  // Pega o header de autorização
  const basicAuth = req.headers.get('authorization');

  // Variáveis de ambiente com o usuário e senha (defina na Vercel e no .env.local)
  const USER = process.env.ADMIN_USER || 'admin';
  const PASS = process.env.ADMIN_PASS || 'sys3@123';

  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1];
    // Decodifica a string base64: "usuario:senha"
    const [user, pwd] = atob(authValue).split(':');

    // Se bater com o nosso usuário e senha, libera o acesso
    if (user === USER && pwd === PASS) {
      return NextResponse.next();
    }
  }

  // Se não tem auth ou a senha está errada, pede a senha (janela nativa do navegador)
  return new NextResponse('Autenticação Necessária', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Acesso Restrito - Sys3 Telecom"',
    },
  });
}

// Configura quais rotas o middleware deve proteger
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
