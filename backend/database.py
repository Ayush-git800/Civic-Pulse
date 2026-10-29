from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

# Path to database file
import os
import shutil

if os.getenv("VERCEL"):
    DB_PATH = Path("/tmp/civicpulse.db")
    SRC_DB = Path(__file__).resolve().parent.parent / "civicpulse.db"
    if SRC_DB.exists() and not DB_PATH.exists():
        try:
            shutil.copy2(SRC_DB, DB_PATH)
        except Exception:
            pass
else:
    DB_PATH = Path(__file__).resolve().parent.parent / "civicpulse.db"

# Thread-safe database lock for SQLite writes
db_lock = threading.Lock()

# Persistent SQLite connection with check_same_thread=False
conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
conn.row_factory = sqlite3.Row
# Enable foreign keys and WAL mode for better concurrency
conn.execute("PRAGMA foreign_keys = ON;")
conn.execute("PRAGMA journal_mode = WAL;")


def init_db() -> None:
    """Initialize SQLite database tables if they do not exist."""
    with db_lock:
        cursor = conn.cursor()
        
        # 1. Civic Posts Table
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS civic_posts (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                image_url TEXT,
                location_city TEXT NOT NULL,
                lat REAL,
                lng REAL,
                department TEXT NOT NULL,
                severity TEXT NOT NULL,
                is_local INTEGER DEFAULT 1,
                external_portals TEXT,
                upvotes INTEGER DEFAULT 0,
                urgent_flags INTEGER DEFAULT 0,
                status TEXT DEFAULT 'Reported',
                assigned_officer TEXT DEFAULT 'Unassigned',
                sla_hours INTEGER DEFAULT 48,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """
        )

        # 2. Civic Comments Table
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS civic_comments (
                id TEXT PRIMARY KEY,
                post_id TEXT NOT NULL,
                author TEXT NOT NULL,
                comment TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (post_id) REFERENCES civic_posts (id) ON DELETE CASCADE
            );
            """
        )

        # 3. Service Jobs Table
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS service_jobs (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                category TEXT NOT NULL,
                media_url TEXT,
                location_city TEXT NOT NULL,
                estimated_price TEXT,
                final_price TEXT,
                status TEXT DEFAULT 'Open',
                assigned_worker_phone TEXT DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """
        )

        # 4. Service Bids Table
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS service_bids (
                id TEXT PRIMARY KEY,
                job_id TEXT NOT NULL,
                worker_name TEXT NOT NULL,
                worker_phone TEXT NOT NULL,
                bid_amount INTEGER NOT NULL,
                counter_amount INTEGER,
                status TEXT DEFAULT 'Pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (job_id) REFERENCES service_jobs (id) ON DELETE CASCADE
            );
            """
        )

        # Dynamic Schema Migrations for Existing Databases
        cursor.execute("PRAGMA table_info(civic_posts);")
        columns = [row[1] for row in cursor.fetchall()]
        if "assigned_officer" not in columns:
            cursor.execute("ALTER TABLE civic_posts ADD COLUMN assigned_officer TEXT DEFAULT 'Unassigned';")
        if "sla_hours" not in columns:
            cursor.execute("ALTER TABLE civic_posts ADD COLUMN sla_hours INTEGER DEFAULT 48;")

        cursor.execute("PRAGMA table_info(service_jobs);")
        job_cols = [row[1] for row in cursor.fetchall()]
        if "assigned_worker_phone" not in job_cols:
            cursor.execute("ALTER TABLE service_jobs ADD COLUMN assigned_worker_phone TEXT DEFAULT NULL;")

        # Normalize existing posts with valid SLAs and officer assignments
        cursor.execute("UPDATE civic_posts SET assigned_officer = 'Unassigned' WHERE assigned_officer IS NULL;")
        cursor.execute("UPDATE civic_posts SET sla_hours = 24 WHERE (sla_hours IS NULL OR sla_hours = 48) AND LOWER(severity) = 'critical';")
        cursor.execute("UPDATE civic_posts SET sla_hours = 48 WHERE (sla_hours IS NULL) AND LOWER(severity) = 'high';")
        cursor.execute("UPDATE civic_posts SET sla_hours = 72 WHERE (sla_hours IS NULL) AND LOWER(severity) IN ('moderate', 'medium');")
        cursor.execute("UPDATE civic_posts SET sla_hours = 120 WHERE (sla_hours IS NULL) AND LOWER(severity) = 'low';")

        conn.commit()


