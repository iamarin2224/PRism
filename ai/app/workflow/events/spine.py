import json
import logging
import uuid
from typing import Any, Dict, Optional

from app.config import settings
from app.rag.db import get_db_pool

logger = logging.getLogger("prism.workflow.events.spine")


class EventsSpine:
    """
    Append-Only Telemetry & Audit Events Spine:
    Persists structured execution spans, decisions, model tokens, and latencies
    into the audit_events table in PostgreSQL for full operational traceability.
    """

    async def emit_event(
        self,
        review_run_id: str,
        node_name: str,
        event_type: str,
        payload: Optional[Dict[str, Any]] = None,
        span_id: Optional[str] = None,
        tokens_in: int = 0,
        tokens_out: int = 0,
        cost_inr: float = 0.0,
        cost_usd: Optional[float] = None,
        duration_ms: Optional[float] = None,
    ) -> Optional[str]:
        """
        Appends an immutable audit event record into the PostgreSQL database.
        """
        if not settings.DATABASE_URL:
            logger.debug("DATABASE_URL not set; skipping audit event emission.")
            return None

        event_id = str(uuid.uuid4())
        span_id = span_id or str(uuid.uuid4())
        json_payload = json.dumps(payload or {})
        effective_cost = cost_usd if cost_usd is not None else cost_inr

        try:
            pool = await get_db_pool()
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO audit_events (
                        id, review_run_id, span_id, node_name, event_type,
                        payload, tokens_in, tokens_out, cost_usd, duration_ms, created_at
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, NOW()
                    );
                    """,
                    event_id,
                    review_run_id,
                    span_id,
                    node_name,
                    event_type,
                    json_payload,
                    tokens_in,
                    tokens_out,
                    effective_cost,
                    duration_ms,
                )
            logger.debug(f"Emitted audit event '{event_type}' for node '{node_name}' in run '{review_run_id}'")
            return event_id
        except Exception as e:
            logger.warning(f"Failed to emit audit event: {e}")
            return None


events_spine = EventsSpine()
