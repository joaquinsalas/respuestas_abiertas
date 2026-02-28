import { useState, FormEvent } from 'react';
import { useAuth } from './AuthContext';

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
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '300px' }}>
                <h2 style={{ textAlign: 'center', margin: 0 }}>Iniciar sesión</h2>
                <input
                    type="text"
                    placeholder="Usuario"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    autoFocus
                />
                <input
                    type="password"
                    placeholder="Contraseña"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                />
                {error && <p style={{ color: 'red', margin: 0, fontSize: '14px' }}>{error}</p>}
                <button type="submit" disabled={loading}>
                    {loading ? 'Ingresando...' : 'Ingresar'}
                </button>
            </form>
        </div>
    );
}
