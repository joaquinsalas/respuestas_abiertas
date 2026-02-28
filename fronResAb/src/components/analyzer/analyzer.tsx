import { useState, useEffect, useCallback, useRef } from 'react'
import './analyzer.css'
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
    data: string,
    id: string
}


function DisplayData({ data, setTarget, setComponent, readOnly = false }: { data: Array<Data>, setTarget: any, setComponent: any, readOnly?: boolean }) {
    const handleOpcCut = (target_id: string, target_data: string) => {
        if (readOnly) return;
        setTarget({ data: target_data, id: target_id });
        setComponent(2);
    };

    return (
        <div className='displayData'>
            {data.map(element => (
                <div className={`displayData_data ${readOnly ? 'read-only' : ''}`} key={element.id} onClick={() => !readOnly && handleOpcCut(element.id, element.data)}>
                    {element.data}
                </div>
            ))}
        </div>
    )
}

interface ButtonTypeSampleProps {
    random: number;
    setRandom: (random: number) => void;
}

function ButtonTypeSample({ random, setRandom }: ButtonTypeSampleProps) {
    return (
        <div className='buttonSample'>
            <button onClick={() => setRandom(1)} className={random === 1 ? 'active' : ''}>Aleatoria</button>
            <button onClick={() => setRandom(0)} className={random === 0 ? 'active' : ''}>Orden</button>
        </div>
    )
}

interface ButtonNavigateProps {
    page: number;
    pageSize: number;
    totalItems: number;
    setPage: (page: number) => void;
}

function ButtonNavigate({ page, pageSize, totalItems, setPage }: ButtonNavigateProps) {
    const totalPages = Math.ceil(totalItems / pageSize);
    const [valueUserPage, setValue] = useState(1);

    return (
        <div className="navigation">
            <button onClick={() => {
                setPage(prev => Math.max(1, prev - 1));
                setValue(page - 1);
            }
            } disabled={page === 1}>&lt;</button>
            <button onClick={() => { setPage(prev => Math.min(totalPages, prev + 1)); setValue(page + 1); }} disabled={page === totalPages}>&gt;</button>
            <p>
                <input type="text" value={valueUserPage} style={{width: '30px', textAlign: 'center'}} onChange={(e) => {
                    setValue(parseInt(e.target.value) || 0);
                    setTimeout(() => {
                        const newPage = parseInt(e.target.value);
                        if (!isNaN(newPage) && newPage >= 1 && newPage <= totalPages) {
                            setPage(newPage);
                        }
                    }, 500)
                }} /> / {totalPages}
            </p>
        </div>
    )
}

const ButtonNewSampleRandom: any = ({ setQuery, query }: { setQuery: any, query: boolean }) => {
    return (
        <button onClick={() => { setQuery(!query); }}>
            Otros datos
        </button>
    )
}

