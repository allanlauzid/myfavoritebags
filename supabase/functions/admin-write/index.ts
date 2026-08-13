// Edge Function: admin-write
// Único ponto de escrita no banco. Recebe { password, totp, table, action, payload }
// verifica a senha do admin + o código do autenticador (só no login) e usa o
// service_role (nunca exposto no navegador) pra gravar. O publishable key do
// front só tem permissão de leitura (RLS).

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { imageUsagesForPath, loadCatalogImageRows } from "./image-usage.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Senha única do painel (antes eram duas, uma por seção do site).
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD")!;
// Segredo TOTP (base32) usado pelo app autenticador (Google Authenticator,
// Authy, etc.) — configurado uma única vez via secret no Supabase.
const TOTP_SECRET = Deno.env.get("ADMIN_TOTP_SECRET")!;
// Chave(s) do Gemini (Google AI Studio) — usada pra gerar a descrição
// automática da bolsa e o gerador de nomes. Suporta 2 chaves (contas
// diferentes) com rotação automática: se a primeira estourar a cota, tenta
// a segunda antes de desistir. GEMINI_API_KEY (sem sufixo) é aceita como
// alias legado da chave 1, pra não quebrar quem já tinha só uma configurada.
const GEMINI_API_KEY_1 = Deno.env.get("GEMINI_API_KEY_1") || Deno.env.get("GEMINI_API_KEY");
const GEMINI_API_KEY_2 = Deno.env.get("GEMINI_API_KEY_2");
const GEMINI_API_KEY = GEMINI_API_KEY_1; // mantém o nome antigo em uso abaixo
const GEMINI_KEYS = [GEMINI_API_KEY_1, GEMINI_API_KEY_2].filter((k): k is string => !!k);

// Modelo do Gemini. Configurável por secret no Supabase (GEMINI_MODEL) pra
// poder trocar SEM mexer no código nem redeployar quando o Google aposentar
// um modelo. Padrão: "gemini-flash-latest" — um alias que o Google mantém
// sempre apontando pro Flash atual, então não volta a dar o erro
// "no longer available" que a versão fixa "gemini-2.5-flash" passou a dar
// pra contas novas. (Ref.: ai.google.dev/gemini-api/docs/models, jul/2026.)
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest";

// Detecta erro de cota/créditos esgotados numa resposta da API do Gemini
// (HTTP 429, ou mensagem de erro mencionando quota/billing) — usado pra
// decidir se vale tentar a próxima chave da rotação.
function isQuotaError(status: number, json: any): boolean {
  if (status === 429) return true;
  const msg = String(json?.error?.message || json?.error?.status || "").toLowerCase();
  return msg.includes("quota") || msg.includes("resource_exhausted") || msg.includes("billing");
}

// Chama o Gemini tentando cada chave configurada em ordem; só avança pra
// próxima quando a anterior falha especificamente por cota esgotada (outros
// erros — payload inválido, etc. — retornam na hora, sem trocar de chave).
async function geminiFetchWithRotation(bodyJson: unknown, model = GEMINI_MODEL): Promise<{ ok: boolean; status: number; json: any; quotaExhausted: boolean }> {
  if (!GEMINI_KEYS.length) {
    return { ok: false, status: 500, json: { error: { message: "GEMINI_API_KEY não configurada no Supabase." } }, quotaExhausted: false };
  }
  let last: { ok: boolean; status: number; json: any } | null = null;
  for (const key of GEMINI_KEYS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(bodyJson) },
    );
    const json = await res.json();
    last = { ok: res.ok, status: res.status, json };
    if (res.ok) return { ...last, quotaExhausted: false };
    if (!isQuotaError(res.status, json)) return { ...last, quotaExhausted: false };
    // cota estourada nesta chave — tenta a próxima do loop
  }
  // todas as chaves falharam por cota
  return { ...(last as { ok: boolean; status: number; json: any }), quotaExhausted: true };
}

