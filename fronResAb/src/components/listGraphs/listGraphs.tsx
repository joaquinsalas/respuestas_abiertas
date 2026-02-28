import { useEffect, useState } from 'react'
import { ROUTES } from '../../routes.ts'
import { useAuth } from '../../auth/AuthContext.tsx'
import './listGraphs.css'

interface Graph {
    name: string;
    id: string | number;
    date: any;
}

/* ─── Upload Dialog ──────────────────────────────────────────────────────────── */

interface UploadCSVProps {
    setPage: (v: number) => void;
    setGraph: (v: number | string) => void;
}

const UploadCSV = ({ setPage, setGraph }: UploadCSVProps) => {
    const { authFetch } = useAuth();
    const [columns, setColumns] = useState<string[]>([]);
    const [isColumnIndex, setIsColumnIndex] = useState(false);
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [columnsSelected, setColumnsSelected] = useState('');
    const [nameAnalysis, setNameAnalysis] = useState('');
    const [loading, setLoading] = useState(false);
    const [fileName, setFileName] = useState('');

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (event) => {
            const csvData = event.target?.result as string;
            setCsvFile(file);
            const headers = csvData.split('\n')[0].split(',').map(h => h.trim());
            setColumns(headers);
            setColumnsSelected(headers[0]);
        };
        reader.readAsText(file);
    };

    const handleSubmit = async (e: React.MouseEvent) => {
        e.preventDefault();
        if (!csvFile || !nameAnalysis) return;
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('file', csvFile);
            formData.append('text_column', columnsSelected);
            formData.append('name', nameAnalysis);
            if (isColumnIndex) formData.append('id_column', columnsSelected);

            const response = await authFetch(ROUTES.upload_csv, {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                const data = await response.json();
                (document.getElementById('uploadCSV') as HTMLDialogElement)?.close();
                setGraph(data.graph_id);
                setPage(2);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <dialog id="uploadCSV">
            <div className="dialog-inner">
                <div className="dialog-header">
                    <h2 className="dialog-title">Nuevo análisis</h2>
                    <button
                        className="dialog-close-btn"
                        onClick={() => (document.getElementById('uploadCSV') as HTMLDialogElement)?.close()}
                    >×</button>
                </div>

                <div className="dialog-field">
                    <label htmlFor="name-analysis">Nombre del análisis</label>
                    <input
                        id="name-analysis"
                        type="text"
                        placeholder="Ej. Encuesta satisfacción Q1 2025"
                        value={nameAnalysis}
                        onChange={e => setNameAnalysis(e.target.value)}
                    />
                </div>

                <div className="dialog-field">
                    <label>Archivo CSV</label>
                    <div className="file-input-wrapper">
                        <input type="file" accept=".csv" onChange={handleFile} />
                        <span className="file-input-label">
                            {fileName
                                ? <><span>📄</span> {fileName}</>
                                : <><span>Seleccionar archivo</span> .csv</>
                            }
                        </span>
                    </div>
                </div>

                {columns.length > 0 && (
                    <div className="dialog-field">
                        <label htmlFor="columns-select">Columna a analizar</label>
                        <select
                            id="columns-select"
                            value={columnsSelected}
                            onChange={e => setColumnsSelected(e.target.value)}
                        >
                            {columns.map((col, i) => (
                                <option key={i} value={col}>{col}</option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="checkbox-row">
                    <input
                        id="column-index-checkbox"
                        type="checkbox"
                        checked={isColumnIndex}
                        onChange={() => setIsColumnIndex(!isColumnIndex)}
                    />
                    <label htmlFor="column-index-checkbox">Usar esta columna como índice</label>
                </div>

                <div className="dialog-footer">
                    <button
                        className="btn-ghost"
                        onClick={() => (document.getElementById('uploadCSV') as HTMLDialogElement)?.close()}
                    >Cancelar</button>
                    <button
                        className="btn-primary"
                        onClick={handleSubmit}
                        disabled={loading || !csvFile || !nameAnalysis}
                    >
                        {loading ? 'Procesando…' : 'Crear análisis'}
                    </button>
                </div>
            </div>
        </dialog>
    );
};

/* ─── List Graphs ────────────────────────────────────────────────────────────── */

interface ListGraphsProps {
    setPage: (v: number) => void;
    setGraph: (v: number | string) => void;
}

export const ListGraphs = ({ setPage, setGraph }: ListGraphsProps) => {
    const { authFetch } = useAuth();
    const [graphs, setGraphs] = useState<Graph[]>([]);

    useEffect(() => {
        const getGraphs = async () => {
            try {
                const response = await authFetch(ROUTES.get_graphs);
                const data = await response.json();
                setGraphs(data);
            } catch (e) {
                console.error('Error loading graphs', e);
            }
        };
        getGraphs();
    }, []);

    const handleOpen = (id: string | number) => {
        setGraph(id);
        setPage(2);
    };

    return (
        <div className="list-graphs-page">
            <div className="list-graphs-page-header">
                <div>
                    <h2 className="list-graphs-page-title">Mis análisis</h2>
                    <p className="list-graphs-page-subtitle">
                        Selecciona un análisis existente o crea uno nuevo
                    </p>
                </div>
                <button
                    className="btn-primary"
                    onClick={() => (document.getElementById('uploadCSV') as HTMLDialogElement)?.showModal()}
                >
                    + Nuevo análisis
                </button>
            </div>

            <div className="graph-grid">
                {graphs.length === 0 ? (
                    <div className="graph-grid-empty">
                        <div className="graph-grid-empty-icon">📂</div>
                        <p>No tienes análisis aún. ¡Crea el primero!</p>
                    </div>
                ) : (
                    graphs
                        .sort((a, b) => b.date - a.date)
                        .map(graph => (
                            <div
                                key={graph.id}
                                className="graph-card"
                                onClick={() => handleOpen(graph.id)}
                            >
                                <div className="graph-card-icon">📄</div>
                                <div className="graph-card-body">
                                    <div className="graph-card-name">{graph.name}</div>
                                </div>
                                <div className="graph-card-footer">
                                    <button className="btn-primary graph-card-btn">
                                        Abrir →
                                    </button>
                                </div>
                            </div>
                        ))
                )}
            </div>

            <UploadCSV setPage={setPage} setGraph={setGraph} />
        </div>
    );
};
