"""
Project: Exclusive Drop API
Developer: Ilya Zeldner
Stack: FastAPI + Beanie (MongoDB ODM) + Pydantic v2 + Loguru
Environment: Python 3.11+ 
"""

import os
import time
import sys
from typing import Any, Dict, List
from contextlib import asynccontextmanager

# Load environment variables FIRST before anything else initializes
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field # Pydantic v2 style field definitions with built-in validation and metadata support
from pymongo import AsyncMongoClient  # Modern native async driver for MongoDB, replacing Motor for better performance and reliability with Beanie ODM
from beanie import Document, init_beanie  # MongoDB ODM for Python
from loguru import logger  # Python logging made easy


# STRUCTURAL LOGGING INITIALIZATION (LOGURU)

# Remove the default logger to prevent duplicate terminal outputs
logger.remove()

# 1st Handler: Colorized human-readable terminal output for clean local development
logger.add(
    sys.stdout,
    format="<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | <level>{level: <8}</level> | <cyan>{message}</cyan>",
    colorize=True,
    level="INFO"
) # Note: We set the level to INFO to avoid verbose debug logs in production, but you can adjust this as needed.

# 2nd Handler: Automated rotating JSON-serialized file stream for production log aggregation
logger.add(
    "./server.log",
    rotation="10 MB", # Rotate the log file after it reaches 10 MB in size
    retention="10 days",
    serialize=True,
    level="INFO"
) # Note: We set the level to INFO to avoid verbose debug logs in production, but we can adjust this as needed.

# Loguru's structured logging allows us to easily include contextual information (like client IPs, user agents, and custom event tags) in our log messages, which is crucial for monitoring and debugging high-traffic applications like this exclusive drop API.

# DATABASE CONFIGURATION & ODM MODELS (BEANIE)
MAX_SPOTS = int(os.getenv("MAX_SPOTS", "5"))
MONGO_URI = os.getenv("MONGO_URI", "")

class Order(Document):
    """
    Database schema definition for an Order.
    Enforces absolute uniqueness on the email field at the database level.
    """
    email: EmailStr = Field(unique=True)
    created_at: float = Field(default_factory=time.time)

    class Settings:
        name = "orders"  # The exact collection name stored in MongoDB

@asynccontextmanager # FastAPI's lifespan context manager for clean startup and shutdown handling
async def lifespan(app: FastAPI):
    """
    Lifespan context manager. This runs exactly once when the server boots up,
    and handles tearing down connections when the server stops.
    """
    if not MONGO_URI:
        logger.critical("CRITICAL: MONGO_URI is missing from environment variables!")
        raise RuntimeError("Missing MONGO_URI configurations.")
    
    try:
        # Initialize the modern native PyMongo Async Client
        client = AsyncMongoClient(MONGO_URI)
        
        # Attach the client globally to the FastAPI app state for easy access in routes
        app.state.db_client = client 
        
        # Initialize Beanie ODM
        # Note: init_beanie() is a local memory operation in modern PyMongo, so NO 'await' is used here.
        await init_beanie(
            database=client.get_default_database(),
            document_models=[Order]
        ) # Note: Beanie will automatically create the "orders" collection if it doesn't exist, but we need to ensure it exists before we start handling requests.
        
        # Force MongoDB to physically create the collection on Atlas.
        # MongoDB cannot create collections natively inside a transaction block. 
        # By inserting and deleting a dummy record on boot, we ensure the table exists.
        dummy = Order(email="system_init_bypass@example.com")
        await dummy.insert()
        await dummy.delete()
        
        logger.info("DB STATUS: Connected to MongoDB Atlas via Beanie (Native Async)")
    except Exception as e:
        logger.error(f"DB CONNECTION ERROR: {str(e)}")
        raise e
        
    yield  # The server handles requests while paused here
    
    # Close connection pool smoothly when shutting down the process
    await client.close()
    logger.info("DB STATUS: Database connections closed cleanly.")


# APPLICATION INSTANTIATION & APP MIDDLEWARES

app = FastAPI(lifespan=lifespan, title="Exclusive Drop API") # We added a title here for better documentation generation in FastAPI's automatic docs (Swagger UI)

# Global CORS configurations allowing any frontend to communicate with the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def process_logging_and_cache_layers(request: Request, call_next):
    """
    Global interceptor middleware. Runs on every single incoming HTTP request.
    Monitors timing metrics, extracts client IPs, and blocks browser caching.
    """
    start_time = time.time()
    
    # Extract client metadata (handling Proxies / Load Balancers)
    user_agent = request.headers.get("user-agent", "Unknown Device")
    client_ip = request.headers.get("x-forwarded-for")
    if not client_ip and request.client:
        client_ip = request.client.host
    client_ip = client_ip or "Unknown IP"

    # Process the actual route
    response = await call_next(request)
    
    # Strictly disable browser caching so users always see accurate "Spots Left"
    response.headers["Cache-Control"] = "no-store"
    
    duration = f"{int((time.time() - start_time) * 1000)}ms"
    
    logger.info(
        f"HTTP Request Received | Method: {request.method} | URL: {request.url.path} "
        f"| Status: {response.status_code} | Duration: {duration} | IP: {client_ip} | UA: {user_agent}"
    )
    return response

