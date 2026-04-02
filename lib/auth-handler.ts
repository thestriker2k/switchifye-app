// Shared deep-link / OAuth callback handler.
// Used by both _layout.tsx (OS deep links) and login.tsx (openAuthSessionAsync result).

import { supabase } from "./supabase";

export function extractParamsFromUrl(url: string): Record<string, string> {
  const params: Record<string, string> = {};

  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");

  const parts: string[] = [];
  if (hashIndex !== -1) parts.push(url.substring(hashIndex + 1));
  if (queryIndex !== -1) {
    const end =
      hashIndex !== -1 && hashIndex > queryIndex ? hashIndex : url.length;
    parts.push(url.substring(queryIndex + 1, end));
  }

  for (const part of parts) {
    for (const pair of part.split("&")) {
      const [key, value] = pair.split("=");
      if (key && value) {
        params[decodeURIComponent(key)] = decodeURIComponent(value);
      }
    }
  }

  return params;
}

export async function handleAuthCallback(url: string): Promise<boolean> {
  if (!url.includes("auth/callback")) return false;

  const params = extractParamsFromUrl(url);

  // PKCE flow — exchange code for session
  if (params.code) {
    console.log("[auth-handler] Exchanging code for session");
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) {
      console.error("[auth-handler] exchangeCodeForSession error:", error.message);
      return false;
    }
    return true;
  }

  // Implicit flow — set session directly from tokens
  if (params.access_token && params.refresh_token) {
    console.log("[auth-handler] Setting session from tokens");
    const { error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (error) {
      console.error("[auth-handler] setSession error:", error.message);
      return false;
    }
    return true;
  }

  return false;
}
