from uuid import uuid4


class Audit:
    def __init__(
        self,
        schedule_id=0,
        title=None,
        muni=None,
        audit_date=None,
        risk_level=None,
        run_status=None,
        summary=None,
    ):

        self.audit_id = uuid4()
        self.schedule_id = schedule_id
        self.title = title
        self.muni = muni
        self.audit_date = audit_date
        self.risk_level = "INFO"
        self.run_status = "PENDING"
        self.summary = summary
        self.tags = []

    def insert_audit_dict(self):
        return {
            "audit_id": self.audit_id,
            "schedule_id": self.schedule_id,
            "title": self.title,
            "muni": self.muni,
            "risk_level": self.risk_level,
            "run_status": self.run_status,
            "summary": self.summary,
        }

    def insert_tags_dict_list(self):
        return [{"audit_id": self.audit_id, "tag_id": tag} for tag in self.tags]
