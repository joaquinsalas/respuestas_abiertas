import { useState, useEffect, useCallback, useRef } from 'react'
import './analyzer.css'
import './sample.css'
import { ROUTES } from '../../routes.ts'
import { useAuth } from '../../auth/AuthContext.tsx'
import {
    ReactFlow,
    useNodesState,
    useEdgesState,
    addEdge,
    Background,
    BaseEdge,
    getBezierPath,
    type EdgeProps,
    type Connection,
    type Edge,
    type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';


interface Data {
    data: string;
    id: string;
}

/* ─── Data Items ─────────────────────────────────────────────────────────────── */

function DisplayData({
    data,
    setTarget,
    setComponent,
    readOnly = false,
}: {
    data: Data[];
    setTarget: any;
    setComponent: any;
    readOnly?: boolean;
}) {
    const handleSelect = (id: string, text: string) => {
        if (readOnly) return;
        setTarget({ data: text, id });
        setComponent(2);
    };

    return (
        <div className="sample-list">
            {data.map(el => (
                <div
                    key={el.id}
                    className={`sample-item${readOnly ? ' sample-item--readonly' : ''}`}
                    onClick={() => handleSelect(el.id, el.data)}
                >
                    {el.data}
                </div>
            ))}
        </div>
    );
}

/* ─── Pagination ─────────────────────────────────────────────────────────────── */

function Pagination({
    page,
    pageSize,
    totalItems,
    setPage,
}: {
    page: number;
    pageSize: number;
    totalItems: number;
    setPage: any;
}) {
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const [inputVal, setInputVal] = useState(String(page));

    return (
        <div className="pagination">
            <button onClick={() => setPage((p: number) => Math.max(1, p - 1))} disabled={page === 1}>&lt;</button>
            <div className="pagination-info">
                <input
                    type="text"
                    value={inputVal}
                    onChange={e => {
                        setInputVal(e.target.value);
                        setTimeout(() => {
                            const n = parseInt(e.target.value);
                            if (!isNaN(n) && n >= 1 && n <= totalPages) setPage(n);
                        }, 500);
                    }}
                />
                <span>/ {totalPages}</span>
            </div>
            <button onClick={() => setPage((p: number) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>&gt;</button>
        </div>
    );
}

/* ─── DisplaySample ──────────────────────────────────────────────────────────── */

interface DisplaySampleProps {
    setTarget?: any;
    setComponent?: any;
    initialTypeSample?: number;
    graph_id: any;
    categoryProp?: string;
    floating?: boolean;
    onClose?: () => void;
}

function DisplaySample({
    setTarget = () => {},
    setComponent = () => {},
    initialTypeSample = 0,
    graph_id,
    categoryProp = '',
    floating = false,
    onClose,
}: DisplaySampleProps) {
    const { authFetch } = useAuth();
    const [sampleData, setSampleData] = useState<Data[]>([]);
    const [random, setRandom] = useState(1);
    const [typeSample] = useState(initialTypeSample);
    const [sampleSize] = useState(10);
    const [category] = useState(categoryProp);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(10);
    const [totalItems, setTotalItems] = useState(0);
    const [query, setQuery] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            const url = `${ROUTES.sample}?graph_id=${graph_id}&sample=${typeSample}&random=${random}&ss=${sampleSize}&page=${page}&page_size=${pageSize}&category=${category}`;
            try {
                const response = await authFetch(url);
                if (!response.ok) throw new Error(`HTTP error ${response.status}`);
                const json = await response.json();
                setSampleData(json.data);
                setTotalItems(json.total_items ?? json.data.length);
            } catch (err) {
                console.error('Error fetching sample:', err);
                setSampleData([]);
                setTotalItems(0);
            }
        };
        fetchData();
    }, [random, typeSample, sampleSize, category, page, pageSize, graph_id, query]);

    const readOnly = typeSample === 1 || typeSample === 2;

    const inner = (
        <>
            {!floating && typeSample === 0 && (
                <div className="sample-header">
                    <h1>Selecciona un dato</h1>
                </div>
            )}
            <div className="sample-controls">
                <div className="sample-type-toggle">
                    <button className={random === 1 ? 'active' : ''} onClick={() => setRandom(1)}>Aleatoria</button>
                    <button className={random === 0 ? 'active' : ''} onClick={() => setRandom(0)}>Orden</button>
                </div>
                {random === 1 && (
                    <button className="btn-ghost" style={{ fontSize: 'var(--font-size-xs)', marginLeft: 'auto' }} onClick={() => setQuery(q => !q)}>
                        ↻ Otros
                    </button>
                )}
            </div>
            <DisplayData data={sampleData} setTarget={setTarget} setComponent={setComponent} readOnly={readOnly} />
            <div className="sample-footer">
                <span className="sample-count">{totalItems} respuestas</span>
                {random === 0 && (
                    <Pagination page={page} pageSize={sampleSize} totalItems={totalItems} setPage={setPage} />
                )}
                {typeSample === 2 && (
                    <button className="btn-ghost" style={{ fontSize: 'var(--font-size-xs)' }} onClick={() => setComponent(1)}>
                        ← Volver
                    </button>
                )}
            </div>
        </>
    );

    if (floating) {
        return (
            <div className="sample-floating-wrapper">
                <div className="sample-floating">
                    <div className="sample-floating-header">
                        <span className="sample-floating-title">{categoryProp || 'Datos'}</span>
                        {onClose && (
                            <button className="sample-floating-close" onClick={onClose}>×</button>
                        )}
                    </div>
                    {inner}
                </div>
            </div>
        );
    }

    return <div className="sample">{inner}</div>;
}

