"use client";

import { useEffect, useState } from "react";
import { ApiError, getMyAddresses } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import type { Address } from "@/types/user";

interface UseAddressesResult {
  addresses: Address[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// Saved shipping addresses for the logged-in user — reads the access token itself, same
// pattern as useCart/useOrders. Used by CheckoutPage to let the user pick a saved address
// instead of retyping receiver/address fields every time.
export function useAddresses(): UseAddressesResult {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const token = getAccessToken();
    if (!token) {
      setAddresses([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await getMyAddresses(token);
      setAddresses(response.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không thể tải danh sách địa chỉ.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function runEffect() {
      const token = getAccessToken();
      if (!token) {
        if (!cancelled) {
          setAddresses([]);
          setIsLoading(false);
          setError(null);
        }
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const response = await getMyAddresses(token);
        if (!cancelled) setAddresses(response.data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Không thể tải danh sách địa chỉ.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void runEffect();

    return () => {
      cancelled = true;
    };
  }, []);

  return { addresses, isLoading, error, refetch: run };
}
