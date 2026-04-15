"use client";

import { useState, useRef, useCallback } from "react";

const MAX_PHOTOS = 3;

interface PillData {
  brand_name: string;
  generic_name: string;
  strength: string;
  purpose: string;
  imprint: string;
  color: string;
  shape: string;
  confidence: "high" | "medium" | "low";
  notes: string;
}

interface MedMatchResult {
  matched: boolean;
  matchedEntry?: {
    brand: string;
    generic: string;
    strength: string;
  };
}

interface IdentifyResult {
  pill: PillData;
  medMatch: MedMatchResult;
  fdaData?: Record<string, string> | null;
  pillImageUrl?: string | null;
}

type AppState = "idle" | "loading" | "result" | "error";

interface PhotoEntry {
  previewUrl: string; // blob URL for display
  file: File;         // compressed file for upload (set async)
  ready: boolean;     // compression complete
}

export default function Home() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [result, setResult] = useState<IdentifyResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const compressForUpload = useCallback(async (file: File): Promise<File> => {
    const isHeic =
      file.type === "image/heic" ||
      file.type === "image/heif" ||
      file.name.toLowerCase().endsWith(".heic") ||
      file.name.toLowerCase().endsWith(".heif");

    if (isHeic) {
      try {
        const heic2any = (await import("heic2any")).default;
        const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
        const blob = Array.isArray(converted) ? converted[0] : converted;
        file = new File([blob], "pill.jpg", { type: "image/jpeg" });
      } catch {
        // fall through to canvas
      }
    }

    return new Promise((resolve) => {
      const img = new window.Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const MAX = 1600;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
          else { width = Math.round((width * MAX) / height); height = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(file);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => resolve(blob ? new File([blob], "pill.jpg", { type: "image/jpeg" }) : file),
          "image/jpeg", 0.85
        );
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
      img.src = objectUrl;
    });
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (fileInputRef.current) fileInputRef.current.value = "";

      const previewUrl = URL.createObjectURL(file);
      const entry: PhotoEntry = { previewUrl, file, ready: false };

      setPhotos((prev) => [...prev, entry]);
      setAppState("idle");
      setResult(null);
      setErrorMsg("");

      const compressed = await compressForUpload(file);
      setPhotos((prev) =>
        prev.map((p) =>
          p.previewUrl === previewUrl ? { ...p, file: compressed, ready: true } : p
        )
      );
    },
    [compressForUpload]
  );

  const handleRemovePhoto = useCallback((previewUrl: string) => {
    setPhotos((prev) => {
      const entry = prev.find((p) => p.previewUrl === previewUrl);
      if (entry) URL.revokeObjectURL(entry.previewUrl);
      return prev.filter((p) => p.previewUrl !== previewUrl);
    });
  }, []);

  const handleIdentify = useCallback(async () => {
    const readyPhotos = photos.filter((p) => p.ready);
    if (readyPhotos.length === 0) return;

    setAppState("loading");
    setResult(null);
    setErrorMsg("");

    try {
      const formData = new FormData();
      readyPhotos.forEach((p) => formData.append("images", p.file));

      const response = await fetch("/api/identify", { method: "POST", body: formData });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");

      setResult(data);
      setAppState("result");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setAppState("error");
    }
  }, [photos]);

  const handleReset = useCallback(() => {
    setPhotos((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return [];
    });
    setAppState("idle");
    setResult(null);
    setErrorMsg("");
  }, []);

  const allReady = photos.length > 0 && photos.every((p) => p.ready);

  return (
    <main className="min-h-screen bg-blue-50 flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">💊</div>
          <h1 className="text-3xl font-bold text-slate-800 leading-tight">
            Dad&rsquo;s Pill Checker
          </h1>
          <p className="text-slate-600 text-lg mt-2">
            Take a photo of a pill to identify it
          </p>
        </div>

        {/* Upload area */}
        {appState !== "result" && (
          <div className="bg-white rounded-2xl shadow-md p-6 mb-4">

            {/* First photo — big tap target */}
            {photos.length === 0 && (
              <label
                htmlFor="pill-photo"
                className="flex flex-col items-center justify-center w-full min-h-44 border-2 border-dashed border-blue-300 rounded-xl cursor-pointer bg-blue-50 hover:bg-blue-100 transition-colors active:bg-blue-200"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <div className="flex flex-col items-center gap-3 py-6 px-4 text-center">
                  <span className="text-5xl">📷</span>
                  <span className="text-slate-700 font-semibold text-xl leading-snug">
                    Take or Upload a Photo
                  </span>
                  <span className="text-slate-500 text-base">
                    Tap here to use your camera or choose a photo
                  </span>
                </div>
              </label>
            )}

            {/* Photo thumbnails grid */}
            {photos.length > 0 && (
              <div className="space-y-4">
                <div className={`grid gap-3 ${photos.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                  {photos.map((p, i) => (
                    <div key={p.previewUrl} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.previewUrl}
                        alt={`Pill photo ${i + 1}`}
                        className="w-full rounded-xl object-cover aspect-square bg-slate-100"
                      />
                      {/* Loading shimmer while compressing */}
                      {!p.ready && (
                        <div className="absolute inset-0 rounded-xl bg-white/60 flex items-center justify-center">
                          <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                        </div>
                      )}
                      {/* Remove button */}
                      <button
                        onClick={() => handleRemovePhoto(p.previewUrl)}
                        className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center text-lg leading-none hover:bg-black/70"
                        aria-label="Remove photo"
                      >
                        ×
                      </button>
                      <div className="absolute bottom-2 left-2 bg-black/40 text-white text-sm px-2 py-0.5 rounded-full">
                        {i === 0 ? "Front" : i === 1 ? "Back" : "Side"}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add another angle */}
                {photos.length < MAX_PHOTOS && appState !== "loading" && (
                  <label
                    htmlFor="pill-photo"
                    className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-blue-300 rounded-xl cursor-pointer bg-blue-50 hover:bg-blue-100 transition-colors text-blue-600 font-semibold text-lg"
                    style={{ WebkitTapHighlightColor: "transparent" }}
                  >
                    <span className="text-2xl">+</span>
                    Add another angle
                    <span className="text-slate-400 font-normal text-base">
                      ({photos.length}/{MAX_PHOTOS})
                    </span>
                  </label>
                )}
              </div>
            )}

            <input
              ref={fileInputRef}
              id="pill-photo"
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Identify button */}
            {photos.length > 0 && appState !== "loading" && (
              <button
                onClick={handleIdentify}
                disabled={!allReady}
                className="mt-5 w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white text-xl font-bold py-4 rounded-xl transition-colors shadow-sm"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                Identify This Pill
              </button>
            )}

            {appState === "loading" && (
              <div className="mt-5 flex flex-col items-center gap-3 py-4">
                <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-slate-600 text-lg font-medium">
                  Analyzing {photos.length > 1 ? `${photos.length} photos` : "photo"}&hellip;
                </p>
              </div>
            )}
          </div>
        )}

        {/* Error state */}
        {appState === "error" && (
          <div className="bg-white rounded-2xl shadow-md p-6 mb-4">
            <div className="text-center">
              <div className="text-4xl mb-3">📸</div>
              <p className="text-slate-700 text-xl font-semibold mb-2">
                The photo was hard to read.
              </p>
              <p className="text-slate-600 text-lg mb-5">
                Try taking it in better light, flat on a surface.
              </p>
              {errorMsg && (
                <p className="text-slate-500 text-base mb-4 italic">{errorMsg}</p>
              )}
              <button
                onClick={handleReset}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xl font-bold py-4 rounded-xl transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* Results */}
        {appState === "result" && result && (
          <div className="space-y-4">

            {/* Photo thumbnails row */}
            {photos.length > 0 && (
              <div className={`grid gap-2 ${photos.length === 1 ? "grid-cols-1" : photos.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                {photos.map((p, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={p.previewUrl}
                    src={p.previewUrl}
                    alt={`Pill photo ${i + 1}`}
                    className="w-full rounded-xl object-cover aspect-square bg-slate-100"
                  />
                ))}
              </div>
            )}

            {/* Main result card */}
            <div className="bg-white rounded-2xl shadow-md p-6">
              <div className="mb-5">
                <div className="text-3xl font-bold text-slate-800 leading-tight">
                  {result.pill.brand_name !== "Unknown" ? result.pill.brand_name : result.pill.generic_name}
                </div>
                {result.pill.brand_name !== "Unknown" && result.pill.generic_name !== "Unknown" && (
                  <div className="text-slate-500 text-lg mt-1">{result.pill.generic_name}</div>
                )}
              </div>

              {/* Database reference image */}
              {result.pillImageUrl && (
                <div className="mb-5">
                  <div className="text-slate-500 text-sm font-semibold uppercase tracking-wide mb-2">
                    Database match
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={result.pillImageUrl}
                    alt="Reference pill image from NLM database"
                    className="w-full max-h-48 object-contain rounded-xl bg-slate-50 border border-slate-100"
                  />
                  <p className="text-slate-400 text-xs mt-1 text-center">Source: NLM DailyMed</p>
                </div>
              )}

              <div className="space-y-3 border-t border-slate-100 pt-4">
                {result.pill.strength && result.pill.strength !== "Unknown" && (
                  <DetailRow label="Strength" value={result.pill.strength} />
                )}
                {result.pill.color && (
                  <DetailRow
                    label="Appearance"
                    value={`${result.pill.color}${result.pill.shape ? `, ${result.pill.shape}` : ""}`}
                  />
                )}
                {result.pill.imprint && result.pill.imprint !== "Unknown" && result.pill.imprint !== "None" && (
                  <DetailRow label="Imprint" value={result.pill.imprint} />
                )}
              </div>

              {result.pill.purpose && (
                <div className="mt-4 bg-slate-50 rounded-xl p-4">
                  <div className="text-slate-500 text-base font-semibold uppercase tracking-wide mb-1">
                    What it&rsquo;s for
                  </div>
                  <p className="text-slate-700 text-lg leading-snug">{result.pill.purpose}</p>
                </div>
              )}

              {result.pill.confidence !== "high" && (
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-amber-800 text-base font-medium">
                    ⚠️ {result.pill.confidence === "medium"
                      ? "Moderate confidence — consider asking your pharmacist."
                      : "Low confidence — please confirm with your pharmacist."}
                  </p>
                  {result.pill.notes && (
                    <p className="text-amber-700 text-base mt-1">{result.pill.notes}</p>
                  )}
                </div>
              )}
            </div>

            {/* Med list match */}
            <div className={`rounded-2xl shadow-md p-5 ${result.medMatch.matched ? "bg-green-50 border border-green-200" : "bg-yellow-50 border border-yellow-200"}`}>
              {result.medMatch.matched ? (
                <p className="text-green-800 text-xl font-semibold">
                  ✓ This appears to be on your medication list
                  {result.medMatch.matchedEntry && (
                    <span className="font-normal text-green-700">
                      {" "}({result.medMatch.matchedEntry.brand}, {result.medMatch.matchedEntry.strength})
                    </span>
                  )}
                </p>
              ) : (
                <div>
                  <p className="text-yellow-800 text-xl font-semibold">
                    ⚠ This medication was not found on your list
                  </p>
                  <p className="text-yellow-700 text-base mt-1">
                    Double-check with your pharmacist before taking it.
                  </p>
                </div>
              )}
            </div>

            <p className="text-center text-slate-400 text-sm px-2 leading-snug">
              This tool is for reference only. Always confirm medications with your pharmacist or doctor.
            </p>

            <button
              onClick={handleReset}
              className="w-full bg-slate-700 hover:bg-slate-800 active:bg-slate-900 text-white text-xl font-bold py-4 rounded-xl transition-colors shadow-sm"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              Check Another Pill
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-slate-500 text-lg font-medium w-28 shrink-0">{label}:</span>
      <span className="text-slate-700 text-lg">{value}</span>
    </div>
  );
}
