/**
 * VaultGold Accounts — shared auth client
 * Drop this file into each tracker's src/ and import { VaultGoldAuth } from './vaultgold-auth'
 */

export const VAULTGOLD_API = 'https://vaultgold.net';

export interface VGUser {
  id: string;
  username: string;
  email: string;
}

export interface VGLinkedServices {
  spotify?: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    username: string | null;
  };
  lastfm?: {
    session_key: string;
    username: string | null;
  };
}

export interface VGSession {
  user: VGUser;
  linked: VGLinkedServices;
}

const TOKEN_KEY = 'vg_token';
const USER_KEY = 'vg_user';

export const VaultGoldAuth = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  getUser(): VGUser | null {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
  },

  isSignedIn(): boolean {
    return !!this.getToken() && !!this.getUser();
  },

  setSession(token: string, user: VGUser) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  async signIn(login: string, password: string): Promise<{ ok: true; token: string; user: VGUser } | { ok: false; error: string }> {
    const res = await fetch(`${VAULTGOLD_API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || 'Sign in failed' };
    this.setSession(data.token, data.user);
    return { ok: true, token: data.token, user: data.user };
  },

  async register(username: string, email: string, password: string): Promise<{ ok: true; token: string; user: VGUser } | { ok: false; error: string }> {
    const res = await fetch(`${VAULTGOLD_API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || 'Registration failed' };
    this.setSession(data.token, data.user);
    return { ok: true, token: data.token, user: data.user };
  },

  async signOut() {
    const token = this.getToken();
    if (token) {
      await fetch(`${VAULTGOLD_API}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    this.clearSession();
  },

  async getSession(): Promise<VGSession | null> {
    const token = this.getToken();
    if (!token) return null;
    const res = await fetch(`${VAULTGOLD_API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 401) this.clearSession();
      return null;
    }
    return res.json();
  },

  /**
   * Hydrate Spotify localStorage keys from VaultGold account.
   * Call this after sign-in so the tracker's existing Spotify logic works unchanged.
   */
  async hydrateSpotify(): Promise<boolean> {
    const session = await this.getSession();
    if (!session?.linked.spotify) return false;
    const { access_token, refresh_token, expires_at } = session.linked.spotify;
    localStorage.setItem('spotify_access_token', access_token);
    localStorage.setItem('spotify_refresh_token', refresh_token);
    localStorage.setItem('spotify_expires_at', String(expires_at));
    return true;
  },

  /**
   * Hydrate Last.fm localStorage keys from VaultGold account.
   */
  async hydrateLastfm(): Promise<boolean> {
    const session = await this.getSession();
    if (!session?.linked.lastfm) return false;
    localStorage.setItem('lastfm_session_key', session.linked.lastfm.session_key);
    if (session.linked.lastfm.username) {
      localStorage.setItem('lastfm_username', session.linked.lastfm.username);
    }
    return true;
  },

  /**
   * Open the VaultGold account page in a new tab.
   */
  openAccountPage() {
    window.open(`${VAULTGOLD_API}/account`, '_blank');
  },

  signInWithGoogle() {
    const returnTo = window.location.origin;
    window.open(
      `${VAULTGOLD_API}/api/auth/google/connect?return_to=${encodeURIComponent(returnTo)}`,
      'vg-google',
      'width=500,height=600'
    );
  },
};
