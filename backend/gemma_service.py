from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional

from google import genai
from google.genai import types

from backend.config import GEMINI_API_KEY

logger = logging.getLogger("civicpulse.gemma")

PRIMARY_MODEL = "gemma-4-26b-a4b-it"
FALLBACK_MODEL = "gemini-2.5-flash"


def _get_genai_client() -> Optional[genai.Client]:
    """Return an authenticated genai Client if API key is provided."""
    if not GEMINI_API_KEY:
        return None
    try:
        return genai.Client(api_key=GEMINI_API_KEY)
    except Exception as e:
        logger.warning("Failed to initialize genai.Client: %s", e)
        return None


def _clean_and_parse_json(text: str) -> Optional[Dict[str, Any]]:
    """Clean model response, strip markdown fence code blocks, and parse JSON."""
    if not text:
        return None

    # Strip code block markdown markers ```json ... ```
    cleaned = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()

    # Try direct parse
    try:
        data = json.loads(cleaned)
        if isinstance(data, dict):
            return data
    except Exception:
        pass

    # Try extracting first {...} block via regex
    match = re.search(r"(\{.*\})", cleaned, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group(1))
            if isinstance(data, dict):
                return data
        except Exception:
            pass

    return None


def _generate_content_with_fallback(
    contents: List[Any],
    system_instruction: Optional[str] = None,
) -> Optional[str]:
    """
    Attempt to call PRIMARY_MODEL (gemma-4-26b-a4b-it).
    If it fails due to rate limits or unavailability, fall back to FALLBACK_MODEL (gemini-2.5-flash).
    """
    client = _get_genai_client()
    if not client:
        logger.info("No GEMINI_API_KEY available; skipping remote API call.")
        return None

    config = types.GenerateContentConfig(
        temperature=0.2,
        system_instruction=system_instruction,
    ) if system_instruction else types.GenerateContentConfig(temperature=0.2)

    # 1. Try Primary Model
    try:
        logger.info("Attempting inference with primary model: %s", PRIMARY_MODEL)
        response = client.models.generate_content(
            model=PRIMARY_MODEL,
            contents=contents,
            config=config,
        )
        if response and response.text:
            return response.text
    except Exception as primary_err:
        logger.warning(
            "Primary model %s failed: %s. Falling back to %s",
            PRIMARY_MODEL,
            primary_err,
            FALLBACK_MODEL,
        )

    # 2. Try Fallback Model
    try:
        logger.info("Attempting inference with fallback model: %s", FALLBACK_MODEL)
        response = client.models.generate_content(
            model=FALLBACK_MODEL,
            contents=contents,
            config=config,
        )
        if response and response.text:
            return response.text
    except Exception as fallback_err:
        logger.error("Fallback model %s also failed: %s", FALLBACK_MODEL, fallback_err)

    return None


def _detect_non_municipal_keywords(text: str) -> bool:
    """Check if description refers to National Highways, Railways, or Central Gov jurisdiction."""
    t = text.lower()
    triggers = [
        "national highway", "nh-", "nhai", "expressway", "toll plaza",
        "railway", "rail station", "train track", "railmadad", "railway station",
        "central government", "cantonment", "military area", "cda", "cpwd"
    ]
    return any(trig in t for trig in triggers)


def _get_default_portals(desc: str) -> List[Dict[str, str]]:
    """Return genuine Indian central grievance portals."""
    desc_l = desc.lower()
    portals = []
    if any(k in desc_l for k in ["railway", "rail", "train"]):
        portals.append({
            "name": "RailMadad",
            "url": "https://railmadad.indianrailways.gov.in",
            "reason": "Railway property and station facilities fall under Ministry of Railways."
        })
    if any(k in desc_l for k in ["highway", "expressway", "nhai", "nh-"]):
        portals.append({
            "name": "NHAI Portal",
            "url": "https://nhai.gov.in",
            "reason": "National highway corridors are maintained by the National Highways Authority of India."
        })
    # Always include CPGRAMS as central escalation
    portals.append({
        "name": "CPGRAMS",
        "url": "https://pgportal.gov.in",
        "reason": "Central Public Grievance Redress and Monitoring System for Government of India ministries."
    })
    return portals[:3]


