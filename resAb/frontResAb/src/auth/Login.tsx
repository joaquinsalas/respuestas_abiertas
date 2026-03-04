import { useState, type FormEvent } from 'react';
import { useAuth } from './AuthContext';
import './Login.css';

export default function Login() {
    const { login } = useAuth();
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(name, password);
        } catch (err: any) {
            setError(err.message || 'Error al iniciar sesión');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-header">
                    <h1 className="login-title">Respuestas Abiertas</h1>
                    <p className="login-subtitle">Ingresa tus credenciales para continuar</p>
                </div>
                <form onSubmit={handleSubmit} className="login-form">
                    <div className="login-field">
                        <label htmlFor="login-name">Usuario</label>
                        <input
                            id="login-name"
                            type="text"
                            placeholder="Nombre de usuario"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            required
                            autoFocus
                        />
                    </div>
                    <div className="login-field">
                        <label htmlFor="login-password">Contraseña</label>
                        <input
                            id="login-password"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    {error && (
                        <div className="login-error">
                            <span>⚠</span> {error}
                        </div>
                    )}
                    <button
                        type="submit"
                        className="btn-primary login-submit"
                        disabled={loading}
                    >
                        {loading ? 'Ingresando…' : 'Iniciar sesión'}
                    </button>
                </form>
            </div>
        </div>
    );
}
