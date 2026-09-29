"use client";

import { useEffect, useState } from "react";
import { ApiError, getCategories } from "@/lib/api";
import type { Category } from "@/types/category";

interface UseCategoriesResult {
  categories: Category[];
  isLoading: boolean;
  error: string | null;
}

export function useCategories(): UseCategoriesResult {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setIsLoading(true);
      setError(null);
      try {
        // Filter/dropdown options: ask for the API max so every option shows up.
        const result = await getCategories({ limit: 100 });
        if (!cancelled) setCategories(result.data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Không thể tải danh mục.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  return { categories, isLoading, error };
}
