import { useRef, useEffect } from 'react'

function NodeOptionsModal({ position, onClose, onBranch, onViewData, onPrune }) {
    const ref = useRef(null)

    useEffect(() => {
        function handleClickOutside(event) {
            if (ref.current && !ref.current.contains(event.target)) {
                onClose()
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [onClose])

    return (
        <div
            className="absolute z-50 transform -translate-x-1/2 -translate-y-full mb-2"
            style={{ left: position.x, top: position.y }}
            ref={ref}
        >
            <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-xl overflow-hidden flex flex-col min-w-[150px]">
                <button
                    onClick={onBranch}
                    className="px-4 py-3 text-left text-sm text-white hover:bg-purple-600 transition border-b border-slate-700"
                >
                    🔀 Bifurcar (New Branch)
                </button>
                <button
                    onClick={onViewData}
                    className="px-4 py-3 text-left text-sm text-white hover:bg-blue-600 transition border-b border-slate-700"
                >
                    📄 Ver Datos (View Data)
                </button>
                <button
                    onClick={onPrune}
                    className="px-4 py-3 text-left text-sm text-red-300 hover:bg-red-900/50 hover:text-red-200 transition"
                >
                    ✂️ Podar (Prune)
                </button>
            </div>
            {/* Arrow */}
            <div className="w-3 h-3 bg-slate-800 border-r border-b border-slate-600 transform rotate-45 absolute bottom-[-6px] left-1/2 -translate-x-1/2"></div>
        </div>
    )
}

export default NodeOptionsModal
