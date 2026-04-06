import { useState, useEffect, useCallback, useRef } from 'react'
import { toPng, toJpeg } from 'html-to-image'
import './analyzer.css'
import './sample.css'
import { ROUTES } from '../../routes.ts'
import { useAuth } from '../../auth/AuthContext.tsx'
import {
    ReactFlow,
    useNodesState,
    useEdgesState,
    useReactFlow,
    addEdge,
    Background,
    MarkerType,
    getViewportForBounds,
    type Connection,
    type Edge,
    type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';


interface Data {
    data: string;
    id: string;
    inCategory?: number;
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
                    className={`sample-item${readOnly ? ' sample-item--readonly' : ''}${el.inCategory === 1 ? ' sample-item--in-category' : ''}`}
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
    const [inputVal, setInputVal] = useState<number | string>(page);
    return (
        <div className="pagination">
            <button onClick={() => setPage((p: number) => {
                setInputVal( Math.max(1, p - 1));
                return Math.max(1, p - 1);})} disabled={page === 1}>&lt;</button>
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
            <button onClick={() => {setPage((p: number) => {
                setInputVal(Math.min(totalPages, p + 1));

                return Math.min(totalPages, p + 1)});
            }} disabled={page === totalPages}>&gt;</button>
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
    refreshTrigger?: boolean;
}

function DisplaySample({
    setTarget = () => {},
    setComponent = () => {},
    initialTypeSample = 0,
    graph_id,
    categoryProp = '',
    floating = false,
    onClose,
    refreshTrigger,
}: DisplaySampleProps) {
    const { authFetch } = useAuth();
    const [sampleData, setSampleData] = useState<Data[]>([]);
    const [random, setRandom] = useState(1);
    const [typeSample] = useState(initialTypeSample);
    const [category] = useState(categoryProp);
    const [page, setPage] = useState(1);
    const [sampleSize] = useState(5);// Estos 2 deberian ser uno
    const [pageSize] = useState(5); // Estos 2 deberían ser uno
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
                console.log(json.data);
                setTotalItems(json.total_items ?? json.data.length);
            } catch (err) {
                console.error('Error fetching sample:', err);
                setSampleData([]);
                setTotalItems(0);
            }
        };
        fetchData();
    }, [random, typeSample, sampleSize, category, page, pageSize, graph_id, query, refreshTrigger]);

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
                {typeSample===2 &&
                (<button className="btn-ghost" style={{ fontSize: 'var(--font-size-xs)' }} onClick={() => setComponent(1)}>
                                ← Volver
                            </button>)}
                        
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

