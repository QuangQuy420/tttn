"use client";

import { useState } from "react";
import { ApiError, analyzeFace } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import type { FaceAnalysisResult } from "@/types/face";

interface UseFaceAnalysisResult {
  result: FaceAnalysisResult | null;
  isLoading: boolean;
  error: string | null;
  analyze: (file: File) => Promise<void>;
  // Drops a failed analysis' error, e.g. when the user opens a history item instead (AC66).
  clearError: () => void;
}

// Action-triggered (not fetch-on-mount like useProduct) — analyze() runs on file select.
export function useFaceAnalysis(): UseFaceAnalysisResult {
  const [result, setResult] = useState<FaceAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze(file: File) {
    const token = getAccessToken();
    if (!token) {
      setResult(null);
      setError("You must be logged in to analyze a photo.");
      return;
    }

    setIsLoading(true);
    setError(null);
    // Clear the previous result up front — otherwise, while a second photo is being
    // analyzed, the page would keep showing the FIRST photo's result (its imageUrl takes
    // precedence over the freshly-selected local preview) until the new request resolves.
    setResult(null);
    try {
      const analysis = await analyzeFace(file, token);
      setResult(analysis);
    } catch (err) {
      setResult(null);
      setError(err instanceof ApiError ? err.message : "Face analysis failed.");
    } finally {
      setIsLoading(false);
    }
  }

  function clearError() {
    setError(null);
  }

  return { result, isLoading, error, analyze, clearError };
}
