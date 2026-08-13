import { assertEquals } from "https://deno.land/std@0.203.0/assert/mod.ts";
import { imageUsagesForPath, publicImagePath, srcsetReferencesPath } from "./image-usage.ts";

const BASE = "https://project.supabase.co/storage/v1/object/public/product-images/";

Deno.test("normaliza caminhos públicos com espaços codificados", () => {
  assertEquals(publicImagePath(`${BASE}Bolsa%20Luma.webp`), "Bolsa Luma.webp");
  assertEquals(publicImagePath(`${BASE}Bolsa Luma.webp`), "Bolsa Luma.webp");
  assertEquals(publicImagePath("webp/bolsa-local.webp"), null);
});

Deno.test("encontra uma variante dentro do srcset", () => {
  const srcset = `${BASE}catalogo-480w.webp 480w, ${BASE}catalogo-800w.webp 800w`;
  assertEquals(srcsetReferencesPath(srcset, "catalogo-800w.webp"), true);
  assertEquals(srcsetReferencesPath(srcset, "outra.webp"), false);
});

Deno.test("lista usos em Bags e Looks e informa o campo", () => {
  const catalogs = {
    bags: [{ id: 1, name: "My Tabi", img: `${BASE}tabi.webp`, img_srcset: null }],
    looks: [{
      id: 2,
      name: "Look Aurora",
      img: `${BASE}aurora.webp`,
      img_srcset: `${BASE}tabi.webp 480w, ${BASE}aurora-800w.webp 800w`,
    }],
  };
  assertEquals(imageUsagesForPath(catalogs, "tabi.webp"), [
    { table: "bags", id: 1, name: "My Tabi", fields: ["img"] },
    { table: "looks", id: 2, name: "Look Aurora", fields: ["img_srcset"] },
  ]);
  assertEquals(imageUsagesForPath(catalogs, "livre.webp"), []);
});
