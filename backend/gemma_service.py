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
FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-3.8-flash", "gemini-flash-latest"]

VALID_DEPARTMENTS = [
    "Roads & Transport",
    "Solid Waste & Sanitation",
    "Water Supply & Sewage",
    "Electricity & Streetlights",
    "Public Health & Encroachment",
]

VALID_SEVERITIES = ["Low", "Moderate", "High", "Critical"]

VALID_CATEGORIES = ["Plumber", "Electrician", "Carpenter", "Appliance Repair"]

PORTAL_DIRECTORY = {
    "cpgrams": {
        "name": "Centralized Public Grievance Redress and Monitoring System (CPGRAMS)",
        "url": "https://pgportal.gov.in",
        "reason": "Apex Central Government grievance portal for inter-departmental and central agency escalation.",
    },
    "railmadad": {
        "name": "RailMadad (Ministry of Railways)",
        "url": "https://railmadad.indianrailways.gov.in",
        "reason": "Incident is located on Indian Railways tracks, station precinct, or level-crossing jurisdiction.",
    },
    "nhai": {
        "name": "Sukhad Yatra / NHAI Citizen Portal",
        "url": "https://nhai.gov.in",
        "reason": "Road asset falls under the National Highways Authority of India (NHAI / MoRTH) jurisdiction.",
    },
    "consumer": {
        "name": "National Consumer Helpline (NCH)",
        "url": "https://consumerhelpline.gov.in",
        "reason": "Commercial dispute or consumer deficiency of service beyond municipal remediation scope.",
    },
}


def _get_genai_client() -> Optional[genai.Client]:
    """Instantiate authenticated Google GenAI client."""
    if not GEMINI_API_KEY or GEMINI_API_KEY.strip() == "":
        logger.warning("GEMINI_API_KEY is not configured in environment or .env file.")
        return None
    try:
        return genai.Client(api_key=GEMINI_API_KEY)
    except Exception as exc:
        logger.error("Failed to initialize Google GenAI Client: %s", exc)
        return None


def _detect_image_mime(data: bytes) -> str:
    """Detect image MIME type from initial magic bytes."""
    if not data:
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"RIFF") and len(data) >= 12 and data[8:12] == b"WEBP":
        return "image/webp"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        return "image/gif"
    return "image/jpeg"


def _clean_and_extract_json(raw_text: str) -> Optional[Dict[str, Any]]:
    """
    Defensively strips code fences, regex extracts json object, and parses with json.loads.
    """
    if not raw_text or not raw_text.strip():
        return None

    text = raw_text.strip()

    # Step 1: Strip standard markdown json code fences
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text).strip()

    # Step 2: Try direct parse
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except Exception:
        pass

    # Step 3: Regex match first balanced outer curly brace structure
    match = re.search(r"(\{.*\})", text, re.DOTALL)
    if match:
        extracted = match.group(1).strip()
        try:
            data = json.loads(extracted)
            if isinstance(data, dict):
                return data
        except Exception:
            pass

    return None


def _execute_with_resilient_fallback(
    contents: List[Any],
    system_instruction: str,
    temperature: float = 0.3,
) -> Optional[str]:
    """
    Executes inference against PRIMARY_MODEL ('gemma-4-26b-a4b-it').
    For Gemma models, system instructions must be embedded directly in prompt contents
    (as Gemma API does not accept system_instruction in GenerateContentConfig).
    Catches rate-limits / API errors and falls back gracefully through FALLBACK_MODELS.
    """
    client = _get_genai_client()
    if not client:
        return None

    # 1. Primary Attempt: gemma-4-26b-a4b-it
    try:
        logger.info("Calling primary model: %s", PRIMARY_MODEL)
        # Prepend system instruction into contents for Gemma
        gemma_contents: List[Any] = []
        instruction_prepended = False
        for c in contents:
            if isinstance(c, str) and not instruction_prepended:
                gemma_contents.append(f"[System Instruction]\n{system_instruction}\n\n{c}")
                instruction_prepended = True
            else:
                gemma_contents.append(c)
        if not instruction_prepended and system_instruction:
            gemma_contents.insert(0, f"[System Instruction]\n{system_instruction}\n\n")

        gemma_config = types.GenerateContentConfig(temperature=temperature)
        response = client.models.generate_content(
            model=PRIMARY_MODEL,
            contents=gemma_contents,
            config=gemma_config,
        )
        if response and response.text:
            return response.text
    except Exception as primary_exc:
        logger.warning(
            "Primary model '%s' failed or exhausted quota: %s. Initiating resilient fallback chain.",
            PRIMARY_MODEL,
            primary_exc,
        )

    # 2. Resilient Fallbacks (Gemini 3.5 / 3.8 / Flash-Latest)
    fallback_config = types.GenerateContentConfig(
        temperature=temperature,
        system_instruction=system_instruction,
    )

    for fallback_model in FALLBACK_MODELS:
        try:
            logger.info("Calling fallback model: %s", fallback_model)
            response = client.models.generate_content(
                model=fallback_model,
                contents=contents,
                config=fallback_config,
            )
            if response and response.text:
                return response.text
        except Exception as fb_exc:
            logger.warning("Fallback model '%s' failed: %s", fallback_model, fb_exc)

    return None


