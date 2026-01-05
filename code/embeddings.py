#https://github.com/openai/tiktoken/blob/main/README.md




#import tiktoken
#enc = tiktoken.get_encoding("cl100k_base")
#assert enc.decode(enc.encode("hello world")) == "hello world"

# To get the tokeniser corresponding to a specific model in the OpenAI API:
#enc = tiktoken.encoding_for_model("gpt-4")

from openai import OpenAI
import numpy as np
import pandas as pd
import csv

client = OpenAI()


def get_embedding(text, model="text-embedding-ada-002"):
  text = text.replace("\n", " ")
  return client.embeddings.create(input=[text], model=model).data[0].embedding




###################

# Path to the input and output files
#input_file_path = '../data/2024.04.20.Cuidados.csv'
input_file_path = '../data/Filtered_Cuidados_manually.csv'

output_file_path = '../data/20240509embeddings.csv'
folio_file_path = '../data/20240509folio.csv'




# Assuming 'infile' is already defined and opened file
with open(input_file_path, 'r') as infile:
    reader = csv.DictReader(infile)
    line_count = sum(1 for row in reader)  # Iterates through the reader and counts each row

print("Number of lines:", line_count)

# Initialize an empty list to collect arrays
arrays = []
folio = []

# Open the input CSV file
with open(input_file_path, mode='r', encoding='utf-8') as infile:
  reader = csv.DictReader(infile)

  # Prepare to write to the output CSV file
  k = 0
  # Iterate over each row in the input CSV file
  for row in reader:
    # Check if the target column is not null
    if row['cuidados']:
      phrase_spanish = row['cuidados']
      res = get_embedding(phrase_spanish, model="text-embedding-ada-002")
      arrays.append(res)
      folio.append(int(row['folio']))


      print(k,'/', line_count)

    k+=1

# Stack all arrays vertically
all_arrays = np.vstack(arrays)
# Save the stacked array to a CSV file

# Convert list of arrays into a DataFrame
df = pd.DataFrame(all_arrays)
# Save the DataFrame to a CSV file
df.to_csv(output_file_path, index=False)

# Convert list of arrays into a DataFrame
df = pd.DataFrame(folio)
# Save the DataFrame to a CSV file
df.to_csv(folio_file_path, index=False)





print(f"Data filtered and written to {output_file_path}")







