import { create } from "zustand";
export async function api<T = any>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const r = await fetch("/api" + url, {
    ...options,
    headers:
      options?.body instanceof FormData
        ? options.headers
        : { "Content-Type": "application/json", ...options?.headers },
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Không kết nối được máy chủ.");
  return data;
}
export const useUI = create<{ toast: string; notify: (s: string) => void }>(
  (set) => ({
    toast: "",
    notify: (toast) => {
      set({ toast });
      setTimeout(() => set({ toast: "" }), 5000);
    },
  }),
);
export const parts = [
  "Photographs",
  "Question–Response",
  "Conversations",
  "Talks",
  "Incomplete Sentences",
  "Text Completion",
  "Reading Comprehension",
];
export const date = (s: string) => new Date(s).toLocaleDateString("vi-VN");
export function clock(s: number) {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}