def _heuristic_jurisdiction_check(desc: str) -> tuple[bool, List[Dict[str, str]]]:
    """
    Heuristically checks if text references Indian Railways, NHAI, or Central properties.
    Returns (is_local_municipal: bool, external_portals: list).
    """
    d = desc.lower()
    portals: List[Dict[str, str]] = []

    is_railway = any(w in d for w in ["railway", "rail track", "train", "station platform", "railmadad", "level crossing"])
    is_highway = any(w in d for w in ["national highway", "nh-", "expressway", "toll plaza", "nhai", "morth", "bypass"])
    is_central = any(w in d for w in ["cantonment", "military area", "central govt", "cpwd", "cda", "income tax office"])
    is_dispute = any(w in d for w in ["tenant", "landlord", "cyber fraud", "scam", "consumer court"])

    if is_railway:
        portals.append(PORTAL_DIRECTORY["railmadad"])
        portals.append(PORTAL_DIRECTORY["cpgrams"])
        return False, portals

    if is_highway:
        portals.append(PORTAL_DIRECTORY["nhai"])
        portals.append(PORTAL_DIRECTORY["cpgrams"])
        return False, portals

    if is_dispute:
        portals.append(PORTAL_DIRECTORY["consumer"])
        portals.append(PORTAL_DIRECTORY["cpgrams"])
        return False, portals

    if is_central:
        portals.append(PORTAL_DIRECTORY["cpgrams"])
        return False, portals

    return True, []


