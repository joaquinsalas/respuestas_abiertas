import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/login': 'http://localhost:8000',
      '/sample': 'http://localhost:8000',
      '/opc_cut': 'http://localhost:8000',
      '/get_similarity': 'http://localhost:8000',
      '/new_category': 'http://localhost:8000',
      '/delete_tmp': 'http://localhost:8000',
      '/get_categorized_data': 'http://localhost:8000',
      '/get_full_graph': 'http://localhost:8000',
      '/add_edge': 'http://localhost:8000',
      '/get_user_graphs': 'http://localhost:8000',
      '/new_analysis': 'http://localhost:8000',
      '/delete_node': 'http://localhost:8000',
      '/delete_edge': 'http://localhost:8000',
      '/delete_graph': 'http://localhost:8000',
      '/create_relationship': 'http://localhost:8000',
      '/get_relations': 'http://localhost:8000',
      '/get_progress': 'http://localhost:8000',
      '/update_node_position': 'http://localhost:8000',
    },
  },
})
