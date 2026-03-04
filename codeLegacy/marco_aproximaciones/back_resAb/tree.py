import pandas as pd

class Tree:
    """
        Encapsula la lógica de las podas y la creación de las ramas, se le debe proporcionar los datos ya obtenidos del parquet
    """
    def __init__(self, main_dataframe: pd.DataFrame, column_data: str, id_node: int = 0, prune: bool = False):
        self.id_node = id_node
        self.tree_structure = {id_node: []}
        n = len(main_dataframe)
        self.data = pd.DataFrame({
            "id_node": [id_node] * n,
            "id_data": range(n) if prune else main_dataframe[column_data].values,
            "history_nodes": [[id_node] for _ in range(n)] #esto se tendra que modificar 
        })
    
    def tree_new_nodes(self, parent: int, children: list[int]):
        """
        para este punto los nodos ya deben tener su ID asignado
        modifica la estructura del arbol (lista de adyacencia) agregando nuevos nodos hijos a un nodo padre existente"""
        if parent not in self.tree_structure:
            raise KeyError(f"Nodo padre {parent} no existe")
        self.tree_structure[parent].extend(children)
    
    def get_parent(self, child) -> int:
        return min(self.tree_structure[child])

    def get_all_childrens(self, parent: int) -> list[int]:
        """
        Esta funcion la tengo que mejorar
        
        Obtiene todos los nodos conectados a parent (descendientes)
        evitando ciclos en grafo bidireccional
        """
        if parent not in self.tree_structure:
            raise KeyError(f"Nodo {parent} no existe en el árbol")

        visitados = set()  # Rastrear nodos ya visitados
        resultado = []
        
        def _recorrer(nodo):
            """Función auxiliar recursiva"""
            if nodo in visitados:
                return  #  Evitar ciclos

            visitados.add(nodo)
            resultado.append(nodo)
            # Recorrer vecinos
            
            for vecino in self.tree_structure[nodo]:
                if vecino > nodo:
                    _recorrer(vecino)

        _recorrer(parent)
        return resultado

    def cut_children(self, target: int):
        """
            Elimina solo un nodo de la lista de adyacencia
        """
        parent = self.get_parent(target)
        try:
            print(self.tree_structure.get(parent))
            self.tree_structure.get(parent).remove(target)
        except KeyError:
            pass
        self.tree_structure.pop(target)


    def correlation_labelgroup_id_node(
        self,
        labels: list[int],
        node_ids: list[int]
    ) -> dict[int, int]:
        if len(labels) != len(node_ids):
            raise ValueError("Labels y nodos deben tener la misma longitud")
        return dict(zip(labels, node_ids))
    
    def new_branches(self, parent: int, labels: list[int], ids_data: list[int]):
        """
            Recibe el nodo padre, las etiquetas de los nuevos grupos y una lista de los ids_data correlacionados con las etiquetas
        """
        # VALIDACIONES AÑADIDAS
        if parent not in self.tree_structure:
            raise KeyError(f"Nodo padre {parent} no existe")
        
        if len(labels) != len(ids_data):
            raise ValueError("labels e ids_data deben tener la misma longitud")
        
        # Crear nuevos nodos
        new_groups = sorted(set(labels))
        new_nodes = list(range(self.id_node + 1, self.id_node + 1 + len(new_groups)))
        
        # Actualizar estructura del árbol
        self.tree_new_nodes(parent, new_nodes)
        self.id_node = new_nodes[-1]
        
        # Mapeo de labels a nodos
        mapping = self.correlation_labelgroup_id_node(new_groups, new_nodes)
        
        # CORRECCIÓN: Actualizar TODOS los registros con cada id_data
        for i in range(len(labels)):
            data_id = ids_data[i]
            new_node = mapping[labels[i]]
            
            # Encontrar TODOS los índices que coinciden
            mask = self.data["id_data"] == data_id
            
            if not mask.any():
                raise ValueError(f"id_data {data_id} no existe en self.data")
            
            # Actualizar TODOS los registros que coinciden 
            # esto lo hizo una IA no tiene sentido pero despues lo elimino, tengo que revisarlo con mas detalle no es necesario el bucle
            for idx in self.data.index[mask]:
                parent_history = self.data.at[idx, "history_nodes"]
                new_history = parent_history + [new_node]  # type: ignore # Más eficiente
                
                self.data.at[idx, "id_node"] = new_node
                self.data.at[idx, "history_nodes"] = new_history
        
        # Inicializar nodos hoja
        for node in new_nodes:
            self.tree_structure[node] = [parent]
        