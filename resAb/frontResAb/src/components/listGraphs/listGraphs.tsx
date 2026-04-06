import { useEffect, useRef, useState } from 'react'
import { ROUTES } from '../../routes.ts'
import { useAuth } from '../../auth/AuthContext.tsx'
import './listGraphs.css'

type GraphStatus = 'pending' | 'done' | 'failed';

interface Graph {
    name: string;
    id: string | number;
    date: any;
    status: GraphStatus;
    task_id: string | null;
}

/* ─── Upload Dialog ──────────────────────────────────────────────────────────── */

interface UploadCSVProps {
    onGraphCreated: (graph: Graph) => void;
}

const UploadCSV = ({ onGraphCreated }: UploadCSVProps) => {
    const { authFetch } = useAuth();
    const [columns, setColumns] = useState<string[]>([]);
    const [isColumnIndex] = useState(false);
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
                onGraphCreated({
                    id: data.graph_id,
                    name: nameAnalysis,
                    date: Date.now(),
                    status: 'pending',
                    task_id: data.task_id,
                });
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

               {/* <div className="checkbox-row">
                    <input
                        id="column-index-checkbox"
                        type="checkbox"
                        checked={isColumnIndex}
                        onChange={() => setIsColumnIndex(!isColumnIndex)}
                    />
                    <label htmlFor="column-index-checkbox">Usar esta columna como índice</label>
                </div>
*/}
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
    const [deletingId, setDeletingId] = useState<string | number | null>(null);

    // Ref siempre actualizado para evitar stale closure en el interval de polling
    const graphsRef = useRef<Graph[]>(graphs);
    useEffect(() => {
        graphsRef.current = graphs;
    }, [graphs]);

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

    // Polling cada 5s para grafos pending. Se monta una sola vez.
    useEffect(() => {
        const interval = setInterval(async () => {
            const pending = graphsRef.current.filter(g => g.status === 'pending');
            if (pending.length === 0) return;

            for (const g of pending) {
                try {
                    const res = await authFetch(
                        `${ROUTES.analysis_status}?graph_id=${g.id}`
                    );
                    if (!res.ok) continue;
                    const data = await res.json();
                    if (data.status !== 'pending') {
                        setGraphs(prev =>
                            prev.map(item =>
                                item.id === g.id
                                    ? { ...item, status: data.status as GraphStatus }
                                    : item
                            )
                        );
                    }
                } catch {
                    // error de red: ignorar silenciosamente
                }
            }
        }, 5000);

        return () => clearInterval(interval);
    }, []); // [] intencional: el interval usa graphsRef para evitar stale closure

    const handleOpen = (graph: Graph) => {
        if (graph.status !== 'done') return;
        setGraph(graph.id);
        setPage(2);
    };

    const handleDelete = async (e: React.MouseEvent, id: string | number) => {
        e.stopPropagation();
        setDeletingId(id);
        try {
            await authFetch(ROUTES.delete_graph, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ graph_id: id }),
            });
            setGraphs(prev => prev.filter(g => g.id !== id));
        } finally {
            setDeletingId(null);
        }
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
                        .sort((a, b) => Number(b.id) - Number(a.id))
                        .map(graph => {
                            const isPending   = graph.status === 'pending';
                            const isFailed    = graph.status === 'failed';
                            const isClickable = graph.status === 'done';

                            return (
                                <div
                                    key={graph.id}
                                    className={[
                                        'graph-card',
                                        isPending ? 'graph-card--pending' : '',
                                        isFailed  ? 'graph-card--failed'  : '',
                                    ].filter(Boolean).join(' ')}
                                    onClick={isClickable ? () => handleOpen(graph) : undefined}
                                >
                                    <div className="graph-card-icon">
                                        {isPending && <span className="graph-spinner" />}
                                        {isFailed  && <span className="graph-failed-icon">⚠</span>}
                                        {!isPending && !isFailed && '📄'}
                                    </div>
                                    <div className="graph-card-body">
                                        <div className="graph-card-name">{graph.name}</div>
                                        {isPending && (
                                            <div className="graph-card-status-label">Procesando…</div>
                                        )}
                                        {isFailed && (
                                            <div className="graph-card-status-label graph-card-status-label--error">
                                                Error al procesar
                                            </div>
                                        )}
                                    </div>
                                    <div className="graph-card-footer">
                                        <button
                                            className="btn-danger-ghost graph-card-delete-btn"
                                            onClick={(e) => { e.stopPropagation(); handleDelete(e, graph.id); }}
                                            disabled={deletingId === graph.id || isPending}
                                            title="Eliminar análisis"
                                        >
                                            {deletingId === graph.id ? '…' : '🗑'}
                                        </button>
                                        {isClickable && (
                                            <button className="btn-primary graph-card-btn">
                                                Abrir →
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                )}
            </div>

            <UploadCSV
                onGraphCreated={(g) => setGraphs(prev => [g, ...prev])}
            />
        </div>
    );
};