function DisplaySample({ setTarget, setComponent, initialTypeSample = 0, graph_id, categoryProp = "" }: any) {
    const { authFetch } = useAuth();
    const [sampleData, setSampleData] = useState<Data[]>([]);
    const [random, setRandom] = useState<number>(1);
    const [typeSample, setTypeSample] = useState<number>(initialTypeSample);
    const [sampleSize, setSampleSize] = useState<number>(10);
    const [category, setCategory] = useState<string>(categoryProp);
    const [page, setPage] = useState<number>(1);
    const [pageSize] = useState<number>(10);
    const [totalItems, setTotalItems] = useState<number>(0);
    const [query, setQuery] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            const url = `${ROUTES.sample}?graph_id=${graph_id}&sample=${typeSample}&random=${random}&ss=${sampleSize}&page=${page}&page_size=${pageSize}&category=${category}`;
            try {
                const response = await authFetch(url);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const dataJson = await response.json();
                setSampleData(dataJson.data);
                setTotalItems(dataJson.total_items ?? dataJson.data.length);
            } catch (error) {
                console.error("Error fetching sample data:", error);
                setSampleData([]);
                setTotalItems(0);
            }
        };
        fetchData();
    }, [random, typeSample, sampleSize, category, page, pageSize, graph_id, query]);

    const readOnly = typeSample === 2 || typeSample === 1;

    return (
        <div className='Sample'>
            {typeSample !== 2 && <h1>Selecciona un dato</h1>}
            <ButtonTypeSample random={random} setRandom={setRandom} />
            <DisplayData data={sampleData} setTarget={setTarget} setComponent={setComponent} readOnly={readOnly} />
            {random === 0 && (
                <ButtonNavigate page={page} pageSize={sampleSize} totalItems={totalItems} setPage={setPage} />
            )}
            {random === 1 && (<ButtonNewSampleRandom setQuery={setQuery} query={query} />)}
            {typeSample === 2 && (
                <div style={{marginTop: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px'}}>
                    <div style={{display: 'flex', gap: '10px'}}>
                        <button onClick={() => setComponent(1)}>volver</button>
                    </div>
                    <p className='total-count'>cantidad de respuestas: {totalItems}</p>
                </div>
            )}
        </div>
    )
}

function ReviewManager({ graph_id, target, setComponent }: any) {
    const { authFetch } = useAuth();
    const [loading, setLoading] = useState(false);
    const [similarity, setSimilarity] = useState(0.8);
    const [showSample, setShowSample] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const preAnalysis = async () => {
            const url = `${ROUTES.opc_cut}?graph_id=${graph_id}&target_id=${target.id}&n_opc=3&min_similarity=0.6`;
            try {
                await authFetch(url);
            } catch (error) {
                console.error("Error in pre-analysis:", error);
            }
        };
        preAnalysis();
    }, [graph_id, target.id]);

    const handleSimilarityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newSim = parseFloat(e.target.value);
        setSimilarity(newSim);
        setLoading(true);
        setShowSample(false);

        if (timerRef.current) clearTimeout(timerRef.current);

        timerRef.current = setTimeout(async () => {
            const simUrl = `${ROUTES.get_similarity}?graph_id=${graph_id}&target_id=${target.id}&min_similarity=${newSim}&preanalized=1`;
            try {
                const response = await authFetch(simUrl);
                if (response.ok) setShowSample(true);
            } catch (error) {
                console.error("Error getting similarity:", error);
            } finally {
                setLoading(false);
            }
        }, 1000);
    };

    return (
        <div className="review-manager">
            <button className="create-category-btn" onClick={() => setComponent(4)}>Crear categoria</button>
            <div className="review-layout">
                <div className="slider-container">
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={similarity}
                        onChange={handleSimilarityChange}
                        className="vertical-slider"
                    />
                </div>
                <p>{target.data}</p>
                <div className="display-area">
                    {loading ? (
                        <div className="loader-container"><div className="loader"></div></div>
                    ) : (
                        showSample ? (
                            <DisplaySample
                                graph_id={graph_id}
                                initialTypeSample={2}
                                setComponent={setComponent}
                                setTarget={() => {}}
                            />
                        ) : (
                            <p style={{marginTop: '50px'}}>Mueve el switch para iniciar el análisis</p>
                        )
                    )}
                </div>
            </div>
        </div>
    );
}

interface ConfirmCategoryProps {
    graph_id: string;
    setComponent: (component: number) => void;
    setExec: (exec: boolean) => void;
    exec: boolean;
}

export function ConfirmCategory({ graph_id, setComponent, setExec, exec }: ConfirmCategoryProps) {
    const { authFetch } = useAuth();
    const [categoryName, setCategoryName] = useState("");

    const handleConfirm = async () => {
        const url = `${ROUTES.new_category}?graph_id=${graph_id}&name=${categoryName}`;
        try {
            const response = await authFetch(url);
            if (response.ok) {
                setExec(!exec);
                setComponent(1);
            } else {
                console.error("Error confirming category:", response.status);
            }
        } catch (error) {
            console.error("Error fetching new_category:", error);
        }
    };

    return (
        <div className='confirm_category'>
            <h1>Nombra la nueva categoría</h1>
            <input
                type="text"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="Nombre de la categoría"
            />
            <div>
                <button onClick={() => setComponent(2)}>Atras</button>
                <button onClick={handleConfirm}>Confirmar</button>
            </div>
        </div>
    )
}

