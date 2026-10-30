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

# Thread-safe re-entrant database lock for SQLite writes and nested queries
db_lock = threading.RLock()

# Persistent SQLite connection with check_same_thread=False
conn = sqlite3.connect(str(DB_PATH), check_same_thread=False, timeout=30.0)
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

        # 5. Users / Technicians Table (Reputation & Profile)
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                phone TEXT UNIQUE NOT NULL,
                role TEXT DEFAULT 'technician',
                trade TEXT,
                location TEXT,
                works_completed INTEGER DEFAULT 0,
                rating REAL DEFAULT 5.0,
                review_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """
        )

        # 6. Technician Reviews Table (Pillar 3 Reputation Mesh)
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS technician_reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                service_id INTEGER NOT NULL,
                technician_id INTEGER NOT NULL,
                citizen_name TEXT NOT NULL,
                rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
                review_text TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (technician_id) REFERENCES users(id)
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
        if "citizen_id" not in columns:
            cursor.execute("ALTER TABLE civic_posts ADD COLUMN citizen_id INTEGER DEFAULT 1;")
        if "citizen_name" not in columns:
            cursor.execute("ALTER TABLE civic_posts ADD COLUMN citizen_name TEXT DEFAULT 'Ayush Chauhan';")
        if "citizen_phone" not in columns:
            cursor.execute("ALTER TABLE civic_posts ADD COLUMN citizen_phone TEXT DEFAULT '+91 98765 43210';")
        if "officer_note" not in columns:
            cursor.execute("ALTER TABLE civic_posts ADD COLUMN officer_note TEXT DEFAULT '';")
        if "acknowledged_at" not in columns:
            cursor.execute("ALTER TABLE civic_posts ADD COLUMN acknowledged_at TIMESTAMP DEFAULT NULL;")
        if "resolved_at" not in columns:
            cursor.execute("ALTER TABLE civic_posts ADD COLUMN resolved_at TIMESTAMP DEFAULT NULL;")
        if "updated_at" not in columns:
            cursor.execute("ALTER TABLE civic_posts ADD COLUMN updated_at TIMESTAMP DEFAULT NULL;")

        cursor.execute("PRAGMA table_info(service_jobs);")
        job_cols = [row[1] for row in cursor.fetchall()]
        if "assigned_worker_phone" not in job_cols:
            cursor.execute("ALTER TABLE service_jobs ADD COLUMN assigned_worker_phone TEXT DEFAULT NULL;")
        if "citizen_id" not in job_cols:
            cursor.execute("ALTER TABLE service_jobs ADD COLUMN citizen_id INTEGER DEFAULT 1;")
        if "citizen_name" not in job_cols:
            cursor.execute("ALTER TABLE service_jobs ADD COLUMN citizen_name TEXT DEFAULT 'Ayush Chauhan';")
        if "citizen_phone" not in job_cols:
            cursor.execute("ALTER TABLE service_jobs ADD COLUMN citizen_phone TEXT DEFAULT '+91 98765 43210';")
        if "citizen_address" not in job_cols:
            cursor.execute("ALTER TABLE service_jobs ADD COLUMN citizen_address TEXT DEFAULT 'Hostel Block B, Sector 62';")
        if "preferred_slot" not in job_cols:
            cursor.execute("ALTER TABLE service_jobs ADD COLUMN preferred_slot TEXT DEFAULT 'Today, 4:00 PM - 6:00 PM';")

        # Backfill default values for existing rows
        cursor.execute("UPDATE service_jobs SET citizen_name = 'Ayush Chauhan' WHERE citizen_name IS NULL OR citizen_name = '';")
        cursor.execute("UPDATE service_jobs SET citizen_phone = '+91 98765 43210' WHERE citizen_phone IS NULL OR citizen_phone = '';")
        cursor.execute("UPDATE service_jobs SET citizen_address = 'Hostel Block B, Sector 62' WHERE citizen_address IS NULL OR citizen_address = '';")
        cursor.execute("UPDATE service_jobs SET preferred_slot = 'Today, 4:00 PM - 6:00 PM' WHERE preferred_slot IS NULL OR preferred_slot = '';")
        cursor.execute("UPDATE civic_posts SET citizen_name = 'Ayush Chauhan' WHERE citizen_name IS NULL OR citizen_name = '';")
        cursor.execute("UPDATE civic_posts SET citizen_phone = '+91 98765 43210' WHERE citizen_phone IS NULL OR citizen_phone = '';")
        cursor.execute("UPDATE civic_posts SET status = 'IN_PROGRESS', assigned_officer = 'Squad Alpha (Inspector V. Sharma)', officer_note = 'Gravel patching crew dispatched on site. Work order #NOI-94821 in execution.' WHERE id = 'post-demo-001';")
        cursor.execute("UPDATE civic_posts SET status = 'ACKNOWLEDGED', assigned_officer = 'Sanitation Zone 3', officer_note = 'Ticket acknowledged by Ward Officer. Compact truck scheduled for immediate clearance.' WHERE id = 'post-demo-002';")
        cursor.execute("UPDATE civic_posts SET status = 'REPORTED', assigned_officer = 'Unassigned', officer_note = 'Pending review by Electrical Division supervisor.' WHERE id = 'post-demo-003';")
        cursor.execute("UPDATE civic_posts SET image_url = '/static/images/demo/dark_streetlight.jpg' WHERE id = 'post-demo-005';")
        cursor.execute("UPDATE civic_posts SET image_url = '/static/images/demo/open_manhole.jpg' WHERE id = 'post-demo-006';")
        cursor.execute("UPDATE civic_posts SET image_url = '/static/images/demo/broken_sidewalk.jpg' WHERE id = 'post-demo-007';")
        cursor.execute("UPDATE civic_posts SET image_url = '/static/images/demo/sewer_overflow.jpg' WHERE id = 'post-demo-008';")
        cursor.execute("UPDATE civic_posts SET image_url = '/static/images/demo/fallen_tree.jpg' WHERE id = 'post-demo-009';")
        cursor.execute("UPDATE civic_posts SET image_url = '/static/images/demo/construction_debris.jpg' WHERE id = 'post-demo-010';")

        # Dynamic Schema Migrations for service_bids
        cursor.execute("PRAGMA table_info(service_bids);")
        bid_cols = [row[1] for row in cursor.fetchall()]
        if "service_id" not in bid_cols:
            cursor.execute("ALTER TABLE service_bids ADD COLUMN service_id TEXT DEFAULT NULL;")
        if "technician_id" not in bid_cols:
            cursor.execute("ALTER TABLE service_bids ADD COLUMN technician_id INTEGER DEFAULT 1;")
        if "technician_name" not in bid_cols:
            cursor.execute("ALTER TABLE service_bids ADD COLUMN technician_name TEXT DEFAULT NULL;")
        if "technician_trade" not in bid_cols:
            cursor.execute("ALTER TABLE service_bids ADD COLUMN technician_trade TEXT DEFAULT 'General Repair';")
        if "initial_bid" not in bid_cols:
            cursor.execute("ALTER TABLE service_bids ADD COLUMN initial_bid REAL DEFAULT NULL;")
        if "current_amount" not in bid_cols:
            cursor.execute("ALTER TABLE service_bids ADD COLUMN current_amount REAL DEFAULT NULL;")
        if "last_action_by" not in bid_cols:
            cursor.execute("ALTER TABLE service_bids ADD COLUMN last_action_by TEXT DEFAULT 'TECHNICIAN';")
        if "notes" not in bid_cols:
            cursor.execute("ALTER TABLE service_bids ADD COLUMN notes TEXT DEFAULT '';")
        if "updated_at" not in bid_cols:
            cursor.execute("ALTER TABLE service_bids ADD COLUMN updated_at TIMESTAMP DEFAULT NULL;")

        # Migrations for civic_posts
        if "ward" not in columns:
            cursor.execute("ALTER TABLE civic_posts ADD COLUMN ward TEXT DEFAULT NULL;")
        if "upvotes_count" not in columns:
            cursor.execute("ALTER TABLE civic_posts ADD COLUMN upvotes_count INTEGER DEFAULT 0;")

        # Backfill service_bids
        cursor.execute("UPDATE service_bids SET service_id = job_id WHERE service_id IS NULL;")
        cursor.execute("UPDATE service_bids SET initial_bid = bid_amount WHERE initial_bid IS NULL;")
        cursor.execute("UPDATE service_bids SET current_amount = COALESCE(counter_amount, bid_amount) WHERE current_amount IS NULL;")
        cursor.execute("UPDATE service_bids SET technician_name = worker_name WHERE technician_name IS NULL;")
        cursor.execute("UPDATE service_bids SET last_action_by = CASE WHEN UPPER(status) = 'COUNTERED' THEN 'CITIZEN' ELSE 'TECHNICIAN' END WHERE last_action_by IS NULL;")
        cursor.execute("UPDATE service_bids SET status = UPPER(status);")

        # Backfill civic_posts
        cursor.execute("UPDATE civic_posts SET ward = location_city WHERE ward IS NULL;")
        cursor.execute("UPDATE civic_posts SET upvotes_count = upvotes WHERE upvotes_count IS NULL OR upvotes_count = 0;")

        cursor.execute("PRAGMA table_info(users);")
        user_cols = [row[1] for row in cursor.fetchall()]
        if user_cols:
            if "works_completed" not in user_cols:
                cursor.execute("ALTER TABLE users ADD COLUMN works_completed INTEGER DEFAULT 0;")
            if "rating" not in user_cols:
                cursor.execute("ALTER TABLE users ADD COLUMN rating REAL DEFAULT 5.0;")
            if "review_count" not in user_cols:
                cursor.execute("ALTER TABLE users ADD COLUMN review_count INTEGER DEFAULT 0;")

        # Seed default technicians and reviews if empty
        cursor.execute("SELECT COUNT(*) AS count FROM users WHERE role = 'technician';")
        if cursor.fetchone()["count"] == 0:
            demo_technicians = [
                (1, "Ramesh Kumar", "+91 98765 43210", "technician", "Electrician & Plumber", "Sector 62, Noida", 24, 4.9, 3),
                (2, "Santosh Plumber", "+91 91234 56789", "technician", "Sanitary & Drainage", "Indirapuram, Ghaziabad", 15, 4.8, 2),
                (3, "Sharma Electrician", "+91 99887 76655", "technician", "High Voltage Specialist", "Delhi NCR", 31, 5.0, 2),
            ]
            cursor.executemany(
                """
                INSERT OR IGNORE INTO users (id, name, phone, role, trade, location, works_completed, rating, review_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
                """,
                demo_technicians,
            )

            demo_reviews = [
                (1, 1, "Ananya Sen", 5, "Ramesh fixed the water tank overflow within 30 minutes! Very honest with parts pricing and clean workmanship."),
                (2, 1, "Rajiv Mehra", 5, "Excellent electrical repair on the MCB board. Clean work and no overcharging. Recommended!"),
                (3, 1, "Sunita Sharma", 5, "Punctual and courteous. Replaced the kitchen sink u-trap cleanly. Rate was completely transparent."),
                (1, 2, "Deepak Roy", 5, "Diagnosed the hidden bathroom drainage clog quickly. Fair quotation without any surprise charges."),
                (3, 2, "Meenakshi Iyer", 4, "Good piping work. Cleaned up the terrace area properly after completing the job."),
                (2, 3, "Harish Verma", 5, "Master electrician. Fixed 3-phase AC wiring safely with proper insulation tape and test lamp."),
                (2, 3, "Rohit Aggarwal", 5, "Aadhaar verified professional. Transparent meter check and gave receipt."),
            ]
            cursor.executemany(
                """
                INSERT OR IGNORE INTO technician_reviews (service_id, technician_id, citizen_name, rating, review_text)
                VALUES (?, ?, ?, ?, ?);
                """,
                demo_reviews,
            )

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

    if item.get("upvotes_count") is None:
        item["upvotes_count"] = item.get("upvotes") or 0
    if item.get("upvotes") is None:
        item["upvotes"] = item.get("upvotes_count") or 0
    if not item.get("ward"):
        item["ward"] = item.get("location_city") or "Noida"
    if not item.get("author_name"):
        item["author_name"] = item.get("citizen_name") or "Resident"
    if not item.get("citizen_name"):
        item["citizen_name"] = item.get("author_name") or "Resident"
    if not item.get("ai_hazard_category"):
        item["ai_hazard_category"] = item.get("department") or "Civic"
    if not item.get("ai_urgency"):
        item["ai_urgency"] = item.get("severity") or "Moderate"
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

    citizen_id = int(post_data.get("citizen_id") or 1)
    citizen_name = post_data.get("citizen_name") or "Ayush Chauhan"
    citizen_phone = post_data.get("citizen_phone") or "+91 98765 43210"
    officer_note = post_data.get("officer_note") or ""

    with db_lock:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO civic_posts (
                id, title, description, image_url, location_city,
                lat, lng, department, severity, is_local,
                external_portals, upvotes, urgent_flags, status,
                assigned_officer, sla_hours, citizen_id, citizen_name,
                citizen_phone, officer_note
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
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
                citizen_id,
                citizen_name,
                citizen_phone,
                officer_note,
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
            "UPDATE civic_posts SET upvotes = upvotes + 1, upvotes_count = upvotes_count + 1 WHERE id = ?;",
            (post_id,),
        )
        conn.commit()
        cursor.execute("SELECT upvotes, upvotes_count FROM civic_posts WHERE id = ?;", (post_id,))
        row = cursor.fetchone()
        if not row:
            return 1
        return row["upvotes_count"] if row["upvotes_count"] is not None else (row["upvotes"] or 1)


def get_civic_feed_posts(
    filter_type: Optional[str] = "all",
    citizen_id: Optional[int] = None,
    sort_by: Optional[str] = "newest",
) -> list[dict]:
    """Retrieve civic feed posts for community social feed or personal reported grievances."""
    with db_lock:
        cursor = conn.cursor()
        order_clause = "ORDER BY upvotes_count DESC, created_at DESC" if sort_by == "upvoted" else "ORDER BY created_at DESC"
        if (filter_type or "").lower() == "mine":
            cid = citizen_id or 1
            cursor.execute(f"SELECT * FROM civic_posts WHERE citizen_id = ? {order_clause};", (cid,))
        else:
            cursor.execute(f"SELECT * FROM civic_posts {order_clause};")
        rows = cursor.fetchall()
        posts = [_format_post(r) for r in rows]

    for p in posts:
        p["comments"] = get_comments(p["id"])
    return posts


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
    citizen_id = int(job_data.get("citizen_id") or 1)
    citizen_name = job_data.get("citizen_name") or "Ayush Chauhan"
    citizen_phone = job_data.get("citizen_phone") or "+91 98765 43210"
    citizen_address = job_data.get("citizen_address") or job_data.get("location_city") or "Hostel Block B, Sector 62"
    preferred_slot = job_data.get("preferred_slot") or "Today, 4:00 PM - 6:00 PM"

    with db_lock:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO service_jobs (
                id, title, description, category, media_url,
                location_city, estimated_price, final_price, status,
                citizen_id, citizen_name, citizen_phone, citizen_address, preferred_slot
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
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
                citizen_id,
                citizen_name,
                citizen_phone,
                citizen_address,
                preferred_slot,
            ),
        )
        conn.commit()

    created = get_service_job_by_id(job_id)
    if not created:
        raise RuntimeError(f"Failed to create service job {job_id}")
    return created


def _format_bid_record(r: Union[sqlite3.Row, dict]) -> dict:
    b = dict(r)
    if b.get("initial_bid") is None:
        b["initial_bid"] = b.get("bid_amount") or 0
    if b.get("current_amount") is None:
        b["current_amount"] = b.get("counter_amount") or b.get("bid_amount") or 0
    if not b.get("technician_name"):
        b["technician_name"] = b.get("worker_name") or "Verified Technician"
    if not b.get("worker_name"):
        b["worker_name"] = b["technician_name"]
    if not b.get("service_id"):
        b["service_id"] = b.get("job_id")
    if not b.get("job_id"):
        b["job_id"] = b.get("service_id")
    if not b.get("last_action_by"):
        b["last_action_by"] = "CITIZEN" if (b.get("status") or "").upper() == "COUNTERED" else "TECHNICIAN"
    b["status"] = (b.get("status") or "PENDING").upper()
    if b.get("rating") is None:
        b["rating"] = 5.0
    if b.get("review_count") is None:
        b["review_count"] = 0
    if b.get("works_completed") is None:
        b["works_completed"] = 0
    return b


def get_bids_for_job(job_id: str) -> list[dict]:
    """Retrieve all bids for a given job ordered by creation date."""
    with db_lock:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT b.*,
                   u.rating, u.review_count, u.works_completed, u.trade AS user_trade,
                   j.citizen_phone, j.citizen_name, j.title AS job_title
            FROM service_bids b
            LEFT JOIN users u ON b.technician_id = u.id
            LEFT JOIN service_jobs j ON (b.job_id = j.id OR b.service_id = j.id)
            WHERE b.job_id = ? OR b.service_id = ?
            ORDER BY b.created_at ASC;
            """,
            (job_id, job_id),
        )
        rows = cursor.fetchall()
        return [_format_bid_record(r) for r in rows]