# REQUEST VALIDATION SCHEMAS (PYDANTIC V2)

class BuySchema(BaseModel):
    """
    Validates incoming JSON payloads.
    EmailStr automatically applies strict regex validation to ensure proper email formatting.
    """
    email: EmailStr

# CORE ROUTING SYSTEM

@app.get("/api/status") # We added a GET endpoint here to allow clients to fetch the current campaign status (remaining spots and sold out state) without needing to attempt a purchase, which is crucial for user experience during high-traffic drops.
async def get_campaign_status() -> Dict[str, Any]:
    """
    Calculates active stock levels and determines if the campaign is sold out.
    """
    try:
        count = await Order.count()
        return {
            "remaining": max(0, MAX_SPOTS - count),
            "soldOut": count >= MAX_SPOTS
        }
    except Exception as e:
        logger.error(f"Failed to sync campaign status: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to sync campaign status"
        )

@app.get("/api/orders", response_model=List[Order]) # We added a GET endpoint here to allow admins to retrieve all historical purchase entries sorted chronologically (newest first), which is essential for monitoring and analyzing the campaign's performance.
async def get_all_orders():
    """
    Admin View: Retrieves historical purchase entries sorted chronologically (newest first).
    """
    try:
        return await Order.find_all().sort(-Order.created_at).to_list()
    except Exception as e:
        logger.error(f"Failed to fetch orders: {str(e)}")
        return []

@app.post("/api/buy") # We added a POST endpoint here to allow users to buy a spot in the campaign.
async def claim_campaign_spot(payload: BuySchema, request: Request):
    """
    Main Logic: Secures a spot for the user.
    Uses strict, isolated ACID transactions to prevent overselling during high-traffic drops.
    """
    email = payload.email.strip().lower()
    
    # Safely retrieve the modern PyMongo client from the global app state
    client = request.app.state.db_client
    
    # Note: start_session() is a local memory operation in modern PyMongo, so NO 'await' is used here.
    async with client.start_session() as session:
        # 1. Explicitly start the isolated transaction block
        await session.start_transaction()
        
        try:
            # Read collection volume inside transaction isolation limits
            count = await Order.find({}, session=session).count()
            
            # Strict Capacity Check
            if count >= MAX_SPOTS:
                logger.warning(f"User tried to buy but campaign is sold out | Event: SOLD_OUT_ATTEMPT | Email: {email}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Campaign Sold Out!"
                )
            
            # Duplicate Registration Check
            existing = await Order.find_one(Order.email == email, session=session)
            if existing:
                logger.warning(f"User tried to register an existing email | Event: DUPLICATE_EMAIL | Email: {email}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This email is already registered!"
                )
            
            # Create and commit the new order
            new_order = Order(email=email)
            await new_order.insert(session=session)
            
            # Explicitly COMMIT the transaction upon absolute success
            await session.commit_transaction()
            
            logger.info(f"🎉 New Spot Claimed! | Event: PURCHASE | Email: {email}")
            return {"success": True, "message": "Spot Secured!"}
                
        except HTTPException as http_exc:
            # Explicitly ABORT the transaction if validation fails (e.g., Sold out, Duplicate)
            await session.abort_transaction()
            raise http_exc
        except Exception as err:
            # Explicitly ABORT the transaction if an unexpected database error occurs
            await session.abort_transaction()
            logger.error(f"Internal Database Error during /api/buy: {str(err)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Internal Database Error"
            )

@app.post("/api/reset") # We added a POST endpoint here to allow admins to reset the campaign by wiping all existing orders, which is essential for testing and relaunching the campaign without needing to manually clear the database.
async def reset_system_state():
    """
    Admin Action: Wipes the active database collection cleanly to reset the campaign.
    """
    try:
        await Order.find_all().delete()
        logger.warning("System was reset by admin | Event: SYSTEM_RESET")
        return {"message": "System Reset Successful"}
    except Exception as e:
        logger.error(f"System Reset Failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="System Reset Failed"
        )

# EXECUTION ENTRYPOINT
if __name__ == "__main__":
    import uvicorn
    PORT = int(os.getenv("PORT", "5000"))
    logger.info(f"🚀 BACKEND ACTIVE: http://127.0.0.1:{PORT}")
    # We added reload=True here so you don't need the CLI flag
    uvicorn.run("main:app", host="127.0.0.1", port=PORT, reload=True, log_config=None)