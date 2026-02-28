import { useState } from 'react'
import { AuthProvider, useAuth } from './auth/AuthContext'
import Login from './auth/Login'
import { Analyzer, ListGraphs } from './components/index.ts'

function AppContent() {
    const { isAuthenticated } = useAuth();
    const [page, setPage] = useState(1);
    const [graph, setGraph] = useState(0);

    if (!isAuthenticated) return <Login />;

    return (
        <div>
            {page === 1 && (<ListGraphs setPage={setPage} setGraph={setGraph} />)}
            {page === 2 && (<Analyzer graph={graph} setPage={setPage} />)}
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