def get_bid_by_id(bid_id: str) -> Optional[dict]:
    """Retrieve a single bid by its ID."""
    with db_lock:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT b.*,
                   u.rating, u.review_count, u.works_completed, u.trade AS user_trade,
                   j.citizen_phone, j.citizen_name, j.title AS job_title
            FROM service_bids b
            LEFT JOIN users u ON b.technician_id = u.id
            LEFT JOIN service_jobs j ON (b.job_id = j.id OR b.service_id = j.id)
            WHERE b.id = ?;
            """,
            (bid_id,),
        )
        row = cursor.fetchone()
        return _format_bid_record(row) if row else None


def create_bid(
    job_id: str,
    worker_name: str = "Verified Technician",
    worker_phone: str = "+91 98450 12345",
    bid_amount: float = 350.0,
    notes: str = "",
    technician_id: int = 1,
    technician_trade: str = "General Repair",
) -> dict:
    """Create a new service bid on a job and update job status to Negotiating."""
    bid_id = str(uuid.uuid4())
    numeric_amount = float(bid_amount)
    with db_lock:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO service_bids (
                id, job_id, service_id, worker_name, technician_name, worker_phone,
                technician_id, technician_trade, bid_amount, initial_bid, current_amount,
                last_action_by, status, notes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'TECHNICIAN', 'PENDING', ?);
            """,
            (
                bid_id, job_id, job_id, worker_name, worker_name, worker_phone,
                technician_id, technician_trade, int(numeric_amount), numeric_amount, numeric_amount,
                notes or "",
            ),
        )
        # Update parent job status to Negotiating if not confirmed
        cursor.execute(
            "UPDATE service_jobs SET status = 'Negotiating' WHERE id = ? AND status NOT IN ('Confirmed', 'IN_PROGRESS');",
            (job_id,),
        )
        conn.commit()

    created = get_bid_by_id(bid_id)
    if not created:
        raise RuntimeError(f"Failed to create bid {bid_id}")
    return created


