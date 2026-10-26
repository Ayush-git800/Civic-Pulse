from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class CivicPostCreate(BaseModel):
    """Schema for creating a new civic post/issue."""
    title: str = Field(..., min_length=3, description="Title of the civic issue")
    description: str = Field(..., min_length=5, description="Detailed explanation of the issue")
    image_url: Optional[str] = Field(None, description="Public URL or path of attached photo")
    location_city: str = Field(..., min_length=2, description="City or locality")
    lat: Optional[float] = Field(None, description="Latitude coordinate")
    lng: Optional[float] = Field(None, description="Longitude coordinate")
    department: str = Field(..., description="Target municipal department (e.g. Roads, Sanitation)")
    severity: str = Field("Medium", description="Severity level: Low, Medium, High, Critical")
    is_local: int = Field(1, description="1 if hyper-local community issue, 0 if regional")
    external_portals: Optional[List[str]] = Field(
        default_factory=list,
        description="List of relevant government portals (e.g., CPGRAMS, Swachhata)"
    )


class CommentCreate(BaseModel):
    """Schema for adding a comment to a civic post."""
    author: str = Field(..., min_length=1, description="Name or handle of comment author")
    comment: str = Field(..., min_length=1, description="Comment text body")


class ServiceJobCreate(BaseModel):
    """Schema for posting a household repair or gig job."""
    title: str = Field(..., min_length=3, description="Job title, e.g. Kitchen Drain Leaking")
    description: str = Field(..., min_length=5, description="Full description of the job work required")
    category: str = Field(..., description="Service category (Plumbing, Electrical, Carpentry, etc.)")
    media_url: Optional[str] = Field(None, description="Attached image or video URL")
    location_city: str = Field(..., min_length=2, description="City or neighborhood")
    estimated_price: Optional[str] = Field(None, description="User estimated budget or quote range")


class BidCreate(BaseModel):
    """Schema for a worker submitting a bid on a service job."""
    worker_name: str = Field(..., min_length=2, description="Name of the contractor or technician")
    worker_phone: str = Field(..., min_length=7, description="Contact phone number")
    bid_amount: int = Field(..., gt=0, description="Proposed quotation in INR")


class CounterBidCreate(BaseModel):
    """Schema for a resident countering a contractor bid."""
    counter_amount: int = Field(..., gt=0, description="Counter offered amount in INR")


class AcceptBidCreate(BaseModel):
    """Schema for confirming and accepting a final agreed bid."""
    job_id: Optional[str] = Field(None, description="Associated service job ID")
    final_price: str = Field(..., description="Final agreed price string (e.g., ₹600)")


class ChatRequest(BaseModel):
    """Schema for AI assistant chat requests (Gemma / Gemini integration)."""
    message: str = Field(..., min_length=1, description="User query or message")
    history: Optional[List[Dict[str, Any]]] = Field(
        default_factory=list,
        description="Chat history messages with role and content"
    )
    context: Optional[Dict[str, Any]] = Field(
        None,
        description="Optional situational context (e.g. active post or job metadata)"
    )
