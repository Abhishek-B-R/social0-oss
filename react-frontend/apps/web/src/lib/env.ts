import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_URL ?? "";
}

export function getAuthBaseUrl(): string {
  return import.meta.env.VITE_AUTH_URL ?? import.meta.env.VITE_API_URL ?? "";
}

export function getAppUrl(): string {
  return import.meta.env.VITE_APP_URL ?? window.location.origin;
}