def counter_bid(bid_id: str, counter_amount: float, actor_role: str = "CITIZEN") -> dict:
    """Submit a two-way counter offer for a service bid."""
    role = (actor_role or "CITIZEN").upper()
    numeric_counter = float(counter_amount)
    with db_lock:
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE service_bids
            SET counter_amount = ?, current_amount = ?, last_action_by = ?, status = 'COUNTERED', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?;
            """,
            (int(numeric_counter), numeric_counter, role, bid_id),
        )
        conn.commit()

    updated = get_bid_by_id(bid_id)
    if not updated:
        raise ValueError(f"Bid not found with id: {bid_id}")
    return updated


def accept_bid(bid_id: str, job_id: Optional[str] = None, final_price: Optional[str] = None) -> dict:
    """Accept a worker bid, confirm the job, and update final negotiated price."""
    with db_lock:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM service_bids WHERE id = ?;", (bid_id,))
        row = cursor.fetchone()
        if not row:
            raise ValueError(f"Bid not found with id: {bid_id}")
        bid = dict(row)

        resolved_job_id = job_id or bid["job_id"] or bid["service_id"]
        worker_phone = bid["worker_phone"]
        tech_id = bid.get("technician_id") or 1
        price_val = bid.get("current_amount") or bid.get("counter_amount") or bid.get("bid_amount") or 0
        resolved_price = final_price or f"₹{int(price_val)}"

        # Accept selected bid
        cursor.execute(
            "UPDATE service_bids SET status = 'ACCEPTED', updated_at = CURRENT_TIMESTAMP WHERE id = ?;",
            (bid_id,),
        )
        # Mark other bids for this job as REJECTED
        cursor.execute(
            "UPDATE service_bids SET status = 'REJECTED', updated_at = CURRENT_TIMESTAMP WHERE (job_id = ? OR service_id = ?) AND id != ?;",
            (resolved_job_id, resolved_job_id, bid_id),
        )
        # Update job status to IN_PROGRESS, final price, and assigned worker phone
        cursor.execute(
            """
            UPDATE service_jobs
            SET status = 'IN_PROGRESS', final_price = ?, assigned_worker_phone = ?
            WHERE id = ?;
            """,
            (resolved_price, worker_phone, resolved_job_id),
        )
        # Increment completed jobs count for the technician
        cursor.execute(
            "UPDATE users SET works_completed = works_completed + 1 WHERE id = ?;",
            (tech_id,),
        )
        conn.commit()

    updated_bid = get_bid_by_id(bid_id)
    updated_job = get_service_job_by_id(resolved_job_id)
    if not updated_bid:
        raise ValueError(f"Bid not found with id: {bid_id}")
    return {"bid": updated_bid, "job": updated_job, "status": "success", "final_price": resolved_price}


def seed_initial_data() -> None:
    """Seed realistic Indian demo data for civic posts and service jobs if empty."""
    with db_lock:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM civic_posts;")
        existing_post_ids = {r["id"] for r in cursor.fetchall()}

        cursor.execute("SELECT COUNT(*) AS count FROM service_jobs;")
        jobs_count = cursor.fetchone()["count"]

    # Seed 10 realistic Indian municipal concerns across multiple citizen personas and wards
    demo_posts = [
        {
            "id": "post-demo-001",
            "title": "Deep Monsoon Pothole with Exposed Gravel (NH-24)",
            "description": (
                "Dangerous crater-sized pothole on the NH-24 service corridor towards electronic city roundabout. "
                "Two-wheelers frequently skid during waterlogging, causing immediate hazard for daily commuters."
            ),
            "image_url": "/static/images/demo/pothole.jpg",
            "location_city": "NH-24 Corridor, Ghaziabad",
            "ward": "Ward 12, NH-24 Bypass",
            "lat": 28.6271,
            "lng": 77.3617,
            "department": "Road & Infrastructure",
            "severity": "High",
            "is_local": 1,
            "external_portals": ["CPGRAMS", "UP Jansunwai", "NHAI Citizen Portal"],
            "upvotes": 49,
            "upvotes_count": 49,
            "urgent_flags": 14,
            "status": "IN_PROGRESS",
            "assigned_officer": "Squad Alpha (Inspector V. Sharma)",
            "sla_hours": 48,
            "citizen_id": 2,
            "citizen_name": "Rahul Verma",
            "citizen_phone": "+91 98100 11223",
            "officer_note": "Gravel patching crew dispatched on site. Work order #NOI-94821 in execution.",
        },
        {
            "id": "post-demo-002",
            "title": "Overflowing Garbage Compactor Near School Gate (Ward 8)",
            "description": (
                "Community garbage compactor near Shipra Mall primary school has not been cleared for 4 days. "
                "Stray cattle are scattering plastic bags across the road, and the stench severely impacts students."
            ),
            "image_url": "/static/images/demo/garbage.jpg",
            "location_city": "Indirapuram Market",
            "ward": "Ward 8, Indirapuram",
            "lat": 28.6434,
            "lng": 77.3752,
            "department": "Sanitation & Waste Management",
            "severity": "Critical",
            "is_local": 1,
            "external_portals": ["Swachhata-MoHUA", "Nagar Nigam Ghaziabad Portal"],
            "upvotes": 68,
            "upvotes_count": 68,
            "urgent_flags": 27,
            "status": "ACKNOWLEDGED",
            "assigned_officer": "Sanitation Zone 3",
            "sla_hours": 24,
            "citizen_id": 3,
            "citizen_name": "Priya Sharma",
            "citizen_phone": "+91 98200 22334",
            "officer_note": "Ticket acknowledged by Ward Officer. Compact truck scheduled for immediate clearance.",
        },
        {
            "id": "post-demo-003",
            "title": "Dangling Live Overhead Power Cable on Main Road",
            "description": (
                "Snapped high-tension overhead cable hanging 4 feet above pedestrian sidewalk. Sparks noticed during morning dew. "
                "Extremely hazardous for school children and morning joggers."
            ),
            "image_url": "/static/images/demo/utility_pole.jpg",
            "location_city": "Block C, Sector 18",
            "ward": "Block C, Sector 18",
            "lat": 28.6315,
            "lng": 77.3168,
            "department": "Electrical & Public Lighting",
            "severity": "Critical",
            "is_local": 1,
            "external_portals": ["BSES Complaints", "UPPCL Discom Portal"],
            "upvotes": 34,
            "upvotes_count": 34,
            "urgent_flags": 12,
            "status": "REPORTED",
            "assigned_officer": "Unassigned",
            "sla_hours": 24,
            "citizen_id": 4,
            "citizen_name": "Vikramaditya Rao",
            "citizen_phone": "+91 98300 33445",
            "officer_note": "Pending review by Electrical Division supervisor.",
        },
        {
            "id": "post-demo-004",
            "title": "Broken Water Supply Main Line Flooding Road",
            "description": (
                "300mm drinking water distribution main ruptured under asphalt. Thousands of liters potable water wasting per hour "
                "while residential colony faces zero pressure."
            ),
            "image_url": "/static/images/demo/drain_leak.jpg",
            "location_city": "Sector 14 Main Road",
            "ward": "Sector 14, Ward 5",
            "lat": 28.6350,
            "lng": 77.3400,
            "department": "Water Supply & Drainage",
            "severity": "High",
            "is_local": 1,
            "external_portals": ["Jal Board Portal", "Noida Authority Citizen App"],
            "upvotes": 56,
            "upvotes_count": 56,
            "urgent_flags": 19,
            "status": "IN_PROGRESS",
            "assigned_officer": "Er. R. Mathur - Jal Board",
            "sla_hours": 48,
            "citizen_id": 1,
            "citizen_name": "Ayush Chauhan",
            "citizen_phone": "+91 98765 43210",
            "officer_note": "Jal Board emergency valve team on-site isolating ruptured line.",
        },
        {
            "id": "post-demo-005",
            "title": "Inactive Streetlights Causing Dark Stretch at Night",
            "description": (
                "A 400m stretch on Link Road has 8 consecutive defunct sodium lamps. Complete darkness creates severe security risk "
                "for women and cyclists after 8 PM."
            ),
            "image_url": "/static/images/demo/dark_streetlight.jpg",
            "location_city": "Anand Vihar Link Road",
            "ward": "Ward 16, Link Road",
            "lat": 28.6410,
            "lng": 77.3200,
            "department": "Electrical & Public Lighting",
            "severity": "Moderate",
            "is_local": 1,
            "external_portals": ["MCD 311", "Delhi Traffic Police"],
            "upvotes": 27,
            "upvotes_count": 27,
            "urgent_flags": 6,
            "status": "REPORTED",
            "assigned_officer": "Unassigned",
            "sla_hours": 72,
            "citizen_id": 5,
            "citizen_name": "Ananya Deshmukh",
            "citizen_phone": "+91 98400 44556",
            "officer_note": "Scheduled for night audit by electrical squad.",
        },
        {
            "id": "post-demo-006",
            "title": "Open Manhole Hazard Near Children Playground",
            "description": (
                "Concrete manhole cover broken into storm drain. Opening is 3 feet wide adjacent to children swing area. "
                "Immediate barricading and replacement cover required."
            ),
            "image_url": "/static/images/demo/open_manhole.jpg",
            "location_city": "Sector 62 Community Park",
            "ward": "Sector 62, Ward 9",
            "lat": 28.6289,
            "lng": 77.3670,
            "department": "Road & Infrastructure",
            "severity": "Critical",
            "is_local": 1,
            "external_portals": ["Noida Authority Citizen App", "UP Jansunwai"],
            "upvotes": 82,
            "upvotes_count": 82,
            "urgent_flags": 31,
            "status": "RESOLVED",
            "assigned_officer": "Inspector V. Sharma - Zone 4",
            "sla_hours": 24,
            "citizen_id": 1,
            "citizen_name": "Ayush Chauhan",
            "citizen_phone": "+91 98765 43210",
            "officer_note": "Heavy reinforced cast iron cover installed and barricade removed.",
        },
        {
            "id": "post-demo-007",
            "title": "Collapsed Pedestrian Sidewalk and Exposed Curbstones",
            "description": (
                "Heavy rains caused 30 feet of pedestrian footpath pavers to cave in. Senior citizens and strollers forced onto busy vehicular road."
            ),
            "image_url": "/static/images/demo/broken_sidewalk.jpg",
            "location_city": "Raj Nagar Extension",
            "ward": "Raj Nagar Ext, Ward 22",
            "lat": 28.6900,
            "lng": 77.4100,
            "department": "Road & Infrastructure",
            "severity": "Moderate",
            "is_local": 1,
            "external_portals": ["UP Jansunwai", "Ghaziabad Nagar Nigam"],
            "upvotes": 18,
            "upvotes_count": 18,
            "urgent_flags": 4,
            "status": "REPORTED",
            "assigned_officer": "Unassigned",
            "sla_hours": 72,
            "citizen_id": 6,
            "citizen_name": "Rohan Kapoor",
            "citizen_phone": "+91 98500 55667",
            "officer_note": "Surveyed by junior engineer for curb realignment.",
        },
        {
            "id": "post-demo-008",
            "title": "Burst Sewer Drain Spreading Foul Sludge Across Market",
            "description": (
                "Sewer line clogged with commercial waste, overflowing onto shopping arcade walkway. Intense bio-hazard and breeding ground for flies."
            ),
            "image_url": "/static/images/demo/sewer_overflow.jpg",
            "location_city": "Vaishali Sector 4",
            "ward": "Vaishali Sector 4, Ward 7",
            "lat": 28.6470,
            "lng": 77.3410,
            "department": "Sanitation & Waste Management",
            "severity": "High",
            "is_local": 1,
            "external_portals": ["Swachhata-MoHUA", "Nagar Nigam Ghaziabad Portal"],
            "upvotes": 41,
            "upvotes_count": 41,
            "urgent_flags": 15,
            "status": "ACKNOWLEDGED",
            "assigned_officer": "Sanitation Squad B",
            "sla_hours": 48,
            "citizen_id": 7,
            "citizen_name": "Sunita Iyer",
            "citizen_phone": "+91 98600 66778",
            "officer_note": "Suction jetting machine dispatched to clear blockage.",
        },
        {
            "id": "post-demo-009",
            "title": "Fallen Tree Branch Blocking School Bus Route",
            "description": (
                "Storm-damaged banyan tree limb collapsed across two-lane access road. School buses and ambulances unable to pass."
            ),
            "image_url": "/static/images/demo/fallen_tree.jpg",
            "location_city": "Vasundhara Sector 11",
            "ward": "Vasundhara Sector 11, Ward 3",
            "lat": 28.6620,
            "lng": 77.3710,
            "department": "Horticulture & Public Works",
            "severity": "High",
            "is_local": 1,
            "external_portals": ["UP Forest & Urban Services", "UP 112"],
            "upvotes": 23,
            "upvotes_count": 23,
            "urgent_flags": 8,
            "status": "RESOLVED",
            "assigned_officer": "Horticulture Rapid Team",
            "sla_hours": 24,
            "citizen_id": 8,
            "citizen_name": "Arjun Nair",
            "citizen_phone": "+91 98700 77889",
            "officer_note": "Tree trunk chopped and removed from roadway. Traffic normal.",
        },
        {
            "id": "post-demo-010",
            "title": "Hazardous Construction Debris Dump on Bicycle Lane",
            "description": (
                "Unlicensed dumping of concrete blocks, sharp tiles, and iron rods obstructing the bicycle corridor. Causes puncture hazards and narrows traffic."
            ),
            "image_url": "/static/images/demo/construction_debris.jpg",
            "location_city": "Indirapuram Green Corridor",
            "ward": "Ward 11, Indirapuram",
            "lat": 28.6400,
            "lng": 77.3800,
            "department": "Sanitation & Waste Management",
            "severity": "Moderate",
            "is_local": 1,
            "external_portals": ["CPGRAMS", "UP Jansunwai"],
            "upvotes": 35,
            "upvotes_count": 35,
            "urgent_flags": 7,
            "status": "REPORTED",
            "assigned_officer": "Unassigned",
            "sla_hours": 72,
            "citizen_id": 1,
            "citizen_name": "Ayush Chauhan",
            "citizen_phone": "+91 98765 43210",
            "officer_note": "Notice issued to nearby builder to clear rubble within 48h.",
        },
    ]

    for post in demo_posts:
        if post["id"] not in existing_post_ids:
            create_civic_post(post)

    # Seed starter comments for posts if missing
    demo_comments = [
        ("post-demo-001", "Aarav Sharma", "Two bike riders slipped here yesterday during the evening drizzle! Needs urgent gravel patching."),
        ("post-demo-001", "Pooja Verma", "Raised grievance ticket on Noida Authority citizen portal as well (#NOI-94821). Upvoted!"),
        ("post-demo-002", "Rajesh Gupta (RWA Sec)", "Sanitation truck missed morning round 3 days in a row. It is breeding dengue mosquitoes."),
        ("post-demo-002", "Neha Saxena", "Tagged Nagar Nigam Ghaziabad commissioner on Twitter/X with photos."),
        ("post-demo-003", "Vikas Malhotra", "Pole number is BSES-DL-412. It's very risky for women walking from the bus stop."),
        ("post-demo-004", "Manish Tiwari", "Water supply line has been leaking since 5 AM. Please close the main feeder valve!"),
        ("post-demo-006", "Kavita Sethi", "My 7-year old was playing right near this crater! Very dangerous situation."),
        ("post-demo-008", "Deepak Mittal", "Market shopkeepers have placed makeshift wooden planks to cross the sewer overflow."),
    ]

    for post_id, author, comment in demo_comments:
        with db_lock:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) AS c FROM civic_comments WHERE post_id = ? AND author = ?;", (post_id, author))
            if cursor.fetchone()["c"] == 0:
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
    officer_note: Optional[str] = None,
) -> Optional[dict]:
    """
    Updates the multi-stage operational lifecycle status ('REPORTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED'),
    officer inspection notes, audit timestamps, and field inspector assignment for a civic grievance.
    """
    canonical_status = status.strip()
    status_upper = canonical_status.upper().replace(" ", "_").replace("-", "_")
    if status_upper in ("REPORTED",):
        canonical_status = "REPORTED"
    elif status_upper in ("ACKNOWLEDGED", "ASSIGNED"):
        canonical_status = "ACKNOWLEDGED"
    elif status_upper in ("IN_PROGRESS", "INPROGRESS", "RESOLVING"):
        canonical_status = "IN_PROGRESS"
    elif status_upper in ("RESOLVED",):
        canonical_status = "RESOLVED"

    with db_lock:
        cursor = conn.cursor()
        updates = ["status = ?", "updated_at = CURRENT_TIMESTAMP"]
        params: list[Any] = [canonical_status]

        if assigned_officer is not None:
            updates.append("assigned_officer = ?")
            params.append(assigned_officer)

        if officer_note is not None:
            updates.append("officer_note = ?")
            params.append(officer_note)

        if canonical_status == "ACKNOWLEDGED":
            updates.append("acknowledged_at = CURRENT_TIMESTAMP")
        elif canonical_status == "RESOLVED":
            updates.append("resolved_at = CURRENT_TIMESTAMP")

        params.append(post_id)
        sql = f"UPDATE civic_posts SET {', '.join(updates)} WHERE id = ?;"
        cursor.execute(sql, tuple(params))
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
            SELECT b.id AS bid_id, b.id, b.job_id, b.worker_name, b.worker_phone,
                   b.bid_amount, b.initial_bid, b.counter_amount, b.current_amount,
                   b.last_action_by, b.status, b.status AS bid_status, b.notes,
                   b.created_at AS bid_created_at,
                   j.title AS job_title, j.description AS job_description,
                   j.category AS job_category, j.media_url, j.location_city,
                   j.citizen_name, j.citizen_phone, j.citizen_address,
                   j.estimated_price, j.status AS job_status, j.final_price
            FROM service_bids b
            JOIN service_jobs j ON b.job_id = j.id
            WHERE b.worker_phone = ? AND UPPER(b.status) IN ('PENDING', 'COUNTERED', 'ACCEPTED')
            ORDER BY b.created_at DESC;
            """,
            (clean_phone,),
        )
        active_bids = [dict(r) for r in cursor.fetchall()]

        # 2. Confirmed Jobs for this worker
        cursor.execute(
            """
            SELECT j.*, b.bid_amount, b.initial_bid, b.counter_amount, b.current_amount, b.worker_name, b.id AS bid_id
            FROM service_jobs j
            LEFT JOIN service_bids b ON j.id = b.job_id AND b.worker_phone = ? AND UPPER(b.status) = 'ACCEPTED'
            WHERE (UPPER(j.status) IN ('CONFIRMED', 'IN_PROGRESS') OR j.status IN ('Confirmed', 'In Progress'))
              AND (j.assigned_worker_phone = ? OR b.id IS NOT NULL)
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
            WHERE UPPER(j.status) IN ('OPEN', 'NEGOTIATING') OR j.status IN ('Open', 'Negotiating')
            GROUP BY j.id
            ORDER BY j.created_at DESC;
            """
        )
        available_leads = [dict(r) for r in cursor.fetchall()]

    for b in active_bids:
        if not b.get("citizen_locality"):
            b["citizen_locality"] = b.get("citizen_address") or b.get("location_city") or "Sector 62, Noida"
        if not b.get("current_amount"):
            b["current_amount"] = b.get("counter_amount") or b.get("bid_amount")
        if not b.get("bid_amount"):
            b["bid_amount"] = b.get("initial_bid") or b.get("current_amount")
        if not b.get("counter_amount") and b.get("last_action_by") == "CITIZEN":
            b["counter_amount"] = b.get("current_amount")
        if not b.get("id"):
            b["id"] = b.get("bid_id")

    for job in confirmed_jobs:
        if not job.get("final_price") and job.get("current_amount"):
            job["final_price"] = f"₹{job['current_amount']}"
        if not job.get("user_phone") and job.get("citizen_phone"):
            job["user_phone"] = job.get("citizen_phone")

    for job in available_leads:
        if not job.get("citizen_name"):
            job["citizen_name"] = "Ayush Chauhan"
        if not job.get("citizen_locality"):
            job["citizen_locality"] = job.get("citizen_address") or job.get("location_city") or "Hostel Block B, Sector 62"
        if not job.get("citizen_phone"):
            job["citizen_phone"] = "+91 98765 43210"
        if not job.get("preferred_slot"):
            job["preferred_slot"] = "Today, 4:00 PM - 6:00 PM"
        job["bids_count"] = job.get("total_bids") or 0

    # Calculate total earnings from confirmed contracts
    total_earnings = 0
    for job in confirmed_jobs:
        fp = str(job.get("final_price") or "")
        digits = "".join(ch for ch in fp if ch.isdigit())
        if digits:
            total_earnings += int(digits)
        elif job.get("bid_amount"):
            total_earnings += int(job["bid_amount"])

    # Query technician reputation profile
    tech_profile = get_technician_by_phone(clean_phone)
    if not tech_profile:
        # Fallback profile if phone not explicitly in users table yet
        tech_profile = {
            "id": 1,
            "name": "Verified Guild Technician",
            "phone": clean_phone,
            "role": "technician",
            "trade": "Household Services",
            "location": "Local Ward",
            "works_completed": len(confirmed_jobs),
            "rating": 5.0,
            "review_count": 0,
        }

    reviews = get_technician_reviews(tech_profile["id"]) if tech_profile else []

    return {
        "worker_phone": clean_phone,
        "total_earnings": total_earnings,
        "active_bids": active_bids,
        "confirmed_jobs": confirmed_jobs,
        "available_leads": available_leads,
        "profile": tech_profile,
        "rating": tech_profile.get("rating", 5.0),
        "review_count": tech_profile.get("review_count", len(reviews)),
        "works_completed": tech_profile.get("works_completed", len(confirmed_jobs)),
        "reviews": reviews,
    }