/* ─── Review Manager ─────────────────────────────────────────────────────────── */

function ReviewManager({ graph_id, target, setComponent }: any) {
    const { authFetch } = useAuth();
    const [loading, setLoading] = useState(false);
    const [similarity, setSimilarity] = useState(0.8);
    const [showSample, setShowSample] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const preAnalysis = async () => {
            const url = `${ROUTES.opc_cut}?graph_id=${graph_id}&target_id=${target.id}&n_opc=3&min_similarity=0.6`;
            try { await authFetch(url); }
            catch (e) { console.error('Pre-analysis error:', e); }
        };
        preAnalysis();
    }, [graph_id, target.id]);

    const handleSimilarityChange = (newSim: number) => {
        setSimilarity(newSim);
        setLoading(true);
        setShowSample(false);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(async () => {
            const url = `${ROUTES.get_similarity}?graph_id=${graph_id}&target_id=${target.id}&min_similarity=${newSim}&preanalized=1`;
            try {
                const res = await authFetch(url);
                if (res.ok) setShowSample(true);
            } catch (e) {
                console.error('Similarity error:', e);
            } finally {
                setLoading(false);
            }
        }, 1000);
    };

    return (
        <div className="review-manager">
            <div className="review-manager-top">
                <button className="btn-primary create-category-btn" onClick={() => setComponent(4)}>
                    Crear categoría
                </button>
            </div>
            <div className="review-layout">
                {/* Vertical slider column */}
                <div className="slider-section">
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={similarity}
                        onChange={e => handleSimilarityChange(parseFloat(e.target.value))}
                        className="vertical-slider"
                    />
                    <span className="similarity-label">{similarity.toFixed(2)}</span>
                    <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.01"
                        value={similarity}
                        className="similarity-input"
                        onChange={e => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v) && v >= 0 && v <= 1) handleSimilarityChange(v);
                        }}
                    />
                </div>

                {/* Target + results */}
                <div className="review-center">
                    <div className="review-target">
                        <div className="review-target-label">Texto de referencia</div>
                        <div className="review-target-text">{target.data}</div>
                    </div>
                    <div className="review-results">
                        {loading ? (
                            <div className="loader-container"><div className="loader" /></div>
                        ) : showSample ? (
                            <DisplaySample
                                graph_id={graph_id}
                                initialTypeSample={2}
                                setComponent={setComponent}
                                setTarget={() => {}}
                            />
                        ) : (
                            <div className="review-placeholder">
                                Mueve el deslizador para ver resultados similares
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ─── Confirm Category ───────────────────────────────────────────────────────── */

interface ConfirmCategoryProps {
    graph_id: string;
    setComponent: (n: number) => void;
    setExec: (v: boolean) => void;
    exec: boolean;
}

export function ConfirmCategory({ graph_id, setComponent, setExec, exec }: ConfirmCategoryProps) {
    const { authFetch } = useAuth();
    const [categoryName, setCategoryName] = useState('');

    const handleConfirm = async () => {
        const url = `${ROUTES.new_category}?graph_id=${graph_id}&name=${categoryName}`;
        try {
            const res = await authFetch(url);
            if (res.ok) {
                setExec(!exec);
                setComponent(1);
            }
        } catch (e) {
            console.error('Error confirming category:', e);
        }
    };

    return (
        <div className="confirm-category">
            <h1>Nombra la nueva categoría</h1>
            <div>
                <label htmlFor="cat-name">Nombre</label>
                <input
                    id="cat-name"
                    type="text"
                    value={categoryName}
                    onChange={e => setCategoryName(e.target.value)}
                    placeholder="Ej. Satisfacción positiva"
                    autoFocus
                />
            </div>
            <div className="confirm-category-actions">
                <button className="btn-ghost" onClick={() => setComponent(2)}>← Atrás</button>
                <button
                    className="btn-primary"
                    onClick={handleConfirm}
                    disabled={!categoryName.trim()}
                >
                    Confirmar
                </button>
            </div>
        </div>
    );
}

/* ─── Custom Edges ───────────────────────────────────────────────────────────── */

const makeEdge = (color: string) => (props: EdgeProps) => {
    const [path] = getBezierPath(props);
    return <BaseEdge path={path} {...props} style={{ stroke: color, strokeWidth: 2 }} />;
};

const edgeTypes = {
    '1': makeEdge('#3b82f6'),
    '2': makeEdge('#10b981'),
    '3': makeEdge('#ef4444'),
    '4': makeEdge('#f59e0b'),
    '5': makeEdge('#8b5cf6'),
};

/* ─── Context Menu ───────────────────────────────────────────────────────────── */

const MenuRightClick = ({
    id, top, left, right, bottom,
    graph_id, exec, onPaneClick, setExec,
    setData, category, setShowData,
    ...props
}: any) => {
    const { authFetch } = useAuth();

    const handleDelete = async () => {
        const res = await authFetch(ROUTES.delete_node, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ node_id: id, graph_id }),
        });
        if (res.ok) { onPaneClick(); setExec(!exec); }
        else console.error('Failed to delete node');
    };

    const handleView = () => {
        onPaneClick();
        setData(category);
        setShowData(true);
    };

    return (
        <div style={{ top, left, right, bottom }} className="context-menu" {...props}>
            <button onClick={handleView}>Ver datos</button>
            <button className="btn-danger" onClick={handleDelete}>Eliminar</button>
        </div>
    );
};

