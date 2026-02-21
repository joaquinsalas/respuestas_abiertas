import { useState, useEffect, useCallback, useMemo } from 'react'
import './analyzer.css'
import { ROUTES } from '../../routes.ts'
//import React, { useCallback, useRef } from 'react';
import {
    applyNodeChanges, applyEdgeChanges,
    ReactFlow,
    useNodesState,
    useEdgesState,
    addEdge,
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


function DisplayData({ data, user_id, graph_id, setOptions, setTarget, setComponent, readOnly = false }: { data: Array<Data>, user_id: string, graph_id: string, setOptions: any, setTarget: any, setComponent: any, readOnly?: boolean }) {
    const handleOpcCut = async (target_id: string, target_data: string) => {
        if (readOnly) return;
        const url = `${ROUTES.opc_cut}?user_id=${user_id}&graph_id=${graph_id}&target_id=${target_id}&n_opc=3&min_similarity=0.80`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            setOptions(result.data); //update the options to make de cut
            setTarget({ data: target_data, id: target_id }) //update de values selected by the user
            setComponent(2);//update component render
            console.log("Opciones de corte:", result);
        } catch (error) {
            console.error("Error fetching opc_cut:", error);
        }
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
            <button onClick={() => setRandom(0)} className={random === 0 ? 'active' : ''}>Secuencial</button>
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
        <div>
            <button onClick={() => {
                setPage(prev => Math.max(1, prev - 1));
                setValue(page - 1);
            }
            } disabled={page === 1}>Atras</button>
            <button onClick={() => { setPage(prev => Math.min(totalPages, prev + 1)); setValue(page + 1); }} disabled={page === totalPages}>Siguiente</button>
            <p>
                <input type="text" value={valueUserPage} onChange={(e) => {
                    setValue(e.target.value);
                    setTimeout(() => {
                        const newPage = parseInt(e.target.value);
                        if (!isNaN(newPage) && newPage >= 1 && newPage <= totalPages) {
                            setPage(newPage);

                        }
                    }, 500)

                }} /> - {totalPages}
            </p>
        </div>
    )
}

const ButtonNewSampleRandom: any = ({ setQuery, query }: { setQuery: any, query: boolean }) => {
    return (
        <button onClick={(e) => {
            setQuery(!query);
            console.log(query);

        }}>

            Otros datos
        </button>
    )
}