# ==============================================================================
# TECHNICIAN REPUTATION & RATING SYSTEM
# ==============================================================================

def get_technicians() -> List[dict]:
    """Retrieve all technicians registered in the reputation registry."""
    with db_lock:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, name, phone, role, trade, location, works_completed, rating, review_count, created_at
            FROM users
            WHERE role = 'technician'
            ORDER BY rating DESC, works_completed DESC;
            """
        )
        return [dict(r) for r in cursor.fetchall()]


def get_technician_by_id(tech_id: int) -> Optional[dict]:
    """Retrieve a single technician by primary key ID along with recent reviews."""
    with db_lock:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, name, phone, role, trade, location, works_completed, rating, review_count, created_at
            FROM users
            WHERE id = ?;
            """,
            (tech_id,),
        )
        row = cursor.fetchone()
        if not row:
            return None
        tech = dict(row)
        tech["reviews"] = get_technician_reviews(tech_id)
        return tech


def get_technician_by_phone(phone: str) -> Optional[dict]:
    """Retrieve a technician profile by phone number (tolerant of format)."""
    clean = phone.strip()
    digits_only = "".join(ch for ch in clean if ch.isdigit())
    with db_lock:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, name, phone, role, trade, location, works_completed, rating, review_count, created_at
            FROM users
            WHERE phone = ? OR phone LIKE ?;
            """,
            (clean, f"%{digits_only[-10:]}"),
        )
        row = cursor.fetchone()
        if not row:
            return None
        tech = dict(row)
        tech["reviews"] = get_technician_reviews(tech["id"])
        return tech


def get_technician_reviews(tech_id: int) -> List[dict]:
    """Fetch all citizen feedback reviews for a specific technician."""
    with db_lock:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, service_id, technician_id, citizen_name, rating, review_text, created_at
            FROM technician_reviews
            WHERE technician_id = ?
            ORDER BY created_at DESC;
            """,
            (tech_id,),
        )
        return [dict(r) for r in cursor.fetchall()]


