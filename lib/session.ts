// Shared session helpers — the native Supabase client is the source of truth
// now that auth is handled natively. The WebView receives the session via injection.

import { supabase } from "./supabase";

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// Build the JS to inject the native Supabase session into the WebView's localStorage
// so the web dashboard recognizes the authenticated user.
const STORAGE_KEY = "sb-jxcwfcbwgqjifmiyeenh-auth-token";

export function buildInjectSessionJS(session: {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
  user?: any;
}): string {
  const payload = JSON.stringify(session);
  return `
    (function() {
      try {
        localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(payload)});
      } catch(e) {}
    })();
    true;
  `;
}