function ReviewManager({ graph_id, target, setComponent, setReviewParams }: any) {
    const { authFetch } = useAuth();
    const [loading, setLoading] = useState(false);
    const [similarity, setSimilarity] = useState(0.8);
    const [visibleSimilarity, setVisibleSimilarity] = useState<number | string>(similarity);
    const [showSample, setShowSample] = useState(false);
    const [searchResults, setSearchResults] = useState<Data[]>([]);
    const [totalItems, setTotalItems] = useState(0);
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 10;
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchResults = useCallback(async (sim: number, p: number) => {
        setLoading(true);
        setShowSample(false);
        const url = `${ROUTES.get_similarity}?graph_id=${graph_id}&target_id=${target.id}&min_similarity=${sim}&page=${p}&page_size=${PAGE_SIZE}`;
        try {
            const res = await authFetch(url);
            if (res.ok) {
                const json = await res.json();
                setSearchResults(json.data);
                setTotalItems(json.total_items);
                setShowSample(true);
            }
        } catch (e) {
            console.error('Similarity error:', e);
        } finally {
            setLoading(false);
        }
    }, [graph_id, target.id]);

    const handleSimilarityChange = (newSim: number) => {
        setSimilarity(newSim);
        setPage(1);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => fetchResults(newSim, 1), 1000);
    };

    const handleNewCategory = () => {
        if (showSample) {
            setReviewParams({ targetId: String(target.id), minSim: similarity });
            setComponent(4);
        }
    };

    return (
        <div className="review-manager">
            <div className="review-manager-top">
                <button className="btn-primary create-category-btn" onClick={handleNewCategory}>
                    {loading ? 'Cargando' : 'Crear categoría'}
                </button>
            </div>
            <div className="review-layout">
                {/* Vertical slider column */}
                <div className="slider-section">
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.001"
                        value={similarity}
                        onChange={e => {
                            const v = parseFloat(e.target.value);
                            setVisibleSimilarity(v.toFixed(3));
                            handleSimilarityChange(v);
                        }}
                        className="vertical-slider"
                    />
                    <input
                        type="text"
                        value={visibleSimilarity}
                        className="similarity-input"
                        onChange={e => {
                            const v = parseFloat(e.target.value);
                            setVisibleSimilarity(e.target.value);
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
                            <>
                                <DisplayData data={searchResults} setTarget={() => {}} setComponent={() => {}} readOnly={true} />
                                <div className="sample-footer">
                                    <span className="sample-count">{totalItems} resultados</span>
                                    <Pagination
                                        page={page}
                                        pageSize={PAGE_SIZE}
                                        totalItems={totalItems}
                                        setPage={(p: number) => {
                                            setPage(p);
                                            fetchResults(similarity, p);
                                        }}
                                    />
                                </div>
                                <button className="btn-ghost" style={{ fontSize: 'var(--font-size-xs)' }} onClick={() => setComponent(1)}>
                                    ← Volver
                                </button>
                            </>
                        ) : (
                            <div>
                                <div className="review-placeholder">
                                    Mueve el deslizador para ver resultados similares
                                </div>
                                <button className="btn-ghost" style={{ fontSize: 'var(--font-size-xs)' }} onClick={() => setComponent(1)}>
                                    ← Volver
                                </button>
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
    targetId: string;
    minSimilarity: number;
}

export function ConfirmCategory({ graph_id, setComponent, setExec, exec, targetId, minSimilarity }: ConfirmCategoryProps) {
    const { authFetch } = useAuth();
    const [categoryName, setCategoryName] = useState('');
    const [blockResponses, setBlockResponses] = useState(false);

    const handleConfirm = async () => {
        const url = `${ROUTES.new_category}?graph_id=${graph_id}&name=${categoryName}&target_id=${targetId}&min_similarity=${minSimilarity}${blockResponses ? '&block=1' : ''}`;
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
            <label className="confirm-category-block-label">
                <input
                    type="checkbox"
                    checked={blockResponses}
                    onChange={e => setBlockResponses(e.target.checked)}
                />
                ¿Desea restringir estas respuestas de futuras categorías?
            </label>
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

/* ─── Rename Modal ───────────────────────────────────────────────────────────── */

function RenameModal({ currentName, graph_id, node_id, onClose, onRenamed }: {
    currentName: string;
    graph_id: any;
    node_id: any;
    onClose: () => void;
    onRenamed: (newName: string) => void;
}) {
    const { authFetch } = useAuth();
    const [newName, setNewName] = useState(currentName);
    const [saving, setSaving]   = useState(false);
    const [error, setError]     = useState('');

    const handleSave = async () => {
        const trimmed = newName.trim();
        if (!trimmed) return;
        setSaving(true);
        setError('');
        try {
            const res = await authFetch(ROUTES.rename_category, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ graph_id, node_id, new_name: trimmed }),
            });
            if (res.ok) {
                onRenamed(trimmed);
                onClose();
            } else {
                const msg = await res.text();
                setError(msg || 'Error al renombrar');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') onClose();
    };

    console.log("no me renderizo");
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
                <h2 className="modal-title">Renombrar categoría</h2>

                <div className="modal-field">
                    <label>Nuevo nombre</label>
                    <input
                        type="text"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        autoFocus
                    />
                </div>

                {error && <p style={{ color: 'var(--color-danger, #ef4444)', fontSize: '0.85rem' }}>{error}</p>}

                <div className="modal-actions">
                    <button className="btn-ghost" onClick={onClose}>Cancelar</button>
                    <button
                        className="btn-primary"
                        onClick={handleSave}
                        disabled={!newName.trim() || saving}
                    >
                        {saving ? 'Guardando…' : 'Guardar'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ─── Context Menu ───────────────────────────────────────────────────────────── */

const MenuRightClick = ({
    id, top, left, right, bottom,
    graph_id, onPaneClick, setExec,
    setData, category, setShowData, onNodeDeleted,
    ...props
}: any) => {
    const { authFetch } = useAuth();
    const [showRenameModal, setShowRenameModal] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');

    const handleDelete = async () => {
        if (!window.confirm(`¿Eliminar la categoría "${category}"? Esta acción no se puede deshacer.`)) return;
        setDeleting(true);
        setDeleteError('');
        try {
            const res = await authFetch(ROUTES.delete_node, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ node_id: id, graph_id }),
            });
            if (res.ok) {
                onPaneClick();
                setExec((p: boolean) => !p);
                onNodeDeleted();
            } else {
                const msg = await res.text();
                setDeleteError(msg || 'Error al eliminar');
            }
        } catch {
            setDeleteError('Error de red');
        } finally {
            setDeleting(false);
        }
    };

    const handleView = () => {
        onPaneClick();
        setData(category);
        setShowData(true);
    };

    return (
        <>
            <div style={{ top, left, right, bottom }} className="context-menu" {...props}>
                <button onClick={handleView}>Ver datos</button>
                <button onClick={() => setShowRenameModal(true)}>Renombrar</button>
                <button
                    className="btn-danger"
                    onClick={handleDelete}
                    disabled={deleting}
                >
                    {deleting ? 'Eliminando…' : 'Eliminar'}
                </button>
                {deleteError && (
                    <span className="context-menu-error">{deleteError}</span>
                )}
            </div>

            {showRenameModal && (
                <RenameModal
                    currentName={category}
                    graph_id={graph_id}
                    node_id={id}
                    onClose={() => setShowRenameModal(false)}
                    onRenamed={() => setExec((p: boolean) => !p)}
                />
            )}
        </>
    );
};

/* ─── Relation Types ─────────────────────────────────────────────────────────── */

interface RelationType {
    id: number;
    type: string;
    color: string;
    is_dashed: boolean;
    direction: 'forward' | 'backward' | 'both';
    stroke_width: number;
    is_global: number;
}

function relationToEdgeProps(style: RelationType): Partial<Edge> {
    const { color, direction, stroke_width, is_dashed } = style;
    return {
        style: {
            stroke: color,
            strokeWidth: stroke_width,
            strokeDasharray: is_dashed ? '6,3' : undefined,
        },
        markerEnd: (direction === 'forward' || direction === 'both')
            ? { type: MarkerType.ArrowClosed, color }
            : undefined,
        markerStart: (direction === 'backward' || direction === 'both')
            ? { type: MarkerType.ArrowClosed, color }
            : undefined,
    };
}

/* ─── New Relation Modal ─────────────────────────────────────────────────────── */

function NewRelationModal({ graph_id, onClose, onCreated }: {
    graph_id: any;
    onClose: () => void;
    onCreated: (rel: RelationType) => void;
}) {
    const { authFetch } = useAuth();
    const [label, setLabel]               = useState('');
    const [color, setColor]               = useState('#6366f1');
    const [isDashed, setIsDashed]         = useState(false);
    const [direction, setDirection]       = useState<'forward' | 'backward' | 'both'>('forward');
    const [strokeWidth, setStrokeWidth]   = useState(2);
    const [isGlobal, setIsGlobal]         = useState(false);
    const [saving, setSaving]             = useState(false);

    const handleSave = async () => {
        if (!label.trim()) return;
        setSaving(true);
        try {
            const res = await authFetch(ROUTES.create_relationship, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    graph_id,
                    type: label.trim(),
                    color,
                    is_dashed: isDashed,
                    direction,
                    stroke_width: strokeWidth,
                    is_global: isGlobal ? 1 : 0,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                onCreated({
                    id: data.id, type: label.trim(), color,
                    is_dashed: isDashed, direction,
                    stroke_width: strokeWidth, is_global: isGlobal ? 1 : 0,
                });
                onClose();
            }
        } finally { setSaving(false); }
    };

    const showEnd   = direction === 'forward'  || direction === 'both';
    const showStart = direction === 'backward' || direction === 'both';

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
                <h2 className="modal-title">Nueva relación</h2>

                <div className="modal-field">
                    <label>Nombre</label>
                    <input
                        type="text"
                        value={label}
                        onChange={e => setLabel(e.target.value)}
                        placeholder="Ej. Depende de"
                        autoFocus
                    />
                </div>

                <div className="modal-row">
                    <div className="modal-field">
                        <label>Color</label>
                        <input type="color" value={color} onChange={e => setColor(e.target.value)} />
                    </div>
                    <div className="modal-field">
                        <label>Grosor ({strokeWidth}px)</label>
                        <input
                            type="range" min={1} max={6} value={strokeWidth}
                            onChange={e => setStrokeWidth(Number(e.target.value))}
                        />
                    </div>
                </div>

                <div className="modal-field">
                    <label>Trazo</label>
                    <label className="modal-toggle">
                        <input type="checkbox" checked={isDashed} onChange={e => setIsDashed(e.target.checked)} />
                        Punteado
                    </label>
                </div>

                <div className="modal-field">
                    <label>Dirección</label>
                    <div className="direction-options">
                        {(['forward', 'backward', 'both'] as const).map(d => (
                            <label key={d} className={`direction-option${direction === d ? ' direction-option--active' : ''}`}>
                                <input type="radio" name="direction" value={d}
                                       checked={direction === d} onChange={() => setDirection(d)} />
                                {d === 'forward' ? 'A → B' : d === 'backward' ? 'A ← B' : 'A ↔ B'}
                            </label>
                        ))}
                    </div>
                </div>

                {/* Live preview */}
                <div className="relation-preview">
                    <svg width="100%" height="50" viewBox="0 0 240 50">
                        <defs>
                            {showEnd && (
                                <marker id="prev-end" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                                    <path d="M0,0 L0,6 L8,3 z" fill={color} />
                                </marker>
                            )}
                            {showStart && (
                                <marker id="prev-start" markerWidth="8" markerHeight="8" refX="2" refY="3" orient="auto-start-reverse">
                                    <path d="M0,0 L0,6 L8,3 z" fill={color} />
                                </marker>
                            )}
                        </defs>
                        <line
                            x1="20" y1="25" x2="220" y2="25"
                            stroke={color}
                            strokeWidth={strokeWidth}
                            strokeDasharray={isDashed ? '8,4' : undefined}
                            markerEnd={showEnd ? 'url(#prev-end)' : undefined}
                            markerStart={showStart ? 'url(#prev-start)' : undefined}
                        />
                        <text x="120" y="18" textAnchor="middle"
                              fontSize="11" fill={color} opacity={0.8}>
                            {label || 'Previsualización'}
                        </text>
                    </svg>
                </div>

                <label className="modal-toggle">
                    <input type="checkbox" checked={isGlobal} onChange={e => setIsGlobal(e.target.checked)} />
                    Disponible en todos mis grafos (global)
                </label>

                <div className="modal-actions">
                    <button className="btn-ghost" onClick={onClose}>Cancelar</button>
                    <button className="btn-primary" onClick={handleSave}
                            disabled={!label.trim() || saving}>
                        {saving ? 'Guardando…' : 'Guardar'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ─── Graph Capture ──────────────────────────────────────────────────────────── */

type CaptureGraphFn = (format: 'png' | 'jpeg') => Promise<string | null>;

function GraphCapture({ onCaptureReady }: { onCaptureReady: (fn: CaptureGraphFn) => void }) {
    const { getNodesBounds, getNodes } = useReactFlow();

    useEffect(() => {
        const capture: CaptureGraphFn = async (format) => {
            const nodes = getNodes();
            if (!nodes.length) return null;
            const imageWidth  = 1920;
            const imageHeight = 1080;
            const bounds   = getNodesBounds(nodes);
            const viewport = getViewportForBounds(bounds, imageWidth, imageHeight, 0.1, 2, 0.1);
            const el = document.querySelector<HTMLElement>('.react-flow__viewport');
            if (!el) return null;
            const bgColor = getComputedStyle(document.documentElement)
                .getPropertyValue('--color-bg').trim() || '#ffffff';
            const opts = {
                backgroundColor: bgColor,
                width: imageWidth,
                height: imageHeight,
                pixelRatio: window.devicePixelRatio * 2,
                style: {
                    width:     `${imageWidth}px`,
                    height:    `${imageHeight}px`,
                    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
                },
            };
            return format === 'png' ? toPng(el, opts) : toJpeg(el, { ...opts, quality: 0.92 });
        };
        onCaptureReady(capture);
    }, [getNodesBounds, getNodes, onCaptureReady]);

    return null;
}

/* ─── Section Graph ──────────────────────────────────────────────────────────── */

function SectionGraph({ exec = false, graph_id, onNodeDeleted, onCaptureReady }: any) {
    const { authFetch } = useAuth();
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [availableRelations, setAvailableRelations] = useState<RelationType[]>([]);
    const [selectedRelation, setSelectedRelation]     = useState<RelationType | null>(null);
    const [showRelationModal, setShowRelationModal]   = useState(false);
    const [menu, setMenu] = useState<any>(null);
    const [nodeDeleted, setNodeDeleted] = useState(false);
    const [edgeDeleted, setEdgeDeleted] = useState(false);
    const [showData, setShowData] = useState(false);
    const [category, setCategory] = useState('');
    const [progress, setProgress] = useState<number | null>(null);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchRelations = async () => {
            try {
                const res = await authFetch(`${ROUTES.get_relations}?graph_id=${graph_id}`);
                if (res.ok) {
                    const data = await res.json();
                    setAvailableRelations(data.relations);
                    if (data.relations.length > 0)
                        setSelectedRelation(prev => prev ?? data.relations[0]);
                }
            } catch (e) { console.error('Relations error:', e); }
        };
        fetchRelations();
    }, [graph_id, showRelationModal]);

    useEffect(() => {
        const fetchProgress = async () => {
            try {
                const res = await authFetch(`${ROUTES.get_progress}?graph_id=${graph_id}`);
                if (res.ok) {
                    const json = await res.json();
                    setProgress(json.progress);
                }
            } catch (e) { console.error('Progress error:', e); }
        };
        fetchProgress();
    }, [graph_id, exec, nodeDeleted]);

    const saveNodePosition = useCallback(async (nodeId: string, x: number, y: number) => {
        try {
            await authFetch(ROUTES.update_node_position, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ graph_id, node_id: parseInt(nodeId), pos_x: x, pos_y: y }),
            });
        } catch (e) { console.error('Position save error:', e); }
    }, [graph_id, authFetch]);

    const onConnect = useCallback(async (params: Connection) => {
        if (!params.source || !params.target || !selectedRelation) return;
        const body = {
            graph_id: graph_id.toString(),
            node_id_1: parseInt(params.source),
            node_id_2: parseInt(params.target),
            connection_type: selectedRelation.id,
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
                        ...relationToEdgeProps(selectedRelation),
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

                const newNodes: Node[] = data.nodes.map((n, i) => {
                    const hasPos = n.pos_x !== null && n.pos_y !== null;
                    return {
                        id: n.id.toString(),
                        data: { label: n.name },
                        position: hasPos
                            ? { x: n.pos_x, y: n.pos_y }
                            : { x: (i % 5) * 200, y: Math.floor(i / 5) * 120 },
                    };
                });
                const newEdges: Edge[] = data.edges.map(e => ({
                    id: String(e.id),
                    source: e.source.toString(),
                    target: e.target.toString(),
                    ...relationToEdgeProps(e.relation_style),
                }));
                setNodes(newNodes);
                setEdges(newEdges);

                // Persistir inmediatamente las posiciones fallback de nodos sin coordenadas en BD
                const unpositioned = data.nodes.filter((n: any) => n.pos_x === null || n.pos_y === null);
                if (unpositioned.length > 0) {
                    Promise.all(unpositioned.map((n: any) => {
                        const i = data.nodes.indexOf(n);
                        return saveNodePosition(n.id.toString(), (i % 5) * 200, Math.floor(i / 5) * 120);
                    }));
                }
            } catch (e) { console.error(e); }
        };
        fetchGraph();
    }, [graph_id, exec, nodeDeleted, edgeDeleted]);

    const onNodeDragStop = useCallback((_event: any, node: Node) => {
        saveNodePosition(node.id, node.position.x, node.position.y);
    }, [saveNodePosition]);

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
                {availableRelations.map(rel => (
                    <button
                        key={rel.id}
                        className={`relation-option${selectedRelation?.id === rel.id ? ' relation-option--active' : ''}`}
                        onClick={() => setSelectedRelation(rel)}
                        style={{ '--relation-color': rel.color } as any}
                    >
                        <span className="relation-color-line"
                              style={{ borderStyle: rel.is_dashed ? 'dashed' : 'solid' }} />
                        {rel.type}
                    </button>
                ))}
                <button className="btn-add-relation" onClick={() => setShowRelationModal(true)}>
                    + relaciones
                </button>
                {progress !== null && (
                    <div className="progress-indicator">
                        <div className="progress-bar-track">
                            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="progress-label">{progress}% categorizado</span>
                    </div>
                )}
            </div>

            {/* ReactFlow canvas */}
            <div style={{ flex: 1, position: 'relative' }}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeDragStop={onNodeDragStop}
                    onNodeContextMenu={onNodeContextMenu}
                    onPaneClick={onPaneClick}
                    onEdgeClick={onEdgeClick}
                    fitView
                >
                    <GraphCapture onCaptureReady={onCaptureReady} />
                    {menu && (
                        <MenuRightClick
                            {...menu}
                            onPaneClick={onPaneClick}
                            graph_id={graph_id}
                            setExec={setNodeDeleted}
                            exec={nodeDeleted}
                            setData={setCategory}
                            setShowData={setShowData}
                            onNodeDeleted={onNodeDeleted}
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

            {/* New relation modal */}
            {showRelationModal && (
                <NewRelationModal
                    graph_id={graph_id}
                    onClose={() => setShowRelationModal(false)}
                    onCreated={rel => setAvailableRelations(prev => [...prev, rel])}
                />
            )}
        </div>
    );
}