def analyze_civic_issue(
    image_bytes: bytes,
    description: str,
    location_city: str,
) -> Dict[str, Any]:
    """
    Prompt model as an impartial municipal infrastructure auditor.
    Returns strictly formatted JSON conforming to the requested schema.
    """
    system_instruction = (
        "You are an impartial municipal infrastructure auditor in India evaluating citizen civic hazard reports. "
        "Your task is to analyze the issue and return ONLY a valid, raw JSON object with no additional text or markdown fences."
    )

    prompt_text = f"""
Analyze the following civic issue report for city/region: '{location_city}'.
Citizen Description: {description}

Return ONLY a JSON response matching this EXACT schema:
{{
  "title": "Concise issue headline",
  "department": "One of: Roads & Potholes, Solid Waste Management, Water Supply & Drainage, Electricity & Streetlights, Public Health & Sanitation",
  "severity": "One of: Low, Moderate, High, Critical",
  "summary": "2 concise sentences explaining the hazard and public risk.",
  "is_local_municipal": true or false,
  "external_portals": [
    {{"name": "Portal Name", "url": "Direct Official URL", "reason": "Why this must be reported here"}}
  ]
}}

CRITICAL RULES:
1. 'is_local_municipal' MUST be false if the issue concerns National Highways (NHAI), Indian Railways property, Central Government buildings, or private civil disputes.
2. When 'is_local_municipal' is false, populate 'external_portals' with 2-3 genuine portals (e.g. CPGRAMS at https://pgportal.gov.in, NHAI Portal at https://nhai.gov.in, RailMadad at https://railmadad.indianrailways.gov.in).
3. When 'is_local_municipal' is true, 'external_portals' MUST be [].
4. Output MUST be strictly valid JSON only.
"""

    contents: List[Any] = []
    if image_bytes:
        try:
            image_part = types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg")
            contents.append(image_part)
        except Exception as e:
            logger.warning("Could not create image Part: %s", e)

    contents.append(prompt_text)

    raw_output = _generate_content_with_fallback(contents, system_instruction=system_instruction)
    parsed = _clean_and_parse_json(raw_output) if raw_output else None

    # Fallback or rule enforcement
    if not parsed:
        is_non_local = _detect_non_municipal_keywords(description)
        severity = "High" if any(w in description.lower() for w in ["fire", "electric", "deep", "accident", "danger", "overflow"]) else "Moderate"
        
        dept = "Roads & Potholes"
        desc_lower = description.lower()
        if any(w in desc_lower for w in ["garbage", "dump", "trash", "waste", "stench"]):
            dept = "Solid Waste Management"
        elif any(w in desc_lower for w in ["water", "drain", "sewage", "leak", "pipe"]):
            dept = "Water Supply & Drainage"
        elif any(w in desc_lower for w in ["light", "electric", "wire", "pole", "mcb", "power"]):
            dept = "Electricity & Streetlights"
        elif any(w in desc_lower for w in ["fogging", "dengue", "sanitation", "mosquito", "clinic"]):
            dept = "Public Health & Sanitation"

        parsed = {
            "title": description.split("\n")[0][:60] or f"Reported Civic Concern in {location_city}",
            "department": dept,
            "severity": severity,
            "summary": f"Reported civic hazard in {location_city}. Requires urgent inspection by the {dept} division to mitigate risk to public commuters.",
            "is_local_municipal": not is_non_local,
            "external_portals": _get_default_portals(description) if is_non_local else [],
        }

    # Strict post-processing enforcement of prompt rules
    if not parsed.get("is_local_municipal"):
        if not parsed.get("external_portals"):
            parsed["external_portals"] = _get_default_portals(description)
    else:
        parsed["external_portals"] = []

    # Validate department
    valid_depts = [
        "Roads & Potholes",
        "Solid Waste Management",
        "Water Supply & Drainage",
        "Electricity & Streetlights",
        "Public Health & Sanitation",
    ]
    if parsed.get("department") not in valid_depts:
        parsed["department"] = "Roads & Potholes"

    # Validate severity
    valid_severities = ["Low", "Moderate", "High", "Critical"]
    if parsed.get("severity") not in valid_severities:
        parsed["severity"] = "Moderate"

    return parsed


