import logging
from typing import Dict, List, Tuple
from app.models.review import Finding

logger = logging.getLogger("prism.workflow.merge")


class DeduplicationService:
    """
    Deterministic Deduplication and Findings Merge Engine:
    Combines findings across multiple specialist agents into a clean, unified list.
    
    Matching heuristics:
    1. Exact or normalized file path match.
    2. Overlapping or closely adjacent line spans (default window <= 3 lines).
    3. Compatible finding categories or domain semantics.
    
    When duplicate findings are detected across specialists:
    - Merges suggestions and descriptions into comprehensive feedback.
    - Increments agreement_count.
    - Selects the maximum severity and maximum confidence score.
    """

    @staticmethod
    def are_findings_overlapping(
        f1: Finding,
        f2: Finding,
        line_tolerance: int = 3,
    ) -> bool:
        if f1.file_path.strip().lower() != f2.file_path.strip().lower():
            return False

        # If both findings lack line numbers, check title similarity
        if f1.start_line is None or f2.start_line is None:
            return f1.title.strip().lower() == f2.title.strip().lower()

        # Check line span overlap with tolerance
        f1_start = f1.start_line
        f1_end = f1.end_line or f1.start_line
        f2_start = f2.start_line
        f2_end = f2.end_line or f2.start_line

        # True if intervals [f1_start - tol, f1_end + tol] and [f2_start, f2_end] overlap
        return not (f1_end + line_tolerance < f2_start or f2_end + line_tolerance < f1_start)

    @classmethod
    def merge_two_findings(cls, base: Finding, candidate: Finding) -> Finding:
        """
        Merges candidate into base, updating agreement metrics, severity, and suggestions.
        """
        # Severity priority hierarchy
        severity_order = {"info": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
        base_sev_rank = severity_order.get(base.severity.lower(), 1)
        cand_sev_rank = severity_order.get(candidate.severity.lower(), 1)

        highest_severity = candidate.severity if cand_sev_rank > base_sev_rank else base.severity
        highest_confidence = max(base.confidence, candidate.confidence)
        new_agreement_count = base.agreement_count + candidate.agreement_count

        # Merge suggestions if different
        merged_suggestion = base.suggestion
        if candidate.suggestion and candidate.suggestion != base.suggestion:
            if not base.suggestion:
                merged_suggestion = candidate.suggestion
            elif candidate.suggestion not in base.suggestion:
                merged_suggestion = f"{base.suggestion}\n\n[Alternative Recommendation ({candidate.specialist})]: {candidate.suggestion}"

        return Finding(
            id=base.id,
            file_path=base.file_path,
            start_line=min(base.start_line or 0, candidate.start_line or 0) if base.start_line and candidate.start_line else (base.start_line or candidate.start_line),
            end_line=max(base.end_line or 0, candidate.end_line or 0) if base.end_line and candidate.end_line else (base.end_line or candidate.end_line),
            category=base.category,
            severity=highest_severity,
            title=base.title,
            description=base.description,
            suggestion=merged_suggestion,
            confidence=round(highest_confidence, 2),
            agreement_count=new_agreement_count,
            specialist=base.specialist if base.specialist == candidate.specialist else f"{base.specialist}+{candidate.specialist}",
            is_verified=base.is_verified or candidate.is_verified,
        )

    def deduplicate(
        self,
        findings: List[Finding],
        line_tolerance: int = 3,
    ) -> List[Finding]:
        """
        Pure-Python deterministic merge matching findings by file path and overlapping line ranges.
        """
        if not findings:
            return []

        merged: List[Finding] = []
        for candidate in findings:
            matched_idx = None
            for idx, existing in enumerate(merged):
                if self.are_findings_overlapping(existing, candidate, line_tolerance=line_tolerance):
                    matched_idx = idx
                    break

            if matched_idx is not None:
                merged[matched_idx] = self.merge_two_findings(merged[matched_idx], candidate)
            else:
                merged.append(candidate.model_copy())

        # Sort merged findings deterministically by file_path and start_line
        merged.sort(key=lambda f: (f.file_path, f.start_line or 0))
        logger.info(f"Deduplicated {len(findings)} specialist findings into {len(merged)} unified findings.")
        return merged


# Global deduplication service instance
deduplication_service = DeduplicationService()