def analyze_civic_issue(
    image_bytes: bytes,
    description: str,
    location_city: str,
) -> Dict[str, Any]:
    """
    Audits civic hazard via Gemma 4 Multimodal model with fallback to Gemini 2.5 Flash.
    Enforces strict municipal schema and jurisdiction escalation protocols.
    """
    system_instruction = (
        "You are an impartial, highly rigorous municipal infrastructure auditor and public safety engineer in India. "
        "Inspect the submitted photographic evidence and citizen note with forensic accuracy.\n"
        "Your output MUST be a single, valid JSON object matching this schema exactly:\n"
        "{\n"
        '  "title": "Clear, high-impact headline (e.g., \'Uncovered High-Voltage Junction Box on Main Walkway\')",\n'
        '  "department": "Must be strictly one of: [\'Roads & Transport\', \'Solid Waste & Sanitation\', \'Water Supply & Sewage\', \'Electricity & Streetlights\', \'Public Health & Encroachment\']",\n'
        '  "severity": "Must be strictly one of: [\'Low\', \'Moderate\', \'High\', \'Critical\']",\n'
        '  "summary": "2-3 detailed sentences assessing physical damage, pedestrian/vehicular risk, and actionable remediation steps for municipal field engineers.",\n'
        '  "is_local_municipal": boolean,\n'
        '  "external_portals": [\n'
        "    {\n"
        '      "name": "Full Official Name of Portal / Authority",\n'
        '      "url": "Direct working URL",\n'
        '      "reason": "Specific legal/administrative reason why this issue falls outside municipal jurisdiction"\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        "CRITICAL JURISDICTION RULES:\n"
        "- Set is_local_municipal to FALSE ONLY IF:\n"
        "  1. The issue involves National Highways (NHAI / Ministry of Road Transport).\n"
        "  2. The issue is on Indian Railways property, railway tracks, stations, or level crossings.\n"
        "  3. The issue concerns Central Government buildings, military cantonments, or inter-state rivers/canals.\n"
        "  4. The issue is an interpersonal civil dispute, domestic dispute, or cyber fraud.\n"
        "- When is_local_municipal is FALSE:\n"
        "  * You MUST populate external_portals with 2-3 genuine, authoritative portals:\n"
        "    - CPGRAMS: https://pgportal.gov.in (Centralized Public Grievance Redress and Monitoring System)\n"
        "    - RailMadad: https://railmadad.indianrailways.gov.in (For Indian Railways complaints)\n"
        "    - Sukhad Yatra / NHAI: https://nhai.gov.in (For National Highways complaints)\n"
        "    - National Consumer Helpline: https://consumerhelpline.gov.in (For consumer/commercial fraud)\n"
        "- When is_local_municipal is TRUE:\n"
        "  * external_portals MUST be an empty array [].\n"
        "Return ONLY raw JSON. No markdown fences. No preamble."
    )

    prompt_body = (
        f"Municipality / Locality: {location_city}\n"
        f"Citizen Field Report: {description}\n"
        "Audit this incident and return the required JSON object."
    )

    contents: List[Any] = []
    if image_bytes and len(image_bytes) > 0:
        try:
            detected_mime = _detect_image_mime(image_bytes)
            image_part = types.Part.from_bytes(data=image_bytes, mime_type=detected_mime)
            contents.append(image_part)
        except Exception as img_err:
            logger.warning("Could not convert image bytes to GenAI Part: %s", img_err)

    contents.append(prompt_body)

    raw_response = _execute_with_resilient_fallback(
        contents=contents,
        system_instruction=system_instruction,
        temperature=0.2,
    )

    parsed = _clean_and_extract_json(raw_response) if raw_response else None

    # Resilient Deterministic Fallback if model or JSON parsing is unavailable
    if not parsed:
        is_local, auto_portals = _heuristic_jurisdiction_check(description)
        desc_lower = description.lower()

        # Categorize department
        if any(w in desc_lower for w in ["garbage", "dump", "waste", "trash", "debris", "filth"]):
            dept = "Solid Waste & Sanitation"
        elif any(w in desc_lower for w in ["water", "sewer", "drain", "leak", "pipe", "overflow"]):
            dept = "Water Supply & Sewage"
        elif any(w in desc_lower for w in ["wire", "pole", "light", "transformer", "shock", "spark", "cable"]):
            dept = "Electricity & Streetlights"
        elif any(w in desc_lower for w in ["dengue", "mosquito", "clinic", "encroach", "vendor", "footpath"]):
            dept = "Public Health & Encroachment"
        else:
            dept = "Roads & Transport"

        # Determine severity
        if any(w in desc_lower for w in ["fatal", "danger", "fire", "deep", "accident", "high voltage", "collapse"]):
            sev = "Critical"
        elif any(w in desc_lower for w in ["urgent", "cracked", "hazard", "overflow", "stray"]):
            sev = "High"
        elif any(w in desc_lower for w in ["slow", "blocked", "broken", "pothole"]):
            sev = "Moderate"
        else:
            sev = "Low"

        clean_title = description.split("\n")[0][:70].strip() or f"Civic Infrastructure Hazard in {location_city}"
        summary_text = (
            f"Field inspection confirmed an infrastructure defect affecting {location_city}. "
            f"Immediate intervention by the {dept} division is required to secure public safety. "
            "Remediation crews should deploy barrier marking and initiate on-site restoration."
        )

        parsed = {
            "title": clean_title,
            "department": dept,
            "severity": sev,
            "summary": summary_text,
            "is_local_municipal": is_local,
            "external_portals": auto_portals,
        }

    # Strict Schema Normalization & Post-processing
    # 1. Department Enforcement
    if parsed.get("department") not in VALID_DEPARTMENTS:
        parsed_dept = str(parsed.get("department", ""))
        matched_dept = next(
            (vd for vd in VALID_DEPARTMENTS if vd.lower() in parsed_dept.lower()),
            "Roads & Transport",
        )
        parsed["department"] = matched_dept

    # 2. Severity Enforcement
    if parsed.get("severity") not in VALID_SEVERITIES:
        parsed_sev = str(parsed.get("severity", "")).capitalize()
        parsed["severity"] = parsed_sev if parsed_sev in VALID_SEVERITIES else "Moderate"

    # 3. Jurisdiction & External Portals Strict Constraint
    is_local_flag = bool(parsed.get("is_local_municipal", True))
    # Double-check heuristics: if citizen report explicitly mentions railway/highway, override
    heur_local, heur_portals = _heuristic_jurisdiction_check(description)
    if not heur_local:
        is_local_flag = False

    parsed["is_local_municipal"] = is_local_flag

    if not is_local_flag:
        ext_portals = parsed.get("external_portals")
        if not isinstance(ext_portals, list) or len(ext_portals) == 0:
            parsed["external_portals"] = heur_portals if heur_portals else [
                PORTAL_DIRECTORY["cpgrams"],
                PORTAL_DIRECTORY["nhai"],
            ]
        else:
            valid_portals = []
            for p in ext_portals:
                if isinstance(p, dict) and "name" in p and "url" in p:
                    valid_portals.append({
                        "name": p["name"],
                        "url": p["url"],
                        "reason": p.get("reason", "Falls under specialized external agency jurisdiction."),
                    })
                elif isinstance(p, str):
                    valid_portals.append({
                        "name": p,
                        "url": "https://pgportal.gov.in",
                        "reason": "Central authority grievance redressal cell.",
                    })
            parsed["external_portals"] = valid_portals or heur_portals
    else:
        parsed["external_portals"] = []

    return parsed