def _format_post(row: Union[sqlite3.Row, dict]) -> dict:
    """Format civic post row and deserialize JSON fields."""
    item = dict(row)
    raw_portals = item.get("external_portals")
    if isinstance(raw_portals, str):
        try:
            item["external_portals"] = json.loads(raw_portals)
        except Exception:
            item["external_portals"] = [p.strip() for p in raw_portals.split(",") if p.strip()] if raw_portals else []
    elif raw_portals is None:
        item["external_portals"] = []
    return item


def get_all_civic_posts() -> list[dict]:
    """Retrieve all civic posts ordered by newest first."""
    with db_lock:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM civic_posts ORDER BY created_at DESC;")
        rows = cursor.fetchall()
        return [_format_post(r) for r in rows]


def get_civic_post_by_id(post_id: str) -> Optional[dict]:
    """Retrieve a single civic post by its ID."""
    with db_lock:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM civic_posts WHERE id = ?;", (post_id,))
        row = cursor.fetchone()
        return _format_post(row) if row else None


def create_civic_post(post_data: dict) -> dict:
    """Insert a new civic post into the database."""
    post_id = post_data.get("id") or str(uuid.uuid4())
    title = post_data["title"]
    description = post_data["description"]
    image_url = post_data.get("image_url")
    location_city = post_data.get("location_city", "Unknown")
    lat = post_data.get("lat")
    lng = post_data.get("lng")
    department = post_data.get("department", "General")
    severity = post_data.get("severity", "Medium")
    is_local = int(post_data.get("is_local", 1))

    external_portals = post_data.get("external_portals", [])
    if isinstance(external_portals, (list, dict)):
        portals_json = json.dumps(external_portals)
    elif isinstance(external_portals, str):
        portals_json = external_portals
    else:
        portals_json = "[]"

    upvotes = int(post_data.get("upvotes", 0))
    urgent_flags = int(post_data.get("urgent_flags", 0))
    status = post_data.get("status", "Reported")
    assigned_officer = post_data.get("assigned_officer") or "Unassigned"

    # Calculate statutory SLA in hours based on severity
    sla_map = {"critical": 24, "high": 48, "moderate": 72, "medium": 72, "low": 120}
    sla_hours = int(post_data.get("sla_hours") or sla_map.get(str(severity).lower(), 48))

    with db_lock:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO civic_posts (
                id, title, description, image_url, location_city,
                lat, lng, department, severity, is_local,
                external_portals, upvotes, urgent_flags, status,
                assigned_officer, sla_hours
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                post_id,
                title,
                description,
                image_url,
                location_city,
                lat,
                lng,
                department,
                severity,
                is_local,
                portals_json,
                upvotes,
                urgent_flags,
                status,
                assigned_officer,
                sla_hours,
            ),
        )
        conn.commit()

    created = get_civic_post_by_id(post_id)
    if not created:
        raise RuntimeError(f"Failed to create civic post {post_id}")
    return created


def upvote_post(post_id: str) -> int:
    """Increment upvotes count for a civic post and return new count."""
    with db_lock:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE civic_posts SET upvotes = upvotes + 1 WHERE id = ?;",
            (post_id,),
        )
        conn.commit()
        cursor.execute("SELECT upvotes FROM civic_posts WHERE id = ?;", (post_id,))
        row = cursor.fetchone()
        return row["upvotes"] if row else 0


def flag_urgent_post(post_id: str) -> int:
    """Increment urgent flag count for a civic post and return new count."""
    with db_lock:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE civic_posts SET urgent_flags = urgent_flags + 1 WHERE id = ?;",
            (post_id,),
        )
        conn.commit()
        cursor.execute("SELECT urgent_flags FROM civic_posts WHERE id = ?;", (post_id,))
        row = cursor.fetchone()
        return row["urgent_flags"] if row else 0


