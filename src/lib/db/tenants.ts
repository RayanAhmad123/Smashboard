import { supabaseClient } from "../supabase/client";
import { getSupabaseServer } from "../supabase/server";
import type { Tenant } from "../supabase/types";

/** Upload a logo file to Supabase Storage and return the public URL. */
export async function uploadLogo(
  tenantId: string,
  file: File,
  variant: "light" | "dark"
): Promise<string> {
  const ext = file.name.split(".").pop() ?? "png";
  const path = `${tenantId}/logo-${variant}.${ext}`;
  const { error } = await supabaseClient.storage
    .from("logos")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw new Error(error.message);
  const { data } = supabaseClient.storage.from("logos").getPublicUrl(path);
  // Bust cache so the new image shows immediately
  return `${data.publicUrl}?t=${Date.now()}`;
}

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("tenants")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data as Tenant | null;
}

export async function updateTenant(
  id: string,
  patch: Partial<Pick<Tenant, "name" | "primary_color" | "logo_url" | "logo_url_dark">>
): Promise<Tenant> {
  const { data, error } = await supabaseClient
    .from("tenants")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Tenant;
}