/* ─── Section Desk ───────────────────────────────────────────────────────────── */

function SectionDesk({ exec, setExec, graph_id, nodeDeleted }: any) {
    const [currentComponent, setCurrentComponent] = useState(1);
    const [target, setTarget] = useState<{ data: string; id: string | number }>();
    const [reviewParams, setReviewParams] = useState<{ targetId: string; minSim: number } | null>(null);

    return (
        <section className="desk">
            {currentComponent === 1 && (
                <DisplaySample
                    setComponent={setCurrentComponent}
                    setTarget={setTarget}
                    graph_id={graph_id}
                    refreshTrigger={nodeDeleted}
                />
            )}
            {currentComponent === 2 && target && (
                <ReviewManager
                    graph_id={graph_id}
                    target={target}
                    setComponent={setCurrentComponent}
                    setReviewParams={setReviewParams}
                />
            )}
            {currentComponent === 4 && reviewParams && (
                <ConfirmCategory
                    graph_id={graph_id}
                    setComponent={setCurrentComponent}
                    setExec={setExec}
                    exec={exec}
                    targetId={reviewParams.targetId}
                    minSimilarity={reviewParams.minSim}
                />
            )}
        </section>
    );
}

/* ─── Analyzer ───────────────────────────────────────────────────────────────── */

