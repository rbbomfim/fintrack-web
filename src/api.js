// Cliente HTTP com JWT. BASE_URL vem do env.js (window.__FINTRACK_CONFIG__).
const API_BASE_URL =
  (window.__FINTRACK_CONFIG__ && window.__FINTRACK_CONFIG__.API_BASE_URL) || 'http://localhost:8000';

const TOKEN_KEY = 'fintrack_token';

let unauthorizedHandler = null;

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function requestApi(method, path, body) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { method, headers, body: payload });

  if (response.status === 401 && unauthorizedHandler) {
    unauthorizedHandler();
  }

  if (response.status === 204) return null;

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const detail = typeof data === 'string' ? data : data.detail || 'Erro inesperado';
    const error = new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    error.status = response.status;
    throw error;
  }

  return data;
}

export { API_BASE_URL };