const CustomEdge1 = (props: EdgeProps) => {
    const [edgePath] = getBezierPath(props);
    return <BaseEdge path={edgePath} {...props} style={{ stroke: '#3b82f6', strokeWidth: 2 }} />;
};
const CustomEdge2 = (props: EdgeProps) => {
    const [edgePath] = getBezierPath(props);
    return <BaseEdge path={edgePath} {...props} style={{ stroke: '#10b981', strokeWidth: 2 }} />;
};
const CustomEdge3 = (props: EdgeProps) => {
    const [edgePath] = getBezierPath(props);
    return <BaseEdge path={edgePath} {...props} style={{ stroke: '#ef4444', strokeWidth: 2 }} />;
};
const CustomEdge4 = (props: EdgeProps) => {
    const [edgePath] = getBezierPath(props);
    return <BaseEdge path={edgePath} {...props} style={{ stroke: '#f59e0b', strokeWidth: 2 }} />;
};
const CustomEdge5 = (props: EdgeProps) => {
    const [edgePath] = getBezierPath(props);
    return <BaseEdge path={edgePath} {...props} style={{ stroke: '#8b5cf6', strokeWidth: 2 }} />;
};

const edgeTypes = {
    '1': CustomEdge1,
    '2': CustomEdge2,
    '3': CustomEdge3,
    '4': CustomEdge4,
    '5': CustomEdge5,
};


const MenuRightClick = ({
    id,
    top,
    left,
    right,
    bottom,
    graph_id,
    exec,
    onPaneClick,
    setExec,
    setData,
    category,
    setShowData,
    ...props
}: any) => {
    const { authFetch } = useAuth();

    const handlerDelete = async () => {
        const res = await authFetch(ROUTES.delete_node, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ node_id: id, graph_id }),
        });
        if (!res.ok) {
            console.error("Failed to delete node in backend");
        } else {
            onPaneClick();
            setExec(!exec);
        }
    };

    const handlerViewData = () => {
        onPaneClick();
        setData(category);
        setShowData(true);
    };

    return (
        <div style={{ top, left, right, bottom }} className="context-menu" {...props}>
            <button onClick={handlerDelete}>borrar</button>
            <button onClick={handlerViewData}>ver</button>
        </div>
    );
};

