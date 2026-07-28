import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

// Suporta 2 chaves (contas diferentes) do remove.bg com rotação automática:
// se a primeira estourar o limite de créditos, tenta a segunda antes de
// desistir. REMOVE_BG_KEY (sem sufixo) é aceita como alias legado da chave 1.
const REMOVE_BG_KEY_1 = Deno.env.get("REMOVE_BG_KEY_1") || Deno.env.get("REMOVE_BG_KEY");
const REMOVE_BG_KEY_2 = Deno.env.get("REMOVE_BG_KEY_2");
const REMOVE_BG_KEYS = [REMOVE_BG_KEY_1, REMOVE_BG_KEY_2].filter((k): k is string => !!k);
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-admin-password",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const JSON_HEADERS = { ...CORS_HEADERS, "content-type": "application/json" };

// ── Token de sessão do painel (mesmo formato emitido pelo admin-write) ─────
// "mfbtok.<expiraEmMs>.<hmacHex>" — HMAC-SHA256 da expiração com a
// ADMIN_PASSWORD como chave. Aceito no lugar da senha, pra o front não
// precisar guardar a senha real.
const TOKEN_PREFIX = "mfbtok.";

async function hmacHex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifySessionToken(token: unknown): Promise<boolean> {
  if (typeof token !== "string" || !token.startsWith(TOKEN_PREFIX)) return false;
  const rest = token.slice(TOKEN_PREFIX.length);
  const dot = rest.indexOf(".");
  if (dot === -1) return false;
  const exp = rest.slice(0, dot);
  const sig = rest.slice(dot + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  return (await hmacHex(exp, ADMIN_PASSWORD)) === sig;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const credential = req.headers.get("x-admin-password");
  if (credential !== ADMIN_PASSWORD && !(await verifySessionToken(credential))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  try {
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: "missing image" }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }
    if (!REMOVE_BG_KEYS.length) {
      return new Response(JSON.stringify({ error: "REMOVE_BG_KEY não configurada no Supabase." }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    const imageBytes = new Uint8Array(await file.arrayBuffer());

    // remove.bg sinaliza créditos esgotados com 402 (Payment Required) ou
    // 403 — nesses casos vale a pena tentar a próxima chave da rotação;
    // qualquer outro erro (imagem inválida, etc.) retorna direto.
    let lastDetail = "";
    let quotaExhausted = false;
    for (const key of REMOVE_BG_KEYS) {
      const upstreamForm = new FormData();
      upstreamForm.append("image_file", new Blob([imageBytes], { type: file.type }), file.name);
      upstreamForm.append("size", "auto");

      const response = await fetch("https://api.remove.bg/v1.0/removebg", {
        method: "POST",
        headers: { "X-Api-Key": key },
        body: upstreamForm,
      });

      if (response.ok) {
        return new Response(await response.arrayBuffer(), {
          headers: { ...CORS_HEADERS, "content-type": "image/png", "cache-control": "no-store" },
        });
      }

      lastDetail = await response.text();
      quotaExhausted = response.status === 402 || response.status === 403;
      if (!quotaExhausted) {
        return new Response(JSON.stringify({ error: "remove.bg failed", detail: lastDetail }), {
          status: 502,
          headers: JSON_HEADERS,
        });
      }
      // cota estourada nesta chave — tenta a próxima do loop
    }

    // todas as chaves falharam por cota
    return new Response(JSON.stringify({
      error: quotaExhausted
        ? "Os créditos da API do remove.bg se esgotaram (todas as chaves configuradas). Tente novamente mais tarde ou configure uma nova chave no Supabase."
        : "remove.bg failed",
      detail: lastDetail,
    }), {
      status: 502,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
});
