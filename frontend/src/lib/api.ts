const BASE_URL = "http://localhost:3000";

export const api = {
  get: async (endpoint: string) => {
    const res = await fetch(`${BASE_URL}${endpoint}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: "Request failed" }));
      throw new Error(errData.error || "Request failed");
    }
    return res.json();
  },
  post: async (endpoint: string, data: any) => {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: "Request failed" }));
      throw new Error(errData.error || "Request failed");
    }
    return res.json();
  },
};