import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './auth/AuthContext'
import Login from './auth/Login'
import { Analyzer, ListGraphs } from './components/index.ts'
import './App.css'

function AppContent() {
    const { isAuthenticated, logout, user } = useAuth();
    const [page, setPage] = useState(1);
    const [graph, setGraph] = useState<number | string>(0);
    const [theme, setTheme] = useState<'light' | 'dark'>(
        () => (localStorage.getItem('ra_theme') as 'light' | 'dark') || 'light'
    );

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('ra_theme', theme);
    }, [theme]);

    const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

    if (!isAuthenticated) return <Login />;

    return (
        <div className="app-shell">
            <header className="app-header">
                <div className="app-header-brand">
                    <span>Respuestas Abiertas</span>
                </div>
                <div className="app-header-actions">
                    <span className="app-header-user">{user?.name}</span>
                    <button className="btn-theme" onClick={toggleTheme} title="Cambiar tema">
                        {theme === 'light' ? '☾' : '☀'}
                    </button>
                    <button className="btn-ghost" onClick={logout}>Cerrar sesión</button>
                </div>
            </header>
            <div className="app-content">
                {page === 1 && (<ListGraphs setPage={setPage} setGraph={setGraph} />)}
                {page === 2 && (<Analyzer graph={graph} setPage={setPage} />)}
            </div>
        </div>
    );
}

export default function App() {
    return (
        <AuthProvider>
            <AppContent />
        </AuthProvider>
    );
}
