export type CatalogImageRow = {
  id: number;
  name: string;
  img: string | null;
  img_srcset: string | null;
};

export type ImageUsage = {
  table: "bags" | "looks";
  id: number;
  name: string;
  fields: ("img" | "img_srcset")[];
};

const PUBLIC_IMAGE_MARKER = "/storage/v1/object/public/product-images/";

// Transforma qualquer URL pública do bucket no caminho real do objeto. A
// comparação por caminho funciona tanto com espaços codificados (%20) quanto
// com a URL crua devolvida pelo Storage.
export function publicImagePath(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const pathname = new URL(value).pathname;
    const markerIndex = pathname.indexOf(PUBLIC_IMAGE_MARKER);
    if (markerIndex < 0) return null;
    return decodeURIComponent(pathname.slice(markerIndex + PUBLIC_IMAGE_MARKER.length));
  } catch (_) {
    return null;
  }
}

export function srcsetReferencesPath(srcset: unknown, path: string): boolean {
  if (typeof srcset !== "string") return false;
  return srcset.split(",").some((entry) => {
    const url = entry.trim().split(/\s+/)[0];
    return publicImagePath(url) === path;
  });
}

export async function loadCatalogImageRows(supabase: any): Promise<{
  bags: CatalogImageRow[];
  looks: CatalogImageRow[];
}> {
  const [bagsResult, looksResult] = await Promise.all([
    supabase.from("bags").select("id,name,img,img_srcset"),
    supabase.from("looks").select("id,name,img,img_srcset"),
  ]);
  if (bagsResult.error) throw new Error(`Falha ao verificar imagens de Bags: ${bagsResult.error.message}`);
  if (looksResult.error) throw new Error(`Falha ao verificar imagens de Looks: ${looksResult.error.message}`);
  return {
    bags: (bagsResult.data || []) as CatalogImageRow[],
    looks: (looksResult.data || []) as CatalogImageRow[],
  };
}

export function imageUsagesForPath(
  catalogs: { bags: CatalogImageRow[]; looks: CatalogImageRow[] },
  path: string,
): ImageUsage[] {
  const usages: ImageUsage[] = [];
  for (const table of ["bags", "looks"] as const) {
    for (const row of catalogs[table]) {
      const fields: ("img" | "img_srcset")[] = [];
      if (publicImagePath(row.img) === path) fields.push("img");
      if (srcsetReferencesPath(row.img_srcset, path)) fields.push("img_srcset");
      if (fields.length) usages.push({ table, id: row.id, name: row.name, fields });
    }
  }
  return usages;
}
