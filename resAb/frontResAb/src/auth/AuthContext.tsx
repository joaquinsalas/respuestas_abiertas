import { createContext, useContext, useState, type ReactNode } from 'react';
import { ROUTES } from '../routes';

interface User {
    id: number;
    name: string;
}

interface Auth {
    user: User | null;
    isAuthenticated: boolean;
    login: (name: string, password: string) => Promise<void>;
    logout: () => void;
    authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(() => {
        const stored = localStorage.getItem('ra_user');
        return stored ? JSON.parse(stored) : null;
    });
    const [token, setToken] = useState<string | null>(() =>
        localStorage.getItem('ra_access')
    );

    const login = async (name: string, password: string) => {
        const res = await fetch(ROUTES.login, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, password }),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Credenciales inválidas');
        }
        const data = await res.json();
        setToken(data.access);
        setUser(data.user);
        localStorage.setItem('ra_access', data.access);
        localStorage.setItem('ra_refresh', data.refresh);
        localStorage.setItem('ra_user', JSON.stringify(data.user));
    };

    const logout = () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('ra_access');
        localStorage.removeItem('ra_refresh');
        localStorage.removeItem('ra_user');
    };

    const authFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
        const headers = new Headers(options.headers);
        headers.set('Authorization', `Bearer ${token}`);
        const res = await fetch(url, { ...options, headers });
        if (res.status === 401 || res.status === 403) {
            logout();
            throw new Error('Sesión expirada. Por favor inicia sesión de nuevo.');
        }
        return res;
    };

    return (
        <AuthContext.Provider value={{ user, isAuthenticated: !!user && !!token, login, logout, authFetch }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): Auth {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
    return ctx;
}
