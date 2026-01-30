import { useState, useEffect } from 'react'
import axios from 'axios'
import TreeVisualizer from './components/TreeVisualizer'

function App() {
  const [userId, setUserId] = useState('')
  const [trees, setTrees] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Visualizer State
  const [selectedTree, setSelectedTree] = useState(null)

  // Form states
  const [file, setFile] = useState(null)
  const [textColumn, setTextColumn] = useState('text')
  const [idColumn, setIdColumn] = useState('')

  const fetchTrees = async () => {
    if (!userId) return
    setLoading(true)
    try {
      const response = await axios.get(`/get_trees/?id_usuario=${userId}`)
      setTrees(response.data)
    } catch (error) {
      console.error("Error fetching trees", error)
      alert("Error fetching trees. Check User ID.")
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!file || !userId) return alert("Select file and user")

    const formData = new FormData()
    formData.append('csv', file)
    formData.append('id_usuario', userId)
    formData.append('text', textColumn)
    if (idColumn) formData.append('id_column', idColumn)

    setUploading(true)
    try {
      await axios.post('/new_tree/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      alert("Tree created successfully!")
      fetchTrees()
    } catch (error) {
      console.error(error)
      alert("Error creating tree")
    } finally {
      setUploading(false)
    }
  }

  // Modified to just select the tree, not auto-prune
  const handleSelectTree = (tree) => {
    setSelectedTree(tree)
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans selection:bg-purple-500 selection:text-white pb-10">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <header className="mb-10 text-center">
          <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600 mb-4">
            ResAb Analyzer
          </h1>
          <p className="text-slate-400 text-lg">Manage and Analyze User Trees</p>
        </header>

        {/* User Selection */}
        <section className="bg-slate-800/50 backdrop-blur-md rounded-2xl p-6 mb-8 border border-slate-700 shadow-xl">
          <div className="flex items-center gap-4 max-w-md mx-auto">
            <label className="text-lg font-medium whitespace-nowrap">User ID:</label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="e.g. 1"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 outline-none transition"
            />
            <button
              onClick={fetchTrees}
              className="bg-purple-600 hover:bg-purple-500 active:bg-purple-700 px-6 py-2 rounded-lg font-bold transition shadow-lg shadow-purple-900/50"
            >
              Load
            </button>
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Create Tree */}
          <section className="bg-slate-800/50 backdrop-blur-md rounded-2xl p-6 border border-slate-700 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/10 rounded-full blur-3xl -z-10 group-hover:bg-purple-600/20 transition duration-700"></div>
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <span className="bg-purple-500/20 text-purple-300 p-2 rounded-lg">🌱</span> Create New Tree
            </h2>
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">CSV File</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setFile(e.target.files[0])}
                  className="w-full text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-500 cursor-pointer"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Text Column</label>
                  <input
                    type="text"
                    value={textColumn}
                    onChange={(e) => setTextColumn(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">ID Column (Opt)</label>
                  <input
                    type="text"
                    value={idColumn}
                    onChange={(e) => setIdColumn(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 outline-none focus:border-purple-500"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={uploading}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 py-3 rounded-xl font-bold text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02]"
              >
                {uploading ? 'Processing...' : 'Create Tree from CSV'}
              </button>
            </form>
          </section>

          {/* List Trees */}
          <section className="bg-slate-800/50 backdrop-blur-md rounded-2xl p-6 border border-slate-700 shadow-xl relative overflow-hidden">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <span className="bg-blue-500/20 text-blue-300 p-2 rounded-lg">🌳</span> Your Trees
            </h2>

            {loading ? (
              <div className="flex justify-center py-10">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-purple-500"></div>
              </div>
            ) : trees.length === 0 ? (
              <div className="text-center py-10 text-slate-500">
                <p>No trees found. Select a user or create one.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {trees.map(tree => (
                  <div
                    key={tree.id}
                    onClick={() => handleSelectTree(tree)}
                    className="bg-slate-900 p-4 rounded-xl border border-slate-700 hover:border-purple-500 cursor-pointer transition-all hover:bg-slate-800 group"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-lg">Tree #{tree.id}</span>
                      <span className="text-xs bg-slate-700 px-2 py-1 rounded text-slate-300">
                        {tree.text_column}
                      </span>
                    </div>
                    <div className="text-sm text-slate-400 font-mono overflow-hidden text-ellipsis whitespace-nowrap">
                      {JSON.stringify(tree.tree_structure)}
                    </div>
                    <div className="mt-2 text-xs text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity uppercase font-bold tracking-wide">
                      Click to Visualize 📊
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Tree Visualizer Modal */}
        {selectedTree && (
          <TreeVisualizer
            treeId={selectedTree.id}
            userId={userId}
            onClose={() => setSelectedTree(null)}
          />
        )}
      </div>
    </div>
  )
}

export default App
