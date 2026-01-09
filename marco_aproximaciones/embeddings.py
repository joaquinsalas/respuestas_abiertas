from openai import OpenAI
from dotenv import load_dotenv
import pandas as pd
import os

load_dotenv() #carga variables de entorno definidas en el archivo .env

client = OpenAI(api_key=os.getenv('api_key_openai'))

#cada vez que se ejecuta esta funcion cuesta dinero, ejecutarlo con discreción
#con un texto funcinona
def get_embedding_single_text(text, model="text-embedding-ada-002"):
    return client.embeddings.create(input=text, model=model).data[0].embedding

#mandar muchos textos de golpe, igual cuesta dinero pero solo hace una peticion
#es más rapido con mucho texto
def get_embeddings_batch(texts, model="text-embedding-ada-002"):
    response = client.embeddings.create(
        model=model,
        input=texts
    )
    #regresa una lista de embeddings
    return [item.embedding for item in response.data]


#funcion que asigna ID de manera automática a cada vector o utiliza uno ya presente en el csv
def get_embeddings_main(dataframe_csv : pd.DataFrame, text_column, ID_column = None):
    if text_column not in dataframe_csv.columns:
        raise KeyError(f"Columna {text_column} no encontrada")
    list_text = dataframe_csv[text_column].tolist()
    if not list_text:
        raise ValueError("Lista vacia")
    try:
        dataframe_output = pd.DataFrame(get_embeddings_batch(list_text))
    except:
        raise RuntimeError("Error al generar los embeddings")
    if ID_column:
        dataframe_output[ID_column] = dataframe_csv[ID_column].values
    else:
        dataframe_output["ID"] =  range(len(list_text))
    return dataframe_output

get_embeddings_main(pd.read_csv("entrada.csv"), "texto").to_csv("prueba2.csv", index=False)