from __future__ import annotations

from typing import Any, Dict, List, Optional, Union
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
    citizen_id: Optional[int] = Field(1, description="Citizen user ID")
    citizen_name: Optional[str] = Field("Ayush Chauhan", description="Citizen name")
    citizen_phone: Optional[str] = Field("+91 98765 43210", description="Citizen phone")


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
    citizen_id: Optional[int] = Field(1, description="Citizen user ID")
    citizen_name: Optional[str] = Field("Ayush Chauhan", description="Name of requester")
    citizen_phone: Optional[str] = Field("+91 98765 43210", description="Phone number of requester")
    citizen_address: Optional[str] = Field(None, description="Address or locality of requester")
    preferred_slot: Optional[str] = Field("Today, 4:00 PM - 6:00 PM", description="Preferred inspection/service time slot")


class BidCreate(BaseModel):
    """Schema for a worker submitting a bid on a service job."""
    worker_name: Optional[str] = Field("Verified Technician", description="Name of the contractor or technician")
    worker_phone: Optional[str] = Field("+91 98450 12345", description="Contact phone number")
    technician_id: Optional[int] = Field(1, description="Technician account ID")
    technician_name: Optional[str] = Field(None, description="Technician display name")
    technician_trade: Optional[str] = Field("General Repair", description="Trade specialization")
    amount: Optional[float] = Field(None, description="Proposed quotation in INR")
    bid_amount: Optional[float] = Field(None, description="Proposed quotation in INR")
    note: Optional[str] = Field(None, description="Quotation note / turnaround time")
    notes: Optional[str] = Field(None, description="Quotation note")


class CounterBidCreate(BaseModel):
    """Schema for a resident or technician submitting a counter offer."""
    counter_amount: float = Field(..., gt=0, description="Counter offered amount in INR")
    actor_role: Optional[str] = Field("CITIZEN", description="Role initiating the counter: 'CITIZEN' or 'TECHNICIAN'")


class AcceptBidCreate(BaseModel):
    """Schema for confirming and accepting a final agreed bid."""
    bid_id: Optional[Union[str, int]] = Field(None, description="Associated bid ID to accept")
    job_id: Optional[str] = Field(None, description="Associated service job ID")
    final_price: Optional[str] = Field(None, description="Final agreed price string (e.g., ₹600)")


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


class LetterRequest(BaseModel):
    """Schema for formal municipal or RTI letter generation request."""
    letter_type: str = Field(
        "municipal",
        description="Type of letter to generate: 'municipal' (Formal Notice) or 'rti' (RTI Act Application)"
    )


class CivicStatusUpdate(BaseModel):
    """Schema for municipal officer updating complaint lifecycle status and assigned inspector."""
    status: str = Field(
        ...,
        description="Operational status: 'Reported', 'Acknowledged', 'Assigned', 'In Progress', 'Resolved'"
    )
    assigned_officer: Optional[str] = Field(
        "Unassigned",
        description="Designated field inspector, junior engineer, or response squad"
    )
    officer_note: Optional[str] = Field(
        None,
        description="Optional inspection remarks or resolution notes"
    )


class CivicStatusPatch(BaseModel):
    """Schema for municipal officer multi-stage lifecycle transitions via PATCH."""
    status: str = Field(
        ...,
        description="Target status: 'REPORTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED'"
    )
    officer_note: Optional[str] = Field(
        None,
        description="Officer remarks or resolution notes"
    )
    assigned_officer: Optional[str] = Field(
        None,
        description="Assigned field inspector or response squad"
    )


class ReviewCreate(BaseModel):
    """Schema for citizen submitting a rating & review for a technician."""
    service_id: Any = Field("job-demo-001", description="Associated service job ID or reference")
    technician_id: int = Field(..., description="Target technician user ID")
    citizen_name: str = Field(..., min_length=2, description="Citizen/homeowner full name")
    rating: int = Field(..., ge=1, le=5, description="Star rating between 1 and 5")
    review_text: Optional[str] = Field("", description="Optional written review feedback")

