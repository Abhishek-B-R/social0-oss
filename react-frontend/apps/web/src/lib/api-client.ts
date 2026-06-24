import axios, { type AxiosError, type AxiosInstance } from "axios";
import type { ApiErrorBody } from "@/types";
import { getApiBaseUrl } from "@/lib/env";

export function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: getApiBaseUrl(),
    withCredentials: true,
    headers: { "Content-Type": "application/json" },
  });

  client.interceptors.response.use(
    (res) => res,
    (error: AxiosError<ApiErrorBody>) => {
      const message =
        typeof error.response?.data?.error === "string"
          ? error.response.data.error
          : error.message;
      return Promise.reject(new Error(message));
    },
  );

  return client;
}

export const api = createApiClient();

export async function apiGet<T>(url: string): Promise<T> {
  const { data } = await api.get<T>(url);
  return data;
}

export async function apiPost<T, B = unknown>(url: string, body?: B): Promise<T> {
  const { data } = await api.post<T>(url, body);
  return data;
}

export async function apiPatch<T, B = unknown>(url: string, body?: B): Promise<T> {
  const { data } = await api.patch<T>(url, body);
  return data;
}

export async function apiPut<T, B = unknown>(url: string, body?: B): Promise<T> {
  const { data } = await api.put<T>(url, body);
  return data;
}

export async function apiDelete<T>(url: string): Promise<T> {
  const { data } = await api.delete<T>(url);
  return data;
}