// ── Contador de sílabas (português do Brasil) ──────────────────────────────
// Heurística baseada em núcleos vocálicos (vogal ou ditongo/hiato tratado
// como um só núcleo por simplicidade) — não é um silabador linguístico
// completo, mas é suficiente pra filtrar sugestões do Gemini por "2 ou 3
// sílabas" com boa precisão em nomes curtos e fictícios.
function countSyllablesPtBr(word: string): number {
  const w = word
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  if (!w) return 0;
  const vowels = "aeiouy";
  let count = 0;
  let prevWasVowel = false;
  for (const ch of w) {
    const isVowel = vowels.includes(ch);
    if (isVowel && !prevWasVowel) count++;
    prevWasVowel = isVowel;
  }
  return Math.max(count, 1);
}

// Conta sílabas de um nome completo (soma das palavras, ignora conectores
// curtos tipo "da"/"de"/"do" no meio do nome).
function countNameSyllables(name: string): number {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .reduce((sum, word) => sum + countSyllablesPtBr(word), 0);
}

// Normaliza um nome pra checagem de duplicidade: minúsculo, sem acento, sem
// espaços extras — dois nomes "iguais" nesse sentido não podem coexistir.
function normalizeName(name: string): string {
  return name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// ── Match Analytics — helpers de agregação por período ─────────────────────
// Agrupa uma data em "dia" (YYYY-MM-DD), "semana" (segunda-feira ISO da
// semana, também YYYY-MM-DD), "mês" (YYYY-MM) ou "ano" (YYYY) — usado pra
// montar as séries temporais do painel Match Analytics.
function bucketKeyDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function bucketKeyWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const isoDay = (date.getUTCDay() + 6) % 7; // 0 = segunda-feira
  date.setUTCDate(date.getUTCDate() - isoDay);
  return date.toISOString().slice(0, 10);
}
function bucketKeyMonth(d: Date): string {
  return d.toISOString().slice(0, 7);
}
function bucketKeyYear(d: Date): string {
  return String(d.getUTCFullYear());
}
function countByKey<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = keyFn(item);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}
function toSortedSeries(map: Record<string, number>): { date: string; count: number }[] {
  return Object.entries(map)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const JSON_HEADERS = { ...CORS_HEADERS, "content-type": "application/json" };

const ALLOWED_TABLES = ["bags", "looks", "site_settings"];

// ── TOTP (RFC 6238) — implementação mínima usando Web Crypto (HMAC-SHA1) ───
function base32Decode(b32: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = b32.replace(/=+$/, "").toUpperCase();
  let bits = "";
  for (const char of clean) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

async function totpAt(secretB32: string, counter: number): Promise<string> {
  const keyBytes = base32Decode(secretB32);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const counterBytes = new ArrayBuffer(8);
  const view = new DataView(counterBytes);
  view.setUint32(0, 0);
  view.setUint32(4, counter);
  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes));
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode = ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binCode % 1_000_000).padStart(6, "0");
}

// Aceita o código atual e uma janela de ±1 passo (30s) de tolerância de
// relógio entre o celular e o servidor.
async function verifyTotp(code: string): Promise<boolean> {
  if (!TOTP_SECRET || !code) return false;
  const step = Math.floor(Date.now() / 1000 / 30);
  for (const delta of [0, -1, 1]) {
    if ((await totpAt(TOTP_SECRET, step + delta)) === String(code).trim()) return true;
  }
  return false;
}

// ── Token de sessão do painel ──────────────────────────────────────────────
// Emitido no login (senha OU autenticador) e aceito nas demais ações no
// lugar da senha. Elimina a necessidade de o front guardar (ou pior, ter
// hardcoded) a senha real. Formato: "mfbtok.<expiraEmMs>.<hmacHex>", com
// HMAC-SHA256 da expiração usando a própria ADMIN_PASSWORD como chave — não
// exige nenhum secret novo no Supabase. Validade: 12 horas.
const TOKEN_PREFIX = "mfbtok.";
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

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