def add_comment(post_id: str, author: str, comment: str) -> dict:
    """Add a new comment to a civic post."""
    comment_id = str(uuid.uuid4())
    with db_lock:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO civic_comments (id, post_id, author, comment)
            VALUES (?, ?, ?, ?);
            """,
            (comment_id, post_id, author, comment),
        )
        conn.commit()
        cursor.execute("SELECT * FROM civic_comments WHERE id = ?;", (comment_id,))
        row = cursor.fetchone()
        return dict(row)


def get_comments(post_id: str) -> list[dict]:
    """Retrieve all comments for a specific post."""
    with db_lock:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM civic_comments WHERE post_id = ? ORDER BY created_at ASC;",
            (post_id,),
        )
        rows = cursor.fetchall()
        return [dict(r) for r in rows]


def get_all_service_jobs() -> list[dict]:
    """Retrieve all service jobs ordered by newest first."""
    with db_lock:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM service_jobs ORDER BY created_at DESC;")
        rows = cursor.fetchall()
        return [dict(r) for r in rows]


def get_service_job_by_id(job_id: str) -> Optional[dict]:
    """Retrieve a single service job by its ID."""
    with db_lock:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM service_jobs WHERE id = ?;", (job_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


def create_service_job(job_data: dict) -> dict:
    """Insert a new household service job."""
    job_id = job_data.get("id") or str(uuid.uuid4())
    title = job_data["title"]
    description = job_data["description"]
    category = job_data["category"]
    media_url = job_data.get("media_url")
    location_city = job_data.get("location_city", "Unknown")
    estimated_price = job_data.get("estimated_price")
    final_price = job_data.get("final_price")
    status = job_data.get("status", "Open")

    with db_lock:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO service_jobs (
                id, title, description, category, media_url,
                location_city, estimated_price, final_price, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                job_id,
                title,
                description,
                category,
                media_url,
                location_city,
                estimated_price,
                final_price,
                status,
            ),
        )
        conn.commit()

    created = get_service_job_by_id(job_id)
    if not created:
        raise RuntimeError(f"Failed to create service job {job_id}")
    return created


def get_bids_for_job(job_id: str) -> list[dict]:
    """Retrieve all bids for a given job ordered by creation date."""
    with db_lock:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM service_bids WHERE job_id = ? ORDER BY created_at ASC;",
            (job_id,),
        )
        rows = cursor.fetchall()
        return [dict(r) for r in rows]


def get_bid_by_id(bid_id: str) -> Optional[dict]:
    """Retrieve a single bid by its ID."""
    with db_lock:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM service_bids WHERE id = ?;", (bid_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


def create_bid(job_id: str, worker_name: str, worker_phone: str, bid_amount: int) -> dict:
    """Create a new service bid on a job and update job status to Negotiating."""
    bid_id = str(uuid.uuid4())
    with db_lock:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO service_bids (id, job_id, worker_name, worker_phone, bid_amount, status)
            VALUES (?, ?, ?, ?, ?, 'Pending');
            """,
            (bid_id, job_id, worker_name, worker_phone, bid_amount),
        )
        # Update parent job status to Negotiating
        cursor.execute(
            "UPDATE service_jobs SET status = 'Negotiating' WHERE id = ?;",
            (job_id,),
        )
        conn.commit()

    created = get_bid_by_id(bid_id)
    if not created:
        raise RuntimeError(f"Failed to create bid {bid_id}")
    return created


