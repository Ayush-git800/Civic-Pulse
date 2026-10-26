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

# Mount /static for serving frontend static assets
static_folder = Path(__file__).resolve().parent.parent / "frontend" / "static"
static_folder.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_folder)), name="static")

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


# --- Civic Grievance Endpoints (Phase 2) ---

@app.get("/api/civic/posts", tags=["Civic"])
async def list_civic_posts() -> List[Dict[str, Any]]:
    """Retrieve all civic posts with their attached comments."""
    posts = get_all_civic_posts()
    for post in posts:
        post["comments"] = get_comments(post["id"])
    return posts


@app.post("/api/civic/posts", status_code=status.HTTP_201_CREATED, tags=["Civic"])
async def submit_civic_post(payload: CivicPostCreate) -> Dict[str, Any]:
    """Report a new civic issue in the neighborhood via JSON schema."""
    created_post = create_civic_post(payload.model_dump())
    created_post["comments"] = []
    return created_post


@app.post("/api/civic/report", status_code=status.HTTP_201_CREATED, tags=["Civic"])
async def report_civic_issue_multimodal(
    image: UploadFile = File(...),
    description: str = Form(...),
    location_city: str = Form("Sector 62, Noida"),
    lat: float = Form(28.6289),
    lng: float = Form(77.3670),
) -> Dict[str, Any]:
    """
    1. POST /api/civic/report:
    - Accepts multipart form data (image, description, location_city, lat, lng).
    - Saves uploaded binary image into uploads/ with a unique UUID filename.
    - Audits hazard using Gemma 4 Multimodal model with fallback to Gemini 2.5 Flash.
    - Inserts structured record directly into SQLite civic_posts table via create_civic_post().
    - Returns created post object with an HTTP 201 status code.
    """
    image_bytes = await image.read()
    file_ext = Path(image.filename or "image.jpg").suffix or ".jpg"
    unique_filename = f"{uuid.uuid4().hex}{file_ext}"
    saved_file_path = upload_folder / unique_filename
    saved_file_path.write_bytes(image_bytes)

    image_url = f"/uploads/{unique_filename}"

    # Audit via Gemma 4 / Gemini fallback engine
    analysis = analyze_civic_issue(
        image_bytes=image_bytes,
        description=description,
        location_city=location_city,
    )

    is_local_flag = 1 if analysis.get("is_local_municipal", True) else 0

    post_record = {
        "title": analysis.get("title") or "Reported Municipal Hazard",
        "description": analysis.get("summary") or description,
        "image_url": image_url,
        "location_city": location_city,
        "lat": lat,
        "lng": lng,
        "department": analysis.get("department") or "Roads & Transport",
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
    """
    2. POST /api/civic/{post_id}/upvote:
    - Calls database upvote_post(post_id).
    - Returns {"post_id": post_id, "upvotes": updated_count}.
    """
    post = get_civic_post_by_id(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Civic post not found")
    new_count = upvote_post(post_id)
    return {"post_id": post_id, "id": post_id, "upvotes": new_count}


@app.post("/api/civic/{post_id}/urgent", tags=["Civic"])
@app.post("/api/civic/posts/{post_id}/urgent", tags=["Civic"])
async def flag_civic_post_urgent(post_id: str) -> Dict[str, Any]:
    """
    3. POST /api/civic/{post_id}/urgent:
    - Calls database flag_urgent_post(post_id).
    - Returns {"post_id": post_id, "urgent_flags": updated_count}.
    """
    post = get_civic_post_by_id(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Civic post not found")
    new_count = flag_urgent_post(post_id)
    return {"post_id": post_id, "id": post_id, "urgent_flags": new_count}


@app.post("/api/civic/{post_id}/comment", status_code=status.HTTP_201_CREATED, tags=["Civic"])
@app.post("/api/civic/{post_id}/comments", status_code=status.HTTP_201_CREATED, tags=["Civic"])
@app.post("/api/civic/posts/{post_id}/comments", status_code=status.HTTP_201_CREATED, tags=["Civic"])
async def add_post_comment(post_id: str, payload: CommentCreate) -> Dict[str, Any]:
    """
    4. POST /api/civic/{post_id}/comment:
    - Accepts CommentCreate body (author: str, comment: str).
    - Calls database add_comment().
    - Returns the created comment.
    """
    post = get_civic_post_by_id(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Civic post not found")
    created_comment = add_comment(post_id=post_id, author=payload.author, comment=payload.comment)
    return created_comment


# --- AI Chat / PulseBot Endpoints (Phase 2) ---

@app.post("/api/chat", tags=["AI"])
async def chat_with_pulsebot(payload: ChatRequest) -> Dict[str, str]:
    """
    5. POST /api/chat:
    - Accepts ChatRequest body (message: str, history: list[dict]).
    - Calls gemma_service.pulsebot_chat().
    - Returns {"reply": reply_text}.
    """
    reply_text = pulsebot_chat(
        history=payload.history or [],
        user_message=payload.message,
    )
    return {"reply": reply_text}


# --- Home Utility & Service Marketplace Endpoints (Phase 3) ---

@app.get("/api/services/jobs", tags=["Services"])
async def list_service_jobs() -> List[Dict[str, Any]]:
    """Retrieve all household service jobs with their attached bids."""
    jobs = get_all_service_jobs()
    for job in jobs:
        job["bids"] = get_bids_for_job(job["id"])
    return jobs


@app.post("/api/services/create", status_code=status.HTTP_201_CREATED, tags=["Services"])
async def create_service_job_with_ai(
    media: UploadFile = File(...),
    description: str = Form(...),
    location_city: str = Form("Sector 62, Noida"),
) -> Dict[str, Any]:
    """Post household service defect with Gemma AI technical diagnosis and price estimation."""
    media_bytes = await media.read()
    file_ext = Path(media.filename or "media.jpg").suffix or ".jpg"
    unique_filename = f"{uuid.uuid4().hex}{file_ext}"
    saved_file_path = upload_folder / unique_filename
    saved_file_path.write_bytes(media_bytes)

    media_url = f"/uploads/{unique_filename}"

    # Diagnose defect via Gemma service
    diagnosis = diagnose_home_repair(
        image_bytes=media_bytes,
        description=description,
    )

    category = diagnosis.get("category") or "Plumber"
    estimated_price = diagnosis.get("fair_price_bracket") or "₹350 - ₹550"
    title = diagnosis.get("title") or "Household Repair Requirement"

    full_description = description
    if diagnosis.get("diagnosis"):
        full_description = f"{description}\n\n[Gemma Diagnosis]: {diagnosis.get('diagnosis')}"
    if diagnosis.get("safety_alert") and diagnosis.get("safety_alert") != "None":
        full_description += f"\n[Safety Alert]: {diagnosis.get('safety_alert')}"

    job_record = {
        "id": str(uuid.uuid4()),
        "title": title,
        "description": full_description,
        "category": category,
        "media_url": media_url,
        "location_city": location_city,
        "estimated_price": estimated_price,
        "final_price": None,
        "status": "Open",
    }

    created_job = create_service_job(job_record)
    created_job["diagnosis"] = diagnosis.get("diagnosis")
    created_job["fair_price_bracket"] = estimated_price
    created_job["safety_alert"] = diagnosis.get("safety_alert")
    created_job["bids"] = []
    return created_job


@app.post("/api/services/jobs", status_code=status.HTTP_201_CREATED, tags=["Services"])
async def submit_service_job(payload: ServiceJobCreate) -> Dict[str, Any]:
    """Directly post a household service job."""
    created_job = create_service_job(payload.model_dump())
    created_job["bids"] = []
    return created_job


@app.get("/api/services/{job_id}/bids", tags=["Services"])
@app.get("/api/services/jobs/{job_id}/bids", tags=["Services"])
async def get_service_job_bids(job_id: str) -> List[Dict[str, Any]]:
    """Returns all bids associated with the given job_id from SQLite."""
    job = get_service_job_by_id(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Service job not found")
    return get_bids_for_job(job_id)


@app.post("/api/services/{job_id}/bid", status_code=status.HTTP_201_CREATED, tags=["Services"])
@app.post("/api/services/jobs/{job_id}/bids", status_code=status.HTTP_201_CREATED, tags=["Services"])
async def submit_bid_on_job(job_id: str, payload: BidCreate) -> Dict[str, Any]:
    """Submit worker bid on job and advance job status to Negotiating."""
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
    """Submit resident counter offer for a worker bid."""
    try:
        updated_bid = counter_bid(bid_id=bid_id, counter_amount=payload.counter_amount)
        return updated_bid
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/services/bids/{bid_id}/accept", tags=["Services"])
@app.post("/api/services/jobs/{job_id}/bids/{bid_id}/accept", tags=["Services"])
async def confirm_accepted_bid(
    bid_id: str,
    payload: AcceptBidCreate,
    job_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Accept worker bid, confirm job contract, and lock final price."""
    effective_job_id = payload.job_id or job_id
    try:
        result = accept_bid(bid_id=bid_id, job_id=effective_job_id, final_price=payload.final_price)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