function DisplaySample({ setOptions, setTarget, setComponent, initialTypeSample = 0 }: any) {
    const [sampleData, setSampleData] = useState<Data[]>([]);
    const [random, setRandom] = useState<number>(1); // 1 for random, 0 for paginated
    const [typeSample, setTypeSample] = useState<number>(initialTypeSample); // 0 - all data, 1 - category, 2 - current category
    const [sampleSize, setSampleSize] = useState<number>(10); // For random sampling
    const [category, setCategory] = useState<string>(""); // For category-based sampling
    const [page, setPage] = useState<number>(1); // For pagination
    const [pageSize, setPageSize] = useState<number>(10); // For pagination
    const [totalItems, setTotalItems] = useState<number>(0); // Total items for pagination
    const [query, setQuery] = useState(false);
    // Dummy user_id and graph_id for now, these should come from context or props
    const [user_id] = useState("1");
    const [graph_id] = useState("5");

    useEffect(() => {
        const fetchData = async () => {
            const url = `${ROUTES.sample}?user_id=${user_id}&graph_id=${graph_id}&sample=${typeSample}&random=${random}&ss=${sampleSize}&page=${page}&page_size=${pageSize}&category=${category}`;

            try {
                let response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                let dataJson = await response.json();
                console.log(dataJson)
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
    if (typeSample === 2) {
        readOnly = true;
    }
    return (
        <div className='Sample'>
            <h1>{typeSample === 2 ? "Datos actuales en revisión" : "Selecciona un dato"}</h1>
            <ButtonTypeSample random={random} setRandom={setRandom} />
            <DisplayData data={sampleData} user_id={user_id} graph_id={graph_id} setOptions={setOptions} setTarget={setTarget} setComponent={setComponent} readOnly={readOnly} />
            {random === 0 && ( // Only show navigation buttons if in paginated mode
                <ButtonNavigate page={page} pageSize={sampleSize} totalItems={totalItems} setPage={setPage} />
            )}
            {random === 1 && (<ButtonNewSampleRandom setQuery={setQuery} query={query} />)}
            {typeSample === 2 && <div><button onClick={e => setComponent(2)}>volver</button><button onClick={e => setComponent(4)}>Siguiente</button></div>}
        </div>
    )
}

interface DisplayOptionsCutProps {
    dataTarget: string;
    dataTargetID: number | string;
    options: Array<{ id: number | string; data: string; sim: number }>;
    setComponent: any;
    user_id: string;
    graph_id: string;
}

function DisplayOptionsCut({ dataTarget, dataTargetID, options, setComponent, user_id, graph_id }: DisplayOptionsCutProps) {
    console.log("opc aqui");
    console.log(dataTarget);
    console.log(dataTargetID);
    console.log(options);

    const handleSelectOption = async (min_similarity: number) => {
        const url = `${ROUTES.get_similarity}?user_id=${user_id}&graph_id=${graph_id}&target_id=${dataTargetID}&min_similarity=${min_similarity}&preanalized=1`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            setComponent(3);
        } catch (error) {
            console.error("Error fetching similarity:", error);
        }
    };

    return (
        <div className='options'>
            <p className='options__target' key={dataTargetID}>{dataTarget}</p>
            {options && options.sort((a, b) => b.sim - a.sim).map(
                e => (<div key={e.id} className='options__opt-container' onClick={() => handleSelectOption(e.sim)}>
                    <p >{e.data}</p><p>{e.sim}</p>
                </div>
                ))}
        </div>
    )
}

interface ConfirmCategoryProps {
    user_id: string;
    graph_id: string;
    setComponent: (component: number) => void;
}

export function ConfirmCategory({ user_id, graph_id, setComponent }: ConfirmCategoryProps) {
    const [categoryName, setCategoryName] = useState("");

    const handleConfirm = async () => {
        const url = `${ROUTES.new_category}?user_id=${user_id}&graph_id=${graph_id}&name=${categoryName}`;
        try {
            const response = await fetch(url);
            if (response.ok) {
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
                <button onClick={() => setComponent(3)}>Atras</button>
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

function SectionGraph({ exec, graph_id = 5 }: any) {
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
    }, [graph_id, setNodes, setEdges]);

    return (
        <div className='graph' style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
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
            <div style={{ flex: 1 }}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    edgeTypes={edgeTypes}
                    fitView
                />
            </div>
        </div>
    )
}


function SectionDesk() {
    const [currentComponent, setCurrentComponent] = useState(1); // 1 - show data to select /2 - Show options to cut / 3- Show sample of data select / 4- Show confirm
    const [optionsCut, setOptionsCut] = useState<Array<{ id: number | string, data: string, sim: number }>>([])
    const [target, setTarget] = useState<{ data: string, id: number | string }>();
    const user_id = "1";
    const graph_id = "5";
    return (
        <section className='desk'>
            {currentComponent === 1 && <DisplaySample setOptions={setOptionsCut} setComponent={setCurrentComponent} setTarget={setTarget} />}
            {currentComponent === 2 && target && <DisplayOptionsCut dataTarget={target.data} dataTargetID={target.id} options={optionsCut} setComponent={setCurrentComponent} user_id={user_id} graph_id={graph_id} />}
            {currentComponent === 3 && <DisplaySample setOptions={setOptionsCut} setComponent={setCurrentComponent} setTarget={setTarget} initialTypeSample={2} />}
            {currentComponent === 4 && <ConfirmCategory setComponent={setCurrentComponent} user_id={user_id} graph_id={graph_id} />}
        </section>
    )
}

export function Analyzer() {

    return (
        <div className='analyzer'>
            <SectionGraph />
            <SectionDesk />
        </div>

    )
}

