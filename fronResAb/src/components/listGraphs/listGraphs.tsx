import {React, useEffect, useState} from 'react'
import {ROUTES} from '../../routes.ts'

interface optionGraphsProps{
    graphs : Array<{name : string, id : string | number, date : any}>
    setPage : (value : number)=> void,
    setGraph : (value : number | string)=> void,
}

const OptionGraphs : React.FC = ({graphs, setGraph, setPage} : optionGraphsProps)=> {
    
    const handlerClick = (e)=> {
        console.log(e.target.value);
        setGraph(e.target.value);
        setPage(2);
    }

    return (
        <div>
            {graphs.sort((a,b)=> b.date - a.date).map((graph)=> (
                <button value={graph.id} onClick={handlerClick}>{graph.name}</button>
            ))}
        </div>
    )
}

const OptionsColumnIndex : React.FC = ({columns} : {columns: Array<string>})=> {
    console.log("me renderizo");
    return(
         <div id='uploadCSVIndexColumn'>
                <select name="columns" id="columns-select">
                    ¿Qué columnas es el indice?
                    {columns.map((col, index)=> (
                        <option key={index} value={col}>{col}</option>
                    ))}
                </select>
            </div>
    )
}

const UploadCSV : React.FC = ()=> {

            const [columns, setColumns] = useState([]);
            const [isColumnIndex, setIsColumnIndex] = useState(false);
            const [csvFile, setCsvFile] = useState(null);
            const [columnsSelected, setColumnsSelected] = useState("");
            const reader = new FileReader();
            const [nameAnalysis, setNameAnalysis] = useState("");
        
            const handlerFile = (e)=> {
                const file = e.target.files[0];
                reader.onload = (event)=> {
                    const csvData = event.target.result;
                    setCsvFile(file);
                    const headers = csvData.split('\n')[0].split(',');
                    setColumns(headers);
                    setColumnsSelected(headers[0]);
                }
                reader.readAsText(file);
            }
        
        const handlerSubmit = (e)=> {
            const sendRequest = async () => {
            const formData = new FormData();
            if(csvFile) formData.append("file", csvFile);           // el archivo CSV
            formData.append("user_id", "1");         // requerido por Django
            formData.append("text_column", columnsSelected);
            formData.append("name", nameAnalysis);
            if(isColumnIndex) formData.append("id_column", isColumnIndex.toString());
                
            const response = await fetch(ROUTES.upload_csv, {
              method: "POST",
              body: formData,
            });
        
            const data = await response.json();
            console.log(data);
          };
      
          sendRequest();
        };

    console.log(isColumnIndex);
    return(

        <dialog id='uploadCSV'>
            <div>
                <label htmlFor="csv-upload">Subir CSV</label>
                <input id="csv-upload" type="file" accept=".csv" onChange={handlerFile} />
            </div>
            <div>
                <label htmlFor="name-analysis">Nombre del análisis</label>
                <input id="name-analysis" type="text" value={nameAnalysis} onChange={(e)=> setNameAnalysis(e.target.value)}/>
            </div>
            <div>
                <select name="columns" id="columns-select" onChange={(e)=> setColumnsSelected(e.target.value)}>
                    ¿Qué columnas quieres analizar?
                    {columns.map((col, index)=> (
                        <option key={index} value={col}>{col}</option>
                    ))}
                </select>
            </div>
            <label htmlFor="column-index-checkbox">¿Usar columna como índice?</label>
            <input id="column-index-checkbox" type="checkbox" onChange={()=> setIsColumnIndex(!isColumnIndex)}/>
            {isColumnIndex && (<OptionsColumnIndex columns={columns}/> )}
            <button onClick={handlerSubmit}>Enviar </button>
            <button onClick={()=> document.getElementById('uploadCSV')?.close()}>Cancelar</button>
        </dialog>
    )
}

export const ListGraphs : React.FC= ({user_id= 1, setPage, setGraph} : any)=> {
    const [graphs, setGraphs] = useState([]);
    useEffect(()=> {
        const getGraphs = async ()=> {
            const response = await fetch(`${ROUTES.get_graphs}?user_id=${user_id}`);
            const data = await response.json();
            setGraphs(data);
            console.log(data);
        }
        getGraphs();
    },[]);

    return (

        <div>
            <button onClick={()=> document.getElementById('uploadCSV')?.showModal()}>Nuevo Análisis</button>
            <OptionGraphs graphs={graphs} setGraph={setGraph} setPage={setPage}/>
            <UploadCSV />
        </div>
    )
}