def diagnose_home_repair(
    image_bytes: bytes,
    description: str,
) -> Dict[str, Any]:
    """
    Inspect household defect photos/videos and return diagnosis JSON.
    """
    system_instruction = (
        "You are an expert Indian home repair technician and estimator on CivicPulse. "
        "Inspect household defects and return ONLY valid JSON with no markdown formatting."
    )

    prompt_text = f"""
Diagnose the following home defect.
Description: {description}

Return ONLY a JSON response matching this EXACT schema:
{{
  "title": "Short problem title",
  "category": "One of: Plumber, Electrician, Carpenter, Appliance Repair",
  "diagnosis": "Technical explanation of the fault.",
  "fair_price_bracket": "Realistic local repair price range in INR (e.g., '₹250 - ₹400')",
  "safety_alert": "Specific safety instruction or 'None'"
}}
"""

    contents: List[Any] = []
    if image_bytes:
        try:
            image_part = types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg")
            contents.append(image_part)
        except Exception as e:
            logger.warning("Could not create image Part for repair: %s", e)

    contents.append(prompt_text)

    raw_output = _generate_content_with_fallback(contents, system_instruction=system_instruction)
    parsed = _clean_and_parse_json(raw_output) if raw_output else None

    if not parsed:
        desc_l = description.lower()
        category = "Plumber"
        bracket = "₹400 - ₹700"
        safety = "None"

        if any(w in desc_l for w in ["electric", "wire", "mcb", "shock", "spark", "switch"]):
            category = "Electrician"
            bracket = "₹350 - ₹650"
            safety = "Turn off the main MCB isolator switch before touching any exposed wiring."
        elif any(w in desc_l for w in ["wood", "door", "hinge", "cupboard", "almirah", "lock"]):
            category = "Carpenter"
            bracket = "₹300 - ₹600"
        elif any(w in desc_l for w in ["ac", "fridge", "washing", "microwave", "appliance"]):
            category = "Appliance Repair"
            bracket = "₹500 - ₹1200"

        parsed = {
            "title": description.split("\n")[0][:50] or "Household Repair Requirement",
            "category": category,
            "diagnosis": f"Defect requires on-site inspection by a certified {category.lower()} for component check and replacement.",
            "fair_price_bracket": bracket,
            "safety_alert": safety,
        }

    return parsed


def pulsebot_chat(history: List[Dict[str, Any]], user_message: str) -> str:
    """
    PulseBot conversational copilot adhering strictly to persona and length rules.
    """
    system_instruction = (
        "You are PulseBot, a grounded, helpful neighborhood and home maintenance advisor on CivicPulse. "
        "Keep responses direct, friendly, and under 3-4 sentences.\n"
        "- If a user is confused whether an issue belongs on the public civic feed or private home utility, guide them clearly.\n"
        "- If they ask about reasonable repair costs, give realistic local labor rates and negotiation tips so they don't get overcharged.\n"
        "- If they want to verify whether a public hazard is worth reporting, advise them on evidence to collect."
    )

    formatted_history: List[str] = []
    for item in history[-6:]:  # Keep recent context
        role = item.get("role", "user")
        content = item.get("content", item.get("message", ""))
        formatted_history.append(f"{role.capitalize()}: {content}")

    chat_prompt = (
        f"Previous conversation:\n" + "\n".join(formatted_history) +
        f"\nUser: {user_message}\n"
        f"Respond as PulseBot in under 3-4 sentences:"
    )

    raw_output = _generate_content_with_fallback([chat_prompt], system_instruction=system_instruction)
    if raw_output and raw_output.strip():
        # Clean any extra quotation marks
        cleaned = raw_output.strip().strip('"')
        return cleaned

    # Fallback response if offline or model unavailable
    msg_lower = user_message.lower()
    if any(k in msg_lower for k in ["pothole", "light", "garbage", "drain", "road"]):
        return (
            "This sounds like a municipal infrastructure issue that belongs on the public Civic Feed. "
            "Please snap a clear photo with a nearby landmark and post it so neighbors can upvote and escalate to the local authority."
        )
    if any(k in msg_lower for k in ["cost", "price", "rate", "charge", "plumber", "electrician"]):
        return (
            "Standard neighborhood service visits in urban India typically range between ₹250 to ₹400 for inspection. "
            "Always agree on the spare parts cost beforehand and request an itemized quote to ensure fair pricing."
        )
    return (
        "Namaste! I'm PulseBot. If this is a neighborhood hazard, post it to our Civic Feed; "
        "for private household repairs, use the Services section to get transparent local contractor bids."
    )
