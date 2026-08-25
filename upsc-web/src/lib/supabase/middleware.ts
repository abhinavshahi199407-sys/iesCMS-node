import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Refreshes the auth cookie on every request and keeps /admin private.
 * Anything under /admin except /admin/login requires a signed-in user.
 */
export async function updateSession(request: NextRequest) {
    let response = NextResponse.next({ request });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    for (const { name, value } of cookiesToSet) {
                        request.cookies.set(name, value);
                    }
                    response = NextResponse.next({ request });
                    for (const { name, value, options } of cookiesToSet) {
                        response.cookies.set(name, value, options);
                    }
                },
            },
        },
    );

    const {
        data: { user },
    } = await supabase.auth.getUser();

    const { pathname } = request.nextUrl;
    const isAdminArea = pathname.startsWith('/admin');
    const isLoginPage = pathname === '/admin/login';

    if (isAdminArea && !isLoginPage && !user) {
        const url = request.nextUrl.clone();
        url.pathname = '/admin/login';
        url.searchParams.set('next', pathname);
        return NextResponse.redirect(url);
    }

    if (isLoginPage && user) {
        const url = request.nextUrl.clone();
        url.pathname = '/admin/dashboard';
        url.search = '';
        return NextResponse.redirect(url);
    }

    return response;
}
