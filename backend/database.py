import os
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")

if not MONGO_URI:
    raise ValueError("No MONGO_URI environment variable found in .env")

# Initialize MongoDB client
# Setting serverSelectionTimeoutMS to quickly fail if the server can't be reached
client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)

try:
    # Trigger a server connection test
    client.admin.command('ping')
    print("Pinged your deployment. You successfully connected to MongoDB!")
except Exception as e:
    print(f"Error connecting to MongoDB: {e}")

# Database instance
# Using a default name 'Cluster1' if not specified in URI 
db = client.get_database("Cluster1")