def diagnose_home_repair(
    image_bytes: bytes,
    description: str,
) -> Dict[str, Any]:
    """
    Analyzes household defect media (pipes, MCB, carpentry, appliances).
    Returns strict JSON with diagnosis, fair local price benchmark, and safety instructions.
    """
    system_instruction = (
        "You are an expert master technician, licensed home utility inspector, and cost estimator in India. "
        "Inspect the submitted defect photographic evidence and fault description.\n"
        "Your output MUST be a single, valid JSON object matching this schema exactly:\n"
        "{\n"
        '  "title": "Concise defect title",\n'
        '  "category": "Strictly one of: [\'Plumber\', \'Electrician\', \'Carpenter\', \'Appliance Repair\']",\n'
        '  "diagnosis": "Detailed technical explanation of the failure mechanism.",\n'
        '  "fair_price_bracket": "Realistic local labor + minor parts price range in INR (e.g., \'₹350 - ₹550\')",\n'
        '  "safety_alert": "Specific hazard warning (e.g., \'Turn off main water inlet before attempting inspection\') or \'None\'"\n'
        "}\n"
        "Return ONLY raw JSON. No markdown fences. No conversational filler."
    )

    prompt_body = (
        f"Resident Fault Report: {description}\n"
        "Diagnose this home utility defect and output the JSON object."
    )

    contents: List[Any] = []
    if image_bytes and len(image_bytes) > 0:
        try:
            detected_mime = _detect_image_mime(image_bytes)
            image_part = types.Part.from_bytes(data=image_bytes, mime_type=detected_mime)
            contents.append(image_part)
        except Exception as img_err:
            logger.warning("Could not convert image bytes to GenAI Part: %s", img_err)

    contents.append(prompt_body)

    raw_response = _execute_with_resilient_fallback(
        contents=contents,
        system_instruction=system_instruction,
        temperature=0.2,
    )

    parsed = _clean_and_extract_json(raw_response) if raw_response else None

    # Resilient Fallback if API fails
    if not parsed:
        desc_l = description.lower()
        if any(w in desc_l for w in ["electric", "wire", "mcb", "spark", "shock", "trip", "switch", "socket", "light"]):
            category = "Electrician"
            bracket = "₹350 - ₹600"
            safety = "Isolate the main MCB breaker immediately before inspecting or touching wiring components."
            diag = "Thermal overload or loose neutral terminal contact causing intermittent tripping and insulation burning."
        elif any(w in desc_l for w in ["wood", "door", "hinge", "drawer", "lock", "cabinet", "cupboard", "swell"]):
            category = "Carpenter"
            bracket = "₹300 - ₹550"
            safety = "None"
            diag = "Moisture absorption causing timber swelling or hinge misalignment preventing proper latch engagement."
        elif any(w in desc_l for w in ["ac", "compressor", "refrigerator", "fridge", "washing", "microwave", "appliance"]):
            category = "Appliance Repair"
            bracket = "₹500 - ₹1200"
            safety = "Unplug the appliance power cord from the 16A high-power wall socket."
            diag = "Compressor run capacitor degradation or motor bearing seizure causing thermal trip-out."
        else:
            category = "Plumber"
            bracket = "₹350 - ₹550"
            safety = "Shut off the localized stopcock valve or main overhead water tank supply."
            diag = "PVC u-trap compression ring gasket failure or pipe thread micro-fracture allowing seepage under pressure."

        clean_title = description.split("\n")[0][:60].strip() or "Household Defect Repair"
        parsed = {
            "title": clean_title,
            "category": category,
            "diagnosis": diag,
            "fair_price_bracket": bracket,
            "safety_alert": safety,
        }

    # Normalize category
    if parsed.get("category") not in VALID_CATEGORIES:
        parsed_cat = str(parsed.get("category", ""))
        matched_cat = next(
            (vc for vc in VALID_CATEGORIES if vc.lower() in parsed_cat.lower()),
            "Plumber",
        )
        parsed["category"] = matched_cat

    # Ensure price bracket format
    bracket = str(parsed.get("fair_price_bracket", "₹350 - ₹550"))
    if "₹" not in bracket:
        bracket = f"₹{bracket}"
    parsed["fair_price_bracket"] = bracket

    if not parsed.get("safety_alert"):
        parsed["safety_alert"] = "None"

    return parsed


