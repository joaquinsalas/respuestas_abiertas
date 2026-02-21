import {useState, useEffect, useCallback} from 'react'
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
} from '@xyflow/react';
 
import '@xyflow/react/dist/style.css';


/*const sampleData: Data[] = [
    { id: '1', data: 'Ejemplo 1' },
    { id: '2', data: 'Ejemplo 2' },
    { id: '3', data: 'Ejemplo 3' },
    { id: '4', data: 'Ejemplo 4' },
    { id: '5', data: 'Ejemplo 5' },
];]*/
interface Data{
    data : string,
    id : string
}


function DisplayData({data, user_id, graph_id, setOptions, setTarget, setComponent, readOnly = false} : {data: Array<Data>, user_id: string, graph_id: string, setOptions : any, setTarget :any, setComponent:any, readOnly? : boolean}){
    const handleOpcCut = async (target_id: string, target_data : string) => {
        if (readOnly) return;
        const url = `${ROUTES.opc_cut}?user_id=${user_id}&graph_id=${graph_id}&target_id=${target_id}&n_opc=3&min_similarity=0.80`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            setOptions(result.data); //update the options to make de cut
            setTarget({ data : target_data, id : target_id}) //update de values selected by the user
            setComponent(2);//update component render
            console.log("Opciones de corte:", result);
        } catch (error) {
            console.error("Error fetching opc_cut:", error);
        }
    };

    return(
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

function ButtonTypeSample({ random, setRandom }: ButtonTypeSampleProps){
    return(
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

function ButtonNavigate({ page, pageSize, totalItems, setPage }: ButtonNavigateProps)
{
    const totalPages = Math.ceil(totalItems / pageSize);
    const [valueUserPage, setValue] = useState(1);

    return(
        <div>
            <button onClick={() => {setPage(prev => Math.max(1, prev - 1)); 
                setValue(page -1);
            }
            } disabled={page === 1}>Atras</button>
            <button onClick={() => {setPage(prev => Math.min(totalPages, prev + 1)); setValue(page +1);}} disabled={page === totalPages}>Siguiente</button>
            <p>
                <input type="text" value={valueUserPage} onChange={(e) => {
                    setValue(e.target.value);
                    setTimeout(()=>{
                    const newPage = parseInt(e.target.value);
                    if (!isNaN(newPage) && newPage >= 1 && newPage <= totalPages) {
                        setPage(newPage);
                        
                    }},500)
                    
                }}/> - {totalPages}
            </p>
        </div>
    )
}

const ButtonNewSampleRandom : any = ({setQuery, query} : {setQuery : any, query : boolean})=>{
    return (
        <button onClick={(e) => {
            setQuery(!query);
            console.log(query);
            
            }}>

            Otros datos
        </button>
    )
}

function DisplaySample({setOptions, setTarget, setComponent, initialTypeSample = 0} : any){
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
            <DisplayData data={sampleData} user_id={user_id} graph_id={graph_id} setOptions={setOptions} setTarget={setTarget} setComponent={setComponent} readOnly={readOnly}/>
            {random === 0 && ( // Only show navigation buttons if in paginated mode
                <ButtonNavigate page={page} pageSize={sampleSize} totalItems={totalItems} setPage={setPage} />
            )}
            {random === 1 && (<ButtonNewSampleRandom setQuery={setQuery} query={query}/>)}
            {typeSample===2 && <div><button onClick={e => setComponent(2)}>volver</button><button onClick={e => setComponent(4)}>Siguiente</button></div>}
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

function SectionGraph({exec,graph_id = 5} : any){
    /*
    const initialNodes = [
  {
    id: 'n1',
    position: { x: 0, y: 0 },
    data: { label: 'Node 1' },
    type: 'input',
  },
  {
    id: 'n2',
    position: { x: 100, y: 100 },
    data: { label: 'Node 2' },
  },
];*/
    const [nodes, setNodes] = useState<Array<any>>([]);
    const [edges, setEdges] = useState<Array<any>>([]);
    
    const onNodesChange = useCallback(()=>
        (changes) => setNodes((nodeSnapshot) => applyNodeChanges(changes, nodeSnapshot))
    ,[])
    
    const getNodesFormat = ({names} : {names : Array<string>})=> {
        names.
        return 
    }

   useEffect(() => {
        const getGraph = async () => {
            try {
                const response = await fetch(`${ROUTES.get_graph}?graph_id=${graph_id}`);
                if (!response.ok) throw new Error("error al obtener el grafo");
                
                const structure_graph: Record<string, any> = await response.json();
                const nodes_name: string[] = Object.keys(structure_graph);
                
                // IMPORTANTE: React Flow necesita una posición inicial (x, y) 
                // para cada nodo o no se verán en pantalla.
                const nuevosNodos: Node[] = nodes_name.map((name, index) => ({
                    id: name,
                    data: { label: name },
                    position: { x: index * 150, y: index * 50 }, // Posición simple en diagonal
                }));
                console.log(structure_graph)
                let newEdges = []
                for(let i=0; i<nodes_name.length; i++)
                {   
                    let name=nodes_name[i]
                    let currentRelations = structure_graph[name]
                    if(currentRelations === 0) continue;
                    let edgeNodesName : Array<any> = Object.keys(currentRelations);
                    edgeNodesName.forEach((value, index) => {
                    newEdges.push({id : `${nodes_name[i]}-${structure_graph[name][value]}`, source : name, target : structure_graph[name][value]})
                    });
                    //console.log(`${name} y ${structure_graph[name][currentRelations]} y ${currentRelations}`);
                }
                console.log(newEdges);
                setEdges(newEdges);
                setNodes(nuevosNodos);
                
            } catch (error) {
                console.error(error);
            }
        };

        getGraph();
    }, [graph_id]); // Agregamos graph_id como dependencia por si cambia
   

    return (
        <div className='graph' style={{ width: '100%', height: '100%' }}>
            <ReactFlow 
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                fitView
            />
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
            {currentComponent === 4 && <ConfirmCategory setComponent={setCurrentComponent} user_id={user_id} graph_id={graph_id}/>}
        </section>
    )
}

export function Analyzer() {

    return(
        <div className='analyzer'>
            <SectionGraph />
            <SectionDesk />
        </div>

    )
}

