import numpy as np
from sklearn.preprocessing import normalize
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
import matplotlib.pyplot as plt


class Cluster:

    # K-Means (en alta dimensión)
    def generation_n_cluster(self, n, embedding : np.ndarray) -> np.ndarray:
        """Ya es necesario pasar los embeddings como un ndarray de numpy"""
        kmeans = KMeans(n_clusters=n, random_state=42, init='k-means++')
        X_norm = normalize(embedding)
        #regresa un array correlacionado con la posicion del embbedign
        return kmeans.fit_predict(X_norm)