def counter_bid(bid_id: str, counter_amount: int) -> dict:
    """Submit a counter offer for a worker's bid."""
    with db_lock:
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE service_bids
            SET counter_amount = ?, status = 'Countered'
            WHERE id = ?;
            """,
            (counter_amount, bid_id),
        )
        conn.commit()

    updated = get_bid_by_id(bid_id)
    if not updated:
        raise ValueError(f"Bid not found with id: {bid_id}")
    return updated


def accept_bid(bid_id: str, job_id: Optional[str] = None, final_price: str = "") -> dict:
    """Accept a worker bid, confirm the job, and update final negotiated price."""
    with db_lock:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM service_bids WHERE id = ?;", (bid_id,))
        bid = cursor.fetchone()
        if not bid:
            raise ValueError(f"Bid not found with id: {bid_id}")

        resolved_job_id = job_id or bid["job_id"]

        worker_phone = bid["worker_phone"]

        # Accept selected bid
        cursor.execute(
            "UPDATE service_bids SET status = 'Accepted' WHERE id = ?;",
            (bid_id,),
        )
        # Mark other bids for this job as Rejected
        cursor.execute(
            "UPDATE service_bids SET status = 'Rejected' WHERE job_id = ? AND id != ?;",
            (resolved_job_id, bid_id),
        )
        # Update job status to Confirmed, final price, and assigned worker phone
        cursor.execute(
            """
            UPDATE service_jobs
            SET status = 'Confirmed', final_price = ?, assigned_worker_phone = ?
            WHERE id = ?;
            """,
            (final_price, worker_phone, resolved_job_id),
        )
        conn.commit()

    updated_bid = get_bid_by_id(bid_id)
    updated_job = get_service_job_by_id(resolved_job_id)
    if not updated_bid:
        raise ValueError(f"Bid not found with id: {bid_id}")
    return {"bid": updated_bid, "job": updated_job}


def seed_initial_data() -> None:
    """Seed realistic Indian demo data for civic posts and service jobs if empty."""
    with db_lock:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) AS count FROM civic_posts;")
        civic_count = cursor.fetchone()["count"]

        cursor.execute("SELECT COUNT(*) AS count FROM service_jobs;")
        jobs_count = cursor.fetchone()["count"]

    if civic_count == 0:
        # Seed realistic Indian municipal concerns
        demo_posts = [
            {
                "id": "post-demo-001",
                "title": "Deep Pothole near Sector 62 Metro Station",
                "description": (
                    "Dangerous crater-sized pothole right after exiting the metro station towards "
                    "the electronic city roundabout. Two-wheelers frequently skid during waterlogging, "
                    "causing immediate hazard for daily commuters."
                ),
                "image_url": "/static/images/demo/pothole.jpg",
                "location_city": "Noida",
                "lat": 28.6271,
                "lng": 77.3617,
                "department": "Road & Infrastructure",
                "severity": "High",
                "is_local": 1,
                "external_portals": ["CPGRAMS", "UP Jansunwai", "Noida Authority Citizen App"],
                "upvotes": 42,
                "urgent_flags": 14,
                "status": "In Review",
            },
            {
                "id": "post-demo-002",
                "title": "Overflowing Garbage Dumpster along Indirapuram Market",
                "description": (
                    "Community garbage dump near Shipra Mall market has not been cleared for over 4 days. "
                    "Stray cattle are scattering plastic bags across the road, and the stench is severely "
                    "affecting local shopkeepers and nearby apartments."
                ),
                "image_url": "/static/images/demo/garbage.jpg",
                "location_city": "Ghaziabad",
                "lat": 28.6434,
                "lng": 77.3752,
                "department": "Sanitation & Waste Management",
                "severity": "Critical",
                "is_local": 1,
                "external_portals": ["Swachhata-MoHUA", "Nagar Nigam Ghaziabad Portal"],
                "upvotes": 68,
                "urgent_flags": 27,
                "status": "Reported",
            },
            {
                "id": "post-demo-003",
                "title": "Broken High-Tension Streetlight on Link Road",
                "description": (
                    "A 200m stretch on Anand Vihar Link Road has been plunged into total darkness for "
                    "a week due to a snapped overhead wire and burnt fixture. High risk of mugging and "
                    "pedestrian accidents at night."
                ),
                "image_url": "/static/images/demo/utility_pole.jpg",
                "location_city": "Delhi NCR",
                "lat": 28.6315,
                "lng": 77.3168,
                "department": "Electrical & Public Lighting",
                "severity": "Medium",
                "is_local": 1,
                "external_portals": ["BSES Complaints", "MCD 311"],
                "upvotes": 19,
                "urgent_flags": 5,
                "status": "Reported",
            },
        ]

        for post in demo_posts:
            create_civic_post(post)

        # Seed starter comments for each post
        demo_comments = [
            ("post-demo-001", "Aarav Sharma", "Two bike riders slipped here yesterday during the evening drizzle! Needs urgent gravel patching."),
            ("post-demo-001", "Pooja Verma", "Raised grievance ticket on Noida Authority citizen portal as well (#NOI-94821). Upvoted!"),
            ("post-demo-002", "Rajesh Gupta (RWA Sec)", "Sanitation truck missed morning round 3 days in a row. It is breeding dengue mosquitoes."),
            ("post-demo-002", "Neha Saxena", "Tagged Nagar Nigam Ghaziabad commissioner on Twitter/X with photos."),
            ("post-demo-003", "Vikas Malhotra", "Pole number is BSES-DL-412. It's very risky for women walking from the bus stop."),
        ]

        for post_id, author, comment in demo_comments:
            add_comment(post_id=post_id, author=author, comment=comment)

    if jobs_count == 0:
        # Seed realistic household service jobs
        demo_jobs = [
            {
                "id": "job-demo-001",
                "title": "Main Kitchen Drain Leaking",
                "description": (
                    "Under-sink PVC u-trap pipe cracked and dirty water is leaking onto wooden modular "
                    "cabinets whenever sink is used. Need an experienced plumber with replacement pipe parts."
                ),
                "category": "Plumbing",
                "media_url": "/static/images/demo/drain_leak.jpg",
                "location_city": "Noida Sector 62",
                "estimated_price": "₹500 - ₹800",
                "final_price": None,
                "status": "Open",
            },
            {
                "id": "job-demo-002",
                "title": "MCB Trip Switch Burning Smell",
                "description": (
                    "Air conditioner 32A MCB trips repeatedly with faint burning plastic odor. "
                    "Requires immediate electrical inspection to avoid short circuit or wiring damage."
                ),
                "category": "Electrical",
                "media_url": "/static/images/demo/mcb_breaker.jpg",
                "location_city": "Ghaziabad",
                "estimated_price": "₹700 - ₹1200",
                "final_price": None,
                "status": "Open",
            },
        ]

        for job in demo_jobs:
            create_service_job(job)

        # Seed realistic starter bids
        demo_bids = [
            ("job-demo-001", "Ramesh Kumar (Expert Plumber)", "+91 98765 43210", 600),
            ("job-demo-001", "Verma Sanitary Works", "+91 98112 23344", 500),
            ("job-demo-002", "Sharma Electric Solutions", "+91 98990 01122", 850),
            ("job-demo-002", "QuickFix Home Electricals", "+91 97118 82233", 750),
        ]

        for job_id, worker_name, worker_phone, bid_amount in demo_bids:
            create_bid(job_id=job_id, worker_name=worker_name, worker_phone=worker_phone, bid_amount=bid_amount)

    # Ensure realistic confirmed job and active counter-offer exist for technician demo
    with db_lock:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) AS count FROM service_jobs WHERE status = 'Confirmed';")
        if cursor.fetchone()["count"] == 0:
            confirmed_job_id = "job-demo-003"
            cursor.execute(
                """
                INSERT OR IGNORE INTO service_jobs (
                    id, title, description, category, media_url, location_city,
                    estimated_price, final_price, status, assigned_worker_phone
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Confirmed', ?);
                """,
                (
                    confirmed_job_id,
                    "Rooftop Water Tank Ball Valve Replacement",
                    "Overhead Sintex 1000L tank valve jammed and continuously overflowing onto terrace. Brass ball valve replaced and float calibrated.",
                    "Plumbing",
                    "/static/images/demo/water_tank.jpg",
                    "Sector 62, Noida",
                    "₹800 - ₹1200",
                    "₹950",
                    "+91 98765 43210",
                ),
            )
            cursor.execute(
                """
                INSERT OR IGNORE INTO service_bids (
                    id, job_id, worker_name, worker_phone, bid_amount, counter_amount, status
                ) VALUES (?, ?, ?, ?, ?, ?, 'Accepted');
                """,
                (
                    "bid-demo-accepted-001",
                    confirmed_job_id,
                    "Ramesh Kumar (Expert Plumber)",
                    "+91 98765 43210",
                    950,
                    950,
                ),
            )
            # Mark Ramesh Kumar's bid on job-demo-001 as Countered to demonstrate homeowner negotiation
            cursor.execute(
                """
                UPDATE service_bids
                SET status = 'Countered', counter_amount = 500
                WHERE job_id = 'job-demo-001' AND worker_phone = '+91 98765 43210';
                """
            )
            conn.commit()


# ==============================================================================
# PILLAR 3: MUNICIPAL COMMAND CENTER & TECHNICIAN WORKSPACE SERVICES
# ==============================================================================

def update_civic_status_and_officer(
    post_id: str,
    status: str,
    assigned_officer: Optional[str] = None,
) -> Optional[dict]:
    """
    Updates the operational lifecycle status and field inspector assignment
    for a municipal civic complaint.
    """
    with db_lock:
        cursor = conn.cursor()
        if assigned_officer:
            cursor.execute(
                """
                UPDATE civic_posts
                SET status = ?, assigned_officer = ?
                WHERE id = ?;
                """,
                (status, assigned_officer, post_id),
            )
        else:
            cursor.execute(
                """
                UPDATE civic_posts
                SET status = ?
                WHERE id = ?;
                """,
                (status, post_id),
            )
        conn.commit()

    return get_civic_post_by_id(post_id)


def get_admin_overview_stats() -> dict:
    """
    Computes real-time municipal command center metrics:
    - Active Critical & High hazard tallies
    - Breach-risk SLA counts (< 12 hours remaining)
    - Unassigned complaints counter
    - Overall resolution rate (%)
    - Departmental breakdown & priority-sorted complaints queue
    """
    from datetime import datetime, timedelta

    with db_lock:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM civic_posts ORDER BY created_at DESC;")
        rows = cursor.fetchall()
        posts = [_format_post(r) for r in rows]

    total_posts = len(posts)
    active_posts = [p for p in posts if p.get("status") != "Resolved"]
    resolved_posts = [p for p in posts if p.get("status") == "Resolved"]

    critical_count = sum(
        1 for p in posts
        if str(p.get("severity", "")).lower() == "critical" and p.get("status") != "Resolved"
    )
    high_count = sum(
        1 for p in posts
        if str(p.get("severity", "")).lower() == "high" and p.get("status") != "Resolved"
    )
    unassigned_count = sum(
        1 for p in posts
        if (not p.get("assigned_officer") or p.get("assigned_officer") == "Unassigned")
        and p.get("status") != "Resolved"
    )

    now = datetime.utcnow()
    sla_at_risk_count = 0
    severity_weights = {"critical": 4, "high": 3, "moderate": 2, "medium": 2, "low": 1}

    for p in posts:
        created_str = p.get("created_at") or ""
        sla_h = int(p.get("sla_hours") or 48)
        created_dt = None
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S.%f"):
            try:
                created_dt = datetime.strptime(created_str.split(".")[0], fmt)
                break
            except Exception:
                pass

        if not created_dt:
            created_dt = now - timedelta(hours=14)

        deadline = created_dt + timedelta(hours=sla_h)
        remaining_seconds = (deadline - now).total_seconds()
        remaining_hours = remaining_seconds / 3600.0

        p["sla_remaining_seconds"] = int(remaining_seconds)
        p["sla_remaining_hours"] = round(remaining_hours, 1)

        # SLA status string
        if p.get("status") == "Resolved":
            p["sla_label"] = "Resolved"
            p["sla_badge_class"] = "bg-emerald-100 text-emerald-800 border-emerald-200"
        elif remaining_seconds <= 0:
            p["sla_label"] = f"Breached ({abs(round(remaining_hours, 1))}h ago)"
            p["sla_badge_class"] = "bg-red-100 text-red-800 border-red-300 animate-pulse font-bold"
            sla_at_risk_count += 1
        elif remaining_hours < 12:
            p["sla_label"] = f"Urgent ({round(remaining_hours, 1)}h left)"
            p["sla_badge_class"] = "bg-amber-100 text-amber-900 border-amber-300 font-bold"
            sla_at_risk_count += 1
        else:
            p["sla_label"] = f"{int(remaining_hours)}h remaining"
            p["sla_badge_class"] = "bg-slate-100 text-slate-700 border-slate-200"

        p["severity_weight"] = severity_weights.get(str(p.get("severity", "")).lower(), 1)

    # Sort prioritized list: Active issues first, then highest severity, then closest deadline
    sorted_posts = sorted(
        posts,
        key=lambda x: (
            0 if x.get("status") == "Resolved" else 1,
            x.get("severity_weight", 1),
            -x.get("sla_remaining_seconds", 0),
        ),
        reverse=True,
    )

    # Department breakdown
    dept_counts: Dict[str, int] = {}
    for p in posts:
        dept = p.get("department") or "Other"
        dept_counts[dept] = dept_counts.get(dept, 0) + 1

    resolution_rate = (
        round((len(resolved_posts) / total_posts * 100), 1) if total_posts > 0 else 0.0
    )

    return {
        "total_posts": total_posts,
        "total_active_issues": len(active_posts),
        "resolved_count": len(resolved_posts),
        "critical_count": critical_count,
        "high_count": high_count,
        "critical_high_count": critical_count + high_count,
        "unassigned_count": unassigned_count,
        "sla_at_risk_count": sla_at_risk_count,
        "resolution_rate": resolution_rate,
        "department_breakdown": dept_counts,
        "prioritized_posts": sorted_posts,
    }


def get_technician_jobs_and_bids(worker_phone: str) -> dict:
    """
    Retrieves technician workspace data:
    - Active bids (Pending or Countered)
    - Confirmed contracts and total earnings
    - Open household leads available for quoting
    """
    clean_phone = worker_phone.strip()

    with db_lock:
        cursor = conn.cursor()

        # 1. Active Bids by this worker
        cursor.execute(
            """
            SELECT b.id AS bid_id, b.job_id, b.worker_name, b.worker_phone,
                   b.bid_amount, b.counter_amount, b.status AS bid_status,
                   b.created_at AS bid_created_at,
                   j.title AS job_title, j.description AS job_description,
                   j.category AS job_category, j.media_url, j.location_city,
                   j.estimated_price, j.status AS job_status, j.final_price
            FROM service_bids b
            JOIN service_jobs j ON b.job_id = j.id
            WHERE b.worker_phone = ? AND b.status IN ('Pending', 'Countered')
            ORDER BY b.created_at DESC;
            """,
            (clean_phone,),
        )
        active_bids = [dict(r) for r in cursor.fetchall()]

        # 2. Confirmed Jobs for this worker
        cursor.execute(
            """
            SELECT j.*, b.bid_amount, b.counter_amount, b.worker_name
            FROM service_jobs j
            LEFT JOIN service_bids b ON j.id = b.job_id AND b.worker_phone = ? AND b.status = 'Accepted'
            WHERE j.status = 'Confirmed' AND (j.assigned_worker_phone = ? OR b.id IS NOT NULL)
            ORDER BY j.created_at DESC;
            """,
            (clean_phone, clean_phone),
        )
        confirmed_jobs = [dict(r) for r in cursor.fetchall()]

        # 3. Available Leads (Open or Negotiating jobs)
        cursor.execute(
            """
            SELECT j.*, COUNT(b.id) AS total_bids
            FROM service_jobs j
            LEFT JOIN service_bids b ON j.id = b.job_id
            WHERE j.status IN ('Open', 'Negotiating')
            GROUP BY j.id
            ORDER BY j.created_at DESC;
            """
        )
        available_leads = [dict(r) for r in cursor.fetchall()]

    # Calculate total earnings from confirmed contracts
    total_earnings = 0
    for job in confirmed_jobs:
        fp = str(job.get("final_price") or "")
        digits = "".join(ch for ch in fp if ch.isdigit())
        if digits:
            total_earnings += int(digits)
        elif job.get("bid_amount"):
            total_earnings += int(job["bid_amount"])

    return {
        "worker_phone": clean_phone,
        "total_earnings": total_earnings,
        "active_bids": active_bids,
        "confirmed_jobs": confirmed_jobs,
        "available_leads": available_leads,
    }