function SectionGraph({ exec = false, graph_id }: any) {
    const { authFetch } = useAuth();

    const relations = {
        1: { "type": "Se asocia con " },
        2: { "type": "Es parte de" },
        3: { "type": "Es causa de" },
        4: { "type": "Es propiedad de" },
        5: { "type": "Es un" }
    };

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [selectedRelationType, setSelectedRelationType] = useState('1');
    const [menu, setMenu] = useState(null);
    const [nodeDeleted, setNodeDeleted] = useState(false);
    const [edgeDeleted, setEdgeDeleted] = useState(false);
    const [showData, setShowData] = useState(false);
    const [category, setCategory] = useState("");
    const ref = useRef<HTMLDivElement>(null);

    const onConnect = useCallback(
        async (params: Connection) => {
            if (!params.source || !params.target) return;
            const body = {
                graph_id: graph_id.toString(),
                node_id_1: parseInt(params.source),
                node_id_2: parseInt(params.target),
                connection_type: parseInt(selectedRelationType),
            };
            try {
                const response = await authFetch(ROUTES.add_edge, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                if (response.ok) {
                    setEdges((eds) => {
                        const filteredEdges = eds.filter(
                            (e) => !(e.source === params.source && e.target === params.target)
                        );
                        const newEdge: Edge = {
                            id: `${params.source}-${params.target}`,
                            source: params.source!,
                            target: params.target!,
                            type: selectedRelationType,
                        };
                        return addEdge(newEdge, filteredEdges);
                    });
                } else {
                    console.error("Failed to add edge in backend");
                }
            } catch (error) {
                console.error("Error adding edge:", error);
            }
        },
        [graph_id, selectedRelationType, setEdges, authFetch]
    );

    useEffect(() => {
        const getGraph = async () => {
            try {
                const response = await authFetch(`${ROUTES.get_graph}?graph_id=${graph_id}`);
                if (!response.ok) throw new Error("error al obtener el grafo");
                const data: { nodes: any[], edges: any[] } = await response.json();

                const nuevosNodos: Node[] = data.nodes.map((node, index) => ({
                    id: node.id.toString(),
                    data: { label: node.name },
                    position: { x: (index % 5) * 200, y: Math.floor(index / 5) * 100 },
                }));

                const newEdges: Edge[] = data.edges.map((e) => ({
                    id: e.id,
                    source: e.source.toString(),
                    target: e.target.toString(),
                    type: e.relation_id.toString(),
                }));

                setNodes(nuevosNodos);
                setEdges(newEdges);
            } catch (error) {
                console.error(error);
            }
        };
        getGraph();
    }, [graph_id, setEdges, setNodes, exec, nodeDeleted, edgeDeleted]);

    const onNodeContextMenu = useCallback((event, nodo) => {
        event.preventDefault();
        const pane = ref.current!.getBoundingClientRect();
        setMenu({
            id: nodo.id,
            top:    event.clientY - pane.top  < pane.height - 200 && event.clientY - pane.top,
            left:   event.clientX - pane.left < pane.width  - 200 && event.clientX - pane.left,
            right:  event.clientX - pane.left >= pane.width  - 200 && pane.width  - (event.clientX - pane.left),
            bottom: event.clientY - pane.top  >= pane.height - 200 && pane.height - (event.clientY - pane.top),
            category: nodo.data.label,
        });
    }, [setMenu]);

    const onPaneClick = useCallback(() => { setMenu(null); setShowData(false); }, [setMenu]);

    const onEdgeClick = useCallback((event, edge) => {
        const deleteEdge = async () => {
            const res = await authFetch(ROUTES.delete_edge, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    graph_id,
                    from_node_id: edge.target,
                    to_node_id: edge.source,
                }),
            });
            if (!res.ok) alert("error al eliminar la conexion, intente mas tarde");
            setEdgeDeleted(prev => !prev);
        };
        deleteEdge();
    }, [graph_id, authFetch]);

    return (
        <div className='graph' ref={ref} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="relation-selector" style={{ padding: '10px', background: '#f0f0f0', display: 'flex', gap: '10px' }}>
                <span>Tipo de relación:</span>
                {Object.entries(relations).map(([id, rel]) => (
                    <label key={id} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                        <input
                            type="radio"
                            name="relationType"
                            value={id}
                            checked={selectedRelationType === id}
                            onChange={(e) => setSelectedRelationType(e.target.value)}
                        />
                        {rel.type}
                    </label>
                ))}
            </div>
            <div style={{ flex: 1, position: 'relative' }}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    edgeTypes={edgeTypes}
                    onNodeContextMenu={onNodeContextMenu}
                    fitView
                    onPaneClick={onPaneClick}
                    onEdgeClick={onEdgeClick}
                >
                    {menu && <MenuRightClick {...menu} onPaneClick={onPaneClick} graph_id={graph_id} setExec={setNodeDeleted} exec={nodeDeleted} setData={setCategory} setShowData={setShowData} />}
                    <Background />
                </ReactFlow>
                {showData && <DisplaySample initialTypeSample={1} graph_id={graph_id} categoryProp={category} setTarget={() => {}} setComponent={() => {}} />}
            </div>
        </div>
    )
}


function SectionDesk({ exec, setExec, graph_id }: any) {
    const [currentComponent, setCurrentComponent] = useState(1);
    const [target, setTarget] = useState<{ data: string, id: number | string }>();

    return (
        <section className='desk'>
            {currentComponent === 1 && <DisplaySample setComponent={setCurrentComponent} setTarget={setTarget} graph_id={graph_id} />}
            {currentComponent === 2 && target && <ReviewManager graph_id={graph_id} target={target} setComponent={setCurrentComponent} />}
            {currentComponent === 4 && <ConfirmCategory graph_id={graph_id} setComponent={setCurrentComponent} setExec={setExec} exec={exec} />}
        </section>
    )
}

export function Analyzer({ graph, setPage }: any) {
    const { authFetch } = useAuth();
    const [exec, setExec] = useState(false);

    const handlerClick = () => {
        const getData = async () => {
            const res = await authFetch(`${ROUTES.dowload_csv}?graph_id=${graph}`);
            const dataBlob = await res.blob();
            const url = URL.createObjectURL(dataBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = "resultado.csv";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        };
        getData();
    };

    return (
        <div className='analyzer'>
            <button onClick={() => setPage(1)}>regresar</button>
            <button onClick={handlerClick}>Exportar a CSV</button>
            <SectionGraph exec={exec} graph_id={graph} />
            <SectionDesk setExec={setExec} exec={exec} graph_id={graph} />
        </div>
    )
}