/* ─── Section Graph ──────────────────────────────────────────────────────────── */

const RELATIONS: Record<number, string> = {
    1: 'Se asocia con',
    2: 'Es parte de',
    3: 'Es causa de',
    4: 'Es propiedad de',
    5: 'Es un',
};

function SectionGraph({ exec = false, graph_id }: any) {
    const { authFetch } = useAuth();
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [selectedRelation, setSelectedRelation] = useState('1');
    const [menu, setMenu] = useState<any>(null);
    const [nodeDeleted, setNodeDeleted] = useState(false);
    const [edgeDeleted, setEdgeDeleted] = useState(false);
    const [showData, setShowData] = useState(false);
    const [category, setCategory] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    const onConnect = useCallback(async (params: Connection) => {
        if (!params.source || !params.target) return;
        const body = {
            graph_id: graph_id.toString(),
            node_id_1: parseInt(params.source),
            node_id_2: parseInt(params.target),
            connection_type: parseInt(selectedRelation),
        };
        try {
            const res = await authFetch(ROUTES.add_edge, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                setEdges(eds => {
                    const filtered = eds.filter(
                        e => !(e.source === params.source && e.target === params.target)
                    );
                    const newEdge: Edge = {
                        id: `${params.source}-${params.target}`,
                        source: params.source!,
                        target: params.target!,
                        type: selectedRelation,
                    };
                    return addEdge(newEdge, filtered);
                });
            }
        } catch (e) { console.error('Add edge error:', e); }
    }, [graph_id, selectedRelation, authFetch]);

    useEffect(() => {
        const fetchGraph = async () => {
            try {
                const res = await authFetch(`${ROUTES.get_graph}?graph_id=${graph_id}`);
                if (!res.ok) throw new Error('Error loading graph');
                const data: { nodes: any[]; edges: any[] } = await res.json();

                const newNodes: Node[] = data.nodes.map((n, i) => ({
                    id: n.id.toString(),
                    data: { label: n.name },
                    position: { x: (i % 5) * 200, y: Math.floor(i / 5) * 120 },
                }));
                const newEdges: Edge[] = data.edges.map(e => ({
                    id: String(e.id),
                    source: e.source.toString(),
                    target: e.target.toString(),
                    type: e.relation_id.toString(),
                }));
                setNodes(newNodes);
                setEdges(newEdges);
            } catch (e) { console.error(e); }
        };
        fetchGraph();
    }, [graph_id, exec, nodeDeleted, edgeDeleted]);

    const onNodeContextMenu = useCallback((event: any, nodo: any) => {
        event.preventDefault();
        const pane = ref.current!.getBoundingClientRect();
        setMenu({
            id: nodo.id,
            category: nodo.data.label,
            top:    event.clientY - pane.top  < pane.height - 200 && event.clientY - pane.top,
            left:   event.clientX - pane.left < pane.width  - 200 && event.clientX - pane.left,
            right:  event.clientX - pane.left >= pane.width  - 200 && pane.width  - (event.clientX - pane.left),
            bottom: event.clientY - pane.top  >= pane.height - 200 && pane.height - (event.clientY - pane.top),
        });
    }, []);

    const onPaneClick = useCallback(() => { setMenu(null); setShowData(false); }, []);

    const onEdgeClick = useCallback((_event: any, edge: any) => {
        const del = async () => {
            const res = await authFetch(ROUTES.delete_edge, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ graph_id, from_node_id: edge.target, to_node_id: edge.source }),
            });
            if (!res.ok) alert('Error al eliminar la conexión');
            setEdgeDeleted(p => !p);
        };
        del();
    }, [graph_id, authFetch]);

    return (
        <div className="graph" ref={ref}>
            {/* Relation selector bar */}
            <div className="relation-selector">
                <span>Tipo de relación:</span>
                {Object.entries(RELATIONS).map(([id, label]) => (
                    <label key={id}>
                        <input
                            type="radio"
                            name="relationType"
                            value={id}
                            checked={selectedRelation === id}
                            onChange={e => setSelectedRelation(e.target.value)}
                        />
                        {label}
                    </label>
                ))}
            </div>

            {/* ReactFlow canvas */}
            <div style={{ flex: 1, position: 'relative' }}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    edgeTypes={edgeTypes}
                    onNodeContextMenu={onNodeContextMenu}
                    onPaneClick={onPaneClick}
                    onEdgeClick={onEdgeClick}
                    fitView
                >
                    {menu && (
                        <MenuRightClick
                            {...menu}
                            onPaneClick={onPaneClick}
                            graph_id={graph_id}
                            setExec={setNodeDeleted}
                            exec={nodeDeleted}
                            setData={setCategory}
                            setShowData={setShowData}
                        />
                    )}
                    <Background />
                </ReactFlow>

                {/* Floating sample panel */}
                {showData && (
                    <DisplaySample
                        floating={true}
                        onClose={() => setShowData(false)}
                        initialTypeSample={1}
                        graph_id={graph_id}
                        categoryProp={category}
                    />
                )}
            </div>
        </div>
    );
}