def add_technician_review(
    service_id: Any,
    technician_id: int,
    citizen_name: str,
    rating: int,
    review_text: str = "",
) -> dict:
    """Submit a verified homeowner rating and review for a technician."""
    with db_lock:
        cursor = conn.cursor()

        # 1. Insert review record
        cursor.execute(
            """
            INSERT INTO technician_reviews (service_id, technician_id, citizen_name, rating, review_text)
            VALUES (?, ?, ?, ?, ?);
            """,
            (int(service_id) if str(service_id).isdigit() else 1, technician_id, citizen_name.strip(), rating, review_text.strip()),
        )
        review_id = cursor.lastrowid

        # 2. Recalculate average rating and review count
        cursor.execute(
            """
            SELECT COUNT(*) AS total_reviews, AVG(rating) AS avg_rating
            FROM technician_reviews
            WHERE technician_id = ?;
            """,
            (technician_id,),
        )
        stats = cursor.fetchone()
        rev_count = stats["total_reviews"] if stats else 1
        avg_rating = round(float(stats["avg_rating"]), 1) if stats and stats["avg_rating"] is not None else float(rating)

        # 3. Update users table with new rating, review count, and works completed
        cursor.execute(
            """
            UPDATE users
            SET rating = ?, review_count = ?, works_completed = works_completed + 1
            WHERE id = ?;
            """,
            (avg_rating, rev_count, technician_id),
        )
        conn.commit()

        # Fetch updated technician profile
        cursor.execute("SELECT * FROM users WHERE id = ?;", (technician_id,))
        updated_tech = dict(cursor.fetchone() or {})

    return {
        "success": True,
        "review_id": review_id,
        "service_id": service_id,
        "technician_id": technician_id,
        "citizen_name": citizen_name,
        "rating": rating,
        "review_text": review_text,
        "new_rating": avg_rating,
        "total_reviews": rev_count,
        "technician": updated_tech,
    }


