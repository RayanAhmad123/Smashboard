"use client";

import { useState } from "react";
import type { Court, Tenant } from "@/lib/supabase/types";
import { updateTenant, uploadLogo } from "@/lib/db/tenants";
import {
  addCourt,
  deleteCourt,
  renameCourt,
  reorderCourts,
} from "@/lib/db/courts";

export function SettingsClient({
  tenant,
  initialCourts,
}: {
  tenant: Tenant;
  initialCourts: Court[];
}) {
  const [name, setName] = useState(tenant.name);
  const [color, setColor] = useState(tenant.primary_color || "#10b981");

  // logo_url — current saved URL + pending file to upload
  const [logoUrl, setLogoUrl] = useState(tenant.logo_url || "");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState(tenant.logo_url || "");

  // logo_url_dark — same pattern
  const [logoDarkUrl, setLogoDarkUrl] = useState(tenant.logo_url_dark || "");
  const [logoDarkFile, setLogoDarkFile] = useState<File | null>(null);
  const [logoDarkPreview, setLogoDarkPreview] = useState(tenant.logo_url_dark || "");

  const [savedTenant, setSavedTenant] = useState(false);
  const [savingTenant, setSavingTenant] = useState(false);

  function handleLogoFile(file: File, variant: "light" | "dark") {
    const preview = URL.createObjectURL(file);
    if (variant === "light") {
      setLogoFile(file);
      setLogoPreview(preview);
    } else {
      setLogoDarkFile(file);
      setLogoDarkPreview(preview);
    }
  }

  const [courts, setCourts] = useState<Court[]>(initialCourts);
  const [newCourt, setNewCourt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const accent = color || "#10b981";

  async function saveTenant() {
    setSavingTenant(true);
    setErr(null);
    setSavedTenant(false);
    try {
      let finalLogoUrl = logoUrl;
      let finalLogoDarkUrl = logoDarkUrl;

      if (logoFile) {
        finalLogoUrl = await uploadLogo(tenant.id, logoFile, "light");
        setLogoUrl(finalLogoUrl);
        setLogoFile(null);
      }
      if (logoDarkFile) {
        finalLogoDarkUrl = await uploadLogo(tenant.id, logoDarkFile, "dark");
        setLogoDarkUrl(finalLogoDarkUrl);
        setLogoDarkFile(null);
      }

      await updateTenant(tenant.id, {
        name: name.trim(),
        primary_color: color,
        logo_url: finalLogoUrl || null,
        logo_url_dark: finalLogoDarkUrl || null,
      });
      setSavedTenant(true);
      setTimeout(() => setSavedTenant(false), 2000);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSavingTenant(false);
    }
  }

  async function handleAddCourt() {
    const trimmed = newCourt.trim();
    if (!trimmed) return;
    setBusy("new");
    setErr(null);
    try {
      const nextOrder = courts.length
        ? Math.max(...courts.map((c) => c.sort_order)) + 1
        : 0;
      const c = await addCourt(tenant.id, trimmed, nextOrder);
      setCourts((prev) => [...prev, c]);
      setNewCourt("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleRename(c: Court, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === c.name) return;
    setBusy(c.id);
    setErr(null);
    try {
      await renameCourt(c.id, trimmed);
      setCourts((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, name: trimmed } : x))
      );
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(c: Court) {
    if (!confirm(`Ta bort ${c.name}?`)) return;
    setBusy(c.id);
    setErr(null);
    try {
      await deleteCourt(c.id);
      setCourts((prev) => prev.filter((x) => x.id !== c.id));
    } catch (e) {
      const er = e as { code?: string; message?: string };
      const isFk =
        er.code === "23503" || /foreign key/i.test(er.message || "");
      setErr(
        isFk
          ? `${c.name} används av en eller flera tävlingar och kan inte tas bort. Ta bort eller arkivera tävlingarna som har spelats på den här banan först.`
          : er.message || "Ett fel uppstod."
      );
    } finally {
      setBusy(null);
    }
  }

  async function move(c: Court, dir: -1 | 1) {
    const idx = courts.findIndex((x) => x.id === c.id);
    const target = idx + dir;
    if (target < 0 || target >= courts.length) return;
    const next = courts.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    const updated = next.map((x, i) => ({ ...x, sort_order: i }));
    setCourts(updated);
    setBusy(c.id);
    setErr(null);
    try {
      await reorderCourts(updated.map((x) => ({ id: x.id, sort_order: x.sort_order })));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <div className="px-6 py-6 max-w-4xl">
        <h1 className="text-2xl font-bold tracking-tight mb-1">
          Inställningar
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">{tenant.name}</p>

        {err && (
          <div className="mb-4 rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-2 text-sm text-red-700 dark:text-red-400">
            {err}
          </div>
        )}

        <section className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-5 mb-6">
          <h2 className="text-base font-semibold mb-4">Varumärke</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Klubbnamn">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 dark:text-zinc-100"
              />
            </Field>
            <Field label="Logo (ljust läge)">
              <LogoUpload
                preview={logoPreview}
                file={logoFile}
                onChange={(f) => handleLogoFile(f, "light")}
                onClear={() => { setLogoFile(null); setLogoPreview(""); setLogoUrl(""); }}
              />
            </Field>
            <Field label="Logo (mörkt läge)">
              <LogoUpload
                preview={logoDarkPreview}
                file={logoDarkFile}
                onChange={(f) => handleLogoFile(f, "dark")}
                onClear={() => { setLogoDarkFile(null); setLogoDarkPreview(""); setLogoDarkUrl(""); }}
                darkBg
              />
            </Field>
            <Field label="Primärfärg">
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 w-14 rounded-md border border-zinc-300 dark:border-zinc-600 cursor-pointer"
                />
                <input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 dark:text-zinc-100 font-mono text-sm"
                />
              </div>
            </Field>
            <Field label="Förhandsvisning">
              <div className="flex items-center gap-3">
                <span
                  className="inline-flex items-center justify-center h-10 w-10 rounded-md font-bold"
                  style={{ backgroundColor: `${accent}22`, color: accent }}
                >
                  {(name || "?").charAt(0)}
                </span>
                <span
                  className="px-3 py-1.5 rounded-md text-white text-sm font-semibold"
                  style={{ backgroundColor: accent }}
                >
                  Knapp
                </span>
              </div>
            </Field>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={saveTenant}
              disabled={savingTenant || !name.trim()}
              className="px-4 py-2 rounded-md text-white text-sm font-semibold disabled:opacity-50"
              style={{ backgroundColor: accent }}
            >
              {savingTenant ? "Sparar..." : "Spara"}
            </button>
            {savedTenant && (
              <span className="text-sm text-zinc-500 dark:text-zinc-400">Sparad ✓</span>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-5">
          <h2 className="text-base font-semibold mb-4">Banor</h2>

          <div className="flex gap-2 mb-4">
            <input
              value={newCourt}
              onChange={(e) => setNewCourt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAddCourt();
              }}
              placeholder="t.ex. Court 9"
              className="flex-1 px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 dark:text-zinc-100"
            />
            <button
              onClick={handleAddCourt}
              disabled={busy === "new" || !newCourt.trim()}
              className="px-4 py-2 rounded-md text-white text-sm font-semibold disabled:opacity-50"
              style={{ backgroundColor: accent }}
            >
              Lägg till
            </button>
          </div>

          {courts.length === 0 ? (
            <div className="text-sm text-zinc-500 dark:text-zinc-400 py-6 text-center border border-dashed border-zinc-200 dark:border-zinc-700 rounded-md">
              Inga banor.
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md overflow-hidden">
              {courts.map((c, i) => (
                <li
                  key={c.id}
                  className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-zinc-900"
                >
                  <span className="text-zinc-400 dark:text-zinc-500 text-xs font-mono w-6 text-right">
                    {i + 1}
                  </span>
                  <input
                    defaultValue={c.name}
                    onBlur={(e) => handleRename(c, e.target.value)}
                    className="flex-1 px-2 py-1 rounded border border-transparent hover:border-zinc-200 dark:hover:border-zinc-600 focus:border-zinc-300 dark:focus:border-zinc-500 focus:outline-none bg-transparent text-zinc-900 dark:text-zinc-100"
                  />
                  <button
                    onClick={() => move(c, -1)}
                    disabled={busy === c.id || i === 0}
                    className="px-2 py-1 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 disabled:opacity-30"
                    aria-label="Flytta upp"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(c, 1)}
                    disabled={busy === c.id || i === courts.length - 1}
                    className="px-2 py-1 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 disabled:opacity-30"
                    aria-label="Flytta ned"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => handleDelete(c)}
                    disabled={busy === c.id}
                    className="px-2 py-1 text-zinc-400 dark:text-zinc-500 hover:text-red-600 disabled:opacity-50"
                    aria-label="Ta bort"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function LogoUpload({
  preview,
  file,
  onChange,
  onClear,
  darkBg = false,
}: {
  preview: string;
  file: File | null;
  onChange: (f: File) => void;
  onClear: () => void;
  darkBg?: boolean;
}) {
  const inputId = darkBg ? "logo-dark-upload" : "logo-light-upload";
  return (
    <div className="flex items-center gap-3">
      {/* Preview box */}
      <div
        className={`h-14 w-24 rounded-md border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shrink-0 overflow-hidden ${
          darkBg ? "bg-zinc-800" : "bg-white dark:bg-zinc-800"
        }`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Logo" className="max-h-12 max-w-full object-contain" />
        ) : (
          <span className="text-xs text-zinc-400 dark:text-zinc-500">Ingen</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5 min-w-0">
        <label
          htmlFor={inputId}
          className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          {file ? "Byt bild" : preview ? "Byt bild" : "Välj bild"}
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onChange(f);
            e.target.value = "";
          }}
        />
        {(preview || file) && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-red-500 text-left"
          >
            Ta bort logo
          </button>
        )}
        {file && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-[12rem]">
            {file.name}
          </p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 font-medium">{label}</div>
      {children}
    </label>
  );
}
