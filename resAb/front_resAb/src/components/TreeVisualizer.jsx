import { useState, useCallback, useEffect } from 'react'
import ReactFlow, {
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    MarkerType
} from 'reactflow'
import 'reactflow/dist/style.css'
import dagre from 'dagre'
import axios from 'axios'

import NodeOptionsModal from './NodeOptionsModal'
import DataViewerModal from './DataViewerModal'

const nodeWidth = 172
const nodeHeight = 36

const getLayoutedElements = (nodes, edges, direction = 'TB') => {
    const dagreGraph = new dagre.graphlib.Graph()
    dagreGraph.setDefaultEdgeLabel(() => ({}))

    dagreGraph.setGraph({ rankdir: direction })

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight })
    })

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target)
    })

    dagre.layout(dagreGraph)

    nodes.forEach((node) => {
        const nodeWithPosition = dagreGraph.node(node.id)
        node.targetPosition = 'top'
        node.sourcePosition = 'bottom'
        // Shift slightly to center
        node.position = {
            x: nodeWithPosition.x - nodeWidth / 2,
            y: nodeWithPosition.y - nodeHeight / 2,
        }
        return node
    })

    return { nodes, edges }
}

function TreeVisualizer({ treeId, userId, onClose, onRefresh }) {
    const [nodes, setNodes, onNodesChange] = useNodesState([])
    const [edges, setEdges, onEdgesChange] = useEdgesState([])
    const [selectedNode, setSelectedNode] = useState(null)
    const [menuPosition, setMenuPosition] = useState(null)
    const [viewDataNode, setViewDataNode] = useState(null)
    const [loading, setLoading] = useState(false)

    const buildGraph = (structure) => {
        if (!structure) return { nodes: [], edges: [] }

        let initNodes = []
        let initEdges = []

        // Structure is { parentId: [childId, childId...] }
        // We need to identify leaf nodes later
        const allParents = new Set(Object.keys(structure).map(k => parseInt(k)))

        // Helper to add node
        const addNode = (id) => {
            // Check if node exists already
            if (initNodes.find(n => n.id === String(id))) return

            // Determine if leaf. 
            // It is a leaf if:
            // 1. It is NOT in structure keys (undefined children)
            // 2. OR it IS in structure keys but has empty children array
            const children = structure[String(id)]
            const isLeaf = !children || children.length === 0

            initNodes.push({
                id: String(id),
                data: { label: `Node ${id}` },
                position: { x: 0, y: 0 }, // layout will fix this
                style: {
                    background: isLeaf ? '#10b981' : '#1e293b', // Green for leaves, Dark for internal
                    color: '#fff',
                    border: '1px solid #475569',
                    borderRadius: '8px',
                    width: nodeWidth,
                    fontSize: '12px',
                    fontWeight: isLeaf ? 'bold' : 'normal'
                },
                type: 'default'
            })
        }

        // Add Root (assuming 0 is root or present)
        // Actually iterate over all keys and values
        Object.keys(structure).forEach(parent => {
            addNode(parent)
            structure[parent].forEach(child => {
                addNode(child)
                initEdges.push({
                    id: `e${parent}-${child}`,
                    source: String(parent),
                    target: String(child),
                    type: 'smoothstep',
                    animated: true,
                    markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
                    style: { stroke: '#94a3b8' }
                })
            })
        })

        return getLayoutedElements(initNodes, initEdges)
    }

    const fetchTreeStructure = async () => {
        setLoading(true)
        try {
            // We might need to refetch if structure changed
            const response = await axios.get('/get_tree_structure/', {
                params: { id_usuario: userId, id_arbol: treeId }
            })
            const { nodes: layoutedNodes, edges: layoutedEdges } = buildGraph(response.data)
            setNodes(layoutedNodes)
            setEdges(layoutedEdges)
        } catch (error) {
            console.error("Error fetching structure", error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchTreeStructure()
    }, [treeId, userId])

    const onNodeClick = useCallback((event, node) => {
        // Only show menu for leaf nodes? Requirement says "nodos hojas se pintaran de un color, cuando el usuario de click en un nodo hoja mostrara 2 opciones"
        // I will check color or some flag. We styled leaves with #10b981
        const isLeaf = node.style.background === '#10b981'

        // Adjust: Logic says "show 2 options" for leaves. 
        // Maybe we allow for all? But requirements specific about leaves.
        // I'll stick to leaves for the menu as per prompt.
        if (isLeaf) {
            setSelectedNode(node)
            // Position menu near the click
            setMenuPosition({ x: event.clientX, y: event.clientY })
        } else {
            setSelectedNode(null)
            setMenuPosition(null)
        }
    }, [])

    const handleBranch = async () => {
        if (!selectedNode) return
        if (!confirm(`Create branches for Node ${selectedNode.id}?`)) return

        setLoading(true)
        try {
            await axios.get('/new_branches/', {
                params: { id_arbol: treeId, id_node: selectedNode.id }
            })
            alert("Branches created!")
            setMenuPosition(null)
            // Refresh tree
            fetchTreeStructure()
            // Also refresh list in parent if needed, but visually here is most important
        } catch (error) {
            console.error(error)
            alert("Error creating branches: " + (error.response?.data || error.message))
        } finally {
            setLoading(false)
        }
    }

    const handlePrune = async () => {
        if (!selectedNode) return
        if (!confirm(`Prune Node ${selectedNode.id}?`)) return

        setLoading(true)
        try {
            await axios.get('/prune_tree/', {
                params: { id_arbol: treeId, id_node: selectedNode.id }
            })
            alert("Pruning successful!")
            setMenuPosition(null)
            fetchTreeStructure()
        } catch (error) {
            console.error(error)
            alert("Error pruning: " + (error.response?.data || error.message))
        } finally {
            setLoading(false)
        }
    }

    const handleViewData = () => {
        if (selectedNode) {
            setViewDataNode(selectedNode)
            setMenuPosition(null)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-[90vw] h-[90vh] flex flex-col relative overflow-hidden">

                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-850">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <span className="text-purple-400">🌳</span> Tree #{treeId} Visualization
                    </h2>
                    <button
                        onClick={onClose}
                        className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition font-medium"
                    >
                        Close Visualizer
                    </button>
                </div>

                {/* Graph Area */}
                <div className="flex-1 w-full h-full relative bg-slate-950">
                    {loading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
                            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
                        </div>
                    )}

                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onNodeClick={onNodeClick}
                        onPaneClick={() => setMenuPosition(null)}
                        fitView
                        className="bg-slate-950"
                    >
                        <Controls className="bg-slate-800 border-slate-700 fill-white text-white" />
                        <Background color="#334155" gap={16} />
                    </ReactFlow>

                    {/* Menu */}
                    {menuPosition && selectedNode && (
                        <NodeOptionsModal
                            position={menuPosition}
                            onClose={() => setMenuPosition(null)}
                            onBranch={handleBranch}
                            onViewData={handleViewData}
                            onPrune={handlePrune}
                        />
                    )}
                </div>

                {/* Data Modal */}
                {viewDataNode && (
                    <DataViewerModal
                        node={viewDataNode}
                        treeId={treeId}
                        userId={userId}
                        onClose={() => setViewDataNode(null)}
                    />
                )}
            </div>
        </div>
    )
}

export default TreeVisualizer
