import { useState, useEffect } from 'react'
import axios from 'axios'

function DataViewerModal({ node, treeId, userId, onClose }) {
    const [data, setData] = useState([])
    const [page, setPage] = useState(0)
    const [totalRows, setTotalRows] = useState(0)
    const [loading, setLoading] = useState(false)

    const fetchData = async (pageNum) => {
        setLoading(true)
        try {
            const response = await axios.get('/get_node_data/', {
                params: {
                    id_usuario: userId,
                    id_arbol: treeId,
                    id_node: node.id,
                    page: pageNum
                }
            })
            setData(response.data.data)
            setTotalRows(response.data.total_rows)
            setPage(pageNum)
        } catch (error) {
            console.error("Error fetching node data", error)
            alert("Error fetching data")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData(0)
    }, [node])

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
            <div className="bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl max-w-2xl w-full p-6 flex flex-col max-h-[80vh]">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-white">Data for Node {node.id}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl">&times;</button>
                </div>

                <div className="flex-1 overflow-auto bg-slate-900 p-4 rounded-lg border border-slate-700 mb-4 custom-scrollbar">
                    {loading ? (
                        <div className="text-center py-10 text-slate-400">Loading data...</div>
                    ) : data.length === 0 ? (
                        <div className="text-center py-10 text-slate-500">No data available</div>
                    ) : (
                        <ul className="space-y-2">
                            {data.map((item, index) => (
                                <li key={index} className="text-slate-300 text-sm border-b border-slate-800 pb-2 last:border-0">
                                    {item}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="flex justify-between items-center text-sm text-slate-400">
                    <span>Total rows: {totalRows}</span>
                    <div className="flex gap-2">
                        <button
                            disabled={page === 0 || loading}
                            onClick={() => fetchData(page - 1)}
                            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-50"
                        >
                            Previous
                        </button>
                        <span className="py-1 px-2">Page {page + 1}</span>
                        <button
                            disabled={(page + 1) * 10 >= totalRows || loading}
                            onClick={() => fetchData(page + 1)}
                            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-50"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default DataViewerModal