export function Analyzer({ graph, setPage }: any) {
    const { authFetch } = useAuth();
    const [exec, setExec] = useState(false);
    const [nodeDeleted, setNodeDeleted] = useState(false);
    const [showImageMenu, setShowImageMenu] = useState(false);
    const [capturingImage, setCapturingImage] = useState(false);
    const captureRef = useRef<CaptureGraphFn | null>(null);

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

    const handleDownloadImage = async (format: 'png' | 'jpeg') => {
        setShowImageMenu(false);
        if (!captureRef.current) return;
        setCapturingImage(true);
        try {
            const dataUrl = await captureRef.current(format);
            if (!dataUrl) return;
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `grafo.${format}`;
            a.click();
        } finally {
            setCapturingImage(false);
        }
    };

    return (
        <div className='contenedor-analyzer'>
            {/* Analyzer sub-toolbar */}
            <div style={{
                display: 'flex',
                flex : '1',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: 'var(--space-2) var(--space-4)',
                background: 'var(--color-surface)',
                borderBottom: '1px solid var(--color-border)',
            }}>
                <button className="btn-ghost" onClick={() => setPage(1)}>← Regresar</button>
                <button className="btn-ghost" onClick={handleExport}>↓ Exportar CSV</button>
                <div className="image-export-wrapper">
                    <button
                        className="btn-ghost btn-image-export"
                        onClick={() => !capturingImage && setShowImageMenu(v => !v)}
                        disabled={capturingImage}
                    >
                        <span style={{ visibility: capturingImage ? 'hidden' : 'visible' }}>
                            ↓ Exportar imagen
                        </span>
                        {capturingImage && <span className="btn-image-export__spinner" aria-hidden />}
                    </button>
                    {showImageMenu && (
                        <div className="image-export-menu" onMouseLeave={() => setShowImageMenu(false)}>
                            <button onClick={() => handleDownloadImage('png')}>PNG</button>
                            <button onClick={() => handleDownloadImage('jpeg')}>JPEG</button>
                        </div>
                    )}
                </div>
            </div>

            <div className="analyzer">
                <SectionGraph exec={exec} graph_id={graph} onNodeDeleted={() => setNodeDeleted(p => !p)} onCaptureReady={(fn: CaptureGraphFn) => { captureRef.current = fn; }} />
                <SectionDesk setExec={setExec} exec={exec} graph_id={graph} nodeDeleted={nodeDeleted} />
            </div>
        </div>
    );
}
