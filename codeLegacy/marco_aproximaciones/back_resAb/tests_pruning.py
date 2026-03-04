from django.test import TestCase, RequestFactory
from unittest.mock import MagicMock, patch
from back_resAb.views import prune_tree, name_parquet_file, BUCKET
from back_resAb.models import Arbol, Usuario
import pandas as pd
import json

class PruningTestCase(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.user = Usuario.objects.create(usuario="test_user", password="123")
        self.arbol = Arbol.objects.create(
            archivo_parquet="dummy_path",
            id_usuario=self.user,
            text_column="text",
            id_column_data="id_data",
            tree_structure={
                0: [1],
                1: [2],  # 0 -> 1 -> 2
                2: []
            } # Estructura simple 0 -> 1 -> 2
        )
        
    @patch('back_resAb.views.fs')
    @patch('back_resAb.views.pd.read_parquet')
    @patch('back_resAb.views.save_or_update_tree_s3')
    def test_prune_middle_node(self, mock_save, mock_read_parquet, mock_fs):
        """
        Test pruning node 1.
        Expectation:
        - Node 0 (parent) receives data from 1 and 2.
        - Node 1 and 2 are removed from S3.
        - Tree structure updates: 0's children remove 1. 1 and 2 removed from keys.
        """
        
        # Setup mocks
        mock_fs.exists.return_value = True
        
        # Mock dataframes
        df_0 = pd.DataFrame({'id_node': [0], 'id_data': ['root'], 'history_nodes': [[0]]})
        df_1 = pd.DataFrame({'id_node': [1], 'id_data': ['child'], 'history_nodes': [[0, 1]]})
        df_2 = pd.DataFrame({'id_node': [2], 'id_data': ['grandchild'], 'history_nodes': [[0, 1, 2]]})
        
        # Configure read_parquet side_effect to return appropriate DF based on path
        def read_parquet_side_effect(path, filesystem, engine):
            if str(0) in path: return df_0.copy()
            if str(1) in path: return df_1.copy()
            if str(2) in path: return df_2.copy()
            return pd.DataFrame()
            
        mock_read_parquet.side_effect = read_parquet_side_effect
        
        # Request
        request = self.factory.get('/prune_tree/', {'id_arbol': self.arbol.id, 'id_node': 1})
        
        # Execution
        response = prune_tree(request)
        
        # Assertions
        self.assertEqual(response.status_code, 200)
        
        # Check Arbol structure
        self.arbol.refresh_from_db()
        # Node 1 should be gone from Node 0's children
        self.assertNotIn(1, self.arbol.tree_structure[0])
        # Node 1 and 2 should keys should be gone
        self.assertNotIn(1, self.arbol.tree_structure)
        self.assertNotIn(2, self.arbol.tree_structure)
        
        # Check Save called on Parent (0)
        self.assertTrue(mock_save.called)
        args, _ = mock_save.call_args
        path_arg, df_arg = args
        self.assertIn(f"/{0}.parquet", path_arg)
        
        # Verify merged dataframe content
        # Should contain logs for root, child, grandchild (3 rows)
        self.assertEqual(len(df_arg), 3)
        # Check that id_node is now 0 for everyone
        self.assertTrue((df_arg['id_node'] == 0).all())
        
        # Check deletions
        # Should have called remove for 1 and 2
        # mock_fs.rm is called
        self.assertTrue(mock_fs.rm.called)
        # Collect all calls to rm
        rm_calls = [c[0][0] for c in mock_fs.rm.call_args_list]
        found_1 = any(f"/{1}.parquet" in path for path in rm_calls)
        found_2 = any(f"/{2}.parquet" in path for path in rm_calls)
        self.assertTrue(found_1)
        self.assertTrue(found_2)

    @patch('back_resAb.views.fs')
    def test_prune_nonexistent_node(self, mock_fs):
        request = self.factory.get('/prune_tree/', {'id_arbol': self.arbol.id, 'id_node': 99})
        response = prune_tree(request)
        self.assertEqual(response.status_code, 404)
        
    @patch('back_resAb.views.fs')
    def test_prune_root_node_fail(self, mock_fs):
        # Trying to prune 0, which has no parent in structure {0: [1]}
        request = self.factory.get('/prune_tree/', {'id_arbol': self.arbol.id, 'id_node': 0})
        response = prune_tree(request)
        # Should fail as it cannot find parent
        self.assertEqual(response.status_code, 404)
