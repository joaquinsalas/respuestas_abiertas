import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import './analyzer.css'
import { ROUTES } from '../../routes.ts'
//import React, { useCallback, useRef } from 'react';
import {
    applyNodeChanges, applyEdgeChanges,
    ReactFlow,
    useNodesState,
    useEdgesState,
    addEdge,
    Background,
    useReactFlow,
    ReactFlowProvider,
    BaseEdge,
    getBezierPath,
    type EdgeProps,
    type Connection,
    type Edge,
    type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';


/*const sampleData: Data[] = [
    { id: '1', data: 'Ejemplo 1' },
    { id: '2', data: 'Ejemplo 2' },
    { id: '3', data: 'Ejemplo 3' },
    { id: '4', data: 'Ejemplo 4' },
    { id: '5', data: 'Ejemplo 5' },
];]*/
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
        <button onClick={(e) => {
            setQuery(!query);

        }}>

            Otros datos
        </button>
    )
}

function DisplaySample({ setTarget, setComponent, initialTypeSample = 0, graph_id, categoryProp= ""}: any) {
    const [sampleData, setSampleData] = useState<Data[]>([]);
    const [random, setRandom] = useState<number>(1); // 1 for random, 0 for paginated
    const [typeSample, setTypeSample] = useState<number>(initialTypeSample); // 0 - all data, 1 - category, 2 - current category
    const [sampleSize, setSampleSize] = useState<number>(10); // For random sampling
    const [category, setCategory] = useState<string>(categoryProp); // For category-based sampling
    const [page, setPage] = useState<number>(1); // For pagination
    const [pageSize, setPageSize] = useState<number>(10); // For pagination
    const [totalItems, setTotalItems] = useState<number>(0); // Total items for pagination
    const [query, setQuery] = useState(false);
    // Dummy user_id and graph_id for now, these should come from context or props
    const [user_id] = useState("1");

    useEffect(() => {
        const fetchData = async () => {
            const url = `${ROUTES.sample}?user_id=${user_id}&graph_id=${graph_id}&sample=${typeSample}&random=${random}&ss=${sampleSize}&page=${page}&page_size=${pageSize}&category=${category}`;

            try {
                let response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                let dataJson = await response.json();
                setSampleData(dataJson.data);
                // Assuming the API returns total items for pagination, if not, we might need another endpoint or calculate it
                // For now, let's assume the API returns a 'total' field in the response for paginated data
                if (dataJson.total_items) { // Assuming the backend sends total_items
                    setTotalItems(dataJson.total_items);
                } else {
                    setTotalItems(dataJson.data.length); // Fallback if total_items is not provided
                }
            } catch (error) {
                console.error("Error fetching sample data:", error);
                setSampleData([]);
                setTotalItems(0);
            }
        };
        fetchData();
    }, [random, typeSample, sampleSize, category, page, pageSize, user_id, graph_id, query]); // Dependencies for useEffect
    let readOnly = false;
    if (typeSample === 2 || typeSample === 1) {
        readOnly = true;
    }
    return (
        <div className='Sample'>
            {typeSample !== 2 && <h1>Selecciona un dato</h1>}
            <ButtonTypeSample random={random} setRandom={setRandom} />
            <DisplayData data={sampleData} setTarget={setTarget} setComponent={setComponent} readOnly={readOnly} />
            {random === 0 && ( // Only show navigation buttons if in paginated mode
                <ButtonNavigate page={page} pageSize={sampleSize} totalItems={totalItems} setPage={setPage} />
            )}
            {random === 1 && (<ButtonNewSampleRandom setQuery={setQuery} query={query} />)}
            {typeSample === 2 && (
                <div style={{marginTop: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px'}}>
                    <div style={{display: 'flex', gap: '10px'}}>
                        <button onClick={e => setComponent(1)}>volver</button>
                    </div>
                    <p className='total-count'>cantidad de respuestas: {totalItems}</p>
                </div>
            )}
        </div>
    )
}

function ReviewManager({ user_id, graph_id, target, setComponent }: any) {
    const [loading, setLoading] = useState(false);
    const [similarity, setSimilarity] = useState(0.8);
    const [showSample, setShowSample] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const preAnalysis = async () => {
            const url = `${ROUTES.opc_cut}?user_id=${user_id}&graph_id=${graph_id}&target_id=${target.id}&n_opc=3&min_similarity=0.6`;
            try {
                await fetch(url);
            } catch (error) {
                console.error("Error in pre-analysis:", error);
            }
        };
        preAnalysis();
    }, [user_id, graph_id, target.id]);

    const handleSimilarityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newSim = parseFloat(e.target.value);
        setSimilarity(newSim);
        setLoading(true);
        setShowSample(false);

        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }

        timerRef.current = setTimeout(async () => {
            const simUrl = `${ROUTES.get_similarity}?user_id=${user_id}&graph_id=${graph_id}&target_id=${target.id}&min_similarity=${newSim}&preanalized=1`;
            try {
                const response = await fetch(simUrl);
                if (response.ok) {
                    setShowSample(true);
                }
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
                <p>
                    {target.data}
                </p>
                <div className="display-area">
                    {loading ? (
                        <div className="loader-container">
                            <div className="loader"></div>
                        </div>
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
    user_id: string;
    graph_id: string;
    setComponent: (component: number) => void;
        setExec: (exec: boolean) => void;
    exec: boolean;
}

export function ConfirmCategory({ user_id, graph_id, setComponent, setExec, exec }: ConfirmCategoryProps) {
    const [categoryName, setCategoryName] = useState("");

    const handleConfirm = async () => {
        const url = `${ROUTES.new_category}?user_id=${user_id}&graph_id=${graph_id}&name=${categoryName}`;
        try {
            const response = await fetch(url);
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


const ModalRightClickNode = ({ id, top, left, right, bottom, deleteNode, editNode, ...props }: any) => {
    alert("me cacharon en la jugada")
    return (
        <div
            style={{ top, left, right, bottom }}
            className="context-menu"
            {...props}
        >
            <p style={{ margin: '0.5em 1em', fontSize: '10px', color: '#999' }}>Nodo: {id}</p>
            <button onClick={() => editNode(id)}>Editar</button>
            <button onClick={() => deleteNode(id)}>Borrar</button>
        </div>
    );
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
} : any )=> {
    
    const handlerDelete = async ()=> {
        let data = await fetch(ROUTES.delete_node, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ node_id: id, user_id : 1, graph_id: graph_id}),
        });
        if (!data.ok) {
            console.error("Failed to delete node in backend");
        }
        else{
            onPaneClick();
            setExec(!exec);
        }
    }

    const handlerViewData = ()=>{
        onPaneClick();
        setData(category);
        setShowData(true);
    }
 

 
  return (
     <div
      style={{ top, left, right, bottom }}
      className="context-menu"
      {...props}
    >
      <button onClick={handlerDelete}>borrar</button>
      <button onClick={handlerViewData}>ver</button>
    </div>
  );
}

function SectionGraph({ exec = false, graph_id }: any) {

    const relations = {
        1: { "type": "Se asocia con " },
        2: { "type": "Es parte de" },
        3: { "type": "Es causa de" },
        4: { "type": "Es propiedad de" },
        5: { "type": "Es un" }
    }

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [selectedRelationType, setSelectedRelationType] = useState('1');
    const [menu, setMenu] = useState(null);
    const [nodeDeleted, setNodeDeleted] = useState(false);
    const [edgeDeleted, setEdgeDeleted] = useState(false);
    const [showData, setShowData] = useState(false);
    const [category, setCategory] = useState("");
    const ref = useRef<HTMLDivElement>(null);
    const user_id = "1";
    
    const onConnect = useCallback(
        async (params: Connection) => {
            if (!params.source || !params.target) return;

            // Prepare API call
            const body = {
                user_id: user_id,
                graph_id: graph_id.toString(),
                node_id_1: parseInt(params.source),
                node_id_2: parseInt(params.target),
                connection_type: parseInt(selectedRelationType)
            };

            try {
                const response = await fetch(ROUTES.add_edge, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });

                if (response.ok) {
                    // Success: update local state
                    // Overwrite if edge between source and target already exists
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
        [graph_id, selectedRelationType, setEdges, user_id]
    );

    useEffect(() => {
        const getGraph = async () => {
            try {
                const response = await fetch(`${ROUTES.get_graph}?graph_id=${graph_id}`);
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
    const pane = ref.current.getBoundingClientRect();
    console.log(nodo);
    setMenu({
        id: nodo.id,
        top:    event.clientY - pane.top  < pane.height - 200 && event.clientY - pane.top,
        left:   event.clientX - pane.left < pane.width  - 200 && event.clientX - pane.left,
        right:  event.clientX - pane.left >= pane.width  - 200 && pane.width  - (event.clientX - pane.left),
        bottom: event.clientY - pane.top  >= pane.height - 200 && pane.height - (event.clientY - pane.top),
        category : nodo.data.label,
    });
}, [setMenu]);

      const onPaneClick = useCallback(() => {setMenu(null); setShowData(false);}, [setMenu]);


    const onEdgeClick = useCallback((event, edge)=>{
        const deleteEdge= async() =>{
            let request = await fetch(ROUTES.delete_edge, {
                method : 'POST',
                  headers: {
                        "Content-Type": "application/json",  // <- indica que envías JSON
                    },
                body : JSON.stringify({
                    user_id : user_id,
                    graph_id : graph_id,
                    from_node_id : edge.target,
                    to_node_id : edge.source

                })
            });
            if(!request.ok) alert("error al eliminar la conexion, intente mas tarde");
            setEdgeDeleted(prev  => !prev);
            console.log(edgeDeleted)
        }
        deleteEdge();
    },[])
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
                    {menu && <MenuRightClick {...menu} onPaneClick={onPaneClick} graph_id={graph_id} setExec={setNodeDeleted} exec={nodeDeleted} setData={setCategory} setShowData={setShowData}/>}
                    <Background />
                </ReactFlow>
                {showData && <DisplaySample initialTypeSample={1} graph_id={graph_id} categoryProp={category}/>}
            </div>
        </div>
    )
}


function SectionDesk({exec, setExec, user_id, graph_id} : any) {
    const [currentComponent, setCurrentComponent] = useState(1); // 1 - show data to select / 2 - Show review manager / 4 - Show confirm
    const [optionsCut, setOptionsCut] = useState<Array<{ id: number | string, data: string, sim: number }>>([])
    const [target, setTarget] = useState<{ data: string, id: number | string }>();
    
    return (
        <section className='desk'>
            {currentComponent === 1 && <DisplaySample setComponent={setCurrentComponent} setTarget={setTarget} graph_id={graph_id} />}
            {currentComponent === 2 && target && <ReviewManager user_id={user_id} graph_id={graph_id} target={target} setComponent={setCurrentComponent} />}
            {currentComponent === 4 && <ConfirmCategory setComponent={setCurrentComponent} user_id={user_id} graph_id={graph_id} setExec={setExec} exec={exec}/>}
        </section>
    )
}

export function Analyzer({graph, setPage} : any) {

    const [exec, setExec] = useState(false);

    const handlerClick = (e) => {
        let getData = async ()=> {
            let data = await fetch(`${ROUTES.dowload_csv}?user_id=1&graph_id=${graph}`);
            let dataBlob = await data.blob();
            let url = URL.createObjectURL(dataBlob)
            let a = document.createElement('a');
            a.href = url;
            a.download = "resultado.csv";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        getData();
    }

    return (
        <div className='analyzer'>
            <button onClick={()=> setPage(1)}>regresar</button>
            <button onClick={handlerClick}>Exportar a CSV</button>
                <SectionGraph exec={exec} user_id={graph.user_id} graph_id={graph} />
            <SectionDesk setExec={setExec} exec={exec} user_id={1} graph_id={graph} />
        </div>

    )
}