def get_available_service_jobs() -> List[dict]:
    """
    Retrieve open utility repair requests with complete citizen requester details,
    preferred time slots, and bids for the technician dashboard.
    """
    with db_lock:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT j.*, COUNT(b.id) AS bids_count
            FROM service_jobs j
            LEFT JOIN service_bids b ON j.id = b.job_id
            WHERE j.status IN ('Open', 'Negotiating', 'Open for Bids')
            GROUP BY j.id
            ORDER BY j.created_at DESC;
            """
        )
        rows = [dict(r) for r in cursor.fetchall()]

    for job in rows:
        bids = get_bids_for_job(job["id"])
        job["bids"] = bids
        if not job.get("citizen_name"):
            job["citizen_name"] = "Ayush Chauhan"
        if not job.get("citizen_locality"):
            job["citizen_locality"] = job.get("citizen_address") or job.get("location_city") or "Hostel Block B, Sector 62"
        if not job.get("citizen_phone"):
            job["citizen_phone"] = "+91 98765 43210"
        if not job.get("preferred_slot"):
            job["preferred_slot"] = "Today, 4:00 PM - 6:00 PM"
        if job.get("status") == "Open":
            job["status"] = "Open for Bids"
        job["bids_count"] = len(bids)

    return rows


def get_citizen_reports(
    citizen_id: Optional[int] = None,
    citizen_phone: Optional[str] = None,
) -> dict:
    """
    Retrieve multi-stage civic grievance metrics and full report history
    for the citizen lifecycle tracker.
    """
    with db_lock:
        cursor = conn.cursor()
        if citizen_id:
            cursor.execute("SELECT * FROM civic_posts WHERE citizen_id = ? ORDER BY created_at DESC;", (citizen_id,))
        elif citizen_phone:
            cursor.execute("SELECT * FROM civic_posts WHERE citizen_phone = ? ORDER BY created_at DESC;", (citizen_phone,))
        else:
            cursor.execute("SELECT * FROM civic_posts ORDER BY created_at DESC;")
        rows = [dict(r) for r in cursor.fetchall()]

    for post in rows:
        post["comments"] = get_comments(post["id"])
        # Format external portals if JSON string
        ep = post.get("external_portals")
        if isinstance(ep, str):
            try:
                post["external_portals"] = json.loads(ep)
            except Exception:
                post["external_portals"] = []

    total_reported = len(rows)
    in_progress_count = 0
    resolved_count = 0

    for post in rows:
        st = (post.get("status") or "").upper().replace(" ", "_").replace("-", "_")
        if st in ("IN_PROGRESS", "ASSIGNED", "ACKNOWLEDGED"):
            in_progress_count += 1
        elif st in ("RESOLVED",):
            resolved_count += 1

    return {
        "total_reported": total_reported,
        "in_progress_count": in_progress_count,
        "resolved_count": resolved_count,
        "reports": rows,
    }


def get_citizen_service_requests(
    citizen_id: Optional[int] = None,
    citizen_phone: Optional[str] = None,
) -> List[dict]:
    """
    Retrieve all utility repair requests submitted by a citizen,
    along with real-time technician bids and worker reputation metrics.
    """
    with db_lock:
        cursor = conn.cursor()
        if citizen_id:
            cursor.execute("SELECT * FROM service_jobs WHERE citizen_id = ? ORDER BY created_at DESC;", (citizen_id,))
        elif citizen_phone:
            cursor.execute("SELECT * FROM service_jobs WHERE citizen_phone = ? ORDER BY created_at DESC;", (citizen_phone,))
        else:
            cursor.execute("SELECT * FROM service_jobs ORDER BY created_at DESC;")
        jobs = [dict(r) for r in cursor.fetchall()]

    for job in jobs:
        bids = get_bids_for_job(job["id"])
        for b in bids:
            tech = get_technician_by_phone(b["worker_phone"])
            if tech:
                b["technician_id"] = tech["id"]
                b["rating"] = tech["rating"]
                b["review_count"] = tech["review_count"]
                b["works_completed"] = tech["works_completed"]
            else:
                b["technician_id"] = 1
                b["rating"] = 5.0
                b["review_count"] = 0
                b["works_completed"] = 0
        job["bids"] = bids
        job["bids_count"] = len(bids)
        if not job.get("citizen_name"):
            job["citizen_name"] = "Ayush Chauhan"
        if not job.get("citizen_locality"):
            job["citizen_locality"] = job.get("citizen_address") or job.get("location_city") or "Hostel Block B, Sector 62"
        if not job.get("citizen_phone"):
            job["citizen_phone"] = "+91 98765 43210"
        if not job.get("preferred_slot"):
            job["preferred_slot"] = "Today, 4:00 PM - 6:00 PM"

    return jobs