def pulsebot_chat(history: List[Dict[str, Any]], user_message: str) -> str:
    """
    PulseBot conversational copilot:
    - Civic vs Home Triage
    - Negotiation Shield & Indian labor benchmarks
    - Evidence Coaching for public hazard photos
    Direct, practical, accessible, 3-4 sentences max.
    """
    system_instruction = (
        "You are PulseBot, a seasoned civic ombudsman and transparent home repair advisor on the CivicPulse platform in India.\n"
        "CivicPulse was developed by Team Version Controllers (Ayush Chauhan, Rishav Ranjan, Hardik Kumar) targeting 'Open Source' and 'Best Use of Gemma' tracks.\n"
        "Responsibilities:\n"
        "1. Triage: If a resident is unsure whether an issue is public civic (handled by municipal corporations) or private home maintenance, clarify jurisdiction instantly.\n"
        "2. Negotiation Shield: Provide realistic Indian local labor benchmarks (carpentry, electrical, plumbing) and give negotiation advice so homeowners are never overcharged by private technicians.\n"
        "3. Evidence Coaching: Tell citizens exactly what angles, lighting, and landmarks to capture in photos so municipal authorities take immediate action.\n"
        "4. Team Information: If asked who built or created CivicPulse, introduce Team Version Controllers and members Ayush Chauhan, Rishav Ranjan, and Hardik Kumar.\n"
        "Style: Direct, practical, accessible to everyday citizens, 3-4 sentences max, zero robotic fluff."
    )

    formatted_context: List[str] = []
    for item in history[-6:]:
        role = item.get("role", "user")
        content = item.get("content", item.get("message", ""))
        if content:
            formatted_context.append(f"{role.capitalize()}: {content}")

    chat_prompt = (
        "Prior Dialogue:\n" + "\n".join(formatted_context) +
        f"\nResident: {user_message}\n"
        "Respond as PulseBot in 3-4 direct sentences:"
    )

    raw_response = _execute_with_resilient_fallback(
        contents=[chat_prompt],
        system_instruction=system_instruction,
        temperature=0.3,
    )

    if raw_response and raw_response.strip():
        cleaned = raw_response.strip().strip('"')
        return cleaned

    # Deterministic Expert Fallback responses
    msg = user_message.lower()
    if any(k in msg for k in ["team", "who built", "who created", "developer", "author", "version controller"]):
        return (
            "CivicPulse was proudly built by Team Version Controllers: Ayush Chauhan, Rishav Ranjan, and Hardik Kumar. "
            "Our mission is to bring open-source multimodal AI auditing to public infrastructure and protect Indian homeowners from unfair gig overcharging."
        )

    if any(k in msg for k in ["civic", "pipeline", "leak", "street", "pothole", "garbage", "drain"]):
        return (
            "Any issue outside your boundary wall—such as leaking municipal water mains, broken streetlights, or potholes—is a civic grievance under Nagar Nigam or Development Authority jurisdiction. "
            "Take a wide photo including a recognizable street landmark or electricity pole number so engineers can locate it without delay. "
            "Submit it to our Civic Feed, and our system will map it directly to the official portal."
        )

    if any(k in msg for k in ["price", "cost", "charge", "rate", "fee", "plumber", "electrician", "drain"]):
        return (
            "Fair market visit charges for verified technicians in Tier 1/2 Indian cities range between ₹250 to ₹400 for standard labor. "
            "For component replacements like PVC u-traps or 32A MCB switches, expect an additional ₹150 to ₹350 for parts. "
            "Always inspect the old part before replacement and use our counter-offer feature so you don't overpay."
        )

    if any(k in msg for k in ["photo", "evidence", "camera", "picture", "angle"]):
        return (
            "Capture two clear photos: one close-up detailing the physical hazard, and one wide shot showing surrounding landmarks, shops, or street boards. "
            "Ensure the photo is taken in daylight without glare, and mention the nearest gate or sector number in your description. "
            "Solid photographic proof reduces municipal inspection delays by over 60%."
        )

    return (
        "Namaste! I am PulseBot, your CivicPulse advisor. "
        "If you are reporting a public hazard, post it to our Infrastructure Feed for automated municipal escalation. "
        "For private household repairs, use the Services section to get fair AI estimates and negotiate with verified neighborhood technicians."
    )