/* ─── Section Desk ───────────────────────────────────────────────────────────── */

function SectionDesk({ exec, setExec, graph_id }: any) {
    const [currentComponent, setCurrentComponent] = useState(1);
    const [target, setTarget] = useState<{ data: string; id: string | number }>();

    return (
        <section className="desk">
            {currentComponent === 1 && (
                <DisplaySample
                    setComponent={setCurrentComponent}
                    setTarget={setTarget}
                    graph_id={graph_id}
                />
            )}
            {currentComponent === 2 && target && (
                <ReviewManager
                    graph_id={graph_id}
                    target={target}
                    setComponent={setCurrentComponent}
                />
            )}
            {currentComponent === 4 && (
                <ConfirmCategory
                    graph_id={graph_id}
                    setComponent={setCurrentComponent}
                    setExec={setExec}
                    exec={exec}
                />
            )}
        </section>
    );
}

/* ─── Analyzer ───────────────────────────────────────────────────────────────── */

export function Analyzer({ graph, setPage }: any) {
    const { authFetch } = useAuth();
    const [exec, setExec] = useState(false);

    const handleExport = () => {
        const download = async () => {
            const res = await authFetch(`${ROUTES.dowload_csv}?graph_id=${graph}`);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'resultado.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        };
        download();
    };

    return (
        <div>
            {/* Analyzer sub-toolbar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: 'var(--space-2) var(--space-4)',
                background: 'var(--color-surface)',
                borderBottom: '1px solid var(--color-border)',
            }}>
                <button className="btn-ghost" onClick={() => setPage(1)}>← Regresar</button>
                <button className="btn-ghost" onClick={handleExport}>↓ Exportar CSV</button>
            </div>

            <div className="analyzer">
                <SectionGraph exec={exec} graph_id={graph} />
                <SectionDesk setExec={setExec} exec={exec} graph_id={graph} />
            </div>
        </div>
    );
}