async function issueSessionToken(): Promise<string> {
  const exp = String(Date.now() + TOKEN_TTL_MS);
  return `${TOKEN_PREFIX}${exp}.${await hmacHex(exp, ADMIN_PASSWORD)}`;
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

  try {
    const body = await req.json();
    const { password, totp, table, action, payload, nameSource: nameSourceTop } = body;

    // Login aceita senha OU autenticador — são dois caminhos independentes,
    // não uma segunda camada em cima da outra. O painel só manda um dos dois
    // por vez (o campo que não está em uso nem aparece na tela).
    if (action === "login") {
      const passwordOk = !!password && password === ADMIN_PASSWORD;
      const totpOk = !!totp && (await verifyTotp(totp));
      if (!passwordOk && !totpOk) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: JSON_HEADERS,
        });
      }
      // Devolve um token de sessão temporário — é ele que o painel guarda e
      // envia nas demais ações, em vez da senha em si.
      return new Response(JSON.stringify({ data: { ok: true, token: await issueSessionToken() } }), {
        headers: JSON_HEADERS,
      });
    }

    // Todas as outras ações (gravar, apagar, listar imagens...) exigem o
    // token de sessão emitido no login — ou, por compatibilidade, a senha.
    if (password !== ADMIN_PASSWORD && !(await verifySessionToken(password))) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: JSON_HEADERS,
      });
    }

    // Converte um Uint8Array em base64 sem depender de Buffer (não existe no
    // runtime do Deno das Edge Functions) — em blocos, pra não estourar o
    // limite de argumentos do String.fromCharCode em imagens grandes.
    function bytesToBase64(bytes: Uint8Array): string {
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      return btoa(binary);
    }

    // Gera DUAS opções de descrição curta de bolsa via Gemini (Google AI
    // Studio), com base na FOTO real da peça OU num prompt escrito pelo
    // lojista (nunca aleatório — um dos dois é obrigatório). payload:
    // { name, cat, price, image?, prompt? } onde `image` é uma data URL
    // (data:image/...;base64,...) ou uma URL pública (http/https) — nos dois
    // casos a função busca os bytes e manda a imagem pro Gemini. Quando não
    // há imagem, usa o texto de `prompt` como base. Não grava nada, só
    // devolve os textos pro admin revisar/escolher antes de salvar.
    if (action === "generate_description") {
      if (!GEMINI_KEYS.length) {
        return new Response(JSON.stringify({ error: "GEMINI_API_KEY não configurada no Supabase." }), {
          status: 500,
          headers: JSON_HEADERS,
        });
      }
      const { name, cat, price, image, prompt: userPrompt } = payload || {};
      const hasImage = !!image;
      const hasPrompt = !!(userPrompt && String(userPrompt).trim());
      if (!hasImage && !hasPrompt) {
        return new Response(JSON.stringify({ error: "Envie ou escolha a foto da bolsa, ou escreva um prompt, antes de gerar a descrição." }), {
          status: 400,
          headers: JSON_HEADERS,
        });
      }

      try {
        const parts: any[] = [];
        let sourceInstruction: string;

        if (hasImage) {
          let mimeType = "image/jpeg";
          let base64Data: string;

          if (image.startsWith("data:")) {
            const commaIdx = image.indexOf(",");
            const meta = image.slice(0, commaIdx);
            base64Data = image.slice(commaIdx + 1);
            mimeType = /data:(.*?);base64/.exec(meta)?.[1] || mimeType;
          } else {
            const imgRes = await fetch(image);
            if (!imgRes.ok) {
              return new Response(JSON.stringify({ error: "Não foi possível ler a imagem da bolsa." }), {
                status: 502,
                headers: JSON_HEADERS,
              });
            }
            mimeType = imgRes.headers.get("content-type") || mimeType;
            const bytes = new Uint8Array(await imgRes.arrayBuffer());
            base64Data = bytesToBase64(bytes);
          }

          sourceInstruction = "Olhe a foto da bolsa em anexo e escreva com base no que você vê de fato na imagem (cor, material aparente, formato, tipo de alça, acabamento) — não invente características que não conseguir identificar na foto.";
          parts.push({ inline_data: { mime_type: mimeType, data: base64Data } });
        } else {
          sourceInstruction = `Escreva com base neste prompt fornecido pelo lojista sobre a bolsa: "${String(userPrompt).trim()}".`;
        }

        const basePrompt = `Escreva DUAS opções alternativas de descrição curta (cada uma com 2 a 3 frases, no máximo 280 caracteres) em português do Brasil para uma loja online. Nome da peça: "${name || 'bolsa'}". Categoria: "${cat || 'bolsa'}". Preço: "${price || ''}". ${sourceInstruction} Tom: elegante, direto, sem exagero, sem emojis, sem aspas. Não repita o nome da bolsa literalmente na primeira palavra. As duas opções devem ser diferentes entre si (variações reais de conteúdo/foco, não apenas troca de sinônimos). Responda APENAS com as duas opções, cada uma em um parágrafo corrido, separadas exatamente por uma linha contendo somente "---" — sem numeração, sem títulos, sem explicações.`;

        const result = await geminiFetchWithRotation({
          contents: [{ parts: [{ text: basePrompt }, ...parts] }],
        });
        if (!result.ok) {
          const message = result.quotaExhausted
            ? "Os créditos da API do Gemini se esgotaram (todas as chaves configuradas). Tente novamente mais tarde ou configure uma nova chave no Supabase."
            : result.json?.error?.message || "Falha ao gerar descrição.";
          return new Response(JSON.stringify({ error: message }), {
            status: 502,
            headers: JSON_HEADERS,
          });
        }
        const text = result.json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        const descriptions = text
          .split(/\r?\n?-{3,}\r?\n?/)
          .map((s: string) => s.trim())
          .filter(Boolean)
          .slice(0, 2);
        return new Response(JSON.stringify({ data: { descriptions } }), {
          headers: JSON_HEADERS,
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), {
          status: 500,
          headers: JSON_HEADERS,
        });
      }
    }

    // Gerador de nomes fofos/sonoros pra bolsas, via Gemini. payload:
    // { mode: 'random'|'photo'|'description', image?, description?, syllables?: 2|3 }
    // Não salva nada — devolve até 5 sugestões pro admin escolher (ou digitar
    // o próprio nome). O nome só entra em bag_names quando o produto for
    // efetivamente salvo (ver bloco "upsert" mais abaixo).
    if (action === "generate_bag_name") {
      if (!GEMINI_KEYS.length) {
        return new Response(JSON.stringify({ error: "GEMINI_API_KEY não configurada no Supabase." }), {
          status: 500,
          headers: JSON_HEADERS,
        });
      }
      const { mode, image, description, syllables } = payload || {};
      const wantSyllables = syllables === 2 || syllables === 3 ? syllables : null;

      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      // Nomes já usados (bloqueio de duplicata) + amostra recente pra
      // inspirar o estilo/sonoridade das novas sugestões.
      const { data: existingRows } = await supabase
        .from("bag_names")
        .select("name, name_normalized")
        .order("created_at", { ascending: false })
        .limit(200);
      const usedNormalized = new Set((existingRows || []).map((r: any) => r.name_normalized));
      const inspirationNames = (existingRows || []).slice(0, 25).map((r: any) => r.name);

      const syllableInstruction = wantSyllables
        ? `Cada nome deve ter exatamente ${wantSyllables} sílabas (contando todas as palavras do nome juntas).`
        : "Prefira nomes com 2 ou no máximo 3 sílabas.";
      const inspirationBlock = inspirationNames.length
        ? `Nomes já usados no catálogo (NÃO repita nenhum deles, mas pode se inspirar no estilo sonoro): ${inspirationNames.join(", ")}.`
        : "";

      let modeInstruction = "";
      const parts: any[] = [];
      if (mode === "photo") {
        if (!image) {
          return new Response(JSON.stringify({ error: "Envie ou escolha a foto da bolsa antes de gerar o nome." }), {
            status: 400,
            headers: JSON_HEADERS,
          });
        }
        let mimeType = "image/jpeg";
        let base64Data: string;
        if (String(image).startsWith("data:")) {
          const commaIdx = image.indexOf(",");
          const meta = image.slice(0, commaIdx);
          base64Data = image.slice(commaIdx + 1);
          mimeType = /data:(.*?);base64/.exec(meta)?.[1] || mimeType;
        } else {
          const imgRes = await fetch(image);
          if (!imgRes.ok) {
            return new Response(JSON.stringify({ error: "Não foi possível ler a imagem da bolsa." }), {
              status: 502,
              headers: JSON_HEADERS,
            });
          }
          mimeType = imgRes.headers.get("content-type") || mimeType;
          const bytes = new Uint8Array(await imgRes.arrayBuffer());
          base64Data = bytesToBase64(bytes);
        }
        modeInstruction = "Olhe a foto da bolsa em anexo e crie nomes que combinem com o estilo, cor e personalidade que a peça transmite.";
        parts.push({ inline_data: { mime_type: mimeType, data: base64Data } });
      } else if (mode === "description") {
        if (!description || !String(description).trim()) {
          return new Response(JSON.stringify({ error: "Escreva uma descrição da bolsa antes de gerar o nome." }), {
            status: 400,
            headers: JSON_HEADERS,
          });
        }
        modeInstruction = `Crie nomes que combinem com esta descrição da bolsa: "${String(description).trim()}".`;
      } else {
        modeInstruction = "Crie nomes aleatórios, sem precisar de nenhuma referência específica da peça.";
      }

      const basePrompt = `Você cria nomes próprios fictícios (não são nomes de pessoas reais, marcas ou produtos existentes) pra batizar bolsas femininas de uma loja brasileira. ${modeInstruction} ${syllableInstruction} CRITÉRIOS OBRIGATÓRIOS DO NOME: deve ser FÁCIL de falar e pronunciar em português do Brasil (evite combinações de letras estranhas, som travado ou pronúncia ambígua) E deve soar FOFO/meigo. Prefira nomes doces, leves e sonoros. ${inspirationBlock} Responda APENAS com uma lista de 10 nomes candidatos, um por linha, sem numeração, sem explicação, sem aspas.`;

      const MAX_ATTEMPTS = 3;
      const WANTED_NAMES = 10;
      const collected: { name: string; syllableCount: number }[] = [];
      const rejectedThisSession = new Set<string>();
      let attemptsUsed = 0;
      let quotaExhausted = false;
      let lastErrorMessage = "";

      for (let attempt = 1; attempt <= MAX_ATTEMPTS && collected.length < WANTED_NAMES; attempt++) {
        attemptsUsed = attempt;
        const avoidBlock = rejectedThisSession.size
          ? ` Não repita nenhum destes nomes já sugeridos e rejeitados nesta tentativa: ${[...rejectedThisSession].join(", ")}.`
          : "";
        const result = await geminiFetchWithRotation({
          contents: [{ parts: [{ text: basePrompt + avoidBlock }, ...parts] }],
        });
        if (!result.ok) {
          quotaExhausted = result.quotaExhausted;
          lastErrorMessage = result.json?.error?.message || "Falha ao gerar nomes.";
          break;
        }
        const text = result.json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        const candidates = text
          .split(/\r?\n/)
          .map((line: string) => line.replace(/^[\s\-•\d.)]+/, "").trim())
          .filter(Boolean);

        for (const candidate of candidates) {
          const norm = normalizeName(candidate);
          if (!norm || usedNormalized.has(norm) || rejectedThisSession.has(norm)) continue;
          const syl = countNameSyllables(candidate);
          if (wantSyllables && syl !== wantSyllables) { rejectedThisSession.add(norm); continue; }
          collected.push({ name: candidate, syllableCount: syl });
          rejectedThisSession.add(norm);
          if (collected.length >= WANTED_NAMES) break;
        }
      }

      if (quotaExhausted) {
        return new Response(JSON.stringify({
          error: "Os créditos da API do Gemini se esgotaram (todas as chaves configuradas). Tente novamente mais tarde ou configure uma nova chave no Supabase.",
        }), { status: 502, headers: JSON_HEADERS });
      }
      if (!collected.length && lastErrorMessage) {
        return new Response(JSON.stringify({ error: lastErrorMessage }), { status: 502, headers: JSON_HEADERS });
      }

      const needMoreDetail = collected.length < 3 && attemptsUsed >= MAX_ATTEMPTS;
      return new Response(JSON.stringify({
        data: {
          names: collected,
          attemptsUsed,
          needMoreDetail,
          needMoreDetailMessage: needMoreDetail
            ? "Não consegui gerar nomes suficientes com esses detalhes depois de 3 tentativas. Acrescente mais informações no campo de descrição (estilo, cor, ocasião de uso) e tente de novo."
            : null,
        },
      }), { headers: JSON_HEADERS });
    }

    const NO_TABLE_ACTIONS = ["upload_image", "list_images", "delete_image", "generate_description", "generate_bag_name", "get_match_analytics"];
    if (!NO_TABLE_ACTIONS.includes(action) && !ALLOWED_TABLES.includes(table)) {
      return new Response(JSON.stringify({ error: "invalid table" }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Upload de imagem (já com fundo removido, vindo do remove-bg, ou uma
    // foto crua enviada pela aba Upload/Galeria) pro Storage. Devolve a URL
    // pública, que é o que fica salvo em bags.img/looks.img, ou usada pela
    // galeria. Se `payload.exactName` vier true, usa o nome exatamente como
    // veio (já formatado com timestamp pelo front) em vez de prefixar com
    // Date.now() — necessário pra galeria conseguir listar por nome.
    if (action === "upload_image") {
      const { base64, filename, exactName } = payload;
      const commaIdx = base64.indexOf(",");
      const meta = base64.slice(0, commaIdx);
      const raw = base64.slice(commaIdx + 1);
      const contentType = /data:(.*?);base64/.exec(meta)?.[1] || "image/png";
      const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
      const safeName = filename.replace(/[^a-zA-Z0-9._\- ()]/g, "_");
      const path = exactName ? safeName : `${Date.now()}-${safeName}`;

      const up = await supabase.storage.from("product-images").upload(path, bytes, {
        contentType,
        upsert: true,
      });
      if (up.error) {
        return new Response(JSON.stringify({ error: up.error.message }), {
          status: 500,
          headers: JSON_HEADERS,
        });
      }
      const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
      return new Response(JSON.stringify({ data: { url: pub.publicUrl, path } }), {
        headers: JSON_HEADERS,
      });
    }

    // Lista todas as imagens já enviadas pra galeria (bucket product-images).
    if (action === "list_images") {
      const { data, error } = await supabase.storage.from("product-images").list("", {
        limit: 1000,
        sortBy: { column: "created_at", order: "desc" },
      });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: JSON_HEADERS,
        });
      }
      const catalogs = await loadCatalogImageRows(supabase);
      const files = (data || []).filter((f) => f.id); // ignora "pastas" fantasma
      const images = files.map((f) => {
        const { data: pub } = supabase.storage.from("product-images").getPublicUrl(f.name);
        return {
          name: f.name,
          url: pub.publicUrl,
          created_at: f.created_at,
          size: f.metadata?.size ?? null,
          usedBy: imageUsagesForPath(catalogs, f.name),
        };
      });
      return new Response(JSON.stringify({ data: images }), {
        headers: JSON_HEADERS,
      });
    }

    // Match Analytics — lê a tabela match_events (populada pelo tracking
    // anônimo em match.html) e devolve tudo já agregado: totais, séries por
    // dia/semana/mês/ano (acessos e matches), ranking por usuário anônimo,
    // ranking por peça, cruzamento peça×usuário e séries por peça ao longo
    // do tempo (só as 8 peças com mais matches, pra manter o gráfico legível).
    if (action === "get_match_analytics") {
      const { data: rows, error } = await supabase
        .from("match_events")
        .select("event_type, visitor_id, session_id, item_id, item_name, item_brand, created_at")
        .order("created_at", { ascending: true })
        .limit(50000);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: JSON_HEADERS,
        });
      }
      const events = rows || [];
      const dateOf = (e: any) => new Date(e.created_at);
      const pageViews = events.filter((e: any) => e.event_type === "page_view");
      const completes = events.filter((e: any) => e.event_type === "session_complete");
      const matches = events.filter((e: any) => e.event_type === "match");

      const visitsByDay   = toSortedSeries(countByKey(pageViews, (e: any) => bucketKeyDay(dateOf(e))));
      const visitsByWeek  = toSortedSeries(countByKey(pageViews, (e: any) => bucketKeyWeek(dateOf(e))));
      const visitsByMonth = toSortedSeries(countByKey(pageViews, (e: any) => bucketKeyMonth(dateOf(e))));
      const visitsByYear  = toSortedSeries(countByKey(pageViews, (e: any) => bucketKeyYear(dateOf(e))));

      const matchesByDay   = toSortedSeries(countByKey(matches, (e: any) => bucketKeyDay(dateOf(e))));
      const matchesByWeek  = toSortedSeries(countByKey(matches, (e: any) => bucketKeyWeek(dateOf(e))));
      const matchesByMonth = toSortedSeries(countByKey(matches, (e: any) => bucketKeyMonth(dateOf(e))));
      const matchesByYear  = toSortedSeries(countByKey(matches, (e: any) => bucketKeyYear(dateOf(e))));

      // Matches por usuário anônimo (visitor_id) — ranking geral.
      const byUserMap = countByKey(matches, (e: any) => e.visitor_id || "desconhecido");
      const matchesByUser = Object.entries(byUserMap)
        .map(([visitor_id, count]) => ({ visitor_id, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 200);

      // Matches por peça específica — ranking geral.
      const itemKey = (e: any) => `${e.item_brand || "?"}::${e.item_name || "Sem nome"}`;
      const byItemMap = countByKey(matches, itemKey);
      const matchesByItem = Object.entries(byItemMap)
        .map(([key, count]) => {
          const [item_brand, item_name] = key.split("::");
          return { item_brand, item_name, count };
        })
        .sort((a, b) => b.count - a.count);

      // Matches por peça específica × usuário — só as combinações que
      // aconteceram de fato, ranqueadas.
      const byItemUserMap: Record<string, number> = {};
      for (const e of matches) {
        const k = `${itemKey(e)}::${(e as any).visitor_id || "desconhecido"}`;
        byItemUserMap[k] = (byItemUserMap[k] || 0) + 1;
      }
      const matchesByItemByUser = Object.entries(byItemUserMap)
        .map(([key, count]) => {
          const [item_brand, item_name, visitor_id] = key.split("::");
          return { item_brand, item_name, visitor_id, count };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 300);

      // Matches por peça específica ao longo do tempo — só as 8 peças com
      // mais matches no total, pra manter o gráfico legível.
      const topItemKeys = matchesByItem.slice(0, 8).map((i) => `${i.item_brand}::${i.item_name}`);
      function seriesByItemAndPeriod(bucketFn: (d: Date) => string) {
        const perItem: Record<string, Record<string, number>> = {};
        for (const key of topItemKeys) perItem[key] = {};
        for (const e of matches) {
          const key = itemKey(e);
          if (!topItemKeys.includes(key)) continue;
          const bucket = bucketFn(dateOf(e));
          perItem[key][bucket] = (perItem[key][bucket] || 0) + 1;
        }
        return topItemKeys.map((key) => {
          const [item_brand, item_name] = key.split("::");
          return { item_brand, item_name, series: toSortedSeries(perItem[key]) };
        });
      }
      const matchesByItemByDay   = seriesByItemAndPeriod(bucketKeyDay);
      const matchesByItemByWeek  = seriesByItemAndPeriod(bucketKeyWeek);
      const matchesByItemByMonth = seriesByItemAndPeriod(bucketKeyMonth);
      const matchesByItemByYear  = seriesByItemAndPeriod(bucketKeyYear);

      const uniqueVisitors = new Set(events.map((e: any) => e.visitor_id).filter(Boolean)).size;
      const uniqueVisitorsCompleted = new Set(completes.map((e: any) => e.visitor_id).filter(Boolean)).size;
      const uniqueSessionsCompleted = new Set(completes.map((e: any) => e.session_id).filter(Boolean)).size;

      return new Response(JSON.stringify({
        data: {
          totals: {
            pageViews: pageViews.length,
            uniqueVisitors,
            sessionCompletes: completes.length,
            uniqueVisitorsCompleted,
            uniqueSessionsCompleted,
            matches: matches.length,
          },
          visitsByDay, visitsByWeek, visitsByMonth, visitsByYear,
          matchesByDay, matchesByWeek, matchesByMonth, matchesByYear,
          matchesByUser,
          matchesByItem,
          matchesByItemByUser,
          matchesByItemByDay, matchesByItemByWeek, matchesByItemByMonth, matchesByItemByYear,
        },
      }), { headers: JSON_HEADERS });
    }

    // Apaga uma imagem da galeria (Storage).
    if (action === "delete_image") {
      const { path } = payload;
      if (typeof path !== "string" || !path.trim()) {
        return new Response(JSON.stringify({ error: "Caminho da imagem inválido." }), {
          status: 400,
          headers: JSON_HEADERS,
        });
      }
      const catalogs = await loadCatalogImageRows(supabase);
      const usages = imageUsagesForPath(catalogs, path);
      if (usages.length) {
        const names = usages.map((usage) => `\"${usage.name}\"`).join(", ");
        return new Response(JSON.stringify({
          error: `Esta imagem está em uso por ${names}. Troque a imagem no cadastro antes de excluí-la da galeria.`,
          code: "image_in_use",
          usages,
        }), {
          status: 409,
          headers: JSON_HEADERS,
        });
      }
      const { error } = await supabase.storage.from("product-images").remove([path]);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: JSON_HEADERS,
        });
      }
      return new Response(JSON.stringify({ data: { path } }), {
        headers: JSON_HEADERS,
      });
    }

    // Grava/atualiza uma linha em bags ou looks (payload já vem no formato
    // snake_case da tabela — ver productToRow no front).
    if (action === "upsert") {
      // Origem do nome (manual|gemini) — metadado só pra bag_names, NÃO é
      // coluna de bags/looks. Agora vem como campo de nível superior
      // (nameSourceTop); o formato antigo (dentro do payload como
      // _name_source) ainda é aceito por compatibilidade. Em ambos os casos
      // o campo é removido do payload antes de gravar na tabela de verdade.
      const nameSource = (nameSourceTop ?? payload?._name_source) === "gemini" ? "gemini" : "manual";
      const rowPayload = { ...payload };
      delete rowPayload._name_source;

      const { data, error } = await supabase
        .from(table)
        .upsert(rowPayload)
        .select()
        .single();
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: JSON_HEADERS,
        });
      }

      // Só bolsas (table === "bags") entram no histórico de nomes — é o
      // catálogo que o gerador de nomes cobre. Editar o nome de uma bolsa já
      // cadastrada ATUALIZA o registro existente (mesmo product_id), nunca
      // cria um segundo órfão. Falha aqui não derruba o salvamento da bolsa.
      if (table === "bags" && data?.name && data?.id != null) {
        try {
          const nameNormalized = normalizeName(data.name);
          const syllableCount = countNameSyllables(data.name);
          const { data: existing } = await supabase
            .from("bag_names")
            .select("id")
            .eq("product_id", data.id)
            .maybeSingle();
          if (existing) {
            await supabase.from("bag_names").update({
              name: data.name,
              name_normalized: nameNormalized,
              syllable_count: syllableCount,
              source: nameSource,
            }).eq("id", existing.id);
          } else {
            await supabase.from("bag_names").upsert({
              name: data.name,
              name_normalized: nameNormalized,
              syllable_count: syllableCount,
              source: nameSource,
              product_id: data.id,
            }, { onConflict: "name_normalized", ignoreDuplicates: false });
          }
        } catch (_e) {
          // Não bloqueia o salvamento da bolsa por causa do histórico de nomes.
        }
      }

      return new Response(JSON.stringify({ data }), {
        headers: JSON_HEADERS,
      });
    }

    // Remove uma linha em bags ou looks a partir do id.
    if (action === "delete") {
      const { id } = payload;
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: JSON_HEADERS,
        });
      }
      return new Response(JSON.stringify({ data: { id } }), {
        headers: JSON_HEADERS,
      });
    }

    // Grava/atualiza uma configuração chave-valor em site_settings.
    if (action === "set_setting") {
      const { key, value } = payload;
      const { data, error } = await supabase
        .from("site_settings")
        .upsert({ key, value })
        .select()
        .single();
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: JSON_HEADERS,
        });
      }
      return new Response(JSON.stringify({ data }), {
        headers: JSON_HEADERS,
      });
    }

    return new Response(JSON.stringify({ error: "invalid action" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
});
