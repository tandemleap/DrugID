"use client";

import { useState, useRef, useCallback } from "react";

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
}

type AppState = "idle" | "loading" | "result" | "error";

export default function Home() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<IdentifyResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedFileRef = useRef<File | null>(null);

  // Returns a compressed File for upload; uses a separate blob URL for preview
  const compressForUpload = useCallback(async (file: File): Promise<File> => {
    // Convert HEIC/HEIF to JPEG first (Chrome/Firefox can't decode HEIC natively)
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
        // If heic2any fails, continue with original and let canvas try
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
          if (width > height) {
            height = Math.round((height * MAX) / width);
            width = MAX;
          } else {
            width = Math.round((width * MAX) / height);
            height = MAX;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(file);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) return resolve(file);
            resolve(new File([blob], "pill.jpg", { type: "image/jpeg" }));
          },
          "image/jpeg",
          0.85
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(file); // fall back to original on error
      };
      img.src = objectUrl;
    });
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setAppState("idle");
      setResult(null);
      setErrorMsg("");

      // Show preview immediately using a blob URL of the original file
      const previewUrl = URL.createObjectURL(file);
      setPreview(previewUrl);

      // Compress in the background for upload
      const compressed = await compressForUpload(file);
      selectedFileRef.current = compressed;
    },
    [compressForUpload]
  );

  const handleIdentify = useCallback(async () => {
    const file = selectedFileRef.current;
    if (!file) return;

    setAppState("loading");
    setResult(null);
    setErrorMsg("");

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch("/api/identify", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong. Please try again.");
      }

      setResult(data);
      setAppState("result");
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.";
      setErrorMsg(msg);
      setAppState("error");
    }
  }, []);

  const handleReset = useCallback(() => {
    setPreview((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    setAppState("idle");
    setResult(null);
    setErrorMsg("");
    selectedFileRef.current = null;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const confidenceLabel = (confidence: string) => {
    if (confidence === "high") return null;
    if (confidence === "medium")
      return "Moderate confidence — consider asking your pharmacist.";
    return "Low confidence — please confirm with your pharmacist.";
  };

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
            <label
              htmlFor="pill-photo"
              className="flex flex-col items-center justify-center w-full min-h-40 border-2 border-dashed border-blue-300 rounded-xl cursor-pointer bg-blue-50 hover:bg-blue-100 transition-colors active:bg-blue-200"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt="Pill preview"
                  className="max-h-64 max-w-full rounded-lg object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 py-6 px-4 text-center">
                  <span className="text-5xl">📷</span>
                  <span className="text-slate-700 font-semibold text-xl leading-snug">
                    Take or Upload a Photo
                  </span>
                  <span className="text-slate-500 text-base">
                    Tap here to use your camera or choose a photo
                  </span>
                </div>
              )}
            </label>
            <input
              ref={fileInputRef}
              id="pill-photo"
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
            />

            {preview && appState !== "loading" && (
              <button
                onClick={handleIdentify}
                className="mt-5 w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xl font-bold py-4 rounded-xl transition-colors shadow-sm"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                Identify This Pill
              </button>
            )}

            {appState === "loading" && (
              <div className="mt-5 flex flex-col items-center gap-3 py-4">
                <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-slate-600 text-lg font-medium">
                  Analyzing pill&hellip;
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
                <p className="text-slate-500 text-base mb-4 italic">
                  {errorMsg}
                </p>
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
            {/* Preview thumbnail */}
            {preview && (
              <div className="bg-white rounded-2xl shadow-md p-4 flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Pill"
                  className="max-h-36 rounded-lg object-contain"
                />
              </div>
            )}

            {/* Main result card */}
            <div className="bg-white rounded-2xl shadow-md p-6">
              {/* Drug name */}
              <div className="mb-5">
                <div className="text-3xl font-bold text-slate-800 leading-tight">
                  {result.pill.brand_name !== "Unknown"
                    ? result.pill.brand_name
                    : result.pill.generic_name}
                </div>
                {result.pill.brand_name !== "Unknown" &&
                  result.pill.generic_name !== "Unknown" && (
                    <div className="text-slate-500 text-lg mt-1">
                      {result.pill.generic_name}
                    </div>
                  )}
              </div>

              {/* Details */}
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

              {/* Purpose */}
              {result.pill.purpose && (
                <div className="mt-4 bg-slate-50 rounded-xl p-4">
                  <div className="text-slate-500 text-base font-semibold uppercase tracking-wide mb-1">
                    What it&rsquo;s for
                  </div>
                  <p className="text-slate-700 text-lg leading-snug">
                    {result.pill.purpose}
                  </p>
                </div>
              )}

              {/* Confidence warning */}
              {result.pill.confidence !== "high" && (
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-amber-800 text-base font-medium">
                    ⚠️ {confidenceLabel(result.pill.confidence)}
                  </p>
                  {result.pill.notes && (
                    <p className="text-amber-700 text-base mt-1">
                      {result.pill.notes}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Med list match */}
            <div
              className={`rounded-2xl shadow-md p-5 ${
                result.medMatch.matched
                  ? "bg-green-50 border border-green-200"
                  : "bg-yellow-50 border border-yellow-200"
              }`}
            >
              {result.medMatch.matched ? (
                <p className="text-green-800 text-xl font-semibold">
                  ✓ This appears to be on your medication list
                  {result.medMatch.matchedEntry && (
                    <span className="font-normal text-green-700">
                      {" "}
                      ({result.medMatch.matchedEntry.brand},{" "}
                      {result.medMatch.matchedEntry.strength})
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

            {/* Disclaimer */}
            <p className="text-center text-slate-400 text-sm px-2 leading-snug">
              This tool is for reference only. Always confirm medications with
              your pharmacist or doctor.
            </p>

            {/* Check another button */}
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
      <span className="text-slate-500 text-lg font-medium w-28 shrink-0">
        {label}:
      </span>
      <span className="text-slate-700 text-lg">{value}</span>
    </div>
  );
}
