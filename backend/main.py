from __future__ import annotations

import logging
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.config import UPLOAD_DIR
from backend.database import (
    accept_bid,
    add_comment,
    counter_bid,
    create_bid,
    create_civic_post,
    create_service_job,
    flag_urgent_post,
    get_all_civic_posts,
    get_all_service_jobs,
    get_bids_for_job,
    get_civic_post_by_id,
    get_comments,
    get_service_job_by_id,
    init_db,
    seed_initial_data,
    upvote_post,
)
from backend.gemma_service import (
    analyze_civic_issue,
    diagnose_home_repair,
    pulsebot_chat,
)
from backend.models import (
    AcceptBidCreate,
    BidCreate,
    ChatRequest,
    CivicPostCreate,
    CommentCreate,
    CounterBidCreate,
    ServiceJobCreate,
)

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("civicpulse")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context for startup and shutdown routines."""
    logger.info("Initializing CivicPulse database and seeding starter demo data...")
    init_db()
    seed_initial_data()
    logger.info("CivicPulse startup sequence completed successfully.")
    yield
    logger.info("CivicPulse application shutting down.")


# Initialize FastAPI app
app = FastAPI(
    title="CivicPulse API",
    description="Community civic grievance reporting and local household service exchange platform",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware allowing all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount /uploads for serving uploaded media files
upload_folder = Path(UPLOAD_DIR)
upload_folder.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(upload_folder)), name="uploads")

# Frontend directory
FRONTEND_PATH = Path(__file__).resolve().parent.parent / "frontend" / "index.html"


# --- Frontend Root ---
@app.get("/", tags=["Frontend"])
async def serve_dashboard():
    """Serve the CivicPulse web application dashboard."""
    if FRONTEND_PATH.exists():
        return FileResponse(str(FRONTEND_PATH))
    return {"message": "CivicPulse API is running. Visit /docs for OpenAPI specs."}


# --- Health Endpoint ---
@app.get("/api/health", tags=["Health"])
async def health_check() -> Dict[str, str]:
    """Health check endpoint confirming API status."""
    return {"status": "healthy", "service": "CivicPulse"}


# --- Civic Grievance Endpoints ---
@app.get("/api/civic/posts", tags=["Civic"])
async def list_civic_posts() -> List[Dict[str, Any]]:
    """Retrieve all civic posts with their attached comments."""
    posts = get_all_civic_posts()
    for post in posts:
        post["comments"] = get_comments(post["id"])
    return posts


@app.post("/api/civic/posts", status_code=status.HTTP_201_CREATED, tags=["Civic"])
async def submit_civic_post(payload: CivicPostCreate) -> Dict[str, Any]:
    """Report a new civic issue in the neighborhood."""
    created_post = create_civic_post(payload.model_dump())
    created_post["comments"] = []
    return created_post


@app.post("/api/civic/report", status_code=status.HTTP_201_CREATED, tags=["Civic"])
async def report_civic_issue_multimodal(
    image: UploadFile = File(...),
    description: str = Form(...),
    location_city: str = Form(...),
    lat: float = Form(0.0),
    lng: float = Form(0.0),
) -> Dict[str, Any]:
    """
    Multimodal civic issue reporting endpoint:
    - Saves uploaded image to uploads/ with unique UUID filename
    - Audits hazard with Gemma 4 multimodal AI service
    - Records structured municipal incident in SQLite
    """
    image_bytes = await image.read()
    file_ext = Path(image.filename or "image.jpg").suffix or ".jpg"
    unique_filename = f"{uuid.uuid4().hex}{file_ext}"
    saved_file_path = upload_folder / unique_filename
    saved_file_path.write_bytes(image_bytes)

    image_url = f"/uploads/{unique_filename}"

    # Analyze via Gemma 4 / Gemini fallback
    analysis = analyze_civic_issue(
        image_bytes=image_bytes,
        description=description,
        location_city=location_city,
    )

    is_local_flag = 1 if analysis.get("is_local_municipal", True) else 0

    post_record = {
        "title": analysis.get("title") or "Reported Civic Hazard",
        "description": analysis.get("summary") or description,
        "image_url": image_url,
        "location_city": location_city,
        "lat": lat,
        "lng": lng,
        "department": analysis.get("department") or "Roads & Potholes",
        "severity": analysis.get("severity") or "Moderate",
        "is_local": is_local_flag,
        "external_portals": analysis.get("external_portals") or [],
        "status": "Reported",
    }

    created_post = create_civic_post(post_record)
    created_post["comments"] = []
    return created_post


@app.post("/api/civic/{post_id}/upvote", tags=["Civic"])
@app.post("/api/civic/posts/{post_id}/upvote", tags=["Civic"])
async def upvote_civic_post(post_id: str) -> Dict[str, Any]:
    """Upvote an existing civic issue."""
    post = get_civic_post_by_id(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Civic post not found")
    new_count = upvote_post(post_id)
    return {"id": post_id, "upvotes": new_count}


@app.post("/api/civic/{post_id}/urgent", tags=["Civic"])
@app.post("/api/civic/posts/{post_id}/urgent", tags=["Civic"])
async def flag_civic_post_urgent(post_id: str) -> Dict[str, Any]:
    """Flag a civic issue as urgent emergency."""
    post = get_civic_post_by_id(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Civic post not found")
    new_count = flag_urgent_post(post_id)
    return {"id": post_id, "urgent_flags": new_count}


@app.post("/api/civic/{post_id}/comment", status_code=status.HTTP_201_CREATED, tags=["Civic"])
@app.post("/api/civic/{post_id}/comments", status_code=status.HTTP_201_CREATED, tags=["Civic"])
@app.post("/api/civic/posts/{post_id}/comments", status_code=status.HTTP_201_CREATED, tags=["Civic"])
async def add_post_comment(post_id: str, payload: CommentCreate) -> Dict[str, Any]:
    """Add a community comment or update on a civic post."""
    post = get_civic_post_by_id(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Civic post not found")
    created_comment = add_comment(post_id=post_id, author=payload.author, comment=payload.comment)
    return created_comment


# --- AI Chat / PulseBot Endpoints ---
@app.post("/api/chat", tags=["AI"])
async def chat_with_pulsebot(payload: ChatRequest) -> Dict[str, str]:
    """
    PulseBot conversational copilot endpoint:
    Assists residents with municipal jurisdiction, fair repair pricing, and evidence collection.
    """
    reply = pulsebot_chat(
        history=payload.history or [],
        user_message=payload.message,
    )
    return {"reply": reply}


# --- Service Jobs & Bids Endpoints ---
@app.get("/api/services/jobs", tags=["Services"])
async def list_service_jobs() -> List[Dict[str, Any]]:
    """Retrieve all household service jobs with their attached bids."""
    jobs = get_all_service_jobs()
    for job in jobs:
        job["bids"] = get_bids_for_job(job["id"])
    return jobs


@app.post("/api/services/jobs", status_code=status.HTTP_201_CREATED, tags=["Services"])
async def submit_service_job(payload: ServiceJobCreate) -> Dict[str, Any]:
    """Post a new household service job."""
    created_job = create_service_job(payload.model_dump())
    created_job["bids"] = []
    return created_job


@app.post("/api/services/jobs/{job_id}/bids", status_code=status.HTTP_201_CREATED, tags=["Services"])
async def submit_bid_for_job(job_id: str, payload: BidCreate) -> Dict[str, Any]:
    """Submit a worker bid for a specific household service job."""
    job = get_service_job_by_id(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Service job not found")
    created_bid = create_bid(
        job_id=job_id,
        worker_name=payload.worker_name,
        worker_phone=payload.worker_phone,
        bid_amount=payload.bid_amount,
    )
    return created_bid


@app.post("/api/services/bids/{bid_id}/counter", tags=["Services"])
async def submit_counter_bid(bid_id: str, payload: CounterBidCreate) -> Dict[str, Any]:
    """Submit a counter offer amount for a worker bid."""
    try:
        updated_bid = counter_bid(bid_id=bid_id, counter_amount=payload.counter_amount)
        return updated_bid
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/services/bids/{bid_id}/accept", tags=["Services"])
@app.post("/api/services/jobs/{job_id}/bids/{bid_id}/accept", tags=["Services"])
async def accept_service_bid(
    bid_id: str,
    payload: AcceptBidCreate,
    job_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Accept a worker bid, locking in the final price and marking the job assigned."""
    try:
        updated_bid = accept_bid(bid_id=bid_id, job_id=job_id, final_price=payload.final_price)
        return updated_bid
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